// AC Scan2Print Customer Portal — Isolated Public Client Environment Reader & Secret-Leak Guard
// Reads ONLY VITE_* public keys via import.meta.env. Never imports Admin modules or service_role keys.

export type CustomerEnvRecord = Record<string, string | boolean | undefined>;

export interface CustomerSupabaseConfig {
  url: string;
  anonKey: string;
}

export interface CustomerShopPublicInfo {
  shopName: string;
  shopHours: string;
  shopContactPhone: string;
  shopAddress: string;
  brandLogoUrl: string | null;
}

function readStr(env: CustomerEnvRecord, key: string): string {
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

export function detectCustomerEnvSecretLeak(keyName: string, value: string): string | null {
  if (!value) return null;
  if (value.includes('-----BEGIN') || value.includes('PRIVATE KEY')) {
    return `${keyName} must never contain a private key.`;
  }
  if (/^postgres(ql)?:\/\//i.test(value)) {
    return `${keyName} must never contain a database connection string.`;
  }
  if (keyName === 'VITE_SUPABASE_ANON_KEY') {
    if (value.startsWith('sb_secret_')) {
      return 'VITE_SUPABASE_ANON_KEY must be a public anon key, never a Supabase secret key.';
    }
    const payload = decodeJwtPayload(value);
    if (payload && (payload.role === 'service_role' || payload.role === 'supabase_admin')) {
      return `VITE_SUPABASE_ANON_KEY must never use privileged role '${String(payload.role)}'.`;
    }
  }
  return null;
}

export function readCustomerImportMetaEnv(): CustomerEnvRecord {
  const hasMeta = typeof import.meta !== 'undefined' && Boolean(import.meta.env);
  return {
    VITE_SUPABASE_URL: hasMeta ? import.meta.env.VITE_SUPABASE_URL : undefined,
    VITE_SUPABASE_ANON_KEY: hasMeta ? import.meta.env.VITE_SUPABASE_ANON_KEY : undefined,
    VITE_BRAND_LOGO_URL: hasMeta ? import.meta.env.VITE_BRAND_LOGO_URL : undefined,
    VITE_CUSTOMER_PORTAL_SHOP_HOURS: hasMeta ? import.meta.env.VITE_CUSTOMER_PORTAL_SHOP_HOURS : undefined,
    VITE_CUSTOMER_PORTAL_SHOP_PHONE: hasMeta ? import.meta.env.VITE_CUSTOMER_PORTAL_SHOP_PHONE : undefined,
    VITE_CUSTOMER_PORTAL_SHOP_ADDRESS: hasMeta ? import.meta.env.VITE_CUSTOMER_PORTAL_SHOP_ADDRESS : undefined,
  };
}

export function validateCustomerSupabaseConfig(
  env: CustomerEnvRecord = readCustomerImportMetaEnv()
): { configured: boolean; config: CustomerSupabaseConfig | null; error: string | null } {
  const url = readStr(env, 'VITE_SUPABASE_URL');
  const anonKey = readStr(env, 'VITE_SUPABASE_ANON_KEY');

  if (!url || !anonKey) {
    return { configured: false, config: null, error: null };
  }

  const urlLeak = detectCustomerEnvSecretLeak('VITE_SUPABASE_URL', url);
  if (urlLeak) return { configured: false, config: null, error: urlLeak };

  const keyLeak = detectCustomerEnvSecretLeak('VITE_SUPABASE_ANON_KEY', anonKey);
  if (keyLeak) return { configured: false, config: null, error: keyLeak };

  try {
    const parsed = new URL(url);
    const isLocal =
      parsed.protocol === 'http:' &&
      (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1');
    if (parsed.protocol !== 'https:' && !isLocal) {
      return {
        configured: false,
        config: null,
        error: 'VITE_SUPABASE_URL must use https:// (or http://localhost in local development).',
      };
    }
  } catch {
    return { configured: false, config: null, error: 'VITE_SUPABASE_URL is not a valid URL.' };
  }

  return {
    configured: true,
    config: { url: url.replace(/\/+$/, ''), anonKey },
    error: null,
  };
}

export function resolveCustomerShopPublicInfo(
  env: CustomerEnvRecord = readCustomerImportMetaEnv()
): CustomerShopPublicInfo {
  const rawLogo = readStr(env, 'VITE_BRAND_LOGO_URL');
  let brandLogoUrl: string | null = null;
  if (rawLogo && !detectCustomerEnvSecretLeak('VITE_BRAND_LOGO_URL', rawLogo)) {
    if (rawLogo.startsWith('/') && !rawLogo.startsWith('//')) {
      brandLogoUrl = rawLogo;
    } else {
      try {
        const u = new URL(rawLogo);
        if (u.protocol === 'https:' || u.protocol === 'http:') brandLogoUrl = u.toString();
      } catch {
        brandLogoUrl = null;
      }
    }
  }

  return {
    shopName: 'AMAN COMPUTER',
    shopHours: readStr(env, 'VITE_CUSTOMER_PORTAL_SHOP_HOURS') || 'Mon–Sat · Counter hours apply',
    shopContactPhone:
      readStr(env, 'VITE_CUSTOMER_PORTAL_SHOP_PHONE') || 'Ask at Aman Computer print counter',
    shopAddress:
      readStr(env, 'VITE_CUSTOMER_PORTAL_SHOP_ADDRESS') || 'Aman Computer Smart Print Counter',
    brandLogoUrl,
  };
}
