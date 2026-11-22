// AC Scan2Print — Phase 0 Hardware Audit & Admin Printer Management Tests
// Tests manual printer CRUD, tri-state unknown capabilities, safe archiving with history preservation,
// single-admin authorization enforcement, future Windows agent sync/review, and audit classification.

import assert from 'node:assert/strict';
import test from 'node:test';
import { SignJWT, exportJWK, generateKeyPair, type JSONWebKeySet } from 'jose';

import {
  handleAdminBootstrap,
  handleAdminPrinters,
  handleAgentEnroll,
  handleAgentSyncPrinters,
} from '../../supabase/functions/_shared/handlers.ts';
import type { PrintJob, PrintJobAttempt, RuntimeEnv } from '../../supabase/functions/_shared/types.ts';
import { TestSupabaseSimulator } from '../phase2/mockBackendAdapter.ts';

const FIREBASE_TEST_PROJECT_ID = 'ac-scan2print-prod';
const TEST_ADMIN_FIREBASE_UID = 'firebase_admin_uid_aman_01';
const TEST_KID = 'firebase-phase0-kid-1';

const primaryKeyPairPromise = generateKeyPair('RS256');
const attackerKeyPairPromise = generateKeyPair('RS256');

const TEST_ENV: RuntimeEnv = {
  FIREBASE_PROJECT_ID: FIREBASE_TEST_PROJECT_ID,
  ADMIN_BOOTSTRAP_SECRET: 'test-bootstrap-secret-32chars-min',
  CRON_SECRET: 'test-cron-secret-32chars-min',
};

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
      'x-forwarded-for': '203.0.113.10',
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

async function getTestJwks(): Promise<JSONWebKeySet> {
  const { publicKey } = await primaryKeyPairPromise;
  const jwk = await exportJWK(publicKey);
  return {
    keys: [
      {
        ...jwk,
        kid: TEST_KID,
        alg: 'RS256',
        use: 'sig',
      },
    ],
  };
}

async function signTestFirebaseToken(opts: {
  uid?: string;
  email?: string;
  useAttackerKey?: boolean;
} = {}): Promise<string> {
  const nowSec = Math.floor(Date.now() / 1000);
  const kp = opts.useAttackerKey ? await attackerKeyPairPromise : await primaryKeyPairPromise;

  return new SignJWT({
    email: opts.email ?? 'owner@amancomputer.local',
    email_verified: true,
    auth_time: nowSec - 60,
    firebase: { sign_in_provider: 'password' },
  })
    .setProtectedHeader({ alg: 'RS256', kid: TEST_KID, typ: 'JWT' })
    .setIssuer(`https://securetoken.google.com/${FIREBASE_TEST_PROJECT_ID}`)
    .setAudience(FIREBASE_TEST_PROJECT_ID)
    .setSubject(opts.uid ?? TEST_ADMIN_FIREBASE_UID)
    .setIssuedAt(nowSec - 10)
    .setExpirationTime(nowSec + 3600)
    .sign(kp.privateKey);
}

async function setupAdminEnv() {
  const sim = new TestSupabaseSimulator();
  sim.setFirebaseJwks(await getTestJwks());
  const adapter = sim.asAdapter();
  const adminJwt = await signTestFirebaseToken();

  const bootRes = await handleAdminBootstrap(
    makeReq(
      'POST',
      'https://edge.local/admin-bootstrap',
      { email: 'owner@amancomputer.local', fullName: 'Aman Owner' },
      {
        'x-admin-bootstrap-secret': TEST_ENV.ADMIN_BOOTSTRAP_SECRET!,
        Authorization: `Bearer ${adminJwt}`,
      }
    ),
    adapter,
    TEST_ENV
  );
  assert.equal(bootRes.status, 201);
  return { sim, adapter, adminJwt };
}

