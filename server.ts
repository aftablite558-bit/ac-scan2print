import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import multer from 'multer';
import * as cheerio from 'cheerio';
import Parser from 'rss-parser';
import { GoogleGenAI } from '@google/genai';

const PORT = Number(process.env.PORT) || 3000;
const IS_PROD = process.env.NODE_ENV === 'production';
const ROOT_DIR = process.cwd();
const DATA_DIR = path.join(ROOT_DIR, 'data');
const UPLOADS_DIR = path.join(ROOT_DIR, 'uploads');

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const ALLOWED_BUCKETS = new Set([
  'business-assets',
  'owner-portraits',
  'gallery-media',
  'govt-media',
]);

for (const b of ALLOWED_BUCKETS) {
  fs.mkdirSync(path.join(UPLOADS_DIR, b), { recursive: true });
}

function resolveSessionSecret(): string {
  const envSecret = process.env.SESSION_SECRET?.trim();
  if (envSecret && envSecret !== 'REPLACE_WITH_LONG_RANDOM_SECRET') {
    return envSecret;
  }
  const secretFile = path.join(DATA_DIR, '.session_secret');
  if (fs.existsSync(secretFile)) {
    return fs.readFileSync(secretFile, 'utf8').trim();
  }
  const generated = crypto.randomBytes(48).toString('hex');
  fs.writeFileSync(secretFile, generated, { mode: 0o600 });
  return generated;
}

const SESSION_SECRET = resolveSessionSecret();
const SESSION_COOKIE = 'aman_session';

// --- SQLite Database Initialization ---
const db = new DatabaseSync(path.join(DATA_DIR, 'aman.db'));
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

db.exec(`
  CREATE TABLE IF NOT EXISTS roles (
    id TEXT PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    description TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS permissions (
    id TEXT PRIMARY KEY,
    code TEXT UNIQUE NOT NULL,
    module TEXT NOT NULL,
    description TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS role_permissions (
    role_id TEXT NOT NULL,
    permission_code TEXT NOT NULL,
    PRIMARY KEY (role_id, permission_code),
    FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS admin_users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    full_name TEXT NOT NULL,
    designation TEXT NOT NULL DEFAULT 'Administrator',
    role_id TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 1,
    last_login_at TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (role_id) REFERENCES roles(id)
  );

  CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    token_hash TEXT UNIQUE NOT NULL,
    expires_at TEXT NOT NULL,
    used_at TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES admin_users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS login_logs (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL,
    event_type TEXT NOT NULL,
    ip_address TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS audit_logs (
    id TEXT PRIMARY KEY,
    actor_email TEXT NOT NULL,
    actor_role TEXT NOT NULL,
    action TEXT NOT NULL,
    module TEXT NOT NULL,
    target_id TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS admin_notifications (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    route TEXT NOT NULL,
    is_read INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS fcm_tokens (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    token TEXT UNIQUE NOT NULL,
    device_label TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS business_profile (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    business_name TEXT NOT NULL,
    dashboard_subtitle TEXT NOT NULL,
    logo_url TEXT,
    favicon_url TEXT,
    address TEXT NOT NULL,
    contact_number TEXT NOT NULL,
    whatsapp_number TEXT NOT NULL,
    email TEXT NOT NULL,
    business_hours TEXT NOT NULL,
    google_maps_url TEXT NOT NULL,
    social_links_json TEXT NOT NULL,
    about_summary TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS hero_section (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    badge_label TEXT NOT NULL,
    main_headline TEXT NOT NULL,
    supporting_headline TEXT NOT NULL,
    hero_description TEXT NOT NULL,
    announcement_text TEXT NOT NULL,
    owner_portrait_url TEXT,
    primary_cta_label TEXT NOT NULL,
    primary_cta_href TEXT NOT NULL,
    secondary_cta_label TEXT NOT NULL,
    secondary_cta_href TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS owner_profile (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    full_name TEXT NOT NULL,
    designation TEXT NOT NULL,
    biography TEXT NOT NULL,
    profile_photo_url TEXT,
    social_links_json TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS website_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    seo_title TEXT NOT NULL,
    seo_description TEXT NOT NULL,
    og_image_url TEXT,
    favicon_url TEXT,
    theme_mode TEXT NOT NULL DEFAULT 'dark',
    announcement_enabled INTEGER NOT NULL DEFAULT 1,
    announcement_text TEXT NOT NULL,
    footer_text TEXT NOT NULL,
    contact_email TEXT NOT NULL,
    contact_phone TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS reference_portraits (
    id TEXT PRIMARY KEY,
    original_url TEXT NOT NULL,
    original_mime TEXT NOT NULL,
    bg_removal_enabled INTEGER NOT NULL DEFAULT 1,
    processed_url TEXT,
    processing_status TEXT NOT NULL,
    error_message TEXT,
    is_approved INTEGER NOT NULL DEFAULT 0,
    approved_at TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS service_categories (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    display_order INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS services (
    id TEXT PRIMARY KEY,
    category_id TEXT,
    category_name TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    icon_name TEXT NOT NULL DEFAULT 'printer',
    image_url TEXT,
    price_label TEXT,
    is_featured INTEGER NOT NULL DEFAULT 0,
    is_published INTEGER NOT NULL DEFAULT 1,
    display_order INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS gallery_items (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    category TEXT NOT NULL,
    caption TEXT NOT NULL,
    image_url TEXT NOT NULL,
    thumbnail_url TEXT,
    width INTEGER,
    height INTEGER,
    file_size_bytes INTEGER,
    display_order INTEGER NOT NULL DEFAULT 0,
    is_published INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS testimonials (
    id TEXT PRIMARY KEY,
    customer_name TEXT NOT NULL,
    feedback TEXT NOT NULL,
    rating INTEGER NOT NULL DEFAULT 5,
    is_approved INTEGER NOT NULL DEFAULT 1,
    is_published INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS faqs (
    id TEXT PRIMARY KEY,
    category TEXT NOT NULL,
    question TEXT NOT NULL,
    answer TEXT NOT NULL,
    display_order INTEGER NOT NULL DEFAULT 0,
    is_published INTEGER NOT NULL DEFAULT 1,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS enquiries (
    id TEXT PRIMARY KEY,
    channel TEXT NOT NULL,
    customer_name TEXT NOT NULL,
    customer_phone TEXT NOT NULL,
    customer_email TEXT NOT NULL,
    service_interest TEXT NOT NULL,
    message TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'new',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS enquiry_notes (
    id TEXT PRIMARY KEY,
    enquiry_id TEXT NOT NULL,
    author_name TEXT NOT NULL,
    note TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (enquiry_id) REFERENCES enquiries(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS govt_sources (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    department TEXT NOT NULL,
    source_url TEXT NOT NULL,
    source_type TEXT NOT NULL,
    default_category TEXT NOT NULL,
    is_trusted INTEGER NOT NULL DEFAULT 1,
    auto_publish INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1,
    fetch_interval_minutes INTEGER NOT NULL DEFAULT 180,
    last_fetched_at TEXT,
    last_status TEXT,
    last_error TEXT
  );

  CREATE TABLE IF NOT EXISTS govt_updates (
    id TEXT PRIMARY KEY,
    source_id TEXT,
    content_hash TEXT UNIQUE NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    hindi_summary TEXT,
    category TEXT NOT NULL,
    source_url TEXT NOT NULL,
    pdf_url TEXT,
    official_image_url TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    published_at TEXT,
    expires_at TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS govt_fetch_logs (
    id TEXT PRIMARY KEY,
    source_id TEXT,
    source_name TEXT NOT NULL,
    status TEXT NOT NULL,
    items_found INTEGER NOT NULL DEFAULT 0,
    items_inserted INTEGER NOT NULL DEFAULT 0,
    duplicates_skipped INTEGER NOT NULL DEFAULT 0,
    duration_ms INTEGER NOT NULL DEFAULT 0,
    error_message TEXT,
    fetched_at TEXT NOT NULL
  );
`);

function nowIso(): string {
  return new Date().toISOString();
}

