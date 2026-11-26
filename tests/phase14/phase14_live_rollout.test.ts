import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { runLiveCloudSmokeSuite } from '../../scripts/lib/liveCloudSmoke.ts';
import { invokeRetentionCleanup } from '../../scripts/run-retention-cleanup.ts';

const ROOT = process.cwd();

test('[P14-01] Live Smoke Verifier Detects Passing Hosting Split, portalConfig & Fail-Closed Auth Gates', async () => {
  const report = await runLiveCloudSmokeSuite({
    target: 'production',
    env: {
      VITE_SUPABASE_URL: 'https://tvtfgsijxlxpwgakpeag.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'public-anon-placeholder',
      CUSTOMER_PORTAL_URL: 'https://ac-scan2print.web.app/quick-print',
    },
    fetchImpl: (async (input, init) => {
      const url = String(input);
      if (url === 'https://ac-scan2print.web.app/') {
        return new Response('<html><title>Admin Dashboard — AMAN COMPUTER</title></html>', {
          status: 200,
        });
      }
      if (url === 'https://ac-scan2print.web.app/quick-print') {
        return new Response(
          '<html><title>AC Scan2Print — Smart QR Print | AMAN COMPUTER</title><script src="/quick-print/assets/app.js"></script></html>',
          { status: 200 }
        );
      }
      if (url.endsWith('/get-public-payment-settings')) {
        return new Response(
          JSON.stringify({
            upiEnabled: true,
            portalConfig: { intakePaused: false, pilotStage: 'production' },
            paymentAssets: [],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (url.endsWith('/admin-print-jobs') || url.endsWith('/cleanup-expired-print-files')) {
        return new Response(JSON.stringify({ error: { code: 'UNAUTHORIZED' } }), { status: 401 });
      }
      if (url.endsWith('/create-print-job') && init?.method === 'POST') {
        return new Response(JSON.stringify({ error: { code: 'VALIDATION_ERROR' } }), { status: 400 });
      }
      if (url.endsWith('/create-print-job') && init?.method === 'OPTIONS') {
        return new Response(null, {
          status: 204,
          headers: { 'access-control-allow-origin': 'https://ac-scan2print.web.app' },
        });
      }
      return new Response('Not Found', { status: 404 });
    }) as typeof fetch,
  });

  assert.equal(report.allPassed, true);
  assert.equal(report.passedCount, report.totalCount);
});

test('[P14-02] Live Smoke Verifier Catches /quick-print Admin SPA Fallback Regression & Unauthenticated Bypass', async () => {
  const report = await runLiveCloudSmokeSuite({
    target: 'production',
    env: {
      VITE_SUPABASE_URL: 'https://tvtfgsijxlxpwgakpeag.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'public-anon-placeholder',
      CUSTOMER_PORTAL_URL: 'https://ac-scan2print.web.app/quick-print',
    },
    fetchImpl: (async (input) => {
      const url = String(input);
      if (url === 'https://ac-scan2print.web.app/') {
        return new Response('<html><title>Admin Dashboard — AMAN COMPUTER</title></html>', { status: 200 });
      }
      // Regression: /quick-print accidentally serves Admin SPA HTML
      if (url === 'https://ac-scan2print.web.app/quick-print') {
        return new Response('<html><title>Admin Dashboard — AMAN COMPUTER</title></html>', { status: 200 });
      }
      if (url.endsWith('/get-public-payment-settings')) {
        return new Response(JSON.stringify({ upiEnabled: false }), { status: 200 });
      }
      return new Response('OK', { status: 200 });
    }) as typeof fetch,
  });

  assert.equal(report.allPassed, false);
  const qrCheck = report.checks.find((c) => c.id === 'hosting_customer_qr');
  assert.equal(qrCheck?.passed, false);
  assert.ok(qrCheck?.detail.includes('REGRESSION'));

  const adminGate = report.checks.find((c) => c.id === 'sec_admin_fail_closed');
  assert.equal(adminGate?.passed, false);
});

test('[P14-03] Retention Cleanup CLI Runner Defaults to Dry-Run, Sends x-cron-secret & Supports Execute Mode', async () => {
  const captured: Array<{ url: string; cronHeader: string | null; dryRun: boolean }> = [];
  const mockFetch = (async (input, init) => {
    const headers = new Headers(init?.headers);
    const body = JSON.parse(String(init?.body || '{}')) as { dryRun: boolean };
    captured.push({
      url: String(input),
      cronHeader: headers.get('x-cron-secret'),
      dryRun: body.dryRun,
    });
    return new Response(
      JSON.stringify({
        mode: body.dryRun ? 'dry_run' : 'execute',
        retentionPolicyConfirmed: true,
        jobsExpired: 2,
        filesMarkedDeleted: body.dryRun ? 0 : 4,
        storageObjectsRemoved: body.dryRun ? 0 : 4,
        skippedActiveOrDisputed: 1,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }) as typeof fetch;

  const dryRes = await invokeRetentionCleanup({
    supabaseUrl: 'https://tvtfgsijxlxpwgakpeag.supabase.co',
    cronSecret: 'test-cron-secret-value',
    execute: false,
    fetchImpl: mockFetch,
  });
  assert.equal(dryRes.mode, 'dry_run');
  assert.equal(captured[0].dryRun, true);
  assert.equal(captured[0].cronHeader, 'test-cron-secret-value');

  const execRes = await invokeRetentionCleanup({
    supabaseUrl: 'https://tvtfgsijxlxpwgakpeag.supabase.co',
    cronSecret: 'test-cron-secret-value',
    execute: true,
    fetchImpl: mockFetch,
  });
  assert.equal(execRes.mode, 'execute');
  assert.equal(execRes.filesMarkedDeleted, 4);
  assert.equal(captured[1].dryRun, false);
});

test('[P14-04] Windows Installer & Scripts Provision Security Directory & Scheduled Retention Without Secret Exposure', () => {
  const iss = fs.readFileSync(path.join(ROOT, 'agent', 'installer', 'ACScan2PrintAgent.iss'), 'utf8');
  assert.ok(iss.includes('{commonappdata}\\ACScan2Print\\Security'));
  assert.ok(iss.includes('scripts\\register-cleanup-task.ps1'));

  const installPs1 = fs.readFileSync(
    path.join(ROOT, 'agent', 'installer', 'scripts', 'install-agent.ps1'),
    'utf8'
  );
  assert.ok(installPs1.includes('Join-Path $ProgramDataDir "Security"'));
  assert.ok(installPs1.includes('register-cleanup-task.ps1'));

  const schedPs1 = fs.readFileSync(
    path.join(ROOT, 'agent', 'installer', 'scripts', 'register-cleanup-task.ps1'),
    'utf8'
  );
  assert.ok(schedPs1.includes('Register-ScheduledTask'));
  assert.ok(schedPs1.includes('health-check.ps1'));
  assert.ok(schedPs1.includes('ACScan2Print\\Temp'));
  assert.ok(!schedPs1.includes('CRON_SECRET'), 'Windows counter PC scripts must never reference CRON_SECRET');
});

test('[P14-05] Server /api/cloud/smoke, Package Scripts & Admin Pilot UI Smoke Panel Are Wired Cleanly', () => {
  const serverSrc = fs.readFileSync(path.join(ROOT, 'server.ts'), 'utf8');
  assert.ok(serverSrc.includes("'/api/cloud/smoke'"));

  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')) as {
    scripts: Record<string, string>;
  };
  assert.equal(pkg.scripts['cloud:smoke'], 'tsx scripts/verify-live-smoke.ts');
  assert.equal(pkg.scripts['cloud:cleanup'], 'tsx scripts/run-retention-cleanup.ts');
  assert.equal(pkg.scripts['test:phase14'], 'tsx --test tests/phase14/*.test.ts');

  const pilotPanel = fs.readFileSync(
    path.join(ROOT, 'src', 'components', 'print-management', 'PilotLaunchPanel.tsx'),
    'utf8'
  );
  assert.ok(pilotPanel.includes('/api/cloud/smoke?target='));
  assert.ok(pilotPanel.includes('Run Production Smoke'));
  assert.ok(pilotPanel.includes('npm run cloud:cleanup'));
  assert.ok(!pilotPanel.includes('process.env.'));
});

test('[P14-06] Phase 14 Rollout & Post-Launch Operations Runbook Exists With Required Sections', () => {
  const doc = fs.readFileSync(
    path.join(ROOT, 'docs', 'scan2print', 'PHASE_14_LIVE_ROLLOUT_AND_OPERATIONS.md'),
    'utf8'
  );
  assert.ok(doc.includes('npm run cloud:smoke'));
  assert.ok(doc.includes('npm run cloud:cleanup -- --execute'));
  assert.ok(doc.includes('register-cleanup-task.ps1'));
  assert.ok(doc.includes('10-Job Supervised Counter Dry Run'));
});