test('Admin printer CRUD supports unknown capabilities, editing, enable/disable, and immutable audit events', async () => {
  const { sim, adapter, adminJwt } = await setupAdminEnv();

  // 1. Initial GET returns zero fabricated printers and honest pending physical audit status
  const listRes = await handleAdminPrinters(
    makeReq('GET', 'https://edge.local/admin-printers', undefined, {
      Authorization: `Bearer ${adminJwt}`,
    }),
    adapter,
    TEST_ENV
  );
  assert.equal(listRes.status, 200);
  const listBody = (await listRes.json()) as {
    printers: unknown[];
    devices: unknown[];
    auditSummary: {
      softwareAuditComplete: boolean;
      physicalVerificationPending: boolean;
      totalRegistered: number;
    };
  };
  assert.equal(listBody.printers.length, 0);
  assert.equal(listBody.devices.length, 0);
  assert.equal(listBody.auditSummary.softwareAuditComplete, true);
  assert.equal(listBody.auditSummary.physicalVerificationPending, true);

  // 2. Add a printer manually with optional model omitted and capabilities Unknown
  const createRes = await handleAdminPrinters(
    makeReq(
      'POST',
      'https://edge.local/admin-printers',
      {
        action: 'create',
        printerName: 'Main Counter Printer',
        connectionType: 'unknown',
        supportsColour: 'unknown',
        supportsDuplex: 'unknown',
        supportedPaperSizes: [],
        isEnabled: false,
      },
      { Authorization: `Bearer ${adminJwt}` }
    ),
    adapter,
    TEST_ENV
  );
  assert.equal(createRes.status, 201);
  const createBody = (await createRes.json()) as {
    printer: {
      id: string;
      printer_name: string;
      printer_model: string | null;
      supports_colour: boolean | null;
      supports_duplex: boolean | null;
      capabilities_verified: boolean;
      is_enabled: boolean;
      printer_status: string;
    };
    auditSummary: {
      pendingVerificationCount: number;
      disabledCount: number;
    };
  };
  assert.equal(createBody.printer.printer_name, 'Main Counter Printer');
  assert.equal(createBody.printer.printer_model, null);
  assert.equal(createBody.printer.supports_colour, null);
  assert.equal(createBody.printer.supports_duplex, null);
  assert.equal(createBody.printer.capabilities_verified, false);
  assert.equal(createBody.printer.is_enabled, false);
  assert.equal(createBody.printer.printer_status, 'disabled');
  assert.equal(createBody.auditSummary.pendingVerificationCount, 1);
  assert.equal(createBody.auditSummary.disabledCount, 1);

  const printerId = createBody.printer.id;

  // 3. Cannot mark physically verified while capabilities remain Unknown
  const badVerifyRes = await handleAdminPrinters(
    makeReq(
      'POST',
      'https://edge.local/admin-printers',
      {
        action: 'update',
        printerId,
        markPhysicallyVerified: true,
      },
      { Authorization: `Bearer ${adminJwt}` }
    ),
    adapter,
    TEST_ENV
  );
  assert.equal(badVerifyRes.status, 400);

  // 4. Edit printer details with confirmed specs & enable it
  const updateRes = await handleAdminPrinters(
    makeReq(
      'POST',
      'https://edge.local/admin-printers',
      {
        action: 'update',
        printerId,
        printerName: 'Counter Desk Unit 1',
        printerModel: 'Shop Desk Model A',
        connectionType: 'usb',
        supportsColour: 'yes',
        supportsDuplex: 'no',
        supportedPaperSizes: ['A4', 'Legal'],
        isEnabled: true,
      },
      { Authorization: `Bearer ${adminJwt}` }
    ),
    adapter,
    TEST_ENV
  );
  assert.equal(updateRes.status, 200);
  const updateBody = (await updateRes.json()) as {
    printer: {
      printer_name: string;
      printer_model: string | null;
      connection_type: string;
      supports_colour: boolean | null;
      supports_duplex: boolean | null;
      supported_paper_sizes: string[];
      is_enabled: boolean;
      printer_status: string;
    };
  };
  assert.equal(updateBody.printer.printer_name, 'Counter Desk Unit 1');
  assert.equal(updateBody.printer.printer_model, 'Shop Desk Model A');
  assert.equal(updateBody.printer.connection_type, 'usb');
  assert.equal(updateBody.printer.supports_colour, true);
  assert.equal(updateBody.printer.supports_duplex, false);
  assert.deepEqual(updateBody.printer.supported_paper_sizes, ['A4', 'Legal']);
  assert.equal(updateBody.printer.is_enabled, true);
  assert.equal(updateBody.printer.printer_status, 'unknown');

  // 5. Toggle disable & re-enable
  const disableRes = await handleAdminPrinters(
    makeReq(
      'POST',
      'https://edge.local/admin-printers',
      { action: 'set_enabled', printerId, isEnabled: false },
      { Authorization: `Bearer ${adminJwt}` }
    ),
    adapter,
    TEST_ENV
  );
  assert.equal(disableRes.status, 200);
  const disableBody = (await disableRes.json()) as {
    printer: { is_enabled: boolean; printer_status: string };
  };
  assert.equal(disableBody.printer.is_enabled, false);
  assert.equal(disableBody.printer.printer_status, 'disabled');

  assert.ok(sim.events.some((e) => e.event_type === 'printer_created'));
  assert.ok(sim.events.some((e) => e.event_type === 'printer_updated'));
  assert.ok(sim.events.some((e) => e.event_type === 'printer_disabled'));
});

