// AC Scan2Print — Frontend Environment Configuration & Security Validation
// Reads ONLY public Vite client environment variables via import.meta.env.
// Never hardcodes credentials and strictly rejects server/service-role secrets.

export type EnvRecord = Record<string, string | boolean | undefined>;

export interface SupabaseClientConfig {
  url: string;
  anonKey: string;
}

export interface FirebaseClientConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
  measurementId?: string;
  vapidKey?: string;
}

export interface ConfigValidationResult<T> {
  ok: boolean;
  configured: boolean;
  config: T | null;
  missingKeys: string[];
  errors: string[];
  summary: string | null;
}

const REQUIRED_SUPABASE_KEYS = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY'] as const;

const REQUIRED_FIREBASE_KEYS = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_STORAGE_BUCKET',
  'VITE_FIREBASE_MESSAGING_SENDER_ID',
  'VITE_FIREBASE_APP_ID',
] as const;

function readString(env: EnvRecord, key: string): string {
  const val = env[key];
  return typeof val === 'string' ? val.trim() : '';
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    const json = atob(padded);
    const parsed = JSON.parse(json);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export function detectPrivilegedSecretLeak(keyName: string, value: string): string | null {
  if (!value) return null;

  if (value.includes('-----BEGIN') || value.includes('PRIVATE KEY')) {
    return `${keyName} must never contain a private key or PEM certificate.`;
  }
  if (value.includes('"type":"service_account"') || value.includes('"type": "service_account"')) {
    return `${keyName} must never contain Firebase service-account JSON credentials.`;
  }
  if (/^postgres(ql)?:\/\//i.test(value)) {
    return `${keyName} must never contain a database connection string or password.`;
  }
  if (keyName === 'VITE_SUPABASE_ANON_KEY') {
    if (value.startsWith('sb_secret_')) {
      return 'VITE_SUPABASE_ANON_KEY must be the public anon/publishable key, never a Supabase secret key (sb_secret_*).';
    }
    const jwtPayload = decodeJwtPayload(value);
    if (jwtPayload && (jwtPayload.role === 'service_role' || jwtPayload.role === 'supabase_admin')) {
      return `VITE_SUPABASE_ANON_KEY contains a privileged '${String(jwtPayload.role)}' JWT. Expose only the public anon key to the frontend.`;
    }
  }
  return null;
}

export function readImportMetaEnv(): EnvRecord {
  const hasMetaEnv = typeof import.meta !== 'undefined' && Boolean(import.meta.env);
  return {
    VITE_SUPABASE_URL: hasMetaEnv ? import.meta.env.VITE_SUPABASE_URL : undefined,
    VITE_SUPABASE_ANON_KEY: hasMetaEnv ? import.meta.env.VITE_SUPABASE_ANON_KEY : undefined,
    VITE_FIREBASE_API_KEY: hasMetaEnv ? import.meta.env.VITE_FIREBASE_API_KEY : undefined,
    VITE_FIREBASE_AUTH_DOMAIN: hasMetaEnv ? import.meta.env.VITE_FIREBASE_AUTH_DOMAIN : undefined,
    VITE_FIREBASE_PROJECT_ID: hasMetaEnv ? import.meta.env.VITE_FIREBASE_PROJECT_ID : undefined,
    VITE_FIREBASE_STORAGE_BUCKET: hasMetaEnv ? import.meta.env.VITE_FIREBASE_STORAGE_BUCKET : undefined,
    VITE_FIREBASE_MESSAGING_SENDER_ID: hasMetaEnv
      ? import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID
      : undefined,
    VITE_FIREBASE_APP_ID: hasMetaEnv ? import.meta.env.VITE_FIREBASE_APP_ID : undefined,
    VITE_FIREBASE_MEASUREMENT_ID: hasMetaEnv ? import.meta.env.VITE_FIREBASE_MEASUREMENT_ID : undefined,
    VITE_FIREBASE_VAPID_KEY: hasMetaEnv ? import.meta.env.VITE_FIREBASE_VAPID_KEY : undefined,
    VITE_PUBLIC_WEBSITE_URL: hasMetaEnv ? import.meta.env.VITE_PUBLIC_WEBSITE_URL : undefined,
    VITE_BRAND_LOGO_URL: hasMetaEnv ? import.meta.env.VITE_BRAND_LOGO_URL : undefined,
  };
}

export function validateSupabaseConfig(
  env: EnvRecord = readImportMetaEnv()
): ConfigValidationResult<SupabaseClientConfig> {
  const missingKeys: string[] = [];
  const errors: string[] = [];

  for (const key of REQUIRED_SUPABASE_KEYS) {
    if (!readString(env, key)) {
      missingKeys.push(key);
    }
  }

  const url = readString(env, 'VITE_SUPABASE_URL');
  const anonKey = readString(env, 'VITE_SUPABASE_ANON_KEY');

  if (url) {
    const leakErr = detectPrivilegedSecretLeak('VITE_SUPABASE_URL', url);
    if (leakErr) errors.push(leakErr);
    try {
      const parsed = new URL(url);
      const isLocalHttp =
        parsed.protocol === 'http:' &&
        (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1');
      if (parsed.protocol !== 'https:' && !isLocalHttp) {
        errors.push('VITE_SUPABASE_URL must use https:// (or http://localhost for local development).');
      }
    } catch {
      errors.push('VITE_SUPABASE_URL is not a valid URL.');
    }
  }

  if (anonKey) {
    const leakErr = detectPrivilegedSecretLeak('VITE_SUPABASE_ANON_KEY', anonKey);
    if (leakErr) errors.push(leakErr);
  }

  if (missingKeys.length > 0) {
    errors.unshift(`Missing required Supabase environment variable(s): ${missingKeys.join(', ')}.`);
  }

  const ok = missingKeys.length === 0 && errors.length === 0;
  return {
    ok,
    configured: ok,
    config: ok ? { url: url.replace(/\/+$/, ''), anonKey } : null,
    missingKeys,
    errors,
    summary: ok ? null : errors.join(' '),
  };
}

export function validateFirebaseConfig(
  env: EnvRecord = readImportMetaEnv()
): ConfigValidationResult<FirebaseClientConfig> {
  const missingKeys: string[] = [];
  const errors: string[] = [];

  for (const key of REQUIRED_FIREBASE_KEYS) {
    if (!readString(env, key)) {
      missingKeys.push(key);
    }
  }

  const apiKey = readString(env, 'VITE_FIREBASE_API_KEY');
  const authDomain = readString(env, 'VITE_FIREBASE_AUTH_DOMAIN');
  const projectId = readString(env, 'VITE_FIREBASE_PROJECT_ID');
  const storageBucket = readString(env, 'VITE_FIREBASE_STORAGE_BUCKET');
  const messagingSenderId = readString(env, 'VITE_FIREBASE_MESSAGING_SENDER_ID');
  const appId = readString(env, 'VITE_FIREBASE_APP_ID');
  const measurementId = readString(env, 'VITE_FIREBASE_MEASUREMENT_ID') || undefined;
  const vapidKey = readString(env, 'VITE_FIREBASE_VAPID_KEY') || undefined;

  const allChecks: [string, string][] = [
    ['VITE_FIREBASE_API_KEY', apiKey],
    ['VITE_FIREBASE_AUTH_DOMAIN', authDomain],
    ['VITE_FIREBASE_PROJECT_ID', projectId],
    ['VITE_FIREBASE_STORAGE_BUCKET', storageBucket],
    ['VITE_FIREBASE_MESSAGING_SENDER_ID', messagingSenderId],
    ['VITE_FIREBASE_APP_ID', appId],
  ];
  if (measurementId) allChecks.push(['VITE_FIREBASE_MEASUREMENT_ID', measurementId]);
  if (vapidKey) allChecks.push(['VITE_FIREBASE_VAPID_KEY', vapidKey]);

  for (const [k, v] of allChecks) {
    const leakErr = detectPrivilegedSecretLeak(k, v);
    if (leakErr) errors.push(leakErr);
  }

  if (authDomain && (/^https?:\/\//i.test(authDomain) || /\s/.test(authDomain))) {
    errors.push('VITE_FIREBASE_AUTH_DOMAIN must be a hostname (e.g. project-id.firebaseapp.com), not a URL.');
  }
  if (storageBucket && (/^https?:\/\//i.test(storageBucket) || /\s/.test(storageBucket))) {
    errors.push('VITE_FIREBASE_STORAGE_BUCKET must be a bucket name without URL scheme or spaces.');
  }
  if (messagingSenderId && !/^\d+$/.test(messagingSenderId)) {
    errors.push('VITE_FIREBASE_MESSAGING_SENDER_ID must be numeric.');
  }
  if (appId && !/^\d+:\d+:(web|ios|android):[a-zA-Z0-9]+$/.test(appId)) {
    errors.push('VITE_FIREBASE_APP_ID does not match expected Firebase App ID format (<projectNum>:<id>:web:<hex>).');
  }

  if (missingKeys.length > 0) {
    errors.unshift(`Missing required Firebase environment variable(s): ${missingKeys.join(', ')}.`);
  }

  const ok = missingKeys.length === 0 && errors.length === 0;
  return {
    ok,
    configured: ok,
    config: ok
      ? {
          apiKey,
          authDomain,
          projectId,
          storageBucket,
          messagingSenderId,
          appId,
          ...(measurementId ? { measurementId } : {}),
          ...(vapidKey ? { vapidKey } : {}),
        }
      : null,
    missingKeys,
    errors,
    summary: ok ? null : errors.join(' '),
  };
}

export interface PublicWebsiteResolution {
  configured: boolean;
  url: string | null;
  error: string | null;
}

export function resolvePublicWebsiteUrl(
  env: EnvRecord = readImportMetaEnv()
): PublicWebsiteResolution {
  const raw = readString(env, 'VITE_PUBLIC_WEBSITE_URL');
  if (!raw) {
    return { configured: false, url: null, error: null };
  }

  const leakErr = detectPrivilegedSecretLeak('VITE_PUBLIC_WEBSITE_URL', raw);
  if (leakErr) {
    return { configured: false, url: null, error: leakErr };
  }

  // Allow explicit same-origin relative paths (e.g. "/") without protocol-relative "//"
  if (raw.startsWith('/') && !raw.startsWith('//')) {
    return { configured: true, url: raw, error: null };
  }

  try {
    const parsed = new URL(raw);
    const isLocalHttp =
      parsed.protocol === 'http:' &&
      (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1');
    if (parsed.protocol !== 'https:' && !isLocalHttp) {
      return {
        configured: false,
        url: null,
        error: 'VITE_PUBLIC_WEBSITE_URL must use https:// (or http://localhost for local development).',
      };
    }
    return { configured: true, url: parsed.toString(), error: null };
  } catch {
    return {
      configured: false,
      url: null,
      error: 'VITE_PUBLIC_WEBSITE_URL is not a valid URL.',
    };
  }
}

export function resolveBrandLogoUrl(env: EnvRecord = readImportMetaEnv()): string | null {
  const raw = readString(env, 'VITE_BRAND_LOGO_URL');
  if (!raw) return null;
  if (detectPrivilegedSecretLeak('VITE_BRAND_LOGO_URL', raw)) return null;
  if (raw.startsWith('/') && !raw.startsWith('//')) return raw;
  try {
    const parsed = new URL(raw);
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
      return parsed.toString();
    }
    return null;
  } catch {
    return null;
  }
}

export function validateFrontendEnv(env: EnvRecord = readImportMetaEnv()) {
  const supabase = validateSupabaseConfig(env);
  const firebase = validateFirebaseConfig(env);
  return {
    supabase,
    firebase,
    allConfigured: supabase.ok && firebase.ok,
  };
}