function seedBaselineData(): void {
  const roles = [
    {
      id: 'role-super-admin',
      name: 'Super Admin',
      description: 'Full administrative control over RBAC, CMS, Door 5 portals, and backups.',
    },
    {
      id: 'role-admin',
      name: 'Admin',
      description: 'Operational control across CMS, enquiries, Door 5 updates, and staff.',
    },
    {
      id: 'role-editor',
      name: 'Editor',
      description: 'Updates CMS content, responds to enquiries, and reviews Bihar notices.',
    },
    {
      id: 'role-content-manager',
      name: 'Content Manager',
      description: 'Manages service catalog, gallery media, reviews, and FAQs.',
    },
  ];
  const insertRole = db.prepare(
    'INSERT OR IGNORE INTO roles (id, name, description) VALUES (?, ?, ?)'
  );
  for (const r of roles) insertRole.run(r.id, r.name, r.description);

  const permissions = [
    { id: 'perm-1', code: 'cms.read', module: 'CMS', description: 'View business & catalog CMS' },
    { id: 'perm-2', code: 'cms.write', module: 'CMS', description: 'Edit business profile, services, gallery, reviews & FAQs' },
    { id: 'perm-3', code: 'portrait.approve', module: 'CMS', description: 'Approve AI reference portraits into Hero & Owner profile' },
    { id: 'perm-4', code: 'enquiries.read', module: 'Enquiries', description: 'View customer enquiries & notes' },
    { id: 'perm-5', code: 'enquiries.write', module: 'Enquiries', description: 'Update enquiry status and add internal staff notes' },
    { id: 'perm-6', code: 'govt.read', module: 'Door 5', description: 'View Bihar government updates and fetch logs' },
    { id: 'perm-7', code: 'govt.fetch', module: 'Door 5', description: 'Trigger manual fetches from Bihar portals' },
    { id: 'perm-8', code: 'govt.publish', module: 'Door 5', description: 'Publish, reject, summarize, and manage Bihar portal sources' },
    { id: 'perm-9', code: 'access.read', module: 'Access', description: 'View staff accounts and role matrix' },
    { id: 'perm-10', code: 'access.manage', module: 'Access', description: 'Create/suspend staff accounts and edit role permissions' },
    { id: 'perm-11', code: 'audit.read', module: 'Audit', description: 'View login logs, audit trail, and export JSON backup' },
  ];
  const insertPerm = db.prepare(
    'INSERT OR IGNORE INTO permissions (id, code, module, description) VALUES (?, ?, ?, ?)'
  );
  for (const p of permissions) insertPerm.run(p.id, p.code, p.module, p.description);

  const rpCount = db.prepare('SELECT COUNT(*) as c FROM role_permissions').get() as { c: number };
  if (rpCount.c === 0) {
    const insertRp = db.prepare(
      'INSERT OR IGNORE INTO role_permissions (role_id, permission_code) VALUES (?, ?)'
    );
    for (const p of permissions) insertRp.run('role-super-admin', p.code);
    for (const code of [
      'cms.read', 'cms.write', 'portrait.approve',
      'enquiries.read', 'enquiries.write',
      'govt.read', 'govt.fetch', 'govt.publish',
      'access.read', 'audit.read',
    ]) {
      insertRp.run('role-admin', code);
    }
    for (const code of [
      'cms.read', 'cms.write',
      'enquiries.read', 'enquiries.write',
      'govt.read', 'govt.fetch',
    ]) {
      insertRp.run('role-editor', code);
    }
    for (const code of ['cms.read', 'cms.write', 'govt.read']) {
      insertRp.run('role-content-manager', code);
    }
  }

  const ts = nowIso();
  db.prepare(
    `INSERT OR IGNORE INTO business_profile (
      id, business_name, dashboard_subtitle, logo_url, favicon_url, address,
      contact_number, whatsapp_number, email, business_hours, google_maps_url,
      social_links_json, about_summary, updated_at
    ) VALUES (1, ?, ?, NULL, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    'AMAN COMPUTER',
    'Admin Dashboard',
    'Near Main Market, Bihar',
    '+91 90000 00000',
    '+91 90000 00000',
    'contact@amancomputer.in',
    'Mon–Sat · 9:00 AM – 8:00 PM',
    'https://maps.google.com',
    JSON.stringify({}),
    'AMAN COMPUTER is a trusted digital printing studio, cyber cafe, and Bihar government online form assistance center.',
    ts
  );

  db.prepare(
    `INSERT OR IGNORE INTO hero_section (
      id, badge_label, main_headline, supporting_headline, hero_description,
      announcement_text, owner_portrait_url, primary_cta_label, primary_cta_href,
      secondary_cta_label, secondary_cta_href, updated_at
    ) VALUES (1, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?)`
  ).run(
    'AMAN COMPUTER · Printing & Cyber Hub',
    'Fast Printing, Digital Seva & Bihar Govt Form Assistance',
    'High-speed color/B&W printing, lamination, spiral binding, and verified Bihar portal updates.',
    'Visit AMAN COMPUTER for crisp document printing, passport photos, online exam applications, and citizen services.',
    'Daily Bihar Government job alerts, admit cards, and scholarship updates.',
    'Explore Services',
    '#services',
    'Contact Desk',
    '#contact',
    ts
  );

  db.prepare(
    `INSERT OR IGNORE INTO owner_profile (
      id, full_name, designation, biography, profile_photo_url, social_links_json, updated_at
    ) VALUES (1, ?, ?, ?, NULL, ?, ?)`
  ).run(
    'Aman Kumar',
    'Founder & Proprietor',
    'Serving local students, businesses, and citizens with reliable printing, scanning, and online application support.',
    JSON.stringify({}),
    ts
  );

  db.prepare(
    `INSERT OR IGNORE INTO website_settings (
      id, seo_title, seo_description, og_image_url, favicon_url, theme_mode,
      announcement_enabled, announcement_text, footer_text, contact_email, contact_phone, updated_at
    ) VALUES (1, ?, ?, NULL, NULL, 'dark', 1, ?, ?, ?, ?, ?)`
  ).run(
    'AMAN COMPUTER — Printing Studio & Cyber Services',
    'Professional document printing, lamination, spiral binding, and Bihar government online form support.',
    'New Bihar exam & scholarship updates available at AMAN COMPUTER.',
    '© AMAN COMPUTER · All rights reserved.',
    'contact@amancomputer.in',
    '+91 90000 00000',
    ts
  );

  const cats = [
    { id: 'cat-printing', name: 'Printing & Xerox', slug: 'printing-xerox', display_order: 1 },
    { id: 'cat-cyber', name: 'Online Forms & Cyber Desk', slug: 'online-forms', display_order: 2 },
    { id: 'cat-binding', name: 'Lamination & Binding', slug: 'lamination-binding', display_order: 3 },
    { id: 'cat-photo', name: 'Passport Photo & ID Cards', slug: 'photo-id', display_order: 4 },
  ];
  const insertCat = db.prepare(
    'INSERT OR IGNORE INTO service_categories (id, name, slug, display_order) VALUES (?, ?, ?, ?)'
  );
  for (const c of cats) insertCat.run(c.id, c.name, c.slug, c.display_order);

  const govtPortals = [
    {
      id: 'src-bpsc',
      name: 'BPSC Official Notices',
      department: 'Bihar Public Service Commission',
      source_url: 'https://www.bpsc.bih.nic.in/',
      source_type: 'website',
      default_category: 'Latest Government Jobs',
    },
    {
      id: 'src-csbc',
      name: 'CSBC Bihar Police Recruitment',
      department: 'Central Selection Board of Constable',
      source_url: 'https://csbc.bihar.gov.in/',
      source_type: 'website',
      default_category: 'Admit Cards',
    },
    {
      id: 'src-bseb',
      name: 'Bihar School Examination Board',
      department: 'Education Department, Bihar',
      source_url: 'https://secondary.biharboardonline.com/',
      source_type: 'website',
      default_category: 'Education',
    },
    {
      id: 'src-pms',
      name: 'Bihar Post Matric Scholarship',
      department: 'Education Department, Bihar',
      source_url: 'https://www.pmsonline.bih.nic.in/',
      source_type: 'website',
      default_category: 'Scholarships',
    },
    {
      id: 'src-agri',
      name: 'Bihar Agriculture DBT Portal',
      department: 'Department of Agriculture, Bihar',
      source_url: 'https://dbtagriculture.bihar.gov.in/',
      source_type: 'website',
      default_category: 'Agriculture',
    },
    {
      id: 'src-state',
      name: 'Bihar State Portal Notifications',
      department: 'Government of Bihar',
      source_url: 'https://state.bihar.gov.in/',
      source_type: 'website',
      default_category: 'Government Notifications',
    },
  ];
  const insertSrc = db.prepare(
    `INSERT OR IGNORE INTO govt_sources (
      id, name, department, source_url, source_type, default_category,
      is_trusted, auto_publish, is_active, fetch_interval_minutes
    ) VALUES (?, ?, ?, ?, ?, ?, 1, 0, 1, 180)`
  );
  for (const s of govtPortals) {
    insertSrc.run(s.id, s.name, s.department, s.source_url, s.source_type, s.default_category);
  }
}

seedBaselineData();

// --- Auth & Session Helpers ---
function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

function verifyPassword(password: string, stored: string): boolean {
  const [salt, key] = stored.split(':');
  if (!salt || !key) return false;
  const derived = crypto.scryptSync(password, salt, 64);
  const keyBuf = Buffer.from(key, 'hex');
  if (derived.length !== keyBuf.length) return false;
  return crypto.timingSafeEqual(derived, keyBuf);
}

function signSessionToken(userId: string): string {
  const payload = Buffer.from(
    JSON.stringify({ uid: userId, exp: Date.now() + 1000 * 60 * 60 * 24 * 7 })
  ).toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

function verifySessionToken(token: string): { uid: string } | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payload, sig] = parts;
  const expectedSig = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(payload)
    .digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      uid?: string;
      exp?: number;
    };
    if (!parsed.uid || !parsed.exp || parsed.exp < Date.now()) return null;
    return { uid: parsed.uid };
  } catch {
    return null;
  }
}

function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx <= 0) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    out[k] = decodeURIComponent(v);
  }
  return out;
}

function setSessionCookie(res: Response, token: string): void {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: IS_PROD,
    sameSite: 'lax',
    path: '/',
    maxAge: 1000 * 60 * 60 * 24 * 7,
  });
}

interface SessionUser {
  id: string;
  email: string;
  fullName: string;
  designation: string;
  roleId: string;
  roleName: string;
  permissions: string[];
  isActive: boolean;
}

function loadSessionUserById(userId: string): SessionUser | null {
  const row = db
    .prepare(
      `SELECT u.id, u.email, u.full_name, u.designation, u.role_id, u.is_active, r.name as role_name
       FROM admin_users u
       JOIN roles r ON r.id = u.role_id
       WHERE u.id = ?`
    )
    .get(userId) as
    | {
        id: string;
        email: string;
        full_name: string;
        designation: string;
        role_id: string;
        is_active: number;
        role_name: string;
      }
    | undefined;
  if (!row || !row.is_active) return null;

  const permRows = db
    .prepare('SELECT permission_code FROM role_permissions WHERE role_id = ?')
    .all(row.role_id) as Array<{ permission_code: string }>;

  return {
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    designation: row.designation,
    roleId: row.role_id,
    roleName: row.role_name,
    permissions: permRows.map((p) => p.permission_code),
    isActive: Boolean(row.is_active),
  };
}

function getIntegrationStatus() {
  return {
    supabaseConfigured: Boolean(process.env.VITE_SUPABASE_URL && process.env.VITE_SUPABASE_ANON_KEY),
    firebaseConfigured: Boolean(process.env.VITE_FIREBASE_API_KEY && process.env.VITE_FIREBASE_PROJECT_ID),
    fcmServerConfigured: Boolean(process.env.FIREBASE_SERVER_KEY),
    birefnetConfigured: Boolean(process.env.BIREFNET_ENDPOINT_URL),
    geminiConfigured: Boolean(
      process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY'
    ),
  };
}

function recordAudit(actor: SessionUser, action: string, moduleName: string, targetId?: string): void {
  db.prepare(
    'INSERT INTO audit_logs (id, actor_email, actor_role, action, module, target_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(crypto.randomUUID(), actor.email, actor.roleName, action, moduleName, targetId ?? null, nowIso());
}

function createNotification(kind: string, title: string, body: string, route: string): void {
  db.prepare(
    'INSERT INTO admin_notifications (id, kind, title, body, route, is_read, created_at) VALUES (?, ?, ?, ?, ?, 0, ?)'
  ).run(crypto.randomUUID(), kind, title, body, route, nowIso());
}

function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const cookies = parseCookies(req.headers.cookie);
  const raw = cookies[SESSION_COOKIE];
  if (!raw) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  const verified = verifySessionToken(raw);
  if (!verified) {
    res.status(401).json({ error: 'Invalid or expired session' });
    return;
  }
  const user = loadSessionUserById(verified.uid);
  if (!user) {
    res.status(401).json({ error: 'Session user not found or suspended' });
    return;
  }
  (req as Request & { adminUser: SessionUser }).adminUser = user;
  next();
}

function requirePerm(permissionCode: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = (req as Request & { adminUser?: SessionUser }).adminUser;
    if (!user || !user.permissions.includes(permissionCode)) {
      res.status(403).json({ error: `Missing permission: ${permissionCode}` });
      return;
    }
    next();
  };
}

function getReqUser(req: Request): SessionUser {
  return (req as Request & { adminUser: SessionUser }).adminUser;
}

// --- Multer Upload Configuration ---
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      cb(new Error('Only image files are accepted'));
      return;
    }
    cb(null, true);
  },
});

function saveUploadedBuffer(bucket: string, originalName: string, mime: string, buf: Buffer): string {
  const extMap: Record<string, string> = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'image/gif': '.gif',
    'image/svg+xml': '.svg',
    'image/x-icon': '.ico',
  };
  const fallbackExt = path.extname(originalName).toLowerCase() || '.png';
  const ext = extMap[mime] || fallbackExt;
  const filename = `${crypto.randomUUID()}${ext}`;
  const dest = path.join(UPLOADS_DIR, bucket, filename);
  fs.writeFileSync(dest, buf);
  return `/uploads/${bucket}/${filename}`;
}

async function runBirefnetRemoval(
  originalBuffer: Buffer,
  mime: string
): Promise<{ ok: true; processedUrl: string } | { ok: false; error: string }> {
  const endpoint = process.env.BIREFNET_ENDPOINT_URL?.trim();
  if (!endpoint) {
    return {
      ok: false,
      error: 'BIREFNET_ENDPOINT_URL is not configured on the server.',
    };
  }
  try {
    const fd = new FormData();
    const blob = new Blob([new Uint8Array(originalBuffer)], { type: mime });
    fd.append('file', blob, 'portrait.png');
    const headers: Record<string, string> = {};
    if (process.env.BIREFNET_API_KEY?.trim()) {
      headers['Authorization'] = `Bearer ${process.env.BIREFNET_API_KEY.trim()}`;
    }
    const resp = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: fd,
      signal: AbortSignal.timeout(25000),
    });
    if (!resp.ok) {
      return { ok: false, error: `BiRefNet responded with HTTP ${resp.status}` };
    }
    const arrayBuf = await resp.arrayBuffer();
    const processedUrl = saveUploadedBuffer(
      'owner-portraits',
      'cutout.png',
      'image/png',
      Buffer.from(arrayBuf)
    );
    return { ok: true, processedUrl };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'BiRefNet request failed',
    };
  }
}

// --- Express App Setup ---
const app = express();
app.use(express.json({ limit: '4mb' }));
app.use('/uploads', express.static(UPLOADS_DIR));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'aman-computer-admin', time: nowIso() });
});

// --- Auth Endpoints ---
app.get('/api/auth/bootstrap-status', (req, res) => {
  const countRow = db.prepare('SELECT COUNT(*) as c FROM admin_users').get() as { c: number };
  const needsBootstrap = countRow.c === 0;
  let user: SessionUser | null = null;
  const cookies = parseCookies(req.headers.cookie);
  const raw = cookies[SESSION_COOKIE];
  if (raw) {
    const verified = verifySessionToken(raw);
    if (verified) user = loadSessionUserById(verified.uid);
  }
  res.json({
    needsBootstrap,
    user,
    integrations: getIntegrationStatus(),
  });
});

app.post('/api/auth/bootstrap-super-admin', (req, res) => {
  const countRow = db.prepare('SELECT COUNT(*) as c FROM admin_users').get() as { c: number };
  if (countRow.c > 0) {
    res.status(403).json({ error: 'Initial Super Admin already exists. Sign in instead.' });
    return;
  }
  const { fullName, email, password, designation } = req.body as {
    fullName?: string;
    email?: string;
    password?: string;
    designation?: string;
  };
  if (!fullName?.trim() || !email?.trim() || !password || password.length < 8) {
    res.status(400).json({ error: 'Full name, email, and 8+ character password are required.' });
    return;
  }
  const id = crypto.randomUUID();
  const normalizedEmail = email.trim().toLowerCase();
  const ts = nowIso();
  db.prepare(
    `INSERT INTO admin_users (id, email, full_name, designation, role_id, password_hash, is_active, last_login_at, created_at)
     VALUES (?, ?, ?, ?, 'role-super-admin', ?, 1, ?, ?)`
  ).run(
    id,
    normalizedEmail,
    fullName.trim(),
    designation?.trim() || 'Super Admin',
    hashPassword(password),
    ts,
    ts
  );
  db.prepare(
    'INSERT INTO login_logs (id, email, event_type, ip_address, created_at) VALUES (?, ?, ?, ?, ?)'
  ).run(crypto.randomUUID(), normalizedEmail, 'bootstrap_login', req.ip || 'local', ts);

  const user = loadSessionUserById(id)!;
  recordAudit(user, 'Initial Super Admin provisioned', 'Access', id);
  setSessionCookie(res, signSessionToken(id));
  res.status(201).json({ user });
});

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body as { email?: string; password?: string };
  const normalizedEmail = email?.trim().toLowerCase() || '';
  if (!normalizedEmail || !password) {
    res.status(400).json({ error: 'Email and password are required.' });
    return;
  }
  const row = db
    .prepare('SELECT id, password_hash, is_active FROM admin_users WHERE email = ?')
    .get(normalizedEmail) as { id: string; password_hash: string; is_active: number } | undefined;
  const ts = nowIso();
  if (!row || !verifyPassword(password, row.password_hash)) {
    db.prepare(
      'INSERT INTO login_logs (id, email, event_type, ip_address, created_at) VALUES (?, ?, ?, ?, ?)'
    ).run(crypto.randomUUID(), normalizedEmail, 'login_failed', req.ip || 'local', ts);
    res.status(401).json({ error: 'Invalid email or password.' });
    return;
  }
  if (!row.is_active) {
    db.prepare(
      'INSERT INTO login_logs (id, email, event_type, ip_address, created_at) VALUES (?, ?, ?, ?, ?)'
    ).run(crypto.randomUUID(), normalizedEmail, 'login_blocked_suspended', req.ip || 'local', ts);
    res.status(403).json({ error: 'Account is suspended. Contact a Super Admin.' });
    return;
  }
  db.prepare('UPDATE admin_users SET last_login_at = ? WHERE id = ?').run(ts, row.id);
  db.prepare(
    'INSERT INTO login_logs (id, email, event_type, ip_address, created_at) VALUES (?, ?, ?, ?, ?)'
  ).run(crypto.randomUUID(), normalizedEmail, 'login_success', req.ip || 'local', ts);

  const user = loadSessionUserById(row.id)!;
  setSessionCookie(res, signSessionToken(row.id));
  res.json({ user });
});

app.post('/api/auth/logout', (req, res) => {
  res.clearCookie(SESSION_COOKIE, { path: '/' });
  res.json({ ok: true });
});

app.post('/api/auth/forgot-password', (req, res) => {
  const { email } = req.body as { email?: string };
  const normalizedEmail = email?.trim().toLowerCase() || '';
  if (!normalizedEmail) {
    res.status(400).json({ error: 'Email address is required.' });
    return;
  }
  const userRow = db
    .prepare('SELECT id FROM admin_users WHERE email = ? AND is_active = 1')
    .get(normalizedEmail) as { id: string } | undefined;
  if (userRow) {
    const rawToken = crypto.randomBytes(24).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    db.prepare(
      'INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)'
    ).run(crypto.randomUUID(), userRow.id, tokenHash, expiresAt, nowIso());
  }
  res.json({
    ok: true,
    message:
      'If that active admin email exists, contact a Super Admin to generate a one-time reset token under Access & Audit.',
  });
});

app.post('/api/auth/reset-password', (req, res) => {
  const { token, newPassword } = req.body as { token?: string; newPassword?: string };
  if (!token?.trim() || !newPassword || newPassword.length < 8) {
    res.status(400).json({ error: 'Valid token and 8+ character password are required.' });
    return;
  }
  const tokenHash = crypto.createHash('sha256').update(token.trim()).digest('hex');
  const row = db
    .prepare(
      'SELECT id, user_id, expires_at, used_at FROM password_reset_tokens WHERE token_hash = ?'
    )
    .get(tokenHash) as
    | { id: string; user_id: string; expires_at: string; used_at: string | null }
    | undefined;
  if (!row || row.used_at || new Date(row.expires_at).getTime() < Date.now()) {
    res.status(400).json({ error: 'Reset token is invalid or expired.' });
    return;
  }
  const ts = nowIso();
  db.prepare('UPDATE admin_users SET password_hash = ? WHERE id = ?').run(
    hashPassword(newPassword),
    row.user_id
  );
  db.prepare('UPDATE password_reset_tokens SET used_at = ? WHERE id = ?').run(ts, row.id);
  res.json({ ok: true, message: 'Password updated. You may now sign in.' });
});

// --- Dashboard Overview ---
app.get('/api/dashboard/overview', requireAuth, (_req, res) => {
  const totalServices = (db.prepare('SELECT COUNT(*) as c FROM services').get() as { c: number }).c;
  const publishedServices = (
    db.prepare('SELECT COUNT(*) as c FROM services WHERE is_published = 1').get() as { c: number }
  ).c;
  const totalEnquiries = (db.prepare('SELECT COUNT(*) as c FROM enquiries').get() as { c: number }).c;
  const pendingEnquiries = (
    db
      .prepare("SELECT COUNT(*) as c FROM enquiries WHERE status IN ('new', 'in_progress')")
      .get() as { c: number }
  ).c;
  const publishedGovtUpdates = (
    db.prepare("SELECT COUNT(*) as c FROM govt_updates WHERE status = 'published'").get() as {
      c: number;
    }
  ).c;
  const pendingGovtUpdates = (
    db.prepare("SELECT COUNT(*) as c FROM govt_updates WHERE status = 'pending'").get() as {
      c: number;
    }
  ).c;
  const galleryImages = (db.prepare('SELECT COUNT(*) as c FROM gallery_items').get() as { c: number })
    .c;
  const unreadNotifications = (
    db.prepare('SELECT COUNT(*) as c FROM admin_notifications WHERE is_read = 0').get() as {
      c: number;
    }
  ).c;

  const recentActivities = db
    .prepare('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 12')
    .all();

  res.json({
    metrics: {
      totalServices,
      publishedServices,
      totalEnquiries,
      pendingEnquiries,
      publishedGovtUpdates,
      pendingGovtUpdates,
      galleryImages,
      unreadNotifications,
    },
    recentActivities,
  });
});

// --- CMS State & Singletons ---
app.get('/api/cms/state', requireAuth, (_req, res) => {
  const bizRow = db.prepare('SELECT * FROM business_profile WHERE id = 1').get() as Record<
    string,
    unknown
  >;
  const ownerRow = db.prepare('SELECT * FROM owner_profile WHERE id = 1').get() as Record<
    string,
    unknown
  >;

  res.json({
    businessProfile: {
      ...bizRow,
      socialLinks: JSON.parse((bizRow.social_links_json as string) || '{}'),
    },
    heroSection: db.prepare('SELECT * FROM hero_section WHERE id = 1').get(),
    ownerProfile: {
      ...ownerRow,
      socialLinks: JSON.parse((ownerRow.social_links_json as string) || '{}'),
    },
    websiteSettings: db.prepare('SELECT * FROM website_settings WHERE id = 1').get(),
    serviceCategories: db
      .prepare('SELECT * FROM service_categories ORDER BY display_order ASC')
      .all(),
    services: db.prepare('SELECT * FROM services ORDER BY display_order ASC, updated_at DESC').all(),
    galleryItems: db
      .prepare('SELECT * FROM gallery_items ORDER BY display_order ASC, created_at DESC')
      .all(),
    testimonials: db.prepare('SELECT * FROM testimonials ORDER BY created_at DESC').all(),
    faqs: db.prepare('SELECT * FROM faqs ORDER BY display_order ASC, updated_at DESC').all(),
    referencePortraits: db
      .prepare('SELECT * FROM reference_portraits ORDER BY created_at DESC')
      .all(),
    notifications: db
      .prepare('SELECT * FROM admin_notifications ORDER BY created_at DESC LIMIT 30')
      .all(),
  });
});

app.put('/api/cms/business', requireAuth, requirePerm('cms.write'), (req, res) => {
  const b = req.body as Record<string, unknown>;
  const ts = nowIso();
  db.prepare(
    `UPDATE business_profile SET
      business_name = ?, dashboard_subtitle = ?, logo_url = ?, favicon_url = ?,
      address = ?, contact_number = ?, whatsapp_number = ?, email = ?,
      business_hours = ?, google_maps_url = ?, social_links_json = ?,
      about_summary = ?, updated_at = ?
     WHERE id = 1`
  ).run(
    String(b.business_name || 'AMAN COMPUTER'),
    String(b.dashboard_subtitle || 'Admin Dashboard'),
    (b.logo_url as string | null) ?? null,
    (b.favicon_url as string | null) ?? null,
    String(b.address || ''),
    String(b.contact_number || ''),
    String(b.whatsapp_number || ''),
    String(b.email || ''),
    String(b.business_hours || ''),
    String(b.google_maps_url || ''),
    JSON.stringify(b.socialLinks || {}),
    String(b.about_summary || ''),
    ts
  );
  recordAudit(getReqUser(req), 'Updated Business Profile', 'CMS', '1');
  res.json({ ok: true });
});

app.put('/api/cms/hero', requireAuth, requirePerm('cms.write'), (req, res) => {
  const h = req.body as Record<string, unknown>;
  const ts = nowIso();
  db.prepare(
    `UPDATE hero_section SET
      badge_label = ?, main_headline = ?, supporting_headline = ?, hero_description = ?,
      announcement_text = ?, owner_portrait_url = ?, primary_cta_label = ?, primary_cta_href = ?,
      secondary_cta_label = ?, secondary_cta_href = ?, updated_at = ?
     WHERE id = 1`
  ).run(
    String(h.badge_label || ''),
    String(h.main_headline || ''),
    String(h.supporting_headline || ''),
    String(h.hero_description || ''),
    String(h.announcement_text || ''),
    (h.owner_portrait_url as string | null) ?? null,
    String(h.primary_cta_label || ''),
    String(h.primary_cta_href || ''),
    String(h.secondary_cta_label || ''),
    String(h.secondary_cta_href || ''),
    ts
  );
  recordAudit(getReqUser(req), 'Updated Hero Section', 'CMS', '1');
  res.json({ ok: true });
});

app.put('/api/cms/owner', requireAuth, requirePerm('cms.write'), (req, res) => {
  const o = req.body as Record<string, unknown>;
  const ts = nowIso();
  db.prepare(
    `UPDATE owner_profile SET
      full_name = ?, designation = ?, biography = ?, profile_photo_url = ?,
      social_links_json = ?, updated_at = ?
     WHERE id = 1`
  ).run(
    String(o.full_name || ''),
    String(o.designation || ''),
    String(o.biography || ''),
    (o.profile_photo_url as string | null) ?? null,
    JSON.stringify(o.socialLinks || {}),
    ts
  );
  recordAudit(getReqUser(req), 'Updated Owner Profile', 'CMS', '1');
  res.json({ ok: true });
});

app.put('/api/cms/website-settings', requireAuth, requirePerm('cms.write'), (req, res) => {
  const w = req.body as Record<string, unknown>;
  const ts = nowIso();
  db.prepare(
    `UPDATE website_settings SET
      seo_title = ?, seo_description = ?, og_image_url = ?, favicon_url = ?,
      theme_mode = ?, announcement_enabled = ?, announcement_text = ?,
      footer_text = ?, contact_email = ?, contact_phone = ?, updated_at = ?
     WHERE id = 1`
  ).run(
    String(w.seo_title || ''),
    String(w.seo_description || ''),
    (w.og_image_url as string | null) ?? null,
    (w.favicon_url as string | null) ?? null,
    String(w.theme_mode || 'dark'),
    w.announcement_enabled ? 1 : 0,
    String(w.announcement_text || ''),
    String(w.footer_text || ''),
    String(w.contact_email || ''),
    String(w.contact_phone || ''),
    ts
  );
  recordAudit(getReqUser(req), 'Updated Website & SEO Settings', 'CMS', '1');
  res.json({ ok: true });
});

// --- File Upload Endpoint ---
app.post(
  '/api/upload/:bucket',
  requireAuth,
  requirePerm('cms.write'),
  upload.single('file'),
  (req, res) => {
    const bucket = String(req.params.bucket || '');
    if (!ALLOWED_BUCKETS.has(bucket)) {
      res.status(400).json({ error: 'Invalid upload bucket' });
      return;
    }
    if (!req.file) {
      res.status(400).json({ error: 'No image file provided' });
      return;
    }
    const url = saveUploadedBuffer(
      bucket,
      req.file.originalname,
      req.file.mimetype,
      req.file.buffer
    );
    res.json({ url, sizeBytes: req.file.size, mime: req.file.mimetype });
  }
);

// --- Reference Portraits & BiRefNet Pipeline ---
app.post(
  '/api/portraits/upload',
  requireAuth,
  requirePerm('cms.write'),
  upload.single('file'),
  async (req, res) => {
    if (!req.file) {
      res.status(400).json({ error: 'Portrait image file is required' });
      return;
    }
    const bgRemovalEnabled = String(req.body?.bgRemovalEnabled ?? 'true') !== 'false';
    const originalUrl = saveUploadedBuffer(
      'owner-portraits',
      req.file.originalname,
      req.file.mimetype,
      req.file.buffer
    );

    let processedUrl: string | null = null;
    let processingStatus: 'pending' | 'processing' | 'succeeded' | 'failed' | 'skipped' = 'skipped';
    let errorMessage: string | null = null;

    if (bgRemovalEnabled) {
      const result = await runBirefnetRemoval(req.file.buffer, req.file.mimetype);
      if (result.ok) {
        processedUrl = result.processedUrl;
        processingStatus = 'succeeded';
      } else {
        processingStatus = 'failed';
        errorMessage = result.error;
      }
    }

    const id = crypto.randomUUID();
    const ts = nowIso();
    db.prepare(
      `INSERT INTO reference_portraits (
        id, original_url, original_mime, bg_removal_enabled, processed_url,
        processing_status, error_message, is_approved, approved_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, NULL, ?)`
    ).run(
      id,
      originalUrl,
      req.file.mimetype,
      bgRemovalEnabled ? 1 : 0,
      processedUrl,
      processingStatus,
      errorMessage,
      ts
    );

    recordAudit(getReqUser(req), `Uploaded reference portrait (${processingStatus})`, 'CMS', id);
    res.status(201).json(db.prepare('SELECT * FROM reference_portraits WHERE id = ?').get(id));
  }
);

app.post('/api/portraits/:id/retry', requireAuth, requirePerm('cms.write'), async (req, res) => {
  const portraitId = String(req.params.id);
  const existing = db
    .prepare('SELECT * FROM reference_portraits WHERE id = ?')
    .get(portraitId) as
    | {
        id: string;
        original_url: string;
        original_mime: string;
        bg_removal_enabled: number;
      }
    | undefined;
  if (!existing) {
    res.status(404).json({ error: 'Reference portrait not found' });
    return;
  }

  const nextEnabled =
    typeof req.body?.bgRemovalEnabled === 'boolean'
      ? req.body.bgRemovalEnabled
      : Boolean(existing.bg_removal_enabled);

  let processedUrl: string | null = null;
  let processingStatus = 'skipped';
  let errorMessage: string | null = null;

  if (nextEnabled) {
    const filePath = path.join(ROOT_DIR, existing.original_url.replace(/^\/+/, ''));
    if (!fs.existsSync(filePath)) {
      res.status(404).json({ error: 'Original portrait file missing on disk' });
      return;
    }
    const buf = fs.readFileSync(filePath);
    const result = await runBirefnetRemoval(buf, existing.original_mime);
    if (result.ok) {
      processedUrl = result.processedUrl;
      processingStatus = 'succeeded';
    } else {
      processingStatus = 'failed';
      errorMessage = result.error;
    }
  }

  db.prepare(
    `UPDATE reference_portraits
     SET bg_removal_enabled = ?, processed_url = ?, processing_status = ?, error_message = ?
     WHERE id = ?`
  ).run(nextEnabled ? 1 : 0, processedUrl, processingStatus, errorMessage, portraitId);

  recordAudit(getReqUser(req), `Retried reference portrait (${processingStatus})`, 'CMS', portraitId);
  res.json(db.prepare('SELECT * FROM reference_portraits WHERE id = ?').get(portraitId));
});

app.post('/api/portraits/:id/approve', requireAuth, (req, res) => {
  const user = getReqUser(req);
  if (!user.permissions.includes('portrait.approve') && !user.permissions.includes('cms.write')) {
    res.status(403).json({ error: 'Missing portrait approval permission' });
    return;
  }
  const portraitId = String(req.params.id);
  const row = db
    .prepare('SELECT * FROM reference_portraits WHERE id = ?')
    .get(portraitId) as
    | {
        id: string;
        original_url: string;
        bg_removal_enabled: number;
        processed_url: string | null;
        processing_status: string;
      }
    | undefined;
  if (!row) {
    res.status(404).json({ error: 'Portrait not found' });
    return;
  }
  if (row.bg_removal_enabled && (row.processing_status !== 'succeeded' || !row.processed_url)) {
    res.status(422).json({
      error:
        'Background removal is enabled but BiRefNet processing has not succeeded. Retry AI or switch to original.',
    });
    return;
  }

  const finalUrl = row.bg_removal_enabled && row.processed_url ? row.processed_url : row.original_url;
  const ts = nowIso();
  db.prepare('UPDATE reference_portraits SET is_approved = 0').run();
  db.prepare('UPDATE reference_portraits SET is_approved = 1, approved_at = ? WHERE id = ?').run(
    ts,
    portraitId
  );
  db.prepare('UPDATE owner_profile SET profile_photo_url = ?, updated_at = ? WHERE id = 1').run(
    finalUrl,
    ts
  );
  db.prepare('UPDATE hero_section SET owner_portrait_url = ?, updated_at = ? WHERE id = 1').run(
    finalUrl,
    ts
  );

  recordAudit(user, 'Approved & synced reference portrait to Owner & Hero', 'CMS', portraitId);
  res.json({ ok: true, approvedUrl: finalUrl });
});

// --- Services CRUD ---
app.post('/api/cms/services', requireAuth, requirePerm('cms.write'), (req, res) => {
  const s = req.body as Record<string, unknown>;
  const id = crypto.randomUUID();
  const ts = nowIso();
  db.prepare(
    `INSERT INTO services (
      id, category_id, category_name, title, description, icon_name,
      image_url, price_label, is_featured, is_published, display_order, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    (s.category_id as string | null) ?? null,
    String(s.category_name || 'Printing & Xerox'),
    String(s.title || 'Untitled Service'),
    String(s.description || ''),
    String(s.icon_name || 'printer'),
    (s.image_url as string | null) ?? null,
    (s.price_label as string | null) ?? null,
    s.is_featured ? 1 : 0,
    s.is_published === 0 ? 0 : 1,
    Number(s.display_order || 0),
    ts
  );
  recordAudit(getReqUser(req), `Created service "${String(s.title)}"`, 'CMS', id);
  res.status(201).json(db.prepare('SELECT * FROM services WHERE id = ?').get(id));
});

