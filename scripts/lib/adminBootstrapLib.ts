// AC Scan2Print — Secure One-Time Super Admin Bootstrap & Verification Library
// Server/CLI-only module. Never import from frontend src/ or customer-portal/src/.
// Never logs, prints, or persists tokens, passwords, bootstrap secrets, or service-role keys.

import {
  canAccessAdminRoute,
  createAdminSessionFromBackend,
  SINGLE_ADMIN_PERMISSIONS,
  type VerifiedBackendAdmin,
} from '../../src/lib/scan2printAdmin.ts';

export const DEFAULT_TARGET_FIREBASE_UID = 'Yr0Wr7PuuAdOIMaqohmqaINNbNC2';
export const DEFAULT_FIREBASE_PROJECT_ID = 'aman-computer-27b21';
export const DEFAULT_SUPABASE_PROJECT_REF = 'tvtfgsijxlxpwgakpeag';
export const DEFAULT_SUPABASE_URL = `https://${DEFAULT_SUPABASE_PROJECT_REF}.supabase.co`;

export interface DecodedFirebaseTokenClaims {
  firebaseUid: string;
  email: string | null;
  emailVerified: boolean;
  issuer: string;
  audience: string;
  issuedAt: number;
  expiresAt: number;
}

export interface BootstrapExecutionInput {
  supabaseUrl: string;
  supabaseAnonKey: string;
  bootstrapSecret: string;
  idToken: string;
  fullName: string;
  email?: string;
  expectedUid?: string;
  expectedProjectId?: string;
  nowSec?: number;
  fetchImpl?: typeof fetch;
}

export interface BootstrapExecutionResult {
  status: number;
  alreadyExists: boolean;
  admin: VerifiedBackendAdmin | null;
  message: string;
}

export interface AdminDatabaseRecord {
  id: string;
  firebase_uid: string | null;
  user_id: string | null;
  email: string;
  full_name: string;
  is_active: boolean;
  singleton_guard: boolean;
  created_at?: string;
}

export interface DatabaseVerificationResult {
  verified: boolean;
  recordCount: number;
  record: AdminDatabaseRecord | null;
  errors: string[];
}

export interface AdminLoginVerificationResult {
  authorized: boolean;
  admin: VerifiedBackendAdmin;
  roleName: string;
  permissionsGranted: string[];
  printersEndpointOk: boolean;
  printerCount: number;
  errors: string[];
}

function decodeBase64UrlJson(segment: string): Record<string, unknown> {
  const normalized = segment.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  const raw = Buffer.from(padded, 'base64').toString('utf8');
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('JWT segment did not decode to a JSON object.');
  }
  return parsed as Record<string, unknown>;
}

/**
 * Validates Firebase ID Token structure and claims locally before transmitting to Supabase.
 * Cryptographic RS256 signature verification is strictly enforced server-side against Google JWKS.
 */
