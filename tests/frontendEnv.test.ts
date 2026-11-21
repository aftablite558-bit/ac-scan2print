// AC Scan2Print — Frontend Environment Configuration & Security Validation Tests

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import {
  detectPrivilegedSecretLeak,
  resolveBrandLogoUrl,
  resolvePublicWebsiteUrl,
  validateFirebaseConfig,
  validateFrontendEnv,
  validateSupabaseConfig,
} from '../src/lib/env.ts';
import {
  checkSupabaseLiveConnectivity,
  getSupabaseClient,
  getSupabaseConfigError,
  requireSupabaseClient,
} from '../src/lib/supabase.ts';
import { getFirebaseApp, getFirebaseConfigError, requireFirebaseApp } from '../src/lib/firebase.ts';

function fakeJwtWithRole(role: string): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ role, iss: 'supabase' })).toString('base64url');
  return `${header}.${payload}.signature`;
}

test('validateSupabaseConfig reports clear errors when required VITE_SUPABASE_* vars are missing', () => {
  const res = validateSupabaseConfig({});
  assert.equal(res.ok, false);
  assert.equal(res.configured, false);
  assert.deepEqual(res.missingKeys, ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY']);
  assert.match(res.summary ?? '', /VITE_SUPABASE_URL/);
  assert.match(res.summary ?? '', /VITE_SUPABASE_ANON_KEY/);
});

test('validateSupabaseConfig validates URL scheme and rejects service_role or secret keys', () => {
  const badUrl = validateSupabaseConfig({
    VITE_SUPABASE_URL: 'ftp://invalid.supabase.co',
    VITE_SUPABASE_ANON_KEY: fakeJwtWithRole('anon'),
  });
  assert.equal(badUrl.ok, false);
  assert.match(badUrl.summary ?? '', /https:\/\//);

  const leakedServiceRole = validateSupabaseConfig({
    VITE_SUPABASE_URL: 'https://example-project.supabase.co',
    VITE_SUPABASE_ANON_KEY: fakeJwtWithRole('service_role'),
  });
  assert.equal(leakedServiceRole.ok, false);
  assert.match(leakedServiceRole.summary ?? '', /service_role/);

  const leakedSecretPrefix = validateSupabaseConfig({
    VITE_SUPABASE_URL: 'https://example-project.supabase.co',
    VITE_SUPABASE_ANON_KEY: 'sb_secret_not_allowed_in_client',
  });
  assert.equal(leakedSecretPrefix.ok, false);
  assert.match(leakedSecretPrefix.summary ?? '', /sb_secret_/);

  const valid = validateSupabaseConfig({
    VITE_SUPABASE_URL: 'https://example-project.supabase.co/',
    VITE_SUPABASE_ANON_KEY: fakeJwtWithRole('anon'),
  });
  assert.equal(valid.ok, true);
  assert.equal(valid.config?.url, 'https://example-project.supabase.co');
});

test('validateFirebaseConfig validates all 6 required keys and rejects private/service-account credentials', () => {
  const missing = validateFirebaseConfig({
    VITE_FIREBASE_API_KEY: 'AIzaTestKey',
    VITE_FIREBASE_PROJECT_ID: 'ac-scan2print-test',
  });
  assert.equal(missing.ok, false);
  assert.deepEqual(missing.missingKeys, [
    'VITE_FIREBASE_AUTH_DOMAIN',
    'VITE_FIREBASE_STORAGE_BUCKET',
    'VITE_FIREBASE_MESSAGING_SENDER_ID',
    'VITE_FIREBASE_APP_ID',
  ]);

  const badFormat = validateFirebaseConfig({
    VITE_FIREBASE_API_KEY: 'AIzaTestKey',
    VITE_FIREBASE_AUTH_DOMAIN: 'https://ac-scan2print.firebaseapp.com',
    VITE_FIREBASE_PROJECT_ID: 'ac-scan2print',
    VITE_FIREBASE_STORAGE_BUCKET: 'ac-scan2print.firebasestorage.app',
    VITE_FIREBASE_MESSAGING_SENDER_ID: 'not-numeric',
    VITE_FIREBASE_APP_ID: 'invalid-app-id',
  });
  assert.equal(badFormat.ok, false);
  assert.equal(badFormat.errors.length, 3);

  const leakedPem = detectPrivilegedSecretLeak('VITE_FIREBASE_API_KEY', '-----BEGIN PRIVATE KEY-----abc');
  assert.match(leakedPem ?? '', /private key/i);

  const valid = validateFirebaseConfig({
    VITE_FIREBASE_API_KEY: 'AIzaTestPublicWebKey',
    VITE_FIREBASE_AUTH_DOMAIN: 'ac-scan2print.firebaseapp.com',
    VITE_FIREBASE_PROJECT_ID: 'ac-scan2print',
    VITE_FIREBASE_STORAGE_BUCKET: 'ac-scan2print.firebasestorage.app',
    VITE_FIREBASE_MESSAGING_SENDER_ID: '123456789012',
    VITE_FIREBASE_APP_ID: '1:123456789012:web:abcdef123456',
  });
  assert.equal(valid.ok, true);
  assert.equal(valid.config?.projectId, 'ac-scan2print');
});

test('Separate Supabase & Firebase validation preserves project separation & unconfigured runtime fails cleanly without claiming live connectivity', async () => {
  const combined = validateFrontendEnv({
    VITE_SUPABASE_URL: 'https://ac-scan2print-sb.supabase.co',
    VITE_SUPABASE_ANON_KEY: fakeJwtWithRole('anon'),
  });
  assert.equal(combined.supabase.ok, true);
  assert.equal(combined.firebase.ok, false);
  assert.equal(combined.allConfigured, false);

  // When runtime env vars are unset in container, wrappers must return null / clear errors and NEVER claim live connection
  assert.equal(getSupabaseClient(), null);
  assert.ok(getSupabaseConfigError());
  assert.throws(() => requireSupabaseClient(), /VITE_SUPABASE_URL/);

  assert.equal(getFirebaseApp(), null);
  assert.ok(getFirebaseConfigError());
  assert.throws(() => requireFirebaseApp(), /VITE_FIREBASE_API_KEY/);

  const probe = await checkSupabaseLiveConnectivity();
  assert.equal(probe.configured, false);
  assert.equal(probe.connected, false);
});

test('Security & Hygiene: .env.local excluded from Git and src/ contains zero hardcoded secrets or process.env leaks', () => {
  const gitignore = fs.readFileSync(path.resolve('.gitignore'), 'utf8');
  assert.match(gitignore, /^\.env\*$/m);
  assert.match(gitignore, /^!\.env\.example$/m);

  const srcFiles = fs.readdirSync(path.resolve('src'), { recursive: true }) as string[];
  for (const rel of srcFiles) {
    const full = path.resolve('src', rel);
    if (!fs.statSync(full).isFile() || !/\.(ts|tsx|js|jsx)$/.test(full)) continue;
    const content = fs.readFileSync(full, 'utf8');
    assert.doesNotMatch(content, /import\.meta\.env\.SUPABASE_SERVICE_ROLE_KEY/);
    assert.doesNotMatch(content, /import\.meta\.env\.FIREBASE_SERVER_KEY/);
    assert.doesNotMatch(content, /import\.meta\.env\.ADMIN_BOOTSTRAP_SECRET/);
    assert.doesNotMatch(content, /-----BEGIN [A-Z ]*PRIVATE KEY-----/);
    assert.doesNotMatch(content, /sb_secret_[a-zA-Z0-9_-]{8,}/);
    assert.doesNotMatch(content, /eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\./);
    assert.doesNotMatch(content, /AIza[0-9A-Za-z_-]{20,}/);
    assert.doesNotMatch(content, /process\.env\./);
  }
});

test('resolvePublicWebsiteUrl never invents a URL when unset and validates configured public website URLs safely', () => {
  const unset = resolvePublicWebsiteUrl({});
  assert.deepEqual(unset, { configured: false, url: null, error: null });

  const blank = resolvePublicWebsiteUrl({ VITE_PUBLIC_WEBSITE_URL: '   ' });
  assert.deepEqual(blank, { configured: false, url: null, error: null });

  const validHttps = resolvePublicWebsiteUrl({ VITE_PUBLIC_WEBSITE_URL: 'https://amancomputer.example/home' });
  assert.equal(validHttps.configured, true);
  assert.equal(validHttps.url, 'https://amancomputer.example/home');
  assert.equal(validHttps.error, null);

  const validLocal = resolvePublicWebsiteUrl({ VITE_PUBLIC_WEBSITE_URL: 'http://localhost:5173' });
  assert.equal(validLocal.configured, true);
  assert.equal(validLocal.url, 'http://localhost:5173/');

  const validRelative = resolvePublicWebsiteUrl({ VITE_PUBLIC_WEBSITE_URL: '/public' });
  assert.equal(validRelative.configured, true);
  assert.equal(validRelative.url, '/public');

  const xssScheme = resolvePublicWebsiteUrl({ VITE_PUBLIC_WEBSITE_URL: 'javascript:alert(1)' });
  assert.equal(xssScheme.configured, false);
  assert.ok(xssScheme.error);

  const protocolRelative = resolvePublicWebsiteUrl({ VITE_PUBLIC_WEBSITE_URL: '//evil.example.com' });
  assert.equal(protocolRelative.configured, false);
  assert.ok(protocolRelative.error);
});

test('resolveBrandLogoUrl returns null when unset and rejects unsafe/invalid URLs', () => {
  assert.equal(resolveBrandLogoUrl({}), null);
  assert.equal(resolveBrandLogoUrl({ VITE_BRAND_LOGO_URL: '   ' }), null);
  assert.equal(resolveBrandLogoUrl({ VITE_BRAND_LOGO_URL: '/assets/logo.svg' }), '/assets/logo.svg');
  assert.equal(
    resolveBrandLogoUrl({ VITE_BRAND_LOGO_URL: 'https://cdn.example.com/logo.png' }),
    'https://cdn.example.com/logo.png'
  );
  assert.equal(resolveBrandLogoUrl({ VITE_BRAND_LOGO_URL: 'javascript:alert(1)' }), null);
  assert.equal(resolveBrandLogoUrl({ VITE_BRAND_LOGO_URL: '//evil.example.com/logo.png' }), null);
  assert.equal(
    resolveBrandLogoUrl({ VITE_BRAND_LOGO_URL: '-----BEGIN PRIVATE KEY-----' }),
    null
  );
});

