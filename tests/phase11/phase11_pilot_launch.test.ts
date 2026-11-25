// AC Scan2Print — Phase 11 Controlled Pilot Launch Automated QA Suite
// Covers Pilot Summary & Real Turnaround Calculations, Go-Live Server Readiness Guard,
// Emergency Portal Intake Pause & Rollback, Retention Policy Confirmation + Dry-Run/Execute Purge,
// Immutable Incident Logbook, Admin Authorization, and Routing.

import assert from 'node:assert/strict';
import test from 'node:test';
import { SignJWT, exportJWK, generateKeyPair, type JSONWebKeySet } from 'jose';

import { parseHash } from '../../src/utils/adminLogic.ts';
import {
  handleAdminBootstrap,
  handleAdminPrintJobs,
  handleCreatePrintJob,
  handleGetPrintJobStatus,
  handleGetPublicPaymentSettings,
} from '../../supabase/functions/_shared/handlers.ts';
import { computeAdminPilotSummary } from '../../supabase/functions/_shared/printManagement.ts';
import type {
  PrintDevice,
  PrintJob,
  PrintPricingRule,
  PrintPrinter,
  RuntimeEnv,
} from '../../supabase/functions/_shared/types.ts';
import { TestSupabaseSimulator } from '../phase2/mockBackendAdapter.ts';

const FIREBASE_TEST_PROJECT_ID = 'ac-scan2print-prod';
const TEST_ADMIN_UID = 'firebase_admin_uid_aman_p11';
const TEST_CUSTOMER_UID = 'firebase_customer_uid_p11';
const TEST_KID = 'firebase-phase11-kid-1';

const primaryKeys = generateKeyPair('RS256');
const attackerKeys = generateKeyPair('RS256');

const BASE_ENV: RuntimeEnv = {
  FIREBASE_PROJECT_ID: FIREBASE_TEST_PROJECT_ID,
  ADMIN_BOOTSTRAP_SECRET: 'phase11-bootstrap-secret-32chars',
  CRON_SECRET: 'phase11-cron-secret-32chars-min',
  CUSTOMER_PORTAL_URL: 'https://ac-scan2print.web.app/quick-print',
};

async function getJwks(): Promise<JSONWebKeySet> {
  const { publicKey } = await primaryKeys;
  const jwk = await exportJWK(publicKey);
  return { keys: [{ ...jwk, kid: TEST_KID, alg: 'RS256', use: 'sig' }] };
}

async function signFirebaseJwt(opts: {
  uid?: string;
  email?: string;
  useAttackerKey?: boolean;
} = {}): Promise<string> {
  const nowSec = Math.floor(Date.now() / 1000);
  const kp = opts.useAttackerKey ? await attackerKeys : await primaryKeys;
  return new SignJWT({
    email: opts.email ?? 'owner@amancomputer.in',
    email_verified: true,
    auth_time: nowSec - 60,
    firebase: { sign_in_provider: 'password' },
  })
    .setProtectedHeader({ alg: 'RS256', kid: TEST_KID, typ: 'JWT' })
    .setIssuer(`https://securetoken.google.com/${FIREBASE_TEST_PROJECT_ID}`)
    .setAudience(FIREBASE_TEST_PROJECT_ID)
    .setSubject(opts.uid ?? TEST_ADMIN_UID)
    .setIssuedAt(nowSec - 10)
    .setExpirationTime(nowSec + 3600)
    .sign(kp.privateKey);
}

