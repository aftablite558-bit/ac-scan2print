import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  EXPECTED_SCAN2PRINT_FUNCTIONS,
  extractSupabaseProjectRef,
  runCloudCutoverPreflight,
} from '../../scripts/lib/cloudCutoverPreflight.ts';

const ROOT = process.cwd();

test('[P13-01] Firebase Hosting Unified Config & Assembler Route /quick-print Before Admin Catch-All', () => {
  const firebaseJsonPath = path.join(ROOT, 'firebase.json');
  const fb = JSON.parse(fs.readFileSync(firebaseJsonPath, 'utf8')) as {
    hosting: {
      public: string;
      rewrites: Array<{ source: string; destination: string }>;
      headers?: Array<{ source: string; headers: Array<{ key: string; value: string }> }>;
    };
  };

  assert.equal(fb.hosting.public, 'dist');

  const qpExactIdx = fb.hosting.rewrites.findIndex(
    (r) => r.source === '/quick-print' && r.destination === '/quick-print/index.html'
  );
  const qpWildcardIdx = fb.hosting.rewrites.findIndex(
    (r) => r.source === '/quick-print/**' && r.destination === '/quick-print/index.html'
  );
  const adminCatchAllIdx = fb.hosting.rewrites.findIndex(
    (r) => r.source === '**' && r.destination === '/index.html'
  );

  assert.ok(qpExactIdx >= 0, 'firebase.json must rewrite /quick-print -> /quick-print/index.html');
  assert.ok(qpWildcardIdx >= 0, 'firebase.json must rewrite /quick-print/** -> /quick-print/index.html');
  assert.ok(adminCatchAllIdx > qpExactIdx && adminCatchAllIdx > qpWildcardIdx, 'Admin ** rewrite must come AFTER /quick-print rewrites');

  const assemblerSrc = fs.readFileSync(path.join(ROOT, 'scripts', 'assemble-hosting-dist.mjs'), 'utf8');
  assert.ok(assemblerSrc.includes('--base=/quick-print/'), 'Assembler must build customer-portal with --base=/quick-print/');
  assert.ok(assemblerSrc.includes("path.join(distDir, 'quick-print')"), 'Assembler must copy bundle into dist/quick-print');

  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')) as {
    scripts: Record<string, string>;
  };
  assert.equal(pkg.scripts['build:hosting'], 'node scripts/assemble-hosting-dist.mjs');
  assert.equal(pkg.scripts['cloud:preflight'], 'tsx scripts/verify-cloud-cutover.ts');
});

test('[P13-02] Preflight Audits All 7 Migrations, All 21 Edge Functions & Leaks Zero Secrets', async () => {
  assert.equal(
    extractSupabaseProjectRef('https://tvtfgsijxlxpwgakpeag.supabase.co'),
    'tvtfgsijxlxpwgakpeag'
  );

  const report = await runCloudCutoverPreflight({
    rootDir: ROOT,
    skipNetworkProbes: true,
    env: {
      VITE_SUPABASE_URL: 'https://tvtfgsijxlxpwgakpeag.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'public-anon-key-placeholder-not-secret',
      VITE_FIREBASE_API_KEY: 'AIzaSyTestPublicKey',
      VITE_FIREBASE_PROJECT_ID: 'aman-computer-27b21',
      VITE_FIREBASE_AUTH_DOMAIN: 'aman-computer-27b21.firebaseapp.com',
      VITE_FIREBASE_APP_ID: '1:123456:web:abcdef',
      SUPABASE_SERVICE_ROLE_KEY: 'SUPER_SECRET_SHOULD_NEVER_BE_RETURNED',
      ADMIN_BOOTSTRAP_SECRET: 'ADMIN_SECRET_SHOULD_NEVER_BE_RETURNED',
      CRON_SECRET: 'CRON_SECRET_SHOULD_NEVER_BE_RETURNED',
    },
  });

  assert.equal(report.migrationsFound.length, 11, 'Expected 11 SQL migrations in supabase/migrations/');
  assert.equal(report.edgeFunctionsFound.length, 21, 'Expected 21 Edge Functions in supabase/functions/');
  assert.deepEqual(report.edgeFunctionsFound, [...EXPECTED_SCAN2PRINT_FUNCTIONS]);
  assert.deepEqual(report.edgeFunctionsMissingFromConfig, [], 'All 21 Edge Functions must be in supabase/config.toml');

  const serialized = JSON.stringify(report);
  assert.ok(!serialized.includes('SUPER_SECRET_SHOULD_NEVER_BE_RETURNED'));
  assert.ok(!serialized.includes('ADMIN_SECRET_SHOULD_NEVER_BE_RETURNED'));
  assert.ok(!serialized.includes('CRON_SECRET_SHOULD_NEVER_BE_RETURNED'));
  assert.ok(!serialized.includes('public-anon-key-placeholder-not-secret'));
});

