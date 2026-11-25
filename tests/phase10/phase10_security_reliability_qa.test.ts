// AC Scan2Print — Phase 10 Comprehensive Security, Reliability, Functional & QA Gate Suite
// Covers End-to-End Multi-File/Duplex/Retention Flows, Payment/Price Atomicity, Bootstrap & CORS Hardening,
// Cross-Device Agent Isolation, C# Agent & Server Static Security Checks, and Negative Fault Matrix.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { SignJWT, exportJWK, generateKeyPair, type JSONWebKeySet } from 'jose';

import {
  handleAdminBootstrap,
  handleAdminPrintJobs,
  handleAdminReleasePrintJob,
  handleAdminRetryPrintJob,
  handleAdminReviewPrintJob,
  handleAdminUpdatePaymentSettings,
  handleAdminVerifyPayment,
  handleAgentClaimJob,
  handleAgentEnroll,
  handleAgentHeartbeat,
  handleAgentReportJobEvent,
  handleCleanupExpiredPrintFiles,
  handleCreatePrintJob,
  handleCreatePrintUploadUrl,
  handleFinalizePrintUpload,
  handleGetPrintJobStatus,
  handleSubmitUpiPayment,
} from '../../supabase/functions/_shared/handlers.ts';
import { sha256Hex } from '../../supabase/functions/_shared/security.ts';
import type { PrintPricingRule, RuntimeEnv } from '../../supabase/functions/_shared/types.ts';
import { TestSupabaseSimulator } from '../phase2/mockBackendAdapter.ts';

const FIREBASE_TEST_PROJECT_ID = 'ac-scan2print-prod';
const TEST_ADMIN_UID = 'firebase_admin_uid_aman_p10';
const TEST_ATTACKER_UID = 'firebase_attacker_uid_p10';
const TEST_KID = 'firebase-phase10-kid-1';

const primaryKeys = generateKeyPair('RS256');
const attackerKeys = generateKeyPair('RS256');

const BASE_ENV: RuntimeEnv = {
  FIREBASE_PROJECT_ID: FIREBASE_TEST_PROJECT_ID,
  ADMIN_BOOTSTRAP_SECRET: 'phase10-bootstrap-secret-32chars',
  CRON_SECRET: 'phase10-cron-secret-32chars-min',
  CUSTOMER_PORTAL_URL: 'https://portal.amancomputer.test/quick-print',
  AGENT_CLAIM_LEASE_SECONDS: '180',
};

async function getJwks(): Promise<JSONWebKeySet> {
  const { publicKey } = await primaryKeys;
  const jwk = await exportJWK(publicKey);
  return { keys: [{ ...jwk, kid: TEST_KID, alg: 'RS256', use: 'sig' }] };
}