function makeReq(
  method: string,
  url: string,
  body?: unknown,
  headers: Record<string, string> = {}
): Request {
  return new Request(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'x-forwarded-for': '198.51.100.77',
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

async function setupBootstrappedAdmin(): Promise<{
  sim: TestSupabaseSimulator;
  adapter: ReturnType<TestSupabaseSimulator['asAdapter']>;
  adminJwt: string;
}> {
  const sim = new TestSupabaseSimulator();
  sim.setFirebaseJwks(await getJwks());
  const adapter = sim.asAdapter();
  const adminJwt = await signFirebaseJwt({ uid: TEST_ADMIN_UID });
  const res = await handleAdminBootstrap(
    makeReq(
      'POST',
      'https://edge.test/admin-bootstrap',
      { email: 'owner@amancomputer.in', fullName: 'Aman Owner' },
      {
        'x-admin-bootstrap-secret': BASE_ENV.ADMIN_BOOTSTRAP_SECRET!,
        Authorization: `Bearer ${adminJwt}`,
      }
    ),
    adapter,
    BASE_ENV
  );
  assert.equal(res.status, 201);
  return { sim, adapter, adminJwt };
}

function makeVerifiedPrinter(deviceId: string | null = null): PrintPrinter {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    printer_name: 'Canon LBP2900B Counter',
    printer_model: 'Canon LBP2900B',
    system_printer_name: 'Canon LBP2900B',
    device_id: deviceId,
    connection_type: 'usb',
    supported_paper_sizes: ['A4', 'Legal'],
    supports_colour: false,
    supports_duplex: false,
    capabilities_verified: true,
    printer_status: 'online',
    is_enabled: true,
    is_default: true,
    discovery_source: 'manual',
    approval_status: 'manual',
    last_seen_at: now,
    last_verified_at: now,
    archived_at: null,
    archived_by: null,
    audit_notes: null,
    created_at: now,
    updated_at: now,
  };
}

function makeActivePricingRule(): PrintPricingRule {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    rule_name: 'A4 B&W Single',
    paper_size: 'A4',
    print_mode: 'bw',
    print_sides: 'single',
    pricing_unit: 'per_printed_page',
    rate: 2.0,
    minimum_charge: 0,
    is_active: true,
    valid_from: new Date(Date.now() - 60_000).toISOString(),
    valid_until: null,
    created_at: now,
    updated_at: now,
  };
}

function makeJobRecord(overrides: Partial<PrintJob> = {}): PrintJob {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    job_number: `AC-P11-${Math.floor(1000 + Math.random() * 8999)}`,
    tracking_token_hash: null,
    draft_upload_secret_hash: null,
    customer_name: 'Test Customer',
    customer_phone: null,
    status: 'completed',
    payment_status: 'paid',
    payment_method: 'cash',
    subtotal: 4,
    final_amount: 4,
    currency: 'INR',
    paper_size: 'A4',
    print_mode: 'bw',
    print_sides: 'single',
    copies: 1,
    orientation: 'auto',
    scaling: 'fit',
    requested_page_range: 'all',
    verified_page_count: 2,
    physical_sheet_count: 2,
    pricing_rule_id: null,
    price_override_reason: null,
    assigned_printer_id: null,
    rejection_reason: null,
    cancellation_reason: null,
    submission_idempotency_key: null,
    created_at: now,
    updated_at: now,
    submitted_at: now,
    approved_at: now,
    completed_at: now,
    expires_at: null,
    ...overrides,
  };
}