export function decodeAndValidateFirebaseIdTokenClaims(
  rawToken: string,
  options: {
    expectedUid?: string;
    expectedProjectId?: string;
    nowSec?: number;
  } = {}
): DecodedFirebaseTokenClaims {
  const token = rawToken.trim();
  if (!token) {
    throw new Error('Firebase ID token is required.');
  }
  const parts = token.split('.');
  if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) {
    throw new Error('Firebase ID token must be a valid 3-part JWT.');
  }

  let header: Record<string, unknown>;
  let payload: Record<string, unknown>;
  try {
    header = decodeBase64UrlJson(parts[0]);
    payload = decodeBase64UrlJson(parts[1]);
  } catch {
    throw new Error('Unable to decode Firebase ID token header or payload.');
  }

  if (header.alg !== 'RS256') {
    throw new Error(`Invalid Firebase ID token algorithm '${String(header.alg ?? '')}'; expected RS256.`);
  }

  const expectedProjectId = (options.expectedProjectId ?? DEFAULT_FIREBASE_PROJECT_ID).trim();
  const expectedIssuer = `https://securetoken.google.com/${expectedProjectId}`;
  const issuer = typeof payload.iss === 'string' ? payload.iss : '';
  const audience = typeof payload.aud === 'string' ? payload.aud : '';
  const firebaseUid = typeof payload.sub === 'string' ? payload.sub.trim() : '';
  const iat = typeof payload.iat === 'number' ? payload.iat : 0;
  const exp = typeof payload.exp === 'number' ? payload.exp : 0;
  const nowSec = options.nowSec ?? Math.floor(Date.now() / 1000);

  if (issuer !== expectedIssuer) {
    throw new Error(`Firebase ID token issuer mismatch (expected ${expectedIssuer}).`);
  }
  if (audience !== expectedProjectId) {
    throw new Error(`Firebase ID token audience mismatch (expected ${expectedProjectId}).`);
  }
  if (!firebaseUid) {
    throw new Error('Firebase ID token is missing the sub (UID) claim.');
  }

  const expectedUid = (options.expectedUid ?? DEFAULT_TARGET_FIREBASE_UID).trim();
  if (expectedUid && firebaseUid !== expectedUid) {
    throw new Error(
      `Firebase ID token UID '${firebaseUid}' does not match required target UID '${expectedUid}'.`
    );
  }

  if (!Number.isFinite(exp) || exp <= nowSec) {
    throw new Error('Firebase ID token is expired. Sign in again to obtain a fresh ID token.');
  }

  const email = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : null;
  return {
    firebaseUid,
    email: email || null,
    emailVerified: payload.email_verified === true,
    issuer,
    audience,
    issuedAt: iat,
    expiresAt: exp,
  };
}

/**
 * Signs into Firebase Authentication (Email/Password) via official Identity Toolkit REST API
 * and immediately validates that the returned localId matches the target UID.
 */
