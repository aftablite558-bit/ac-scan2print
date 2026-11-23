import type { AdminUserSession } from '../types/admin';
import { validateSupabaseConfig, type SupabaseClientConfig } from './env';

export const SINGLE_ADMIN_PERMISSIONS = [
  'services.read',
  'services.write',
  'cms.read',
  'cms.write',
  'enquiries.read',
  'enquiries.write',
  'govt.read',
  'govt.write',
  'access.read',
  'access.manage',
  'audit.read',
  'settings.write',
  'scan2print.manage',
] as const;

export interface VerifiedBackendAdmin {
  id: string;
  firebaseUid: string;
  email: string;
  fullName: string;
  isActive: boolean;
}

export class ProtectedEdgeApiError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ProtectedEdgeApiError';
    this.status = status;
    this.code = code;
  }
}

export function canAccessAdminRoute(user: AdminUserSession | null): boolean {
  return Boolean(user && user.isActive && user.permissions.length > 0);
}

export function createAdminSessionFromBackend(admin: VerifiedBackendAdmin): AdminUserSession {
  const rawEmail = typeof admin.email === 'string' ? admin.email.trim() : '';
  const rawName = typeof admin.fullName === 'string' ? admin.fullName.trim() : '';
  const rawId =
    (typeof admin.id === 'string' && admin.id.trim()) ||
    (typeof admin.firebaseUid === 'string' && admin.firebaseUid.trim()) ||
    'single-admin';

  return {
    id: rawId,
    email: rawEmail,
    fullName: rawName || rawEmail || 'Authorized Admin',
    designation: 'Authorized Admin',
    roleId: 'single-admin',
    roleName: 'Super Admin',
    permissions: [...SINGLE_ADMIN_PERMISSIONS],
    isActive: Boolean(admin.isActive),
  };
}

export interface ProtectedEdgeInvokeOptions {
  method?: 'GET' | 'POST';
  body?: unknown;
  getIdToken: (forceRefresh?: boolean) => Promise<string | null>;
  onUnauthorized?: (error: ProtectedEdgeApiError) => Promise<void> | void;
  fetchImpl?: typeof fetch;
  supabaseConfig?: SupabaseClientConfig | null;
}

function parseErrorPayload(rawText: string, status: number): { code: string; message: string } {
  if (rawText) {
    try {
      const parsed = JSON.parse(rawText) as {
        error?: { code?: string; message?: string } | string;
        message?: string;
      };
      if (parsed.error && typeof parsed.error === 'object') {
        return {
          code: parsed.error.code || `HTTP_${status}`,
          message: parsed.error.message || `Protected request failed (${status}).`,
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
  return { code: `HTTP_${status}`, message: `Protected request failed (${status}).` };
}

export async function invokeProtectedEdgeFunction<T>(
  functionName: string,
  options: ProtectedEdgeInvokeOptions
): Promise<T> {
  const sbConfig =
    options.supabaseConfig !== undefined
      ? options.supabaseConfig
      : validateSupabaseConfig().config;

  if (!sbConfig) {
    throw new ProtectedEdgeApiError(
      503,
      'SUPABASE_NOT_CONFIGURED',
      'Supabase frontend configuration is incomplete. Check VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.'
    );
  }

  const fetchFn = options.fetchImpl ?? fetch;
  const method = options.method ?? 'POST';
  const endpoint = `${sbConfig.url.replace(/\/+$/, '')}/functions/v1/${functionName}`;

  const execute = async (token: string): Promise<Response> => {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      apikey: sbConfig.anonKey,
    };
    const init: RequestInit = { method, headers };
    if (method === 'POST' && options.body !== undefined) {
      headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(options.body);
    }
    return fetchFn(endpoint, init);
  };

  const initialToken = await options.getIdToken(false);
  if (!initialToken) {
    const err = new ProtectedEdgeApiError(
      401,
      'UNAUTHORIZED',
      'Active Firebase Admin session is required.'
    );
    await options.onUnauthorized?.(err);
    throw err;
  }

  let res = await execute(initialToken);

  // Automatic single retry with force-refreshed Firebase ID token if backend reports 401
  if (res.status === 401) {
    const refreshedToken = await options.getIdToken(true);
    if (refreshedToken && refreshedToken !== initialToken) {
      res = await execute(refreshedToken);
    }
  }

  const rawText = await res.text();
  if (!res.ok) {
    const { code, message } = parseErrorPayload(rawText, res.status);
    const err = new ProtectedEdgeApiError(res.status, code, message);
    if (res.status === 401 || res.status === 403) {
      await options.onUnauthorized?.(err);
    }
    throw err;
  }

  let parsedSuccess: unknown = {};
  if (rawText.trim()) {
    try {
      parsedSuccess = JSON.parse(rawText) as unknown;
    } catch {
      throw new ProtectedEdgeApiError(
        res.status || 502,
        'INVALID_RESPONSE',
        `Backend function ${functionName} returned invalid JSON.`
      );
    }
  }
  return parsedSuccess as T;
}

export async function verifyAdminAccessWithBackend(options: {
  getIdToken: (forceRefresh?: boolean) => Promise<string | null>;
  onUnauthorized?: (error: ProtectedEdgeApiError) => Promise<void> | void;
  fetchImpl?: typeof fetch;
  supabaseConfig?: SupabaseClientConfig | null;
}): Promise<{ authorized: true; admin: VerifiedBackendAdmin; settings?: unknown }> {
  const res = await invokeProtectedEdgeFunction<{
    authorized?: boolean;
    admin?: VerifiedBackendAdmin;
    settings?: unknown;
  }>('admin-update-payment-settings', {
    method: 'GET',
    getIdToken: options.getIdToken,
    onUnauthorized: options.onUnauthorized,
    fetchImpl: options.fetchImpl,
    supabaseConfig: options.supabaseConfig,
  });

  if (
    !res ||
    typeof res !== 'object' ||
    !res.authorized ||
    !res.admin ||
    typeof res.admin !== 'object' ||
    !res.admin.isActive
  ) {
    const err = new ProtectedEdgeApiError(
      403,
      'FORBIDDEN',
      'Supabase backend rejected Admin authorization for this Firebase account.'
    );
    await options.onUnauthorized?.(err);
    throw err;
  }

  return {
    authorized: true,
    admin: res.admin,
    settings: res.settings,
  };
}