test('[P11-01] computeAdminPilotSummary & list compute real metrics & never fabricate data', async () => {
  const { sim, adapter, adminJwt } = await setupBootstrappedAdmin();

  // Empty DB starts cleanly with null rates/turnaround and failing Go-Live gates
  const emptyListRes = await handleAdminPrintJobs(
    makeReq(
      'POST',
      'https://edge.test/admin-print-jobs',
      { action: 'list' },
      { Authorization: `Bearer ${adminJwt}` }
    ),
    adapter,
    BASE_ENV
  );
  assert.equal(emptyListRes.status, 200);
  const emptyBody = (await emptyListRes.json()) as {
    pilotSummary: ReturnType<typeof computeAdminPilotSummary>;
    systemSettings: { pilot_stage: string; pilot_intake_paused: boolean };
  };

  assert.equal(emptyBody.systemSettings.pilot_stage, 'dry_run');
  assert.equal(emptyBody.systemSettings.pilot_intake_paused, false);
  assert.equal(emptyBody.pilotSummary.submittedJobsCount, 0);
  assert.equal(emptyBody.pilotSummary.completionRatePct, null);
  assert.equal(emptyBody.pilotSummary.avgReviewToApproveMinutes, null);
  assert.equal(emptyBody.pilotSummary.avgEndToEndMinutes, null);
  assert.equal(emptyBody.pilotSummary.readyForGoLive, false);
  assert.ok(emptyBody.pilotSummary.blockingGateReasons.length >= 5);

  // Add real jobs: 1 completed (2m review, 5m end-to-end), 1 failed, 1 draft (excluded from submitted count)
  const baseMs = Date.parse('2026-11-24T10:00:00.000Z');
  sim.jobs.push(
    makeJobRecord({
      status: 'completed',
      submitted_at: new Date(baseMs).toISOString(),
      approved_at: new Date(baseMs + 2 * 60_000).toISOString(),
      completed_at: new Date(baseMs + 5 * 60_000).toISOString(),
    }),
    makeJobRecord({
      status: 'failed',
      submitted_at: new Date(baseMs + 10 * 60_000).toISOString(),
      approved_at: new Date(baseMs + 14 * 60_000).toISOString(),
      completed_at: null,
    }),
    makeJobRecord({
      status: 'draft',
      submitted_at: null,
      approved_at: null,
      completed_at: null,
    })
  );

  // Add a payment rejection event + retry attempt
  sim.events.push({
    id: crypto.randomUUID(),
    job_id: sim.jobs[1].id,
    actor_type: 'admin',
    actor_id: sim.adminAccounts[0].id,
    event_type: 'payment_verification_rejected',
    previous_status: 'failed',
    new_status: 'failed',
    metadata: { payment_id: crypto.randomUUID(), reason: 'Blurry UTR' },
    created_at: new Date(baseMs + 12 * 60_000).toISOString(),
  });

  const dev: PrintDevice = {
    id: crypto.randomUUID(),
    device_name: 'Shop-PC-01',
    device_status: 'active',
    credential_hash: 'h',
    agent_version: '1.0.0',
    os_version: 'Windows 11',
    last_heartbeat_at: new Date(sim.nowMs - 10_000).toISOString(),
    approved_at: new Date(sim.nowMs).toISOString(),
    revoked_at: null,
    created_at: new Date(sim.nowMs).toISOString(),
  };
  sim.devices.push(dev);
  sim.attempts.push({
    id: crypto.randomUUID(),
    job_id: sim.jobs[1].id,
    attempt_number: 2,
    idempotency_key: 'retry-2',
    device_id: dev.id,
    printer_id: crypto.randomUUID(),
    attempt_status: 'failed',
    lease_expires_at: new Date(sim.nowMs + 60_000).toISOString(),
    windows_spooler_job_id: null,
    started_at: new Date(sim.nowMs).toISOString(),
    submitted_to_spooler_at: null,
    completed_at: null,
    finished_at: new Date(sim.nowMs).toISOString(),
    error_code: 'PAPER_JAM',
    error_message: 'Paper jam',
  });

  const populatedRes = await handleAdminPrintJobs(
    makeReq(
      'POST',
      'https://edge.test/admin-print-jobs',
      { action: 'list' },
      { Authorization: `Bearer ${adminJwt}` }
    ),
    adapter,
    BASE_ENV
  );
  assert.equal(populatedRes.status, 200);
  const populated = (await populatedRes.json()) as {
    pilotSummary: ReturnType<typeof computeAdminPilotSummary>;
  };

  assert.equal(populated.pilotSummary.submittedJobsCount, 2);
  assert.equal(populated.pilotSummary.completedCount, 1);
  assert.equal(populated.pilotSummary.failedCount, 1);
  assert.equal(populated.pilotSummary.completionRatePct, 50);
  assert.equal(populated.pilotSummary.failureOrReviewRatePct, 50);
  assert.equal(populated.pilotSummary.avgReviewToApproveMinutes, 3); // avg of 2m and 4m
  assert.equal(populated.pilotSummary.avgEndToEndMinutes, 5);
  assert.equal(populated.pilotSummary.paymentMismatchOrRejectionCount, 1);
  assert.equal(populated.pilotSummary.reprintOrRetryCount, 1);
  assert.equal(
    populated.pilotSummary.readinessGates.find((g) => g.id === 'agent_online')?.passed,
    true
  );
});