app.put('/api/cms/services/:id', requireAuth, requirePerm('cms.write'), (req, res) => {
  const id = String(req.params.id);
  const existing = db.prepare('SELECT * FROM services WHERE id = ?').get(id) as
    | Record<string, unknown>
    | undefined;
  if (!existing) {
    res.status(404).json({ error: 'Service not found' });
    return;
  }
  const patch = req.body as Record<string, unknown>;
  const merged: Record<string, unknown> = { ...existing, ...patch, updated_at: nowIso() };
  db.prepare(
    `UPDATE services SET
      category_id = ?, category_name = ?, title = ?, description = ?, icon_name = ?,
      image_url = ?, price_label = ?, is_featured = ?, is_published = ?, display_order = ?, updated_at = ?
     WHERE id = ?`
  ).run(
    (merged.category_id as string | null) ?? null,
    String(merged.category_name),
    String(merged.title),
    String(merged.description),
    String(merged.icon_name),
    (merged.image_url as string | null) ?? null,
    (merged.price_label as string | null) ?? null,
    merged.is_featured ? 1 : 0,
    merged.is_published ? 1 : 0,
    Number(merged.display_order || 0),
    String(merged.updated_at),
    id
  );
  recordAudit(getReqUser(req), `Updated service "${String(merged.title)}"`, 'CMS', id);
  res.json(db.prepare('SELECT * FROM services WHERE id = ?').get(id));
});

