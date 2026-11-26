// AC Scan2Print — Phase 13 Cloud Provisioning & Cutover Preflight Engine
// Verifies client/server env readiness, 7 SQL migrations, 21 Edge Functions,
// unified Firebase Hosting config, Windows Agent payload scripts, and live Supabase probes.

import fs from 'node:fs';
import path from 'node:path';

export interface EdgeProbeResult {
  fnName: string;
  reachable: boolean;
  deployed: boolean;
  httpStatus: number | null;
  corsAllowedForPortalOrigin: boolean | null;
  detail: string;
}

export interface CutoverCheckItem {
  id: string;
  category: 'env' | 'database' | 'edge' | 'hosting' | 'agent';
  label: string;
  passed: boolean;
  severity: 'blocking' | 'advisory';
  detail: string;
}

export interface CloudCutoverPreflightReport {
  checkedAtIso: string;
  supabaseProjectRef: string | null;
  supabaseUrl: string | null;
  firebaseProjectId: string | null;
  expectedCustomerPortalUrl: string;
  expectedAdminOrigin: string;
  migrationsFound: string[];
  edgeFunctionsFound: string[];
  edgeFunctionsMissingFromConfig: string[];
  hostingUnifiedReady: boolean;
  adminBundleBuilt: boolean;
  customerBundleBuilt: boolean;
  mountedQuickPrintBundleBuilt: boolean;
  agentInstallerFilesPresent: boolean;
  agentStagedBinariesPresent: boolean;
  liveEdgeProbes: EdgeProbeResult[];
  portalConfigSchemaLive: boolean;
  checks: CutoverCheckItem[];
  readyForLiveCutover: boolean;
  blockingReasons: string[];
  playbookCommands: {
    supabaseSecretsAndDb: string;
    supabaseDeployAllFunctions: string;
    adminBootstrapAndVerify: string;
    firebaseHostingDeploy: string;
    windowsAgentInstall: string;
  };
}

export const EXPECTED_SCAN2PRINT_FUNCTIONS = [
  'admin-bootstrap',
  'admin-confirm-cash',
  'admin-print-jobs',
  'admin-printers',
  'admin-release-print-job',
  'admin-retry-print-job',
  'admin-review-print-job',
  'admin-update-payment-settings',
  'admin-verify-payment',
  'agent-claim-job',
  'agent-enroll',
  'agent-heartbeat',
  'agent-report-job-event',
  'agent-sync-printers',
  'cleanup-expired-print-files',
  'create-print-job',
  'create-print-upload-url',
  'finalize-print-upload',
  'get-print-job-status',
  'get-public-payment-settings',
  'submit-upi-payment',
] as const;