test('[P11-02] Server-side Go-Live guard blocks incomplete production transition and approves once all gates pass', async () => {
  const { sim, adapter, adminJwt } = await setupBootstrappedAdmin();

  // Attempt transition to 'production' while gates fail -> must reject 409 PILOT_GO_LIVE_BLOCKED
  const blockedRes = await handleAdminPrintJobs(
    makeReq(
      'POST',
      'https://edge.test/admin-print-jobs',
      { action: 'pilot_update_settings', pilotStage: 'production' },
      { Authorization: `Bearer ${adminJwt}` }
    ),
    adapter,
    BASE_ENV
  );
  assert.equal(blockedRes.status, 409);
  const blockedBody = (await blockedRes.json()) as { error: { code: string } };
  assert.equal(blockedBody.error.code, 'PILOT_GO_LIVE_BLOCKED');

  // Satisfy all 6 blocking gates
  sim.printers.push(makeVerifiedPrinter());
  sim.pricingRules.push(makeActivePricingRule());
  sim.jobs.push(makeJobRecord({ status: 'completed' }));

  const approveRes = await handleAdminPrintJobs(
    makeReq(
      'POST',
      'https://edge.test/admin-print-jobs',
      {
        action: 'pilot_update_settings',
        pilotStage: 'production',
        customerPortalUrl: 'https://ac-scan2print.web.app/quick-print',
        pilotTargetJobs: 100,
        retentionPolicyConfirmed: true,
        autoCleanupEnabled: true,
        pilotChecklist: {
          shopPcInstalled: true,
          printerTested: true,
          qrPosterDisplayed: true,
          staffTrained: true,
          backupTested: true,
        },
      },
      { Authorization: `Bearer ${adminJwt}` }
    ),
    adapter,
    BASE_ENV
  );
  assert.equal(approveRes.status, 200);
  const approvedBody = (await approveRes.json()) as {
    systemSettings: { pilot_stage: string; pilot_go_live_approved_at: string | null };
    pilotSummary: { readyForGoLive: boolean };
  };
  assert.equal(approvedBody.systemSettings.pilot_stage, 'production');
  assert.ok(approvedBody.systemSettings.pilot_go_live_approved_at);
  assert.equal(approvedBody.pilotSummary.readyForGoLive, true);
  assert.ok(sim.events.some((e) => e.event_type === 'pilot_go_live_approved'));
});

