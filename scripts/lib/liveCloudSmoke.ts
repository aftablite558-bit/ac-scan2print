// AC Scan2Print — Phase 14 Post-Deploy Live Cloud Smoke Verifier
// Verifies Admin & Customer QR (/quick-print) hosting split, Supabase public contract,
// CORS headers, and fail-closed Admin/Cron security boundaries without leaking secrets.

import { extractOrigin, extractSupabaseProjectRef } from './cloudCutoverPreflight.ts';

export type SmokeTargetMode = 'production' | 'local';

export interface SmokeCheckResult {
  id: string;
  surface: 'hosting' | 'supabase_public' | 'security_gate' | 'cors' | 'local_api';
  label: string;
  passed: boolean;
  httpStatus: number | null;
  detail: string;
}

export interface LiveCloudSmokeReport {
  checkedAtIso: string;
  target: SmokeTargetMode;
  adminUrl: string;
  customerPortalUrl: string;
  supabaseProjectRef: string | null;
  passedCount: number;
  totalCount: number;
  allPassed: boolean;
  checks: SmokeCheckResult[];
}

function readStr(env: Record<string, string | undefined>, key: string): string {
  return typeof env[key] === 'string' ? env[key]!.trim() : '';
}

export async function runLiveCloudSmokeSuite(opts: {
  target?: SmokeTargetMode;
  localOrigin?: string;
  env?: Record<string, string | undefined>;
  fetchImpl?: typeof fetch;
} = {}): Promise<LiveCloudSmokeReport> {
  const env = opts.env ?? process.env;
  const fetchFn = opts.fetchImpl ?? fetch;
  const target: SmokeTargetMode = opts.target === 'local' ? 'local' : 'production';

  const configuredPortalUrl =
    readStr(env, 'CUSTOMER_PORTAL_URL') || 'https://ac-scan2print.web.app/quick-print';
  const configuredAdminOrigin = extractOrigin(configuredPortalUrl);
  const localOrigin = (opts.localOrigin || `http://127.0.0.1:${Number(env.PORT) || 3000}`).replace(/\/+$/, '');

  const adminUrl = target === 'local' ? `${localOrigin}/` : `${configuredAdminOrigin}/`;
  const customerPortalUrl =
    target === 'local' ? `${localOrigin}/quick-print` : configuredPortalUrl;

  const supabaseUrl =
    readStr(env, 'VITE_SUPABASE_URL') || readStr(env, 'SUPABASE_URL') || '';
  const supabaseAnonKey =
    readStr(env, 'VITE_SUPABASE_ANON_KEY') || readStr(env, 'SUPABASE_ANON_KEY') || '';
  const supabaseProjectRef = extractSupabaseProjectRef(supabaseUrl);

  const checks: SmokeCheckResult[] = [];

  // 1. Admin Hosting Check (/)
  try {
    const res = await fetchFn(adminUrl, {
      method: 'GET',
      signal: AbortSignal.timeout(8000),
    });
    const html = await res.text();
    const looksLikeAdmin =
      html.includes('AMAN COMPUTER') ||
      html.includes('Admin Dashboard') ||
      html.includes('AC Scan2Print');
    const ok = res.ok && looksLikeAdmin;
    checks.push({
      id: 'hosting_admin_root',
      surface: 'hosting',
      label: `Admin Control Center (${adminUrl})`,
      passed: ok,
      httpStatus: res.status,
      detail: ok
        ? `HTTP ${res.status} · Admin root HTML verified`
        : `HTTP ${res.status} · Missing Admin Control Center document markers`,
    });
  } catch (err) {
    checks.push({
      id: 'hosting_admin_root',
      surface: 'hosting',
      label: `Admin Control Center (${adminUrl})`,
      passed: false,
      httpStatus: null,
      detail: err instanceof Error ? err.message : 'Unable to reach Admin root',
    });
  }

  // 2. Customer QR Portal Route Check (/quick-print) — must NOT fall back to Admin Login
  try {
    const res = await fetchFn(customerPortalUrl, {
      method: 'GET',
      signal: AbortSignal.timeout(8000),
    });
    const html = await res.text();
    const isCustomerTitle = html.includes('Smart QR Print');
    const isMountedAssets =
      html.includes('/quick-print/assets/') || html.includes('/quick-print/src/main.tsx');
    const accidentallyServedAdmin = html.includes('Admin Dashboard — AMAN COMPUTER');
    const ok = res.ok && (isCustomerTitle || isMountedAssets) && !accidentallyServedAdmin;
    checks.push({
      id: 'hosting_customer_qr',
      surface: 'hosting',
      label: `Customer QR Portal (${customerPortalUrl})`,
      passed: ok,
      httpStatus: res.status,
      detail: ok
        ? `HTTP ${res.status} · Isolated Customer QR Portal served (no Admin SPA fallback)`
        : accidentallyServedAdmin
          ? `HTTP ${res.status} · REGRESSION: /quick-print served Admin Dashboard instead of Customer Portal`
          : `HTTP ${res.status} · Customer Portal markers missing`,
    });
  } catch (err) {
    checks.push({
      id: 'hosting_customer_qr',
      surface: 'hosting',
      label: `Customer QR Portal (${customerPortalUrl})`,
      passed: false,
      httpStatus: null,
      detail: err instanceof Error ? err.message : 'Unable to reach Customer QR Portal',
    });
  }

  // 3. Optional Local Server Dual-Surface Health Check
  if (target === 'local') {
    try {
      const res = await fetchFn(`${localOrigin}/api/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      });
      const json = (await res.json()) as { ok?: boolean };
      const ok = res.ok && json.ok === true;
      checks.push({
        id: 'local_express_health',
        surface: 'local_api',
        label: 'Local Express Server (/api/health)',
        passed: ok,
        httpStatus: res.status,
        detail: ok ? `HTTP ${res.status} · Express API healthy` : `HTTP ${res.status}`,
      });
    } catch (err) {
      checks.push({
        id: 'local_express_health',
        surface: 'local_api',
        label: 'Local Express Server (/api/health)',
        passed: false,
        httpStatus: null,
        detail: err instanceof Error ? err.message : 'Local server unreachable',
      });
    }
  }

  // 4. Supabase Public Payment Settings & Phase 11+ portalConfig Contract
  if (!supabaseUrl || !supabaseAnonKey) {
    checks.push({
      id: 'supabase_public_contract',
      surface: 'supabase_public',
      label: 'Supabase Public Settings & portalConfig Contract',
      passed: false,
      httpStatus: null,
      detail: 'VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY is missing in environment.',
    });
  } else {
    const baseFnUrl = `${supabaseUrl.replace(/\/+$/, '')}/functions/v1`;

    try {
      const res = await fetchFn(`${baseFnUrl}/get-public-payment-settings`, {
        method: 'GET',
        headers: { apikey: supabaseAnonKey },
        signal: AbortSignal.timeout(8000),
      });
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      const hasPortalConfig =
        typeof data.portalConfig === 'object' && data.portalConfig !== null;
      const hasUpiFlag = typeof data.upiEnabled === 'boolean';
      const ok = res.ok && hasPortalConfig && hasUpiFlag;
      checks.push({
        id: 'supabase_public_contract',
        surface: 'supabase_public',
        label: 'Public Config Contract (get-public-payment-settings)',
        passed: ok,
        httpStatus: res.status,
        detail: ok
          ? `HTTP ${res.status} · Phase 11+ portalConfig & payment settings active`
          : `HTTP ${res.status} · portalConfig missing (redeploy Edge Functions to upgrade from baseline)`,
      });
    } catch (err) {
      checks.push({
        id: 'supabase_public_contract',
        surface: 'supabase_public',
        label: 'Public Config Contract (get-public-payment-settings)',
        passed: false,
        httpStatus: null,
        detail: err instanceof Error ? err.message : 'Supabase probe failed',
      });
    }

    // 5. Fail-Closed Security Gates (must reject unauthenticated calls cleanly)
    const securityProbes: Array<{
      id: string;
      fnName: string;
      label: string;
      expectedStatuses: number[];
      body: Record<string, unknown>;
    }> = [
      {
        id: 'sec_admin_fail_closed',
        fnName: 'admin-print-jobs',
        label: 'Admin Endpoint Fail-Closed Gate (admin-print-jobs)',
        expectedStatuses: [401, 403],
        body: { action: 'list' },
      },
      {
        id: 'sec_cron_fail_closed',
        fnName: 'cleanup-expired-print-files',
        label: 'Cron Cleanup Fail-Closed Gate (cleanup-expired-print-files)',
        expectedStatuses: [401, 403],
        body: { dryRun: true },
      },
      {
        id: 'sec_create_job_validation',
        fnName: 'create-print-job',
        label: 'Customer Anti-Tampering Guard (create-print-job)',
        expectedStatuses: [400, 422],
        body: { status: 'printed', finalAmount: 0 },
      },
    ];

    for (const sp of securityProbes) {
      try {
        const res = await fetchFn(`${baseFnUrl}/${sp.fnName}`, {
          method: 'POST',
          headers: {
            apikey: supabaseAnonKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(sp.body),
          signal: AbortSignal.timeout(8000),
        });
        const passed = sp.expectedStatuses.includes(res.status);
        checks.push({
          id: sp.id,
          surface: 'security_gate',
          label: sp.label,
          passed,
          httpStatus: res.status,
          detail: passed
            ? `HTTP ${res.status} · Rejects unauthenticated/invalid payload cleanly`
            : res.status === 404
              ? 'HTTP 404 · Function not deployed to live Supabase project yet'
              : `HTTP ${res.status} · Unexpected status (expected ${sp.expectedStatuses.join('/')})`,
        });
      } catch (err) {
        checks.push({
          id: sp.id,
          surface: 'security_gate',
          label: sp.label,
          passed: false,
          httpStatus: null,
          detail: err instanceof Error ? err.message : 'Network error',
        });
      }
    }

    // 6. CORS Preflight Verification for Configured Hosting Origin
    try {
      const corsRes = await fetchFn(`${baseFnUrl}/create-print-job`, {
        method: 'OPTIONS',
        headers: {
          Origin: configuredAdminOrigin,
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers': 'apikey,content-type,x-tracking-token',
        },
        signal: AbortSignal.timeout(8000),
      });
      const acao = corsRes.headers.get('access-control-allow-origin');
      const corsOk =
        corsRes.status !== 404 &&
        Boolean(acao && (acao === configuredAdminOrigin || acao === '*'));
      checks.push({
        id: 'cors_portal_origin',
        surface: 'cors',
        label: `Edge CORS Allowlist (${configuredAdminOrigin})`,
        passed: corsOk,
        httpStatus: corsRes.status,
        detail: corsOk
          ? `HTTP ${corsRes.status} · Access-Control-Allow-Origin matches ${acao}`
          : `HTTP ${corsRes.status} · Missing/mismatched CORS header (got ${acao ?? 'none'})`,
      });
    } catch (err) {
      checks.push({
        id: 'cors_portal_origin',
        surface: 'cors',
        label: `Edge CORS Allowlist (${configuredAdminOrigin})`,
        passed: false,
        httpStatus: null,
        detail: err instanceof Error ? err.message : 'CORS probe failed',
      });
    }
  }

  const passedCount = checks.filter((c) => c.passed).length;
  const totalCount = checks.length;

  return {
    checkedAtIso: new Date().toISOString(),
    target,
    adminUrl,
    customerPortalUrl,
    supabaseProjectRef,
    passedCount,
    totalCount,
    allPassed: totalCount > 0 && passedCount === totalCount,
    checks,
  };
}