export async function signInWithFirebasePasswordRest(input: {
  firebaseApiKey: string;
  email: string;
  password: string;
  expectedUid?: string;
  fetchImpl?: typeof fetch;
}): Promise<{ idToken: string; localId: string; email: string }> {
  const apiKey = input.firebaseApiKey.trim();
  const email = input.email.trim();
  const password = input.password;
  if (!apiKey) {
    throw new Error('Firebase Web API key is required to sign in via Email/Password.');
  }
  if (!email || !password) {
    throw new Error('Admin email and password are required.');
  }

  const fetchFn = input.fetchImpl ?? fetch;
  const endpoint = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(
    apiKey
  )}`;

  const res = await fetchFn(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email,
      password,
      returnSecureToken: true,
    }),
  });

  const rawText = await res.text();
  let parsed: Record<string, unknown> = {};
  try {
    parsed = rawText ? (JSON.parse(rawText) as Record<string, unknown>) : {};
  } catch {
    // non-JSON response
  }

  if (!res.ok) {
    const errObj = parsed.error as { message?: string } | undefined;
    const code = errObj?.message || `HTTP_${res.status}`;
    throw new Error(`Firebase Email/Password sign-in failed (${code}).`);
  }

  const idToken = typeof parsed.idToken === 'string' ? parsed.idToken.trim() : '';
  const localId = typeof parsed.localId === 'string' ? parsed.localId.trim() : '';
  const resolvedEmail =
    typeof parsed.email === 'string' ? parsed.email.trim().toLowerCase() : email.toLowerCase();

  if (!idToken || !localId) {
    throw new Error('Firebase sign-in response omitted idToken or localId.');
  }

  const expectedUid = (input.expectedUid ?? DEFAULT_TARGET_FIREBASE_UID).trim();
  if (expectedUid && localId !== expectedUid) {
    throw new Error(
      `Authenticated Firebase user UID '${localId}' does not match required target UID '${expectedUid}'.`
    );
  }

  return { idToken, localId, email: resolvedEmail };
}

function parseEdgeError(rawText: string, status: number): { code: string; message: string } {
  if (rawText) {
    try {
      const parsed = JSON.parse(rawText) as {
        error?: { code?: string; message?: string } | string;
        message?: string;
      };
      if (parsed.error && typeof parsed.error === 'object') {
        return {
          code: parsed.error.code || `HTTP_${status}`,
          message: parsed.error.message || `Request failed (${status}).`,
        };
      }
      if (typeof parsed.error === 'string') {
        return { code: `HTTP_${status}`, message: parsed.error };
      }
      if (typeof parsed.message === 'string') {
        return { code: `HTTP_${status}`, message: parsed.message };
      }
    } catch {
      return { code: `HTTP_${status}`, message: rawText };
    }
  }
  return { code: `HTTP_${status}`, message: `Request failed (${status}).` };
}

/**
 * Invokes the deployed `admin-bootstrap` Edge Function using verified Firebase ID Token,
 * Supabase anon apikey, and server-side ADMIN_BOOTSTRAP_SECRET.
 */
export async function executeAdminBootstrap(
  input: BootstrapExecutionInput
): Promise<BootstrapExecutionResult> {
  const supabaseUrl = input.supabaseUrl.trim().replace(/\/+$/, '');
  const supabaseAnonKey = input.supabaseAnonKey.trim();
  const bootstrapSecret = input.bootstrapSecret.trim();
  const expectedUid = (input.expectedUid ?? DEFAULT_TARGET_FIREBASE_UID).trim();
  const expectedProjectId = (input.expectedProjectId ?? DEFAULT_FIREBASE_PROJECT_ID).trim();
  const fullName = input.fullName.trim();

  if (!supabaseUrl) throw new Error('Supabase URL is required.');
  if (!supabaseAnonKey) throw new Error('Supabase anon/publishable apikey is required.');
  if (!bootstrapSecret) throw new Error('ADMIN_BOOTSTRAP_SECRET is required.');
  if (fullName.length < 2) throw new Error('Admin fullName (at least 2 characters) is required.');

  const claims = decodeAndValidateFirebaseIdTokenClaims(input.idToken, {
    expectedUid,
    expectedProjectId,
    nowSec: input.nowSec,
  });

  const email = (input.email?.trim() || claims.email || '').toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('A valid admin email matching the Firebase account is required.');
  }
  if (claims.email && email !== claims.email) {
    throw new Error('Provided email does not match the verified Firebase ID token email claim.');
  }

  const fetchFn = input.fetchImpl ?? fetch;
  const endpoint = `${supabaseUrl}/functions/v1/admin-bootstrap`;

  const res = await fetchFn(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${input.idToken.trim()}`,
      apikey: supabaseAnonKey,
      'x-admin-bootstrap-secret': bootstrapSecret,
    },
    body: JSON.stringify({
      firebaseUid: claims.firebaseUid,
      email,
      fullName,
    }),
  });

  const rawText = await res.text();
  if (res.status === 409) {
    const parsedErr = parseEdgeError(rawText, res.status);
    if (parsedErr.code === 'SINGLE_ADMIN_ALREADY_EXISTS') {
      return {
        status: 409,
        alreadyExists: true,
        admin: null,
        message: parsedErr.message,
      };
    }
  }

  if (!res.ok) {
    const parsedErr = parseEdgeError(rawText, res.status);
    throw new Error(`admin-bootstrap failed (${res.status} ${parsedErr.code}): ${parsedErr.message}`);
  }

  const data = JSON.parse(rawText) as {
    adminId: string;
    firebaseUid: string;
    email: string;
    fullName: string;
    isActive: boolean;
  };

  if (data.firebaseUid !== expectedUid) {
    throw new Error(
      `Bootstrap returned unexpected firebaseUid '${data.firebaseUid}' instead of '${expectedUid}'.`
    );
  }

  return {
    status: res.status,
    alreadyExists: false,
    admin: {
      id: data.adminId,
      firebaseUid: data.firebaseUid,
      email: data.email,
      fullName: data.fullName,
      isActive: Boolean(data.isActive),
    },
    message: 'Super Admin record bootstrapped successfully.',
  };
}

/**
 * Verifies post-bootstrap database invariants directly via Supabase PostgREST using Service Role Key.
 * Ensures strictly 1 record, exact firebase_uid, is_active = true, user_id = null, singleton_guard = true.
 */