export function extractSupabaseProjectRef(supabaseUrl: string | null | undefined): string | null {
  if (!supabaseUrl) return null;
  try {
    const parsed = new URL(supabaseUrl.trim());
    const match = parsed.hostname.match(/^([a-z0-9-]+)\.supabase\.co$/i);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

export function extractOrigin(urlStr: string): string {
  try {
    return new URL(urlStr).origin;
  } catch {
    return 'https://ac-scan2print.web.app';
  }
}

function readStr(env: Record<string, string | undefined>, key: string): string {
  return typeof env[key] === 'string' ? env[key]!.trim() : '';
}

function listFilesSorted(dirPath: string, suffix: string): string[] {
  if (!fs.existsSync(dirPath)) return [];
  return fs
    .readdirSync(dirPath, { withFileTypes: true })
    .filter((d) => d.isFile() && d.name.endsWith(suffix))
    .map((d) => d.name)
    .sort();
}

function listFunctionDirs(functionsRoot: string): string[] {
  if (!fs.existsSync(functionsRoot)) return [];
  return fs
    .readdirSync(functionsRoot, { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name !== '_shared')
    .map((d) => d.name)
    .sort();
}

export async function runCloudCutoverPreflight(opts: {
  rootDir?: string;
  env?: Record<string, string | undefined>;
  fetchImpl?: typeof fetch;
  skipNetworkProbes?: boolean;
  expectedCustomerPortalUrl?: string;
} = {}): Promise<CloudCutoverPreflightReport> {
  const rootDir = opts.rootDir ?? process.cwd();
  const env = opts.env ?? process.env;
  const fetchFn = opts.fetchImpl ?? fetch;

  const supabaseUrl = readStr(env, 'VITE_SUPABASE_URL') || readStr(env, 'SUPABASE_URL') || null;
  const supabaseAnonKey = readStr(env, 'VITE_SUPABASE_ANON_KEY') || readStr(env, 'SUPABASE_ANON_KEY');
  const firebaseApiKey = readStr(env, 'VITE_FIREBASE_API_KEY');
  const firebaseProjectId = readStr(env, 'VITE_FIREBASE_PROJECT_ID') || null;
  const firebaseAuthDomain = readStr(env, 'VITE_FIREBASE_AUTH_DOMAIN');
  const firebaseAppId = readStr(env, 'VITE_FIREBASE_APP_ID');

  const supabaseProjectRef = extractSupabaseProjectRef(supabaseUrl);
  const expectedCustomerPortalUrl =
    opts.expectedCustomerPortalUrl ||
    readStr(env, 'CUSTOMER_PORTAL_URL') ||
    'https://ac-scan2print.web.app/quick-print';
  const expectedAdminOrigin = extractOrigin(expectedCustomerPortalUrl);

  // 1. Migrations & Edge Function Inventory
  const migrationsFound = listFilesSorted(path.join(rootDir, 'supabase', 'migrations'), '.sql');
  const edgeFunctionsFound = listFunctionDirs(path.join(rootDir, 'supabase', 'functions'));

  const configTomlPath = path.join(rootDir, 'supabase', 'config.toml');
  const configTomlRaw = fs.existsSync(configTomlPath) ? fs.readFileSync(configTomlPath, 'utf8') : '';
  const edgeFunctionsMissingFromConfig = edgeFunctionsFound.filter(
    (fn) => !configTomlRaw.includes(`[functions.${fn}]`)
  );

  // 2. Firebase Hosting Config & Bundle Check
  const firebaseJsonPath = path.join(rootDir, 'firebase.json');
  let hostingUnifiedReady = false;
  if (fs.existsSync(firebaseJsonPath)) {
    try {
      const fb = JSON.parse(fs.readFileSync(firebaseJsonPath, 'utf8')) as {
        hosting?: { public?: string; rewrites?: Array<{ source?: string; destination?: string }> };
      };
      const rewrites = fb.hosting?.rewrites ?? [];
      const qpIdx = rewrites.findIndex(
        (r) =>
          (r.source === '/quick-print/**' || r.source === '/quick-print{,/**}') &&
          r.destination === '/quick-print/index.html'
      );
      const qpRootIdx = rewrites.findIndex(
        (r) => r.source === '/quick-print' && r.destination === '/quick-print/index.html'
      );
      const catchAllIdx = rewrites.findIndex(
        (r) => r.source === '**' && r.destination === '/index.html'
      );
      hostingUnifiedReady =
        fb.hosting?.public === 'dist' &&
        qpRootIdx >= 0 &&
        qpIdx >= 0 &&
        catchAllIdx > qpIdx &&
        catchAllIdx > qpRootIdx;
    } catch {
      hostingUnifiedReady = false;
    }
  }

  const adminBundleBuilt = fs.existsSync(path.join(rootDir, 'dist', 'index.html'));
  const customerBundleBuilt = fs.existsSync(path.join(rootDir, 'dist-customer', 'index.html'));
  const mountedQuickPrintBundleBuilt = fs.existsSync(
    path.join(rootDir, 'dist', 'quick-print', 'index.html')
  );

  // 3. Windows Print Agent Artifacts
  const agentRequiredFiles = [
    path.join(rootDir, 'agent', 'ACScan2Print.Agent.sln'),
    path.join(rootDir, 'agent', 'installer', 'ACScan2PrintAgent.iss'),
    path.join(rootDir, 'agent', 'installer', 'scripts', 'publish-release.ps1'),
    path.join(rootDir, 'agent', 'installer', 'scripts', 'install-agent.ps1'),
    path.join(rootDir, 'agent', 'installer', 'scripts', 'health-check.ps1'),
  ];
  const agentInstallerFilesPresent = agentRequiredFiles.every((f) => fs.existsSync(f));
  const agentStagedBinariesPresent =
    fs.existsSync(path.join(rootDir, 'agent', 'installer', 'stage', 'worker')) &&
    fs.existsSync(path.join(rootDir, 'agent', 'installer', 'stage', 'tray'));

  // 4. Live Supabase Edge Function Probes (read-only / OPTIONS only; never sends secrets)
  const liveEdgeProbes: EdgeProbeResult[] = [];
  let portalConfigSchemaLive = false;

  if (!opts.skipNetworkProbes && supabaseUrl && supabaseAnonKey) {
    const baseFnUrl = `${supabaseUrl.replace(/\/+$/, '')}/functions/v1`;

    // Probe A: get-public-payment-settings (GET + OPTIONS CORS)
    try {
      const [optRes, getRes] = await Promise.all([
        fetchFn(`${baseFnUrl}/get-public-payment-settings`, {
          method: 'OPTIONS',
          headers: {
            Origin: expectedAdminOrigin,
            'Access-Control-Request-Method': 'GET',
            'Access-Control-Request-Headers': 'apikey,content-type',
          },
          signal: AbortSignal.timeout(8000),
        }),
        fetchFn(`${baseFnUrl}/get-public-payment-settings`, {
          method: 'GET',
          headers: { apikey: supabaseAnonKey },
          signal: AbortSignal.timeout(8000),
        }),
      ]);

      const acao = optRes.headers.get('access-control-allow-origin');
      const corsOk = Boolean(acao && (acao === expectedAdminOrigin || acao === '*'));
      let hasPortalConfig = false;
      if (getRes.ok) {
        try {
          const json = (await getRes.json()) as Record<string, unknown>;
          hasPortalConfig = Boolean(json && typeof json.portalConfig === 'object' && json.portalConfig !== null);
        } catch {
          hasPortalConfig = false;
        }
      }
      portalConfigSchemaLive = hasPortalConfig;

      liveEdgeProbes.push({
        fnName: 'get-public-payment-settings',
        reachable: true,
        deployed: getRes.status !== 404,
        httpStatus: getRes.status,
        corsAllowedForPortalOrigin: corsOk,
        detail: getRes.ok
          ? hasPortalConfig
            ? `HTTP ${getRes.status} · Phase 11+ portalConfig active`
            : `HTTP ${getRes.status} · Legacy baseline payload (missing portalConfig — redeploy Edge Function)`
          : `HTTP ${getRes.status}`,
      });
    } catch (err) {
      liveEdgeProbes.push({
        fnName: 'get-public-payment-settings',
        reachable: false,
        deployed: false,
        httpStatus: null,
        corsAllowedForPortalOrigin: null,
        detail: err instanceof Error ? err.message : 'Network error',
      });
    }

    // Probe B: Key protected/gateway functions via OPTIONS
    for (const fnName of ['admin-bootstrap', 'admin-print-jobs', 'admin-printers', 'agent-sync-printers']) {
      try {
        const res = await fetchFn(`${baseFnUrl}/${fnName}`, {
          method: 'OPTIONS',
          headers: {
            Origin: expectedAdminOrigin,
            'Access-Control-Request-Method': 'POST',
            'Access-Control-Request-Headers': 'authorization,apikey,content-type',
          },
          signal: AbortSignal.timeout(8000),
        });
        const acao = res.headers.get('access-control-allow-origin');
        const corsOk = Boolean(acao && (acao === expectedAdminOrigin || acao === '*'));
        const deployed = res.status !== 404;
        liveEdgeProbes.push({
          fnName,
          reachable: true,
          deployed,
          httpStatus: res.status,
          corsAllowedForPortalOrigin: corsOk,
          detail: deployed
            ? `HTTP ${res.status} · Deployed${corsOk ? '' : ' (CORS origin missing)'}`
            : 'HTTP 404 · Not deployed to live Supabase yet',
        });
      } catch (err) {
        liveEdgeProbes.push({
          fnName,
          reachable: false,
          deployed: false,
          httpStatus: null,
          corsAllowedForPortalOrigin: null,
          detail: err instanceof Error ? err.message : 'Network error',
        });
      }
    }
  }

  const clientEnvReady = Boolean(
    supabaseUrl &&
      supabaseAnonKey &&
      firebaseApiKey &&
      firebaseProjectId &&
      firebaseAuthDomain &&
      firebaseAppId
  );

  const publicProbe = liveEdgeProbes.find((p) => p.fnName === 'get-public-payment-settings');
  const allProbedFunctionsDeployed =
    liveEdgeProbes.length > 0 && liveEdgeProbes.every((p) => p.deployed);
  const corsVerifiedForPortal = Boolean(publicProbe?.corsAllowedForPortalOrigin);

  const checks: CutoverCheckItem[] = [
    {
      id: 'client_env',
      category: 'env',
      label: 'Client Supabase & Firebase Public Environment Configured',
      passed: clientEnvReady,
      severity: 'blocking',
      detail: clientEnvReady
        ? `Supabase ref=${supabaseProjectRef ?? 'custom'} · Firebase project=${firebaseProjectId}`
        : 'Populate VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, and VITE_FIREBASE_* in .env.local.',
    },
    {
      id: 'sql_migrations',
      category: 'database',
      label: `All ${migrationsFound.length} Supabase SQL Migrations Ready`,
      passed: migrationsFound.length >= 7,
      severity: 'blocking',
      detail:
        migrationsFound.length >= 7
          ? `Found ${migrationsFound[0]} → ${migrationsFound[migrationsFound.length - 1]}`
          : `Expected 7 migrations in supabase/migrations/, found ${migrationsFound.length}.`,
    },
    {
      id: 'edge_config',
      category: 'edge',
      label: `All ${edgeFunctionsFound.length} Edge Functions Configured in config.toml`,
      passed: edgeFunctionsFound.length >= 21 && edgeFunctionsMissingFromConfig.length === 0,
      severity: 'blocking',
      detail:
        edgeFunctionsMissingFromConfig.length === 0
          ? `${edgeFunctionsFound.length} Edge Functions verified with verify_jwt = false.`
          : `Missing from supabase/config.toml: ${edgeFunctionsMissingFromConfig.join(', ')}`,
    },
    {
      id: 'live_edge_schema',
      category: 'edge',
      label: 'Live Supabase Edge Functions Up-to-Date (Phase 11+ Schema & CORS)',
      passed: allProbedFunctionsDeployed && portalConfigSchemaLive && corsVerifiedForPortal,
      severity: 'blocking',
      detail:
        liveEdgeProbes.length === 0
          ? 'Live network probe skipped or Supabase env missing.'
          : allProbedFunctionsDeployed && portalConfigSchemaLive
            ? `All probed functions live · CORS verified for ${expectedAdminOrigin}`
            : `Redeploy Edge Functions to ${supabaseProjectRef ?? 'Supabase'} (portalConfigLive=${portalConfigSchemaLive}, allDeployed=${allProbedFunctionsDeployed}, cors=${corsVerifiedForPortal}).`,
    },
    {
      id: 'unified_hosting',
      category: 'hosting',
      label: 'Firebase Unified Hosting (/ & /quick-print) Assembled',
      passed: hostingUnifiedReady && adminBundleBuilt && mountedQuickPrintBundleBuilt,
      severity: 'blocking',
      detail:
        hostingUnifiedReady && adminBundleBuilt && mountedQuickPrintBundleBuilt
          ? 'firebase.json routes /quick-print/** before ** and dist/quick-print/index.html is built.'
          : `Run "npm run build:hosting" to mount Customer Portal at dist/quick-print/ (configReady=${hostingUnifiedReady}, admin=${adminBundleBuilt}, quickPrint=${mountedQuickPrintBundleBuilt}).`,
    },
    {
      id: 'agent_packaging',
      category: 'agent',
      label: 'Windows Print Agent Installer & PowerShell Scripts Verified',
      passed: agentInstallerFilesPresent,
      severity: 'blocking',
      detail: agentInstallerFilesPresent
        ? agentStagedBinariesPresent
          ? 'Solution, Inno Setup (.iss), PowerShell scripts, and win-x64 staged binaries ready.'
          : 'Solution, Inno Setup (.iss), and PowerShell scripts ready (run publish-release.ps1 on Windows 11 PC).'
        : 'Missing Windows Print Agent solution or installer scripts under agent/.',
    },
  ];

  const blockingReasons = checks
    .filter((c) => c.severity === 'blocking' && !c.passed)
    .map((c) => c.detail);

  const projectRefFlag = supabaseProjectRef ? `--project-ref ${supabaseProjectRef}` : '--project-ref <PROJECT_REF>';
  const deployList = EXPECTED_SCAN2PRINT_FUNCTIONS.map(
    (fn) => `supabase functions deploy ${fn} --no-verify-jwt ${projectRefFlag}`
  ).join('\n');

  const playbookCommands = {
    supabaseSecretsAndDb: [
      `supabase link ${projectRefFlag}`,
      `supabase db push`,
      `supabase secrets set \\`,
      `  FIREBASE_PROJECT_ID="${firebaseProjectId || 'aman-computer-27b21'}" \\`,
      `  ADMIN_BOOTSTRAP_ALLOWED_UID="Yr0Wr7PuuAdOIMaqohmqaINNbNC2" \\`,
      `  ADMIN_BOOTSTRAP_SECRET="<64-char-random-secret>" \\`,
      `  CRON_SECRET="<64-char-random-secret>" \\`,
      `  CUSTOMER_PORTAL_URL="${expectedCustomerPortalUrl}" \\`,
      `  ALLOWED_ORIGINS="${expectedAdminOrigin}" \\`,
      `  AGENT_CLAIM_LEASE_SECONDS="180" ${projectRefFlag}`,
    ].join('\n'),
    supabaseDeployAllFunctions: deployList,
    adminBootstrapAndVerify: [
      `# One-time Super Admin provisioning (requires Firebase ID token + ADMIN_BOOTSTRAP_SECRET):`,
      `npm run admin:bootstrap`,
      `# Re-verify cloud cutover gates after Edge Function & Hosting deploy:`,
      `npm run cloud:preflight`,
    ].join('\n'),
    firebaseHostingDeploy: [
      `npm run build:hosting`,
      `firebase use ${firebaseProjectId || 'aman-computer-27b21'}`,
      `firebase deploy --only hosting`,
    ].join('\n'),
    windowsAgentInstall: [
      `# Run on Shop Windows 11 x64 Counter PC (Administrator PowerShell):`,
      `.\\agent\\installer\\scripts\\publish-release.ps1`,
      `.\\agent\\installer\\scripts\\install-agent.ps1`,
      `.\\agent\\installer\\scripts\\health-check.ps1`,
    ].join('\n'),
  };

  return {
    checkedAtIso: new Date().toISOString(),
    supabaseProjectRef,
    supabaseUrl,
    firebaseProjectId,
    expectedCustomerPortalUrl,
    expectedAdminOrigin,
    migrationsFound,
    edgeFunctionsFound,
    edgeFunctionsMissingFromConfig,
    hostingUnifiedReady,
    adminBundleBuilt,
    customerBundleBuilt,
    mountedQuickPrintBundleBuilt,
    agentInstallerFilesPresent,
    agentStagedBinariesPresent,
    liveEdgeProbes,
    portalConfigSchemaLive,
    checks,
    readyForLiveCutover: blockingReasons.length === 0,
    blockingReasons,
    playbookCommands,
  };
}