test('Safe archiving preserves historical print_jobs & print_job_attempts while blocking hard delete', async () => {
  const { sim, adapter, adminJwt } = await setupAdminEnv();

  const createRes = await handleAdminPrinters(
    makeReq(
      'POST',
      'https://edge.local/admin-printers',
      {
        action: 'create',
        printerName: 'Legacy Shop Printer',
        connectionType: 'lan',
        supportsColour: 'no',
        supportsDuplex: 'yes',
        supportedPaperSizes: ['A4'],
        isEnabled: true,
      },
      { Authorization: `Bearer ${adminJwt}` }
    ),
    adapter,
    TEST_ENV
  );
  const { printer } = (await createRes.json()) as { printer: { id: string } };

  const deviceId = crypto.randomUUID();
  sim.devices.push({
    id: deviceId,
    device_name: 'Shop-PC',
    device_status: 'active',
    credential_hash: 'hash-1',
    agent_version: null,
    os_version: null,
    last_heartbeat_at: null,
    approved_at: new Date().toISOString(),
    revoked_at: null,
    created_at: new Date().toISOString(),
  });

  // Insert historical completed job & attempt referencing this printer
  const jobId = crypto.randomUUID();
  const historicalJob: PrintJob = {
    id: jobId,
    job_number: 'AC261121-0001',
    tracking_token_hash: 'tokhash',
    draft_upload_secret_hash: null,
    customer_name: null,
    customer_phone: null,
    status: 'completed',
    payment_status: 'paid',
    payment_method: 'cash',
    subtotal: 10,
    final_amount: 10,
    currency: 'INR',
    paper_size: 'A4',
    print_mode: 'bw',
    print_sides: 'single',
    copies: 1,
    orientation: 'auto',
    scaling: 'fit',
    requested_page_range: 'all',
    verified_page_count: 5,
    physical_sheet_count: 5,
    pricing_rule_id: null,
    price_override_reason: null,
    assigned_printer_id: printer.id,
    rejection_reason: null,
    cancellation_reason: null,
    submission_idempotency_key: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    submitted_at: new Date().toISOString(),
    approved_at: new Date().toISOString(),
    completed_at: new Date().toISOString(),
    expires_at: null,
  };
  const historicalAttempt: PrintJobAttempt = {
    id: crypto.randomUUID(),
    job_id: jobId,
    attempt_number: 1,
    idempotency_key: crypto.randomUUID(),
    device_id: deviceId,
    printer_id: printer.id,
    attempt_status: 'completed',
    lease_expires_at: new Date().toISOString(),
    windows_spooler_job_id: '42',
    started_at: new Date().toISOString(),
    submitted_to_spooler_at: new Date().toISOString(),
    completed_at: new Date().toISOString(),
    finished_at: new Date().toISOString(),
    error_code: null,
    error_message: null,
  };
  sim.jobs.push(historicalJob);
  sim.attempts.push(historicalAttempt);

  // Attempt hard delete -> must be refused (409 HISTORICAL_RECORDS_EXIST)
  const hardDeleteRes = await handleAdminPrinters(
    makeReq(
      'POST',
      'https://edge.local/admin-printers',
      { action: 'delete', printerId: printer.id, confirmPermanentDelete: true },
      { Authorization: `Bearer ${adminJwt}` }
    ),
    adapter,
    TEST_ENV
  );
  assert.equal(hardDeleteRes.status, 409);

  // Archive printer safely -> succeeds and keeps historical records intact
  const archiveRes = await handleAdminPrinters(
    makeReq(
      'POST',
      'https://edge.local/admin-printers',
      { action: 'archive', printerId: printer.id },
      { Authorization: `Bearer ${adminJwt}` }
    ),
    adapter,
    TEST_ENV
  );
  assert.equal(archiveRes.status, 200);
  const archiveBody = (await archiveRes.json()) as {
    printer: { archived_at: string | null; is_enabled: boolean; printer_status: string };
    auditSummary: { totalRegistered: number; archivedCount: number };
  };
  assert.ok(archiveBody.printer.archived_at);
  assert.equal(archiveBody.printer.is_enabled, false);
  assert.equal(archiveBody.printer.printer_status, 'disabled');
  assert.equal(archiveBody.auditSummary.totalRegistered, 0);
  assert.equal(archiveBody.auditSummary.archivedCount, 1);

  // Historical job & attempt still reference printer.id cleanly
  assert.equal(sim.jobs[0].assigned_printer_id, printer.id);
  assert.equal(sim.attempts[0].printer_id, printer.id);

  // Archived printer cannot be edited or re-enabled
  const editArchivedRes = await handleAdminPrinters(
    makeReq(
      'POST',
      'https://edge.local/admin-printers',
      { action: 'set_enabled', printerId: printer.id, isEnabled: true },
      { Authorization: `Bearer ${adminJwt}` }
    ),
    adapter,
    TEST_ENV
  );
  assert.equal(editArchivedRes.status, 409);
});