async function signFirebaseJwt(opts: {
  uid?: string;
  email?: string;
  nowMs?: number;
  expiresInSeconds?: number;
  useAttackerKey?: boolean;
} = {}): Promise<string> {
  const nowSec = Math.floor((opts.nowMs ?? Date.now()) / 1000);
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
    .setExpirationTime(nowSec + (opts.expiresInSeconds ?? 3600))
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
      'x-forwarded-for': '198.51.100.42',
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

function buildMinimalPdf(pageCount: number): Uint8Array {
  const pages = Array.from(
    { length: pageCount },
    (_, idx) => `${idx + 3} 0 obj << /Type /Page /Parent 2 0 R >> endobj`
  ).join('\n');
  return new TextEncoder().encode(
    `%PDF-1.4\n1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n2 0 obj << /Type /Pages /Count ${pageCount} >> endobj\n${pages}\n%%EOF`
  );
}

function buildMinimalPng(): Uint8Array {
  return new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
}

function makePricingRule(overrides: Partial<PrintPricingRule> = {}): PrintPricingRule {
  return {
    id: crypto.randomUUID(),
    rule_name: 'P10 Rule',
    paper_size: 'A4',
    print_mode: 'bw',
    print_sides: 'single',
    pricing_unit: 'per_printed_page',
    rate: 2.0,
    minimum_charge: 0,
    is_active: true,
    valid_from: new Date(Date.now() - 60_000).toISOString(),
    valid_until: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

async function setupFullShopEnv(env: RuntimeEnv = BASE_ENV) {
  const sim = new TestSupabaseSimulator();
  sim.setFirebaseJwks(await getJwks());
  const adapter = sim.asAdapter();
  const adminJwt = await signFirebaseJwt({ nowMs: sim.nowMs });

  const bootRes = await handleAdminBootstrap(
    makeReq(
      'POST',
      'https://edge.local/admin-bootstrap',
      { email: 'owner@amancomputer.in', fullName: 'Aman Owner' },
      { 'x-admin-bootstrap-secret': env.ADMIN_BOOTSTRAP_SECRET!, Authorization: `Bearer ${adminJwt}` }
    ),
    adapter,
    env
  );
  assert.equal(bootRes.status, 201);

  sim.pricingRules.push(
    makePricingRule({
      rule_name: 'A4 B&W Single',
      paper_size: 'A4',
      print_mode: 'bw',
      print_sides: 'single',
      pricing_unit: 'per_printed_page',
      rate: 2.0,
    }),
    makePricingRule({
      rule_name: 'A4 B&W Duplex',
      paper_size: 'A4',
      print_mode: 'bw',
      print_sides: 'duplex',
      pricing_unit: 'per_physical_sheet',
      rate: 3.5,
    })
  );

  // Enroll Device A
  const enrollA = await (
    await handleAgentEnroll(
      makeReq('POST', 'https://edge.local/agent-enroll', { deviceName: 'COUNTER-PC-A' }, { Authorization: `Bearer ${adminJwt}` }),
      adapter,
      env
    )
  ).json();

  // Enable UPI settings
  const qrPrep = await (
    await handleAdminUpdatePaymentSettings(
      makeReq(
        'POST',
        'https://edge.local/admin-update-payment-settings',
        { action: 'prepare_qr_upload', filename: 'qr.png', mimeType: 'image/png', fileSizeBytes: 12 },
        { Authorization: `Bearer ${adminJwt}` }
      ),
      adapter,
      env
    )
  ).json();
  sim.uploadObjectWithSignedUrl(qrPrep.signedUrl, buildMinimalPng());
  await handleAdminUpdatePaymentSettings(
    makeReq(
      'POST',
      'https://edge.local/admin-update-payment-settings',
      {
        upiEnabled: true,
        upiId: 'amancomputer@okaxis',
        upiQrStoragePath: qrPrep.storagePath,
        displayName: 'Aman Computer',
        paymentInstructions: 'Pay and submit UTR.',
      },
      { Authorization: `Bearer ${adminJwt}` }
    ),
    adapter,
    env
  );

  const printerA = await adapter.createPrinter!({
    printerName: 'HP Counter Laser A',
    printerModel: 'HP LaserJet M1005',
    systemPrinterName: 'HP_M1005_A',
    deviceId: enrollA.deviceId,
    connectionType: 'usb',
    supportedPaperSizes: ['A4', 'Legal'],
    supportsColour: false,
    supportsDuplex: true,
    capabilitiesVerified: true,
    printerStatus: 'online',
    isEnabled: true,
    isDefault: true,
    discoverySource: 'agent',
    approvalStatus: 'approved',
    lastSeenAt: new Date().toISOString(),
    lastVerifiedAt: new Date().toISOString(),
    auditNotes: null,
  });

  return { sim, adapter, adminJwt, deviceA: enrollA, printerA };
}

test('[P10-01] Functional E2E: Multi-File Duplex Odd Pages + Server Pricing + UPI Auto-Release + Execution + Retention Purge', async () => {
  const { sim, adapter, adminJwt, deviceA, printerA } = await setupFullShopEnv();

  // 1. Create draft (duplex, 2 copies)
  const createRes = await handleCreatePrintJob(
    makeReq('POST', 'https://edge.local/create-print-job', {
      customerName: 'Sita Verma',
      paperSize: 'A4',
      printMode: 'bw',
      printSides: 'duplex',
      copies: 2,
      submissionIdempotencyKey: 'p10-e2e-duplex-0001',
    }),
    adapter,
    BASE_ENV
  );
  assert.equal(createRes.status, 201);
  const created = await createRes.json();

  // 2. Upload 3-page PDF + 1-page PNG (4 pages total -> ceil(4/2) = 2 physical sheets * 2 copies * ₹3.50 = ₹14.00)
  const pdfBytes = buildMinimalPdf(3);
  const pngBytes = buildMinimalPng();

  const u1 = await (
    await handleCreatePrintUploadUrl(
      makeReq(
        'POST',
        'https://edge.local/create-print-upload-url',
        { jobId: created.jobId, filename: 'notes.pdf', mimeType: 'application/pdf', fileSizeBytes: pdfBytes.byteLength },
        { 'x-draft-secret': created.draftUploadSecret }
      ),
      adapter,
      BASE_ENV
    )
  ).json();
  sim.uploadObjectWithSignedUrl(u1.signedUrl, pdfBytes);

  const u2 = await (
    await handleCreatePrintUploadUrl(
      makeReq(
        'POST',
        'https://edge.local/create-print-upload-url',
        { jobId: created.jobId, filename: 'id_scan.png', mimeType: 'image/png', fileSizeBytes: pngBytes.byteLength },
        { 'x-draft-secret': created.draftUploadSecret }
      ),
      adapter,
      BASE_ENV
    )
  ).json();
  sim.uploadObjectWithSignedUrl(u2.signedUrl, pngBytes);

  // 3. Finalize & verify server pricing
  const finRes = await handleFinalizePrintUpload(
    makeReq(
      'POST',
      'https://edge.local/finalize-print-upload',
      { jobId: created.jobId },
      { 'x-draft-secret': created.draftUploadSecret }
    ),
    adapter,
    BASE_ENV
  );
  assert.equal(finRes.status, 200);
  const fin = await finRes.json();
  assert.equal(fin.verifiedPageCount, 4);
  assert.equal(fin.physicalSheetCount, 2);
  assert.equal(fin.finalAmount, 14);
  assert.ok(fin.trackingToken);

  // 4. Submit UPI payment
  const payRes = await handleSubmitUpiPayment(
    makeReq(
      'POST',
      'https://edge.local/submit-upi-payment',
      { paymentMethod: 'upi', transactionReference: 'UTR10P10E2E9988' },
      { 'x-tracking-token': fin.trackingToken }
    ),
    adapter,
    BASE_ENV
  );
  assert.equal(payRes.status, 201);
  const payBody = await payRes.json();

  // 5. Admin verifies payment & auto-releases to queue on Printer A
  const verRes = await handleAdminVerifyPayment(
    makeReq(
      'POST',
      'https://edge.local/admin-verify-payment',
      { paymentId: payBody.paymentId, decision: 'approve', printerId: printerA.id },
      { Authorization: `Bearer ${adminJwt}` }
    ),
    adapter,
    BASE_ENV
  );
  assert.equal(verRes.status, 200);
  const verBody = await verRes.json();
  assert.equal(verBody.jobStatus, 'queued');
  assert.equal(verBody.autoReleased, true);

  // 6. Agent claims, verifies checksums, prints & completes
  const claim = await (
    await handleAgentClaimJob(
      makeReq('POST', 'https://edge.local/agent-claim-job', { leaseSeconds: 120 }, { 'x-device-credential': deviceA.deviceCredential }),
      adapter,
      BASE_ENV
    )
  ).json();
  assert.equal(claim.claimed, true);
  assert.equal(claim.job.files.length, 2);
  for (const f of claim.job.files) {
    const dl = sim.downloadObjectWithSignedUrl(f.signedDownloadUrl);
    assert.equal(await sha256Hex(dl), f.sha256Checksum);
  }

  for (const nextStatus of ['downloading', 'printing', 'submitted_to_spooler', 'completed']) {
    const ev = await handleAgentReportJobEvent(
      makeReq(
        'POST',
        'https://edge.local/agent-report-job-event',
        { attemptId: claim.attemptId, nextStatus, spoolerJobId: '7701' },
        { 'x-device-credential': deviceA.deviceCredential }
      ),
      adapter,
      BASE_ENV
    );
    assert.equal(ev.status, 200);
  }

  // 7. Verify retention cleanup stays in dry_run until policy is confirmed, then purges binary storage while keeping financial record
  sim.advanceTimeSeconds(25 * 3600);
  const dryRunRes = await handleCleanupExpiredPrintFiles(
    makeReq(
      'POST',
      'https://edge.local/cleanup-expired-print-files',
      { dryRun: false, nowIso: new Date(sim.nowMs).toISOString() },
      { 'x-cron-secret': BASE_ENV.CRON_SECRET! }
    ),
    adapter,
    BASE_ENV
  );
  assert.equal(dryRunRes.status, 200);
  const dryRunBody = await dryRunRes.json();
  assert.equal(dryRunBody.mode, 'dry_run');
  assert.equal(dryRunBody.filesMarkedDeleted, 2);
  assert.equal(dryRunBody.storageObjectsRemoved, 0);

  sim.systemSettings.retention_policy_confirmed = true;
  sim.systemSettings.auto_cleanup_enabled = true;

  const cleanRes = await handleCleanupExpiredPrintFiles(
    makeReq(
      'POST',
      'https://edge.local/cleanup-expired-print-files',
      { dryRun: false, nowIso: new Date(sim.nowMs).toISOString() },
      { 'x-cron-secret': BASE_ENV.CRON_SECRET! }
    ),
    adapter,
    BASE_ENV
  );
  assert.equal(cleanRes.status, 200);
  const cleanBody = await cleanRes.json();
  assert.equal(cleanBody.mode, 'execute');
  assert.equal(cleanBody.filesMarkedDeleted, 2);
  assert.equal(cleanBody.storageObjectsRemoved, 2);

  const trackedPayment = await adapter.getPaymentById(payBody.paymentId);
  assert.equal(trackedPayment?.payment_status, 'paid');
  assert.equal(trackedPayment?.amount, 14);
});

test('[P10-02] Security: File Upload Hardening, Rollback on Signed-URL Error & Explicit Action Allowlists', async () => {
  const { sim, adapter, adminJwt } = await setupFullShopEnv();

  // Short / numeric idempotency key rejected (anti-enumeration)
  const shortIdemRes = await handleCreatePrintJob(
    makeReq('POST', 'https://edge.local/create-print-job', {
      paperSize: 'A4',
      printMode: 'bw',
      printSides: 'single',
      copies: 1,
      submissionIdempotencyKey: '123456',
    }),
    adapter,
    BASE_ENV
  );
  assert.equal(shortIdemRes.status, 400);
  assert.equal((await shortIdemRes.json()).error.code, 'INVALID_IDEMPOTENCY_KEY');

  const createRes = await handleCreatePrintJob(
    makeReq('POST', 'https://edge.local/create-print-job', {
      paperSize: 'A4',
      printMode: 'bw',
      printSides: 'single',
      copies: 1,
      submissionIdempotencyKey: 'p10-upload-sec-0001',
    }),
    adapter,
    BASE_ENV
  );
  const created = await createRes.json();

  // Unknown upload action rejected cleanly
  const badActionRes = await handleCreatePrintUploadUrl(
    makeReq(
      'POST',
      'https://edge.local/create-print-upload-url',
      { jobId: created.jobId, action: 'bypass_action' },
      { 'x-draft-secret': created.draftUploadSecret }
    ),
    adapter,
    BASE_ENV
  );
  assert.equal(badActionRes.status, 400);
  assert.equal((await badActionRes.json()).error.code, 'UNSUPPORTED_ACTION');

  // Path traversal filename rejected
  const traversalRes = await handleCreatePrintUploadUrl(
    makeReq(
      'POST',
      'https://edge.local/create-print-upload-url',
      { jobId: created.jobId, filename: '../../Windows/System32/cmd.pdf', mimeType: 'application/pdf', fileSizeBytes: 120 },
      { 'x-draft-secret': created.draftUploadSecret }
    ),
    adapter,
    BASE_ENV
  );
  assert.equal(traversalRes.status, 400);
  assert.equal((await traversalRes.json()).error.code, 'INVALID_FILENAME');

  // Signed URL failure rolls back print_files row so maxFilesPerJob quota is NOT leaked
  const failingAdapter = {
    ...adapter,
    async createSignedUploadUrl() {
      throw new Error('Transient storage error');
    },
  };
  const failRes = await handleCreatePrintUploadUrl(
    makeReq(
      'POST',
      'https://edge.local/create-print-upload-url',
      { jobId: created.jobId, filename: 'valid.pdf', mimeType: 'application/pdf', fileSizeBytes: 120 },
      { 'x-draft-secret': created.draftUploadSecret }
    ),
    failingAdapter,
    BASE_ENV
  );
  assert.equal(failRes.status, 500);
  assert.equal(await adapter.countActiveFilesForJob(created.jobId), 0, 'Orphan file record must be soft-deleted on signed URL failure');

  // MIME spoofing check: PNG bytes uploaded under PDF declaration
  const up = await (
    await handleCreatePrintUploadUrl(
      makeReq(
        'POST',
        'https://edge.local/create-print-upload-url',
        { jobId: created.jobId, filename: 'fake.pdf', mimeType: 'application/pdf', fileSizeBytes: 12 },
        { 'x-draft-secret': created.draftUploadSecret }
      ),
      adapter,
      BASE_ENV
    )
  ).json();
  sim.uploadObjectWithSignedUrl(up.signedUrl, buildMinimalPng());
  const spoofFinalize = await handleFinalizePrintUpload(
    makeReq('POST', 'https://edge.local/finalize-print-upload', { jobId: created.jobId }, { 'x-draft-secret': created.draftUploadSecret }),
    adapter,
    BASE_ENV
  );
  assert.equal(spoofFinalize.status, 422);
  assert.equal((await spoofFinalize.json()).error.code, 'MIME_SPOOFING_DETECTED');

  // Unknown retry action rejected
  const badRetry = await handleAdminRetryPrintJob(
    makeReq(
      'POST',
      'https://edge.local/admin-retry-print-job',
      { jobId: created.jobId, action: 'delete_all', reason: 'test' },
      { Authorization: `Bearer ${adminJwt}` }
    ),
    adapter,
    BASE_ENV
  );
  assert.equal(badRetry.status, 400);
  assert.equal((await badRetry.json()).error.code, 'UNSUPPORTED_ACTION');
});

test('[P10-03] Security: Bootstrap Rate-Limit, Production UID Allowlist, Fail-Closed CORS & Tracking Token Rules', async () => {
  const sim = new TestSupabaseSimulator();
  sim.setFirebaseJwks(await getJwks());
  const adapter = sim.asAdapter();
  const validJwt = await signFirebaseJwt({ nowMs: sim.nowMs });

  // Production CORS present without ADMIN_BOOTSTRAP_ALLOWED_UID must fail closed (503)
  const prodEnvNoAllowlist: RuntimeEnv = {
    ...BASE_ENV,
    ALLOWED_ORIGINS: 'https://amancomputer.web.app',
  };
  const missingUidRes = await handleAdminBootstrap(
    makeReq(
      'POST',
      'https://edge.local/admin-bootstrap',
      { email: 'owner@amancomputer.in', fullName: 'Aman Owner' },
      {
        Origin: 'https://amancomputer.web.app',
        'x-admin-bootstrap-secret': BASE_ENV.ADMIN_BOOTSTRAP_SECRET!,
        Authorization: `Bearer ${validJwt}`,
      }
    ),
    adapter,
    prodEnvNoAllowlist
  );
  assert.equal(missingUidRes.status, 503);
  assert.equal((await missingUidRes.json()).error.code, 'BOOTSTRAP_UID_ALLOWLIST_REQUIRED');

  // Untrusted origin rejected by CORS wrapper (403 ORIGIN_NOT_ALLOWED)
  const evilOriginRes = await handleAdminBootstrap(
    makeReq(
      'POST',
      'https://edge.local/admin-bootstrap',
      { email: 'owner@amancomputer.in', fullName: 'Aman Owner' },
      {
        Origin: 'https://evil-phishing.example',
        'x-admin-bootstrap-secret': BASE_ENV.ADMIN_BOOTSTRAP_SECRET!,
        Authorization: `Bearer ${validJwt}`,
      }
    ),
    adapter,
    prodEnvNoAllowlist
  );
  assert.equal(evilOriginRes.status, 403);
  assert.equal((await evilOriginRes.json()).error.code, 'ORIGIN_NOT_ALLOWED');

  // Brute-force secret guessing hits rate limit on attempt #6 -> 429 RATE_LIMIT_EXCEEDED
  const prodEnvWithUid: RuntimeEnv = {
    ...prodEnvNoAllowlist,
    ADMIN_BOOTSTRAP_ALLOWED_UID: TEST_ADMIN_UID,
  };
  for (let i = 0; i < 4; i += 1) {
    const badAttempt = await handleAdminBootstrap(
      makeReq(
        'POST',
        'https://edge.local/admin-bootstrap',
        { email: 'owner@amancomputer.in', fullName: 'Aman Owner' },
        {
          'x-forwarded-for': '192.0.2.99',
          'x-admin-bootstrap-secret': `wrong-secret-${i}`,
          Authorization: `Bearer ${validJwt}`,
        }
      ),
      adapter,
      prodEnvWithUid
    );
    assert.equal(badAttempt.status, 403);
  }
  const fifthBad = await handleAdminBootstrap(
    makeReq(
      'POST',
      'https://edge.local/admin-bootstrap',
      { email: 'owner@amancomputer.in', fullName: 'Aman Owner' },
      {
        'x-forwarded-for': '192.0.2.99',
        'x-admin-bootstrap-secret': 'wrong-secret-4',
        Authorization: `Bearer ${validJwt}`,
      }
    ),
    adapter,
    prodEnvWithUid
  );
  assert.equal(fifthBad.status, 403);

  const sixthRateLimited = await handleAdminBootstrap(
    makeReq(
      'POST',
      'https://edge.local/admin-bootstrap',
      { email: 'owner@amancomputer.in', fullName: 'Aman Owner' },
      {
        'x-forwarded-for': '192.0.2.99',
        'x-admin-bootstrap-secret': BASE_ENV.ADMIN_BOOTSTRAP_SECRET!,
        Authorization: `Bearer ${validJwt}`,
      }
    ),
    adapter,
    prodEnvWithUid
  );
  assert.equal(sixthRateLimited.status, 429);

  // Tracking token in URL query string blocked
  const queryTokenRes = await handleGetPrintJobStatus(
    makeReq('GET', 'https://edge.local/get-print-job-status?token=secret_leak_in_url'),
    adapter,
    BASE_ENV
  );
  assert.equal(queryTokenRes.status, 400);
  assert.equal((await queryTokenRes.json()).error.code, 'TOKEN_IN_QUERY_DISALLOWED');

  // Attacker-signed JWT cannot access admin endpoints
  const attackerJwt = await signFirebaseJwt({ uid: TEST_ATTACKER_UID, useAttackerKey: true });
  const unauthJobs = await handleAdminPrintJobs(
    makeReq('GET', 'https://edge.local/admin-print-jobs', undefined, { Authorization: `Bearer ${attackerJwt}` }),
    adapter,
    BASE_ENV
  );
  assert.equal(unauthJobs.status, 401);
});

test('[P10-04] Integrity: Price Override Blocked During Pending UPI & Atomic Pre-Validation in Payment Verify', async () => {
  const { sim, adapter, adminJwt, printerA } = await setupFullShopEnv();

  // Create & submit ₹4.00 job
  const created = await (
    await handleCreatePrintJob(
      makeReq('POST', 'https://edge.local/create-print-job', {
        paperSize: 'A4',
        printMode: 'bw',
        printSides: 'single',
        copies: 1,
        submissionIdempotencyKey: 'p10-pay-atomicity-01',
      }),
      adapter,
      BASE_ENV
    )
  ).json();

  const pdfBytes = buildMinimalPdf(2);
  const up = await (
    await handleCreatePrintUploadUrl(
      makeReq(
        'POST',
        'https://edge.local/create-print-upload-url',
        { jobId: created.jobId, filename: 'doc.pdf', mimeType: 'application/pdf', fileSizeBytes: pdfBytes.byteLength },
        { 'x-draft-secret': created.draftUploadSecret }
      ),
      adapter,
      BASE_ENV
    )
  ).json();
  sim.uploadObjectWithSignedUrl(up.signedUrl, pdfBytes);

  const fin = await (
    await handleFinalizePrintUpload(
      makeReq('POST', 'https://edge.local/finalize-print-upload', { jobId: created.jobId }, { 'x-draft-secret': created.draftUploadSecret }),
      adapter,
      BASE_ENV
    )
  ).json();
  assert.equal(fin.finalAmount, 4);

  // Submit UPI UTR (₹4.00 pending_verification)
  const payBody = await (
    await handleSubmitUpiPayment(
      makeReq(
        'POST',
        'https://edge.local/submit-upi-payment',
        { paymentMethod: 'upi', transactionReference: 'UTR10ATOM990011' },
        { 'x-tracking-token': fin.trackingToken }
      ),
      adapter,
      BASE_ENV
    )
  ).json();

  // 1. Price override MUST be rejected while pending_verification
  const overrideRes = await handleAdminReviewPrintJob(
    makeReq(
      'POST',
      'https://edge.local/admin-review-print-job',
      { jobId: created.jobId, action: 'override_price', finalAmount: 10, reason: 'Price increase attempt during pending UPI' },
      { Authorization: `Bearer ${adminJwt}` }
    ),
    adapter,
    BASE_ENV
  );
  assert.equal(overrideRes.status, 409);
  assert.equal((await overrideRes.json()).error.code, 'PAYMENT_PENDING_VERIFICATION');

  // 2. If verify-payment targets an unavailable/disabled printer, BOTH payment & job MUST remain untouched (atomic pre-validation)
  const disabledPrinter = await adapter.createPrinter!({
    printerName: 'Disabled Printer',
    printerModel: 'Test',
    systemPrinterName: 'DISABLED_PRINTER',
    deviceId: printerA.device_id,
    connectionType: 'usb',
    supportedPaperSizes: ['A4'],
    supportsColour: false,
    supportsDuplex: false,
    capabilitiesVerified: true,
    printerStatus: 'disabled',
    isEnabled: false,
    isDefault: false,
    discoverySource: 'manual',
    approvalStatus: 'manual',
    lastSeenAt: null,
    lastVerifiedAt: null,
    auditNotes: null,
  });

  const badReleaseVerify = await handleAdminVerifyPayment(
    makeReq(
      'POST',
      'https://edge.local/admin-verify-payment',
      { paymentId: payBody.paymentId, decision: 'approve', printerId: disabledPrinter.id },
      { Authorization: `Bearer ${adminJwt}` }
    ),
    adapter,
    BASE_ENV
  );
  assert.equal(badReleaseVerify.status, 409);
  assert.equal((await badReleaseVerify.json()).error.code, 'PRINTER_UNAVAILABLE');

  const paymentAfterFail = await adapter.getPaymentById(payBody.paymentId);
  const jobAfterFail = await adapter.getJobById(created.jobId);
  assert.equal(paymentAfterFail?.payment_status, 'pending_verification', 'Payment must remain pending_verification if pre-validation fails');
  assert.equal(jobAfterFail?.payment_status, 'pending_verification', 'Job payment status must remain unchanged on failed verify-release');

  // 3. Amount mismatch protection: tamper payment amount vs job.final_amount -> rejected with 409 PAYMENT_AMOUNT_MISMATCH
  await adapter.updatePayment(payBody.paymentId, { amount: 2 });
  const mismatchVerify = await handleAdminVerifyPayment(
    makeReq(
      'POST',
      'https://edge.local/admin-verify-payment',
      { paymentId: payBody.paymentId, decision: 'approve', printerId: printerA.id },
      { Authorization: `Bearer ${adminJwt}` }
    ),
    adapter,
    BASE_ENV
  );
  assert.equal(mismatchVerify.status, 409);
  assert.equal((await mismatchVerify.json()).error.code, 'PAYMENT_AMOUNT_MISMATCH');
});

test('[P10-05] Security & Reliability: Cross-Device Printer Status Spoofing Blocked & Revoked Credential Isolation', async () => {
  const { adapter, adminJwt, deviceA, printerA } = await setupFullShopEnv();

  // Enroll Device B
  const deviceB = await (
    await handleAgentEnroll(
      makeReq('POST', 'https://edge.local/agent-enroll', { deviceName: 'COUNTER-PC-B' }, { Authorization: `Bearer ${adminJwt}` }),
      adapter,
      BASE_ENV
    )
  ).json();

  // Device B tries to mark Device A's printer 'offline' via UUID or system_printer_name
  const spoofHb = await handleAgentHeartbeat(
    makeReq(
      'POST',
      'https://edge.local/agent-heartbeat',
      {
        agentVersion: '1.0.4',
        osVersion: 'Windows 11',
        printers: [
          { printerId: printerA.id, printerStatus: 'offline' },
          { printerId: printerA.system_printer_name, printerStatus: 'error' },
        ],
      },
      { 'x-device-credential': deviceB.deviceCredential }
    ),
    adapter,
    BASE_ENV
  );
  assert.equal(spoofHb.status, 200);

  const printerAAfterSpoof = await adapter.getPrinterById(printerA.id);
  assert.equal(printerAAfterSpoof?.printer_status, 'online', 'Device B must NOT be able to alter Device A printer status');

  // Device A CAN update its own printer status using system_printer_name
  const validHb = await handleAgentHeartbeat(
    makeReq(
      'POST',
      'https://edge.local/agent-heartbeat',
      {
        agentVersion: '1.0.4',
        osVersion: 'Windows 11',
        printers: [{ printerId: printerA.system_printer_name, printerStatus: 'paused' }],
      },
      { 'x-device-credential': deviceA.deviceCredential }
    ),
    adapter,
    BASE_ENV
  );
  assert.equal(validHb.status, 200);
  const printerAAfterOwnHb = await adapter.getPrinterById(printerA.id);
  assert.equal(printerAAfterOwnHb?.printer_status, 'paused', 'Owning Device A should update its own printer status');

  // Revoke Device B and verify credential is immediately blocked
  await adapter.updateDevice(deviceB.deviceId, { device_status: 'revoked', revoked_at: new Date().toISOString() });
  const revokedClaim = await handleAgentClaimJob(
    makeReq('POST', 'https://edge.local/agent-claim-job', {}, { 'x-device-credential': deviceB.deviceCredential }),
    adapter,
    BASE_ENV
  );
  assert.equal(revokedClaim.status, 403);
  assert.equal((await revokedClaim.json()).error.code, 'DEVICE_NOT_ACTIVE');
});

test('[P10-06] Static Security & Operational QA Audit Across Frontend, Backend, Server & Windows Agent', () => {
  const root = process.cwd();

  const walkFiles = (dir: string, exts: string[]): string[] => {
    const out: string[] = [];
    if (!fs.existsSync(dir)) return out;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'dist-customer' || entry.name === 'bin' || entry.name === 'obj') continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) out.push(...walkFiles(full, exts));
      else if (exts.some((ext) => entry.name.endsWith(ext))) out.push(full);
    }
    return out;
  };

  // 1. No privileged secrets or unsafe DOM sinks in frontends or Agent
  const clientFiles = [
    ...walkFiles(path.join(root, 'src'), ['.ts', '.tsx']),
    ...walkFiles(path.join(root, 'customer-portal', 'src'), ['.ts', '.tsx']),
    ...walkFiles(path.join(root, 'agent'), ['.cs', '.iss', '.ps1', '.json']),
  ];
  for (const file of clientFiles) {
    const content = fs.readFileSync(file, 'utf8');
    assert.ok(!content.includes('SUPABASE_SERVICE_ROLE_KEY'), `Service role secret reference found in ${file}`);
    assert.ok(!content.includes('ADMIN_BOOTSTRAP_SECRET'), `Bootstrap secret reference found in ${file}`);
    assert.ok(!content.includes('CRON_SECRET'), `Cron secret reference found in ${file}`);
    if (file.endsWith('.ts') || file.endsWith('.tsx')) {
      assert.ok(!content.includes('dangerouslySetInnerHTML'), `Unsafe dangerouslySetInnerHTML in ${file}`);
      assert.ok(!/\bdocument\.write\s*\(/.test(content), `Unsafe document.write in ${file}`);
      assert.ok(!/\beval\s*\(/.test(content), `Unsafe eval in ${file}`);
    }
  }

  // 2. All 21 Edge Functions configured in supabase/config.toml with verify_jwt = false (Firebase RS256 + custom auth handled in code)
  const configToml = fs.readFileSync(path.join(root, 'supabase', 'config.toml'), 'utf8');
  const fnDirs = fs.readdirSync(path.join(root, 'supabase', 'functions'), { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name !== '_shared')
    .map((d) => d.name);
  assert.ok(fnDirs.length >= 20, 'Expected at least 20 Edge Function directories');
  for (const fn of fnDirs) {
    assert.ok(configToml.includes(`[functions.${fn}]`), `Missing [functions.${fn}] in supabase/config.toml`);
  }

  // 3. Server.ts hardening verified
  const serverContent = fs.readFileSync(path.join(root, 'server.ts'), 'utf8');
  assert.ok(serverContent.includes('secure: IS_PROD'), 'Session cookie must set secure: IS_PROD');
  assert.ok(serverContent.includes('assertSafeExternalSourceUrl'), 'Door 5 external ingestion must validate URLs against SSRF');

  // 4. C# Agent hardening verified
  const fileMgr = fs.readFileSync(
    path.join(root, 'agent', 'src', 'ACScan2Print.Agent.Infrastructure', 'Storage', 'LocalFileManager.cs'),
    'utf8'
  );
  assert.ok(fileMgr.includes('Path.GetFullPath'), 'LocalFileManager must canonicalize paths via Path.GetFullPath');
  assert.ok(fileMgr.includes('DirectorySeparatorChar'), 'LocalFileManager must enforce trailing directory separator boundary');

  const safeLog = fs.readFileSync(
    path.join(root, 'agent', 'src', 'ACScan2Print.Agent.Infrastructure', 'Diagnostics', 'SafeLogger.cs'),
    'utf8'
  );
  assert.ok(safeLog.includes('[REDACTED_JWT]'), 'SafeLogger must redact JWT bearer tokens');

  const worker = fs.readFileSync(
    path.join(root, 'agent', 'src', 'ACScan2Print.Agent.Worker', 'Worker.cs'),
    'utf8'
  );
  assert.ok(worker.includes('Uri.UriSchemeHttps'), 'Worker must enforce HTTPS for signed download URLs');
});