app.delete('/api/cms/services/:id', requireAuth, requirePerm('cms.write'), (req, res) => {
  const id = String(req.params.id);
  db.prepare('DELETE FROM services WHERE id = ?').run(id);
  recordAudit(getReqUser(req), 'Deleted service', 'CMS', id);
  res.json({ ok: true });
});

// --- Gallery CRUD ---
app.post('/api/cms/gallery', requireAuth, requirePerm('cms.write'), (req, res) => {
  const g = req.body as Record<string, unknown>;
  const id = crypto.randomUUID();
  const ts = nowIso();
  db.prepare(
    `INSERT INTO gallery_items (
      id, title, category, caption, image_url, thumbnail_url, width, height,
      file_size_bytes, display_order, is_published, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    String(g.title || 'Gallery Photo'),
    String(g.category || 'Printing Studio'),
    String(g.caption || ''),
    String(g.image_url || ''),
    (g.thumbnail_url as string | null) ?? null,
    g.width ? Number(g.width) : null,
    g.height ? Number(g.height) : null,
    g.file_size_bytes ? Number(g.file_size_bytes) : null,
    Number(g.display_order || 0),
    g.is_published === 0 ? 0 : 1,
    ts
  );
  recordAudit(getReqUser(req), `Added gallery item "${String(g.title)}"`, 'CMS', id);
  res.status(201).json(db.prepare('SELECT * FROM gallery_items WHERE id = ?').get(id));
});

app.put('/api/cms/gallery/:id', requireAuth, requirePerm('cms.write'), (req, res) => {
  const id = String(req.params.id);
  const existing = db.prepare('SELECT * FROM gallery_items WHERE id = ?').get(id) as
    | Record<string, unknown>
    | undefined;
  if (!existing) {
    res.status(404).json({ error: 'Gallery item not found' });
    return;
  }
  const merged: Record<string, unknown> = { ...existing, ...(req.body as Record<string, unknown>) };
  db.prepare(
    `UPDATE gallery_items SET title = ?, category = ?, caption = ?, display_order = ?, is_published = ? WHERE id = ?`
  ).run(
    String(merged.title),
    String(merged.category),
    String(merged.caption),
    Number(merged.display_order || 0),
    merged.is_published ? 1 : 0,
    id
  );
  recordAudit(getReqUser(req), `Updated gallery item "${String(merged.title)}"`, 'CMS', id);
  res.json(db.prepare('SELECT * FROM gallery_items WHERE id = ?').get(id));
});

app.delete('/api/cms/gallery/:id', requireAuth, requirePerm('cms.write'), (req, res) => {
  const id = String(req.params.id);
  db.prepare('DELETE FROM gallery_items WHERE id = ?').run(id);
  recordAudit(getReqUser(req), 'Deleted gallery item', 'CMS', id);
  res.json({ ok: true });
});

// --- Testimonials CRUD ---
app.post('/api/cms/testimonials', requireAuth, requirePerm('cms.write'), (req, res) => {
  const t = req.body as Record<string, unknown>;
  const id = crypto.randomUUID();
  db.prepare(
    `INSERT INTO testimonials (id, customer_name, feedback, rating, is_approved, is_published, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    String(t.customer_name || 'Customer'),
    String(t.feedback || ''),
    Math.min(5, Math.max(1, Number(t.rating || 5))),
    t.is_approved === 0 ? 0 : 1,
    t.is_published === 0 ? 0 : 1,
    nowIso()
  );
  recordAudit(getReqUser(req), `Added testimonial from ${String(t.customer_name)}`, 'CMS', id);
  res.status(201).json(db.prepare('SELECT * FROM testimonials WHERE id = ?').get(id));
});

app.put('/api/cms/testimonials/:id', requireAuth, requirePerm('cms.write'), (req, res) => {
  const id = String(req.params.id);
  const existing = db.prepare('SELECT * FROM testimonials WHERE id = ?').get(id) as
    | Record<string, unknown>
    | undefined;
  if (!existing) {
    res.status(404).json({ error: 'Testimonial not found' });
    return;
  }
  const merged: Record<string, unknown> = { ...existing, ...(req.body as Record<string, unknown>) };
  db.prepare(
    `UPDATE testimonials SET customer_name = ?, feedback = ?, rating = ?, is_approved = ?, is_published = ? WHERE id = ?`
  ).run(
    String(merged.customer_name),
    String(merged.feedback),
    Math.min(5, Math.max(1, Number(merged.rating || 5))),
    merged.is_approved ? 1 : 0,
    merged.is_published ? 1 : 0,
    id
  );
  recordAudit(getReqUser(req), `Updated testimonial (${String(merged.customer_name)})`, 'CMS', id);
  res.json(db.prepare('SELECT * FROM testimonials WHERE id = ?').get(id));
});

app.delete('/api/cms/testimonials/:id', requireAuth, requirePerm('cms.write'), (req, res) => {
  const id = String(req.params.id);
  db.prepare('DELETE FROM testimonials WHERE id = ?').run(id);
  recordAudit(getReqUser(req), 'Deleted testimonial', 'CMS', id);
  res.json({ ok: true });
});

// --- FAQs CRUD ---
app.post('/api/cms/faqs', requireAuth, requirePerm('cms.write'), (req, res) => {
  const f = req.body as Record<string, unknown>;
  const id = crypto.randomUUID();
  db.prepare(
    `INSERT INTO faqs (id, category, question, answer, display_order, is_published, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    String(f.category || 'General'),
    String(f.question || ''),
    String(f.answer || ''),
    Number(f.display_order || 0),
    f.is_published === 0 ? 0 : 1,
    nowIso()
  );
  recordAudit(getReqUser(req), `Created FAQ "${String(f.question).slice(0, 40)}"`, 'CMS', id);
  res.status(201).json(db.prepare('SELECT * FROM faqs WHERE id = ?').get(id));
});

app.put('/api/cms/faqs/:id', requireAuth, requirePerm('cms.write'), (req, res) => {
  const id = String(req.params.id);
  const existing = db.prepare('SELECT * FROM faqs WHERE id = ?').get(id) as
    | Record<string, unknown>
    | undefined;
  if (!existing) {
    res.status(404).json({ error: 'FAQ not found' });
    return;
  }
  const merged: Record<string, unknown> = { ...existing, ...(req.body as Record<string, unknown>) };
  db.prepare(
    `UPDATE faqs SET category = ?, question = ?, answer = ?, display_order = ?, is_published = ?, updated_at = ? WHERE id = ?`
  ).run(
    String(merged.category),
    String(merged.question),
    String(merged.answer),
    Number(merged.display_order || 0),
    merged.is_published ? 1 : 0,
    nowIso(),
    id
  );
  recordAudit(getReqUser(req), 'Updated FAQ', 'CMS', id);
  res.json(db.prepare('SELECT * FROM faqs WHERE id = ?').get(id));
});

app.delete('/api/cms/faqs/:id', requireAuth, requirePerm('cms.write'), (req, res) => {
  const id = String(req.params.id);
  db.prepare('DELETE FROM faqs WHERE id = ?').run(id);
  recordAudit(getReqUser(req), 'Deleted FAQ', 'CMS', id);
  res.json({ ok: true });
});

// --- Enquiries Endpoints ---
app.get('/api/enquiries', requireAuth, requirePerm('enquiries.read'), (_req, res) => {
  const items = db.prepare('SELECT * FROM enquiries ORDER BY created_at DESC').all() as Array<
    Record<string, unknown>
  >;
  const noteStmt = db.prepare(
    'SELECT * FROM enquiry_notes WHERE enquiry_id = ? ORDER BY created_at ASC'
  );
  res.json({
    enquiries: items.map((item) => ({
      ...item,
      notes: noteStmt.all(String(item.id)),
    })),
  });
});

app.post('/api/enquiries', requireAuth, requirePerm('enquiries.write'), (req, res) => {
  const e = req.body as Record<string, unknown>;
  const id = crypto.randomUUID();
  const ts = nowIso();
  db.prepare(
    `INSERT INTO enquiries (
      id, channel, customer_name, customer_phone, customer_email,
      service_interest, message, status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'new', ?, ?)`
  ).run(
    id,
    String(e.channel || 'walk_in'),
    String(e.customer_name || 'Customer'),
    String(e.customer_phone || ''),
    String(e.customer_email || ''),
    String(e.service_interest || 'General'),
    String(e.message || ''),
    ts,
    ts
  );
  createNotification(
    'new_enquiry',
    `New enquiry: ${String(e.customer_name || 'Customer')}`,
    String(e.service_interest || 'Printing & Cyber Desk'),
    '#/enquiries'
  );
  recordAudit(getReqUser(req), `Logged enquiry from ${String(e.customer_name)}`, 'Enquiries', id);
  res.status(201).json({ id });
});

app.patch('/api/enquiries/:id', requireAuth, requirePerm('enquiries.write'), (req, res) => {
  const id = String(req.params.id);
  const { status } = req.body as { status?: string };
  if (!status || !['new', 'in_progress', 'resolved', 'archived'].includes(status)) {
    res.status(400).json({ error: 'Invalid enquiry status' });
    return;
  }
  db.prepare('UPDATE enquiries SET status = ?, updated_at = ? WHERE id = ?').run(
    status,
    nowIso(),
    id
  );
  recordAudit(getReqUser(req), `Updated enquiry status to ${status}`, 'Enquiries', id);
  res.json({ ok: true });
});

app.post('/api/enquiries/:id/notes', requireAuth, requirePerm('enquiries.write'), (req, res) => {
  const id = String(req.params.id);
  const { note } = req.body as { note?: string };
  if (!note?.trim()) {
    res.status(400).json({ error: 'Note text is required' });
    return;
  }
  const user = getReqUser(req);
  const noteId = crypto.randomUUID();
  db.prepare(
    'INSERT INTO enquiry_notes (id, enquiry_id, author_name, note, created_at) VALUES (?, ?, ?, ?, ?)'
  ).run(noteId, id, user.fullName, note.trim(), nowIso());
  db.prepare('UPDATE enquiries SET updated_at = ? WHERE id = ?').run(nowIso(), id);
  recordAudit(user, 'Added staff note to enquiry', 'Enquiries', id);
  res.status(201).json({ id: noteId });
});

// --- Door 5: Bihar Government Updates ---
const rssParser = new Parser({ timeout: 12000 });

function assertSafeExternalSourceUrl(rawUrl: string): string {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    throw new Error('Source URL must be a valid HTTP or HTTPS URL.');
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error('Source URL must use http:// or https://.');
  }
  const host = parsed.hostname.toLowerCase();
  if (
    host === 'localhost' ||
    host === '0.0.0.0' ||
    host === '::1' ||
    host === '[::1]' ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^169\.254\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(host) ||
    /^f[cd][0-9a-f]{2}:/i.test(host)
  ) {
    throw new Error('Source URL cannot target private, loopback, or link-local addresses.');
  }
  return parsed.toString();
}

async function ingestSingleSource(source: {
  id: string;
  name: string;
  source_url: string;
  source_type: string;
  default_category: string;
  auto_publish: number;
}): Promise<{
  status: 'success' | 'partial' | 'error';
  itemsFound: number;
  itemsInserted: number;
  duplicatesSkipped: number;
  errorMessage: string | null;
}> {
  const started = Date.now();
  let itemsFound = 0;
  let itemsInserted = 0;
  let duplicatesSkipped = 0;
  let errorMessage: string | null = null;
  let status: 'success' | 'partial' | 'error' = 'success';

  const candidates: Array<{ title: string; description: string; link: string; pdfUrl: string | null }> = [];

  try {
    const safeSourceUrl = assertSafeExternalSourceUrl(source.source_url);
    if (source.source_type === 'rss') {
      const feed = await rssParser.parseURL(safeSourceUrl);
      for (const item of feed.items.slice(0, 20)) {
        const title = (item.title || '').trim();
        const link = (item.link || source.source_url).trim();
        const description = (item.contentSnippet || item.content || '').trim().slice(0, 500);
        if (title.length >= 6) {
          candidates.push({
            title,
            description,
            link,
            pdfUrl: link.toLowerCase().endsWith('.pdf') ? link : null,
          });
        }
      }
    } else if (source.source_type === 'api') {
      const resp = await fetch(source.source_url, {
        signal: AbortSignal.timeout(12000),
        headers: { 'User-Agent': 'AMAN-COMPUTER-Door5/1.0' },
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const json = (await resp.json()) as unknown;
      const arr = Array.isArray(json)
        ? json
        : Array.isArray((json as Record<string, unknown>)?.items)
          ? ((json as Record<string, unknown>).items as Array<Record<string, unknown>>)
          : [];
      for (const row of arr.slice(0, 20)) {
        const title = String(row.title || row.name || '').trim();
        const link = String(row.url || row.link || source.source_url).trim();
        const description = String(row.description || row.summary || '').trim().slice(0, 500);
        if (title.length >= 6) {
          candidates.push({
            title,
            description,
            link,
            pdfUrl: link.toLowerCase().endsWith('.pdf') ? link : null,
          });
        }
      }
    } else {
      const resp = await fetch(source.source_url, {
        signal: AbortSignal.timeout(12000),
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AMAN-COMPUTER-Door5/1.0)' },
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const html = await resp.text();
      const $ = cheerio.load(html);
      const seenLinks = new Set<string>();
      $('a[href]').each((_i, el) => {
        if (candidates.length >= 20) return;
        const text = $(el).text().replace(/\s+/g, ' ').trim();
        const href = ($(el).attr('href') || '').trim();
        if (text.length < 18 || text.length > 240 || !href || href.startsWith('javascript:')) return;
        let resolvedUrl = source.source_url;
        try {
          resolvedUrl = new URL(href, source.source_url).toString();
        } catch {
          return;
        }
        if (seenLinks.has(resolvedUrl)) return;
        seenLinks.add(resolvedUrl);
        candidates.push({
          title: text,
          description: `Official notice from ${source.name}`,
          link: resolvedUrl,
          pdfUrl: resolvedUrl.toLowerCase().includes('.pdf') ? resolvedUrl : null,
        });
      });
    }

    itemsFound = candidates.length;
    const ts = nowIso();
    const insertUpdate = db.prepare(
      `INSERT INTO govt_updates (
        id, source_id, content_hash, title, description, hindi_summary, category,
        source_url, pdf_url, official_image_url, status, published_at, expires_at, created_at
      ) VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?, NULL, ?, ?, NULL, ?)`
    );
    const existsStmt = db.prepare('SELECT id FROM govt_updates WHERE content_hash = ?');

    for (const c of candidates) {
      const normalizedKey = `${c.title.toLowerCase()}|${c.link}`;
      const contentHash = crypto.createHash('sha256').update(normalizedKey).digest('hex');
      if (existsStmt.get(contentHash)) {
        duplicatesSkipped += 1;
        continue;
      }
      const nextStatus = source.auto_publish ? 'published' : 'pending';
      insertUpdate.run(
        crypto.randomUUID(),
        source.id,
        contentHash,
        c.title,
        c.description,
        source.default_category,
        c.link,
        c.pdfUrl,
        nextStatus,
        source.auto_publish ? ts : null,
        ts
      );
      itemsInserted += 1;
    }

    if (itemsFound === 0) status = 'partial';
  } catch (err) {
    status = 'error';
    errorMessage = err instanceof Error ? err.message : 'Portal unreachable';
  }

  const ts = nowIso();
  const durationMs = Date.now() - started;
  db.prepare(
    `UPDATE govt_sources SET last_fetched_at = ?, last_status = ?, last_error = ? WHERE id = ?`
  ).run(ts, status, errorMessage, source.id);

  db.prepare(
    `INSERT INTO govt_fetch_logs (
      id, source_id, source_name, status, items_found, items_inserted,
      duplicates_skipped, duration_ms, error_message, fetched_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    crypto.randomUUID(),
    source.id,
    source.name,
    status,
    itemsFound,
    itemsInserted,
    duplicatesSkipped,
    durationMs,
    errorMessage,
    ts
  );

  if (itemsInserted > 0) {
    createNotification(
      'govt_update',
      `${itemsInserted} new notice(s) from ${source.name}`,
      'Review and publish under Door 5 Bihar Updates.',
      '#/bihar-updates/updates'
    );
  } else if (status === 'error') {
    createNotification(
      'failed_fetch',
      `Fetch failed: ${source.name}`,
      errorMessage || 'Portal fetch error',
      '#/bihar-updates/logs'
    );
  }

  return { status, itemsFound, itemsInserted, duplicatesSkipped, errorMessage };
}

app.get('/api/govt/state', requireAuth, requirePerm('govt.read'), (_req, res) => {
  res.json({
    sources: db.prepare('SELECT * FROM govt_sources ORDER BY name ASC').all(),
    updates: db.prepare('SELECT * FROM govt_updates ORDER BY created_at DESC LIMIT 100').all(),
    fetchLogs: db.prepare('SELECT * FROM govt_fetch_logs ORDER BY fetched_at DESC LIMIT 60').all(),
  });
});

app.post('/api/govt/sources', requireAuth, requirePerm('govt.publish'), (req, res) => {
  const s = req.body as Record<string, unknown>;
  let validatedUrl: string;
  try {
    validatedUrl = assertSafeExternalSourceUrl(String(s.source_url || ''));
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Invalid source_url' });
    return;
  }
  const id = crypto.randomUUID();
  db.prepare(
    `INSERT INTO govt_sources (
      id, name, department, source_url, source_type, default_category,
      is_trusted, auto_publish, is_active, fetch_interval_minutes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    String(s.name || 'Bihar Portal'),
    String(s.department || 'Government of Bihar'),
    validatedUrl,
    String(s.source_type || 'website'),
    String(s.default_category || 'Government Notifications'),
    s.is_trusted === 0 ? 0 : 1,
    s.auto_publish ? 1 : 0,
    s.is_active === 0 ? 0 : 1,
    Number(s.fetch_interval_minutes || 180)
  );
  recordAudit(getReqUser(req), `Added Bihar portal source "${String(s.name)}"`, 'Door 5', id);
  res.status(201).json(db.prepare('SELECT * FROM govt_sources WHERE id = ?').get(id));
});

app.put('/api/govt/sources/:id', requireAuth, requirePerm('govt.publish'), (req, res) => {
  const id = String(req.params.id);
  const existing = db.prepare('SELECT * FROM govt_sources WHERE id = ?').get(id) as
    | Record<string, unknown>
    | undefined;
  if (!existing) {
    res.status(404).json({ error: 'Source not found' });
    return;
  }
  const merged: Record<string, unknown> = { ...existing, ...(req.body as Record<string, unknown>) };
  let validatedUrl: string;
  try {
    validatedUrl = assertSafeExternalSourceUrl(String(merged.source_url || ''));
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Invalid source_url' });
    return;
  }
  db.prepare(
    `UPDATE govt_sources SET
      name = ?, department = ?, source_url = ?, source_type = ?, default_category = ?,
      is_trusted = ?, auto_publish = ?, is_active = ?, fetch_interval_minutes = ?
     WHERE id = ?`
  ).run(
    String(merged.name),
    String(merged.department),
    validatedUrl,
    String(merged.source_type),
    String(merged.default_category),
    merged.is_trusted ? 1 : 0,
    merged.auto_publish ? 1 : 0,
    merged.is_active ? 1 : 0,
    Number(merged.fetch_interval_minutes || 180),
    id
  );
  recordAudit(getReqUser(req), `Updated source "${String(merged.name)}"`, 'Door 5', id);
  res.json(db.prepare('SELECT * FROM govt_sources WHERE id = ?').get(id));
});

app.post('/api/govt/fetch', requireAuth, async (req, res) => {
  const user = getReqUser(req);
  if (!user.permissions.includes('govt.fetch') && !user.permissions.includes('govt.publish')) {
    res.status(403).json({ error: 'Missing govt.fetch permission' });
    return;
  }
  const { sourceId } = (req.body || {}) as { sourceId?: string };
  const sources = sourceId
    ? (db.prepare('SELECT * FROM govt_sources WHERE id = ?').all(sourceId) as Array<{
        id: string;
        name: string;
        source_url: string;
        source_type: string;
        default_category: string;
        auto_publish: number;
      }>)
    : (db.prepare('SELECT * FROM govt_sources WHERE is_active = 1').all() as Array<{
        id: string;
        name: string;
        source_url: string;
        source_type: string;
        default_category: string;
        auto_publish: number;
      }>);

  const results = [];
  for (const s of sources) {
    results.push(await ingestSingleSource(s));
  }
  recordAudit(user, `Executed Door 5 fetch (${results.length} source(s))`, 'Door 5');
  res.json({ ok: true, results });
});

app.patch('/api/govt/updates/:id', requireAuth, requirePerm('govt.publish'), (req, res) => {
  const id = String(req.params.id);
  const existing = db.prepare('SELECT * FROM govt_updates WHERE id = ?').get(id) as
    | Record<string, unknown>
    | undefined;
  if (!existing) {
    res.status(404).json({ error: 'Update notice not found' });
    return;
  }
  const patch = req.body as Record<string, unknown>;
  const merged: Record<string, unknown> = { ...existing, ...patch };
  const publishedAt =
    merged.status === 'published'
      ? (existing.published_at as string | null) || nowIso()
      : (merged.published_at as string | null) ?? null;

  db.prepare(
    `UPDATE govt_updates SET title = ?, description = ?, category = ?, expires_at = ?, status = ?, published_at = ? WHERE id = ?`
  ).run(
    String(merged.title),
    String(merged.description),
    String(merged.category),
    (merged.expires_at as string | null) ?? null,
    String(merged.status),
    publishedAt,
    id
  );
  recordAudit(getReqUser(req), `Updated Bihar notice status -> ${String(merged.status)}`, 'Door 5', id);
  res.json(db.prepare('SELECT * FROM govt_updates WHERE id = ?').get(id));
});

app.post(
  '/api/govt/updates/:id/summarize-hindi',
  requireAuth,
  requirePerm('govt.publish'),
  async (req, res) => {
    const id = String(req.params.id);
    const notice = db.prepare('SELECT * FROM govt_updates WHERE id = ?').get(id) as
      | { id: string; title: string; description: string; category: string }
      | undefined;
    if (!notice) {
      res.status(404).json({ error: 'Notice not found' });
      return;
    }
    const apiKey = process.env.GEMINI_API_KEY?.trim();
    if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
      res.status(503).json({ error: 'GEMINI_API_KEY is not configured on the server.' });
      return;
    }
    try {
      const ai = new GoogleGenAI({ apiKey });
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: `Summarize this Bihar Government official notice clearly in 2-3 simple Hindi sentences for citizens visiting a cyber cafe. Category: ${notice.category}. Title: ${notice.title}. Details: ${notice.description}`,
      });
      const hindiSummary = (response.text || '').trim();
      db.prepare('UPDATE govt_updates SET hindi_summary = ? WHERE id = ?').run(hindiSummary, id);
      recordAudit(getReqUser(req), 'Generated Gemini Hindi summary', 'Door 5', id);
      res.json({ ok: true, hindiSummary });
    } catch (err) {
      res.status(502).json({
        error: err instanceof Error ? err.message : 'Gemini API call failed',
      });
    }
  }
);

app.post('/api/govt/updates/expire-sweep', requireAuth, requirePerm('govt.publish'), (req, res) => {
  const ts = nowIso();
  const result = db
    .prepare(
      `UPDATE govt_updates SET status = 'expired'
       WHERE status IN ('pending', 'published') AND expires_at IS NOT NULL AND expires_at < ?`
    )
    .run(ts);
  recordAudit(getReqUser(req), `Ran expiry sweep (${result.changes} expired)`, 'Door 5');
  res.json({ ok: true, expiredCount: Number(result.changes || 0) });
});

// --- Access Control & Audit ---
app.get('/api/access/state', requireAuth, (req, res) => {
  const user = getReqUser(req);
  const roles = db.prepare('SELECT * FROM roles ORDER BY name ASC').all() as Array<{
    id: string;
    name: string;
    description: string;
  }>;
  const permissions = db.prepare('SELECT * FROM permissions ORDER BY module ASC, code ASC').all();
  const rpRows = db.prepare('SELECT role_id, permission_code FROM role_permissions').all() as Array<{
    role_id: string;
    permission_code: string;
  }>;
  const rolePermissions = roles.map((r) => ({
    roleId: r.id,
    roleName: r.name,
    permissions: rpRows.filter((rp) => rp.role_id === r.id).map((rp) => rp.permission_code),
  }));

  const canReadAccess = user.permissions.includes('access.read') || user.permissions.includes('access.manage');
  const canReadAudit = user.permissions.includes('audit.read') || canReadAccess;

  const users = canReadAccess
    ? db
        .prepare(
          `SELECT u.id, u.email, u.full_name, u.designation, u.role_id, r.name as role_name,
                  u.is_active, u.last_login_at, u.created_at
           FROM admin_users u
           JOIN roles r ON r.id = u.role_id
           ORDER BY u.created_at ASC`
        )
        .all()
    : [];

  const loginLogs = canReadAudit
    ? db.prepare('SELECT * FROM login_logs ORDER BY created_at DESC LIMIT 60').all()
    : [];
  const auditLogs = canReadAudit
    ? db.prepare('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 80').all()
    : [];

  res.json({ roles, permissions, rolePermissions, users, loginLogs, auditLogs });
});

app.post('/api/access/users', requireAuth, requirePerm('access.manage'), (req, res) => {
  const { fullName, email, designation, roleId, password } = req.body as {
    fullName?: string;
    email?: string;
    designation?: string;
    roleId?: string;
    password?: string;
  };
  const normalizedEmail = email?.trim().toLowerCase() || '';
  if (!fullName?.trim() || !normalizedEmail || !roleId || !password || password.length < 8) {
    res.status(400).json({ error: 'All fields and 8+ char password are required.' });
    return;
  }
  const existing = db.prepare('SELECT id FROM admin_users WHERE email = ?').get(normalizedEmail);
  if (existing) {
    res.status(409).json({ error: 'An admin user with this email already exists.' });
    return;
  }
  const id = crypto.randomUUID();
  db.prepare(
    `INSERT INTO admin_users (id, email, full_name, designation, role_id, password_hash, is_active, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 1, ?)`
  ).run(
    id,
    normalizedEmail,
    fullName.trim(),
    designation?.trim() || 'Staff',
    roleId,
    hashPassword(password),
    nowIso()
  );
  recordAudit(getReqUser(req), `Created admin account ${normalizedEmail}`, 'Access', id);
  res.status(201).json({ id });
});

app.patch('/api/access/users/:id', requireAuth, requirePerm('access.manage'), (req, res) => {
  const id = String(req.params.id);
  const { roleId, isActive, designation } = req.body as {
    roleId?: string;
    isActive?: boolean;
    designation?: string;
  };
  const existing = db.prepare('SELECT * FROM admin_users WHERE id = ?').get(id) as
    | { id: string; email: string; role_id: string; is_active: number; designation: string }
    | undefined;
  if (!existing) {
    res.status(404).json({ error: 'Admin user not found' });
    return;
  }
  db.prepare(
    'UPDATE admin_users SET role_id = ?, is_active = ?, designation = ? WHERE id = ?'
  ).run(
    roleId ?? existing.role_id,
    typeof isActive === 'boolean' ? (isActive ? 1 : 0) : existing.is_active,
    designation ?? existing.designation,
    id
  );
  recordAudit(getReqUser(req), `Updated account ${existing.email}`, 'Access', id);
  res.json({ ok: true });
});

app.post('/api/access/users/:id/reset-token', requireAuth, requirePerm('access.manage'), (req, res) => {
  const id = String(req.params.id);
  const userRow = db.prepare('SELECT id, email FROM admin_users WHERE id = ?').get(id) as
    | { id: string; email: string }
    | undefined;
  if (!userRow) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  const rawToken = crypto.randomBytes(20).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
  db.prepare(
    'INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)'
  ).run(crypto.randomUUID(), userRow.id, tokenHash, expiresAt, nowIso());
  recordAudit(getReqUser(req), `Issued reset token for ${userRow.email}`, 'Access', id);
  res.json({ token: rawToken, expiresInMinutes: 30 });
});

app.patch(
  '/api/access/roles/:roleId/permissions',
  requireAuth,
  requirePerm('access.manage'),
  (req, res) => {
    const roleId = String(req.params.roleId);
    if (roleId === 'role-super-admin') {
      res.status(400).json({ error: 'Super Admin role retains all system permissions.' });
      return;
    }
    const { permissionCodes } = req.body as { permissionCodes?: string[] };
    if (!Array.isArray(permissionCodes)) {
      res.status(400).json({ error: 'permissionCodes array is required' });
      return;
    }
    db.prepare('DELETE FROM role_permissions WHERE role_id = ?').run(roleId);
    const ins = db.prepare(
      'INSERT OR IGNORE INTO role_permissions (role_id, permission_code) VALUES (?, ?)'
    );
    for (const code of permissionCodes) ins.run(roleId, String(code));
    recordAudit(getReqUser(req), `Updated permissions for ${roleId}`, 'Access', roleId);
    res.json({ ok: true });
  }
);

// --- Notifications & FCM ---
app.post('/api/notifications/:id/read', requireAuth, (req, res) => {
  db.prepare('UPDATE admin_notifications SET is_read = 1 WHERE id = ?').run(String(req.params.id));
  res.json({ ok: true });
});

app.post('/api/notifications/read-all', requireAuth, (_req, res) => {
  db.prepare('UPDATE admin_notifications SET is_read = 1').run();
  res.json({ ok: true });
});

app.post('/api/notifications/fcm-token', requireAuth, (req, res) => {
  const { token, deviceLabel } = req.body as { token?: string; deviceLabel?: string };
  if (!token?.trim()) {
    res.status(400).json({ error: 'FCM token is required' });
    return;
  }
  const user = getReqUser(req);
  db.prepare(
    `INSERT INTO fcm_tokens (id, user_id, token, device_label, created_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(token) DO UPDATE SET user_id = excluded.user_id, device_label = excluded.device_label`
  ).run(crypto.randomUUID(), user.id, token.trim(), deviceLabel || 'Browser', nowIso());
  res.json({ ok: true });
});

// --- System Export ---
app.get('/api/system/export', requireAuth, requirePerm('audit.read'), (req, res) => {
  recordAudit(getReqUser(req), 'Exported complete workspace database JSON', 'System');
  res.json({
    exportedAt: nowIso(),
    businessProfile: db.prepare('SELECT * FROM business_profile WHERE id = 1').get(),
    heroSection: db.prepare('SELECT * FROM hero_section WHERE id = 1').get(),
    ownerProfile: db.prepare('SELECT * FROM owner_profile WHERE id = 1').get(),
    websiteSettings: db.prepare('SELECT * FROM website_settings WHERE id = 1').get(),
    services: db.prepare('SELECT * FROM services').all(),
    galleryItems: db.prepare('SELECT * FROM gallery_items').all(),
    testimonials: db.prepare('SELECT * FROM testimonials').all(),
    faqs: db.prepare('SELECT * FROM faqs').all(),
    enquiries: db.prepare('SELECT * FROM enquiries').all(),
    govtSources: db.prepare('SELECT * FROM govt_sources').all(),
    govtUpdates: db.prepare('SELECT * FROM govt_updates').all(),
  });
});

// Error handler for multer & unexpected API errors
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  if (req.path.startsWith('/api/')) {
    res.status(400).json({ error: err.message || 'Bad request' });
    return;
  }
  next(err);
});

async function startServer(): Promise<void> {
  if (!IS_PROD) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.join(ROOT_DIR, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`AMAN COMPUTER Admin Dashboard listening on http://0.0.0.0:${PORT}`);
  });
}

void startServer();