export async function verifyAdminDatabaseRecord(input: {
  supabaseUrl: string;
  serviceRoleKey: string;
  expectedUid?: string;
  expectedEmail?: string;
  fetchImpl?: typeof fetch;
}): Promise<DatabaseVerificationResult> {
  const supabaseUrl = input.supabaseUrl.trim().replace(/\/+$/, '');
  const serviceRoleKey = input.serviceRoleKey.trim();
  const expectedUid = (input.expectedUid ?? DEFAULT_TARGET_FIREBASE_UID).trim();

  if (!supabaseUrl) throw new Error('Supabase URL is required.');
  if (!serviceRoleKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY is required for DB verification.');

  const fetchFn = input.fetchImpl ?? fetch;
  const endpoint = `${supabaseUrl}/rest/v1/print_admin_accounts?select=id,firebase_uid,user_id,email,full_name,is_active,singleton_guard,created_at`;

  const res = await fetchFn(endpoint, {
    method: 'GET',
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      Accept: 'application/json',
    },
  });

  const rawText = await res.text();
  if (!res.ok) {
    throw new Error(`Database verification query failed (HTTP ${res.status}).`);
  }

  const rows = JSON.parse(rawText) as AdminDatabaseRecord[];
  const errors: string[] = [];

  if (!Array.isArray(rows) || rows.length !== 1) {
    errors.push(`Expected exactly 1 record in public.print_admin_accounts, found ${rows.length}.`);
    return { verified: false, recordCount: rows.length, record: rows[0] ?? null, errors };
  }

  const row = rows[0];
  if (row.firebase_uid !== expectedUid) {
    errors.push(`firebase_uid mismatch: expected '${expectedUid}', found '${row.firebase_uid}'.`);
  }
  if (row.is_active !== true) {
    errors.push(`is_active must be true, found '${String(row.is_active)}'.`);
  }
  if (row.user_id !== null) {
    errors.push(`user_id must be NULL for Firebase Admin, found '${row.user_id}'.`);
  }
  if (row.singleton_guard !== true) {
    errors.push(`singleton_guard must be true, found '${String(row.singleton_guard)}'.`);
  }
  if (input.expectedEmail && row.email.toLowerCase() !== input.expectedEmail.trim().toLowerCase()) {
    errors.push(`email mismatch: expected '${input.expectedEmail}', found '${row.email}'.`);
  }

  return {
    verified: errors.length === 0,
    recordCount: rows.length,
    record: row,
    errors,
  };
}

/**
 * Verifies Admin login authorization & RBAC dashboard readiness against deployed Admin Edge Functions.
 */
export async function verifyAdminLoginAuthorization(input: {
  supabaseUrl: string;
  supabaseAnonKey: string;
  idToken: string;
  expectedUid?: string;
  fetchImpl?: typeof fetch;
}): Promise<AdminLoginVerificationResult> {
  const supabaseUrl = input.supabaseUrl.trim().replace(/\/+$/, '');
  const supabaseAnonKey = input.supabaseAnonKey.trim();
  const expectedUid = (input.expectedUid ?? DEFAULT_TARGET_FIREBASE_UID).trim();
  const fetchFn = input.fetchImpl ?? fetch;

  const authHeaders = {
    Authorization: `Bearer ${input.idToken.trim()}`,
    apikey: supabaseAnonKey,
  };

  // 1. Verify Admin Authorization via GET admin-update-payment-settings (same call used by AdminContext)
  const verifyRes = await fetchFn(`${supabaseUrl}/functions/v1/admin-update-payment-settings`, {
    method: 'GET',
    headers: authHeaders,
  });
  const verifyRaw = await verifyRes.text();
  if (!verifyRes.ok) {
    const err = parseEdgeError(verifyRaw, verifyRes.status);
    throw new Error(`Admin backend authorization rejected (${verifyRes.status} ${err.code}): ${err.message}`);
  }
  const verifyJson = JSON.parse(verifyRaw) as {
    authorized?: boolean;
    admin?: VerifiedBackendAdmin;
  };

  if (!verifyJson.authorized || !verifyJson.admin || !verifyJson.admin.isActive) {
    throw new Error('Backend did not return an active authorized Admin record.');
  }

  const errors: string[] = [];
  if (verifyJson.admin.firebaseUid !== expectedUid) {
    errors.push(`Authorized firebaseUid mismatch: '${verifyJson.admin.firebaseUid}'.`);
  }

  // 2. Verify RBAC session mapping (same builder used by AdminContext)
  const session = createAdminSessionFromBackend(verifyJson.admin);
  if (!canAccessAdminRoute(session)) {
    errors.push('Admin session failed canAccessAdminRoute() check.');
  }
  for (const perm of SINGLE_ADMIN_PERMISSIONS) {
    if (!session.permissions.includes(perm)) {
      errors.push(`Missing expected RBAC permission '${perm}'.`);
    }
  }

  // 3. Verify secondary protected Admin Edge Function (`admin-printers` list)
  const printersRes = await fetchFn(`${supabaseUrl}/functions/v1/admin-printers`, {
    method: 'POST',
    headers: {
      ...authHeaders,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ action: 'list' }),
  });
  let printersEndpointOk = false;
  let printerCount = 0;
  if (printersRes.ok) {
    const printersData = JSON.parse(await printersRes.text()) as { printers?: unknown[] };
    printersEndpointOk = true;
    printerCount = Array.isArray(printersData.printers) ? printersData.printers.length : 0;
  } else {
    const pErr = parseEdgeError(await printersRes.text(), printersRes.status);
    errors.push(`Protected admin-printers check failed (${printersRes.status} ${pErr.code}): ${pErr.message}`);
  }

  return {
    authorized: verifyJson.authorized && errors.length === 0,
    admin: verifyJson.admin,
    roleName: session.roleName,
    permissionsGranted: session.permissions,
    printersEndpointOk,
    printerCount,
    errors,
  };
}