test('Unauthorized callers and device credentials cannot access admin-printers', async () => {
  const { adapter, adminJwt } = await setupAdminEnv();

  // No token -> 401
  const noAuthRes = await handleAdminPrinters(
    makeReq('GET', 'https://edge.local/admin-printers'),
    adapter,
    TEST_ENV
  );
  assert.equal(noAuthRes.status, 401);

  // Attacker-signed JWT -> 401
  const attackerJwt = await signTestFirebaseToken({ useAttackerKey: true });
  const attackerRes = await handleAdminPrinters(
    makeReq('GET', 'https://edge.local/admin-printers', undefined, {
      Authorization: `Bearer ${attackerJwt}`,
    }),
    adapter,
    TEST_ENV
  );
  assert.equal(attackerRes.status, 401);

  // Different valid Firebase user not in print_admin_accounts -> 403
  const strangerJwt = await signTestFirebaseToken({ uid: 'unauthorized_uid_999' });
  const strangerRes = await handleAdminPrinters(
    makeReq('GET', 'https://edge.local/admin-printers', undefined, {
      Authorization: `Bearer ${strangerJwt}`,
    }),
    adapter,
    TEST_ENV
  );
  assert.equal(strangerRes.status, 403);

  // Device credential rejected by admin-printers -> 401
  const enrollRes = await handleAgentEnroll(
    makeReq(
      'POST',
      'https://edge.local/agent-enroll',
      { deviceName: 'Counter-PC' },
      { Authorization: `Bearer ${adminJwt}` }
    ),
    adapter,
    TEST_ENV
  );
  const { deviceCredential } = (await enrollRes.json()) as { deviceCredential: string };

  const agentOnAdminRes = await handleAdminPrinters(
    makeReq('GET', 'https://edge.local/admin-printers', undefined, {
      'x-device-credential': deviceCredential,
    }),
    adapter,
    TEST_ENV
  );
  assert.equal(agentOnAdminRes.status, 401);
});