test('[P11-03] Emergency Intake Pause blocks new uploads (503) while keeping tracking open and resuming cleanly', async () => {
  const { sim, adapter, adminJwt } = await setupBootstrappedAdmin();
  sim.pricingRules.push(makeActivePricingRule());

  // 1. Create an existing job while intake is open
  const openCreateRes = await handleCreatePrintJob(
    makeReq('POST', 'https://edge.test/create-print-job', {
      paperSize: 'A4',
      printMode: 'bw',
      printSides: 'single',
      copies: 1,
      customerName: 'Pre-Pause Customer',
    }),
    adapter,
    BASE_ENV
  );
  assert.equal(openCreateRes.status, 201);
  const createdJob = (await openCreateRes.json()) as { jobId: string };
  // Simulate finalized tracking token on that job
  const trackToken = 'ac_track_pilot_existing_order_0123456';
  const { sha256Hex } = await import('../../supabase/functions/_shared/security.ts');
  const storedJob = sim.jobs.find((j) => j.id === createdJob.jobId)!;
  storedJob.status = 'submitted';
  storedJob.tracking_token_hash = await sha256Hex(trackToken);

  // 2. Pause customer portal intake
  const pauseRes = await handleAdminPrintJobs(
    makeReq(
      'POST',
      'https://edge.test/admin-print-jobs',
      {
        action: 'pilot_update_settings',
        pilotIntakePaused: true,
        pilotPauseReason: 'Toner replacement in progress (back in 10 mins)',
      },
      { Authorization: `Bearer ${adminJwt}` }
    ),
    adapter,
    BASE_ENV
  );
  assert.equal(pauseRes.status, 200);
  assert.ok(sim.events.some((e) => e.event_type === 'pilot_intake_paused'));

  // 3. Public bootstrap payload exposes pilotStatus.intakePaused = true
  const publicCfgRes = await handleGetPublicPaymentSettings(
    makeReq('GET', 'https://edge.test/get-public-payment-settings'),
    adapter,
    BASE_ENV
  );
  assert.equal(publicCfgRes.status, 200);
  const publicCfg = (await publicCfgRes.json()) as {
    portalConfig: {
      pilotStatus: { pilotStage: string; intakePaused: boolean; pauseReason: string | null };
    };
  };
  assert.equal(publicCfg.portalConfig.pilotStatus.intakePaused, true);
  assert.equal(
    publicCfg.portalConfig.pilotStatus.pauseReason,
    'Toner replacement in progress (back in 10 mins)'
  );

  // 4. New uploads fail fast with 503 PORTAL_INTAKE_PAUSED
  const pausedCreateRes = await handleCreatePrintJob(
    makeReq('POST', 'https://edge.test/create-print-job', {
      paperSize: 'A4',
      printMode: 'bw',
      printSides: 'single',
      copies: 1,
    }),
    adapter,
    BASE_ENV
  );
  assert.equal(pausedCreateRes.status, 503);
  const pausedErr = (await pausedCreateRes.json()) as { error: { code: string } };
  assert.equal(pausedErr.error.code, 'PORTAL_INTAKE_PAUSED');

  // 5. Existing order tracking remains operational while paused
  const trackRes = await handleGetPrintJobStatus(
    makeReq('GET', 'https://edge.test/get-print-job-status', undefined, {
      'x-tracking-token': trackToken,
    }),
    adapter,
    BASE_ENV
  );
  assert.equal(trackRes.status, 200);

  // 6. Resume intake and verify new jobs succeed again
  const resumeRes = await handleAdminPrintJobs(
    makeReq(
      'POST',
      'https://edge.test/admin-print-jobs',
      { action: 'pilot_update_settings', pilotIntakePaused: false, pilotPauseReason: null },
      { Authorization: `Bearer ${adminJwt}` }
    ),
    adapter,
    BASE_ENV
  );
  assert.equal(resumeRes.status, 200);
  assert.ok(sim.events.some((e) => e.event_type === 'pilot_intake_resumed'));

  const resumedCreateRes = await handleCreatePrintJob(
    makeReq('POST', 'https://edge.test/create-print-job', {
      paperSize: 'A4',
      printMode: 'bw',
      printSides: 'single',
      copies: 1,
    }),
    adapter,
    BASE_ENV
  );
  assert.equal(resumedCreateRes.status, 201);
});