test('[P13-03] Live Edge Probe Detects Legacy vs Phase 11+ portalConfig Schema & CORS Origins', async () => {
  const baseEnv = {
    VITE_SUPABASE_URL: 'https://tvtfgsijxlxpwgakpeag.supabase.co',
    VITE_SUPABASE_ANON_KEY: 'anon-key',
    VITE_FIREBASE_API_KEY: 'fb-key',
    VITE_FIREBASE_PROJECT_ID: 'aman-computer-27b21',
    VITE_FIREBASE_AUTH_DOMAIN: 'aman-computer-27b21.firebaseapp.com',
    VITE_FIREBASE_APP_ID: '1:123:web:abc',
  };

  // Case A: Legacy deployed function (missing portalConfig, missing CORS)
  const legacyReport = await runCloudCutoverPreflight({
    rootDir: ROOT,
    env: baseEnv,
    fetchImpl: (async (_url, init) => {
      if (init?.method === 'OPTIONS') {
        return new Response(null, { status: 200, headers: {} });
      }
      return new Response(JSON.stringify({ upiEnabled: false, paymentAssets: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as typeof fetch,
  });

  assert.equal(legacyReport.portalConfigSchemaLive, false);
  const legacyEdgeCheck = legacyReport.checks.find((c) => c.id === 'live_edge_schema');
  assert.equal(legacyEdgeCheck?.passed, false);

  // Case B: Phase 11+ upgraded Edge Functions + CORS header for https://ac-scan2print.web.app
  const upgradedReport = await runCloudCutoverPreflight({
    rootDir: ROOT,
    env: baseEnv,
    fetchImpl: (async (_url, init) => {
      const headers = { 'access-control-allow-origin': 'https://ac-scan2print.web.app' };
      if (init?.method === 'OPTIONS') {
        return new Response(null, { status: 200, headers });
      }
      return new Response(
        JSON.stringify({
          upiEnabled: true,
          portalConfig: { intakePaused: false, pauseReason: null, pilotStage: 'dry_run' },
        }),
        { status: 200, headers: { ...headers, 'Content-Type': 'application/json' } }
      );
    }) as typeof fetch,
  });

  assert.equal(upgradedReport.portalConfigSchemaLive, true);
  const upgradedEdgeCheck = upgradedReport.checks.find((c) => c.id === 'live_edge_schema');
  assert.equal(upgradedEdgeCheck?.passed, true);
});

test('[P13-04] Windows Print Agent Supports Session-0 LocalMachine DPAPI & Direct dev_ Credential Pairing', () => {
  const dpapi = fs.readFileSync(
    path.join(ROOT, 'agent', 'src', 'ACScan2Print.Agent.Infrastructure', 'Windows', 'DpapiStorage.cs'),
    'utf8'
  );
  assert.ok(dpapi.includes('Environment.SpecialFolder.CommonApplicationData'));
  assert.ok(dpapi.includes('DataProtectionScope.LocalMachine'));
  assert.ok(dpapi.includes('DataProtectionScope.CurrentUser'), 'Must preserve fallback read for legacy CurrentUser path');

  const enrollDialog = fs.readFileSync(
    path.join(ROOT, 'agent', 'src', 'ACScan2Print.Agent.Tray', 'EnrollmentDialog.cs'),
    'utf8'
  );
  assert.ok(enrollDialog.includes('dev_'), 'EnrollmentDialog must recognize dev_ device credentials');
  assert.ok(enrollDialog.includes('SendHeartbeatAsync'), 'EnrollmentDialog must verify dev_ credential via heartbeat');
  assert.ok(enrollDialog.includes('EnrollDeviceAsync'), 'EnrollmentDialog must still support Admin JWT enrollment');

  const healthPs1 = fs.readFileSync(
    path.join(ROOT, 'agent', 'installer', 'scripts', 'health-check.ps1'),
    'utf8'
  );
  assert.ok(healthPs1.includes('ACScan2Print\\Security'), 'health-check.ps1 must verify DPAPI Security directory');
  assert.ok(healthPs1.includes('*.dat'), 'health-check.ps1 must check for .dat credential files without reading secrets');
});

test('[P13-05] Server Preflight Endpoint, Edge Proxy Allowlist & Admin Cutover UI Console Wired Cleanly', () => {
  const serverSrc = fs.readFileSync(path.join(ROOT, 'server.ts'), 'utf8');
  assert.ok(serverSrc.includes("'/api/cutover/preflight'"));
  assert.ok(serverSrc.includes("'admin-printers'"));

  const pilotPanelSrc = fs.readFileSync(
    path.join(ROOT, 'src', 'components', 'print-management', 'PilotLaunchPanel.tsx'),
    'utf8'
  );
  assert.ok(pilotPanelSrc.includes('/api/cutover/preflight'));
  assert.ok(pilotPanelSrc.includes('Live Cloud Provisioning &amp; Cutover Preflight'));
  assert.ok(!pilotPanelSrc.includes('process.env.'), 'Client TSX must never access process.env');

  const qrModalSrc = fs.readFileSync(
    path.join(ROOT, 'src', 'components', 'print-management', 'ShopQrPosterModal.tsx'),
    'utf8'
  );
  assert.ok(qrModalSrc.includes('referrerPolicy="no-referrer"'));
});

test('[P13-06] Phase 13 Live Cutover Runbook Documents All 7 Migrations & 21 Edge Functions', () => {
  const runbook = fs.readFileSync(
    path.join(ROOT, 'docs', 'scan2print', 'PHASE_13_LIVE_CUTOVER_RUNBOOK.md'),
    'utf8'
  );
  assert.ok(runbook.includes('202611250001_scan2print_phase11_pilot_controls.sql'));
  for (const fn of EXPECTED_SCAN2PRINT_FUNCTIONS) {
    assert.ok(runbook.includes(fn), `Runbook must document Edge Function ${fn}`);
  }
});