export function redactSensitiveOutput(text: string, secrets: Array<string | undefined | null>): string {
  let out = text;
  for (const secret of secrets) {
    const trimmed = secret?.trim();
    if (trimmed && trimmed.length >= 6) {
      out = out.split(trimmed).join('[REDACTED]');
    }
  }
  return out;
}

export function formatBootstrapVerificationSummary(input: {
  bootstrap?: BootstrapExecutionResult | null;
  database?: DatabaseVerificationResult | null;
  login?: AdminLoginVerificationResult | null;
}): string {
  const lines: string[] = ['=== AC Scan2Print Super Admin Provisioning Summary ==='];

  if (input.bootstrap) {
    lines.push(
      `[Bootstrap] Status: HTTP ${input.bootstrap.status} | ${
        input.bootstrap.alreadyExists ? 'ALREADY_EXISTS' : 'CREATED'
      }`
    );
    if (input.bootstrap.admin) {
      lines.push(
        `[Bootstrap] Admin ID: ${input.bootstrap.admin.id} | UID: ${input.bootstrap.admin.firebaseUid} | Email: ${input.bootstrap.admin.email} | Active: ${String(
          input.bootstrap.admin.isActive
        )}`
      );
    }
  }

  if (input.database) {
    lines.push(
      `[Database] Verified: ${String(input.database.verified)} | Record Count: ${input.database.recordCount}`
    );
    if (input.database.record) {
      lines.push(
        `[Database] UID=${input.database.record.firebase_uid} | is_active=${String(
          input.database.record.is_active
        )} | user_id=${String(input.database.record.user_id)} | singleton_guard=${String(
          input.database.record.singleton_guard
        )} | email=${input.database.record.email}`
      );
    }
    if (input.database.errors.length > 0) {
      lines.push(`[Database Errors] ${input.database.errors.join(' | ')}`);
    }
  } else {
    lines.push('[Database] Skipped (SUPABASE_SERVICE_ROLE_KEY not provided in operator env).');
  }

  if (input.login) {
    lines.push(
      `[Login & RBAC] Authorized: ${String(input.login.authorized)} | Role: ${input.login.roleName} | Permissions: ${
        input.login.permissionsGranted.length
      } | Printers Endpoint OK: ${String(input.login.printersEndpointOk)} (${input.login.printerCount} printers)`
    );
    if (input.login.errors.length > 0) {
      lines.push(`[Login Errors] ${input.login.errors.join(' | ')}`);
    }
  }

  return lines.join('\n');
}