test('[P11-04] Retention confirmation guards purge execute; dry_run and incident logbook work reliably', async () => {
  const { sim, adapter, adminJwt } = await setupBootstrappedAdmin();

  // Execute purge blocked until retentionPolicyConfirmed is saved
  const unconfirmedExec = await handleAdminPrintJobs(
    makeReq(
      'POST',
      'https://edge.test/admin-print-jobs',
      { action: 'pilot_run_cleanup', mode: 'execute' },
      { Authorization: `Bearer ${adminJwt}` }
    ),
    adapter,
    BASE_ENV
  );
  assert.equal(unconfirmedExec.status, 409);
  const execErr = (await unconfirmedExec.json()) as { error: { code: string } };
  assert.equal(execErr.error.code, 'RETENTION_CONFIRMATION_REQUIRED');

  // Dry run is allowed before confirmation without deleting objects
  const dryRunRes = await handleAdminPrintJobs(
    makeReq(
      'POST',
      'https://edge.test/admin-print-jobs',
      { action: 'pilot_run_cleanup', mode: 'dry_run' },
      { Authorization: `Bearer ${adminJwt}` }
    ),
    adapter,
    BASE_ENV
  );
  assert.equal(dryRunRes.status, 200);
  const dryRunBody = (await dryRunRes.json()) as { mode: string };
  assert.equal(dryRunBody.mode, 'dry_run');

  // Confirm retention & execute cleanup
  const confirmRetRes = await handleAdminPrintJobs(
    makeReq(
      'POST',
      'https://edge.test/admin-print-jobs',
      {
        action: 'pilot_update_settings',
        retentionPolicyConfirmed: true,
        autoCleanupEnabled: true,
        draftRetentionHours: 2,
        completedRetentionHours: 24,
        failedRetentionHours: 72,
      },
      { Authorization: `Bearer ${adminJwt}` }
    ),
    adapter,
    BASE_ENV
  );
  assert.equal(confirmRetRes.status, 200);

  const execRes = await handleAdminPrintJobs(
    makeReq(
      'POST',
      'https://edge.test/admin-print-jobs',
      { action: 'pilot_run_cleanup', mode: 'execute' },
      { Authorization: `Bearer ${adminJwt}` }
    ),
    adapter,
    BASE_ENV
  );
  assert.equal(execRes.status, 200);
  assert.equal(sim.cleanupLogs.length, 2);

  // Pilot observation logbook validation + persistence
  const badNoteRes = await handleAdminPrintJobs(
    makeReq(
      'POST',
      'https://edge.test/admin-print-jobs',
      { action: 'pilot_log_note', category: 'invalid_cat', note: 'Test' },
      { Authorization: `Bearer ${adminJwt}` }
    ),
    adapter,
    BASE_ENV
  );
  assert.equal(badNoteRes.status, 400);

  const linkedJob = makeJobRecord();
  sim.jobs.push(linkedJob);
  const noteRes = await handleAdminPrintJobs(
    makeReq(
      'POST',
      'https://edge.test/admin-print-jobs',
      {
        action: 'pilot_log_note',
        category: 'printer_issue',
        severity: 'warning',
        jobId: linkedJob.id,
        note: 'Tray 1 low on A4 paper during pilot test #12',
      },
      { Authorization: `Bearer ${adminJwt}` }
    ),
    adapter,
    BASE_ENV
  );
  assert.equal(noteRes.status, 201);
  const loggedEv = sim.events.find((e) => e.event_type === 'pilot_observation_logged');
  assert.ok(loggedEv);
  assert.equal(loggedEv.job_id, linkedJob.id);
  assert.equal(loggedEv.metadata.category, 'printer_issue');
});

test('[P11-05] Unauthorized requests cannot alter pilot settings and #/print-management/pilot routes cleanly', async () => {
  const { adapter } = await setupBootstrappedAdmin();
  const nonAdminJwt = await signFirebaseJwt({ uid: TEST_CUSTOMER_UID });
  const forgedJwt = await signFirebaseJwt({ uid: TEST_ADMIN_UID, useAttackerKey: true });

  for (const action of ['pilot_update_settings', 'pilot_log_note', 'pilot_run_cleanup']) {
    const anonRes = await handleAdminPrintJobs(
      makeReq('POST', 'https://edge.test/admin-print-jobs', { action }),
      adapter,
      BASE_ENV
    );
    assert.equal(anonRes.status, 401);

    const nonAdminRes = await handleAdminPrintJobs(
      makeReq(
        'POST',
        'https://edge.test/admin-print-jobs',
        { action },
        { Authorization: `Bearer ${nonAdminJwt}` }
      ),
      adapter,
      BASE_ENV
    );
    assert.equal(nonAdminRes.status, 403);

    const forgedRes = await handleAdminPrintJobs(
      makeReq(
        'POST',
        'https://edge.test/admin-print-jobs',
        { action },
        { Authorization: `Bearer ${forgedJwt}` }
      ),
      adapter,
      BASE_ENV
    );
    assert.equal(forgedRes.status, 401);
  }

  assert.deepEqual(parseHash('#/print-management/pilot'), { main: 'print-management', sub: 'pilot' });
  assert.deepEqual(parseHash('#/pilot'), { main: 'print-management', sub: 'pilot' });
});
