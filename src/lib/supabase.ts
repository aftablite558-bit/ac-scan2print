import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { validateSupabaseConfig } from './env';

export const supabaseEnvValidation = validateSupabaseConfig();
export const isSupabaseClientConfigured = supabaseEnvValidation.ok;

let client: SupabaseClient | null = null;

export function getSupabaseConfigError(): string | null {
  return supabaseEnvValidation.summary;
}

export function getSupabaseClient(): SupabaseClient | null {
  if (!supabaseEnvValidation.ok || !supabaseEnvValidation.config) {
    return null;
  }
  if (!client) {
    client = createClient(supabaseEnvValidation.config.url, supabaseEnvValidation.config.anonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
  }
  return client;
}

export function requireSupabaseClient(): SupabaseClient {
  const sb = getSupabaseClient();
  if (!sb) {
    throw new Error(
      supabaseEnvValidation.summary ??
        'Supabase frontend configuration is incomplete. Check VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local.'
    );
  }
  return sb;
}

export async function checkSupabaseLiveConnectivity(): Promise<{
  configured: boolean;
  connected: boolean;
  statusCode?: number;
  error?: string;
}> {
  if (!supabaseEnvValidation.ok || !supabaseEnvValidation.config) {
    return {
      configured: false,
      connected: false,
      error: supabaseEnvValidation.summary ?? 'Supabase environment variables are not configured.',
    };
  }

  try {
    const res = await fetch(`${supabaseEnvValidation.config.url}/auth/v1/health`, {
      method: 'GET',
      headers: {
        apikey: supabaseEnvValidation.config.anonKey,
      },
    });
    if (!res.ok) {
      return {
        configured: true,
        connected: false,
        statusCode: res.status,
        error: `Supabase health check returned HTTP ${res.status}.`,
      };
    }
    return {
      configured: true,
      connected: true,
      statusCode: res.status,
    };
  } catch (err) {
    return {
      configured: true,
      connected: false,
      error: err instanceof Error ? err.message : 'Unable to reach configured Supabase URL.',
    };
  }
}

export function subscribeAdminRealtime(onChange: () => void): () => void {
  const sb = getSupabaseClient();
  if (!sb) return () => {};

  const channel = sb
    .channel('aman-admin-realtime')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'enquiries' }, () => onChange())
    .on('postgres_changes', { event: '*', schema: 'public', table: 'govt_updates' }, () => onChange())
    .on('postgres_changes', { event: '*', schema: 'public', table: 'admin_notifications' }, () => onChange())
    .subscribe();

  return () => {
    void sb.removeChannel(channel);
  };
}