test('Future agent-sync-printers creates pending_review printers disabled until Admin approval', async () => {
  const { adapter, adminJwt } = await setupAdminEnv();

  // Admin token rejected by agent-sync-printers
  const adminOnAgentRes = await handleAgentSyncPrinters(
    makeReq(
      'POST',
      'https://edge.local/agent-sync-printers',
      { printers: [{ systemPrinterName: 'Spooler_Q1' }] },
      { Authorization: `Bearer ${adminJwt}` }
    ),
    adapter,
    TEST_ENV
  );
  assert.equal(adminOnAgentRes.status, 401);

  // Enroll active device
  const enrollRes = await handleAgentEnroll(
    makeReq(
      'POST',
      'https://edge.local/agent-enroll',
      { deviceName: 'Shop-Win11-PC', osVersion: 'Windows 11 24H2', agentVersion: '0.1.0' },
      { Authorization: `Bearer ${adminJwt}` }
    ),
    adapter,
    TEST_ENV
  );
  assert.equal(enrollRes.status, 201);
  const { deviceCredential } = (await enrollRes.json()) as { deviceCredential: string };

  // Agent reports discovered printer
  const syncRes = await handleAgentSyncPrinters(
    makeReq(
      'POST',
      'https://edge.local/agent-sync-printers',
      {
        printers: [
          {
            systemPrinterName: 'USB_Printer_Queue',
            printerName: 'Discovered Shop Printer',
            connectionType: 'usb',
            supportsColour: 'unknown',
            supportsDuplex: 'no',
            supportedPaperSizes: ['A4'],
            printerStatus: 'online',
          },
        ],
      },
      { 'x-device-credential': deviceCredential }
    ),
    adapter,
    TEST_ENV
  );
  assert.equal(syncRes.status, 200);
  const syncBody = (await syncRes.json()) as {
    synced: Array<{ id: string; approvalStatus: string; created: boolean }>;
  };
  assert.equal(syncBody.synced.length, 1);
  assert.equal(syncBody.synced[0].approvalStatus, 'pending_review');
  assert.equal(syncBody.synced[0].created, true);

  const syncedId = syncBody.synced[0].id;

  // Admin cannot enable unapproved discovered printer without reviewing it first
  const enableBeforeReviewRes = await handleAdminPrinters(
    makeReq(
      'POST',
      'https://edge.local/admin-printers',
      { action: 'set_enabled', printerId: syncedId, isEnabled: true },
      { Authorization: `Bearer ${adminJwt}` }
    ),
    adapter,
    TEST_ENV
  );
  assert.equal(enableBeforeReviewRes.status, 409);

  // Admin approves discovered printer
  const reviewRes = await handleAdminPrinters(
    makeReq(
      'POST',
      'https://edge.local/admin-printers',
      { action: 'review_discovered', printerId: syncedId, decision: 'approve', enableNow: true },
      { Authorization: `Bearer ${adminJwt}` }
    ),
    adapter,
    TEST_ENV
  );
  assert.equal(reviewRes.status, 200);
  const reviewBody = (await reviewRes.json()) as {
    printer: { approval_status: string; is_enabled: boolean };
  };
  assert.equal(reviewBody.printer.approval_status, 'approved');
  assert.equal(reviewBody.printer.is_enabled, true);
});
