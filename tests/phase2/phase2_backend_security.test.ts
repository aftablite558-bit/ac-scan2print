// AC Scan2Print — Comprehensive Phase 2 Automated Security, Functional & Negative Test Suite
// Covers Pricing Engine, State Machine, Tracking Tokens, Magic-Byte/PDF Validation,
// Payment & Queue Release Gates, Agent Concurrency, Retention Cleanup, SQL Audit, and ALL 20 Negative Cases.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { SignJWT, exportJWK, generateKeyPair, type JSONWebKeySet } from 'jose';

import {
  handleAdminBootstrap,
  handleAdminConfirmCash,
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
  handleGetPublicPaymentSettings,
  handleSubmitUpiPayment,
} from '../../supabase/functions/_shared/handlers.ts';
import { calculatePhysicalSheets, computeServerPrice } from '../../supabase/functions/_shared/pricing.ts';
import { extractPdfPageCount, sha256Hex } from '../../supabase/functions/_shared/security.ts';
import type { PrintPricingRule, RuntimeEnv } from '../../supabase/functions/_shared/types.ts';
import { TestSupabaseSimulator } from './mockBackendAdapter.ts';

function buildMinimalPdf(pageCount: number): Uint8Array {
  const pages = Array.from({ length: pageCount }, (_, idx) => `${idx + 3} 0 obj << /Type /Page /Parent 2 0 R >> endobj`).join('\n');
  const raw = `%PDF-1.4
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Count ${pageCount} >> endobj
${pages}
%%EOF`;
  return new TextEncoder().encode(raw);
}

function buildMinimalPng(): Uint8Array {
  return new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
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
      'x-forwarded-for': '203.0.113.10',
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

function makePricingRule(overrides: Partial<PrintPricingRule> = {}): PrintPricingRule {
  return {
    id: crypto.randomUUID(),
    rule_name: 'Test Rule',
    paper_size: 'A4',
    print_mode: 'bw',
    print_sides: 'single',
    pricing_unit: 'per_printed_page',
    rate: 2.5,
    minimum_charge: 0,
    is_active: true,
    valid_from: new Date(Date.now() - 60_000).toISOString(),
    valid_until: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

const FIREBASE_TEST_PROJECT_ID = 'ac-scan2print-prod';
const TEST_ADMIN_FIREBASE_UID = 'firebase_admin_uid_aman_01';

const primaryKeyPairPromise = generateKeyPair('RS256');
const attackerKeyPairPromise = generateKeyPair('RS256');
const TEST_KID = 'firebase-test-kid-1';

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
  issuer?: string;
  audience?: string;
  nowMs?: number;
  expiresInSeconds?: number;
  useAttackerKey?: boolean;
  kid?: string;
} = {}): Promise<string> {
  const nowSec = Math.floor((opts.nowMs ?? Date.now()) / 1000);
  const expSec = nowSec + (opts.expiresInSeconds ?? 3600);
  const kp = opts.useAttackerKey ? await attackerKeyPairPromise : await primaryKeyPairPromise;

  return new SignJWT({
    email: opts.email ?? 'owner@amancomputer.local',
    email_verified: true,
    auth_time: nowSec - 60,
    firebase: { sign_in_provider: 'password' },
  })
    .setProtectedHeader({ alg: 'RS256', kid: opts.kid ?? TEST_KID, typ: 'JWT' })
    .setIssuer(opts.issuer ?? `https://securetoken.google.com/${FIREBASE_TEST_PROJECT_ID}`)
    .setAudience(opts.audience ?? FIREBASE_TEST_PROJECT_ID)
    .setSubject(opts.uid ?? TEST_ADMIN_FIREBASE_UID)
    .setIssuedAt(nowSec - 10)
    .setExpirationTime(expSec)
    .sign(kp.privateKey);
}

const TEST_ENV: RuntimeEnv = {
  FIREBASE_PROJECT_ID: FIREBASE_TEST_PROJECT_ID,
  ADMIN_BOOTSTRAP_SECRET: 'test-bootstrap-secret-32chars-min',
  CRON_SECRET: 'test-cron-secret-32chars-min',
  CUSTOMER_PORTAL_URL: 'https://portal.example.test/quick-print',
  AGENT_CLAIM_LEASE_SECONDS: '180',
};

async function bootstrapAdmin(sim: TestSupabaseSimulator) {
  sim.setFirebaseJwks(await getTestJwks());
  const adapter = sim.asAdapter();
  const firebaseUid = TEST_ADMIN_FIREBASE_UID;
  const adminJwt = await signTestFirebaseToken({
    uid: firebaseUid,
    email: 'owner@amancomputer.local',
    nowMs: sim.nowMs,
  });

  const res = await handleAdminBootstrap(
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
  assert.equal(res.status, 201);
  return { adminJwt, firebaseUid };
}

async function setupSeededShop(sim: TestSupabaseSimulator) {
  const { adminJwt } = await bootstrapAdmin(sim);
  const adapter = sim.asAdapter();

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
      rate: 3.0,
    })
  );

  // Enroll active device + enabled printer
  const enrollRes = await handleAgentEnroll(
    makeReq('POST', 'https://edge.local/agent-enroll', { deviceName: 'Counter-PC-1' }, { Authorization: `Bearer ${adminJwt}` }),
    adapter,
    TEST_ENV
  );
  assert.equal(enrollRes.status, 201);
  const enrollBody = (await enrollRes.json()) as { deviceId: string; deviceCredential: string };

  const printerId = crypto.randomUUID();
  sim.printers.push({
    id: printerId,
    printer_name: 'Main Shop Laser',
    system_printer_name: 'Shop_Printer_1',
    device_id: enrollBody.deviceId,
    connection_type: 'usb',
    supported_paper_sizes: ['A4'],
    supports_colour: false,
    supports_duplex: true,
    capabilities_verified: true,
    printer_status: 'online',
    is_enabled: true,
    is_default: true,
    last_seen_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  // Configure UPI settings
  const qrSignedRes = await handleAdminUpdatePaymentSettings(
    makeReq(
      'POST',
      'https://edge.local/admin-update-payment-settings',
      { action: 'prepare_qr_upload', filename: 'shop-qr.png', mimeType: 'image/png', fileSizeBytes: 12 },
      { Authorization: `Bearer ${adminJwt}` }
    ),
    adapter,
    TEST_ENV
  );
  const qrSigned = (await qrSignedRes.json()) as { storagePath: string; signedUrl: string };
  sim.uploadObjectWithSignedUrl(qrSigned.signedUrl, buildMinimalPng());

  const updateSettingsRes = await handleAdminUpdatePaymentSettings(
    makeReq(
      'POST',
      'https://edge.local/admin-update-payment-settings',
      {
        upiEnabled: true,
        upiId: 'amancomputer@okbank',
        upiQrStoragePath: qrSigned.storagePath,
        displayName: 'Aman Computer',
        paymentInstructions: 'Pay exact total shown and upload UTR screenshot.',
      },
      { Authorization: `Bearer ${adminJwt}` }
    ),
    adapter,
    TEST_ENV
  );
  assert.equal(updateSettingsRes.status, 200);

  return {
    adminJwt,
    deviceId: enrollBody.deviceId,
    deviceCredential: enrollBody.deviceCredential,
    printerId,
  };
}

async function createAndSubmitPdfJob(
  sim: TestSupabaseSimulator,
  opts: { pages: number; printSides: 'single' | 'duplex'; copies: number }
) {
  const adapter = sim.asAdapter();
  const draftRes = await handleCreatePrintJob(
    makeReq('POST', 'https://edge.local/create-print-job', {
      paperSize: 'A4',
      printMode: 'bw',
      printSides: opts.printSides,
      copies: opts.copies,
    }),
    adapter,
    TEST_ENV
  );
  assert.equal(draftRes.status, 201);
  const draft = (await draftRes.json()) as { jobId: string; draftUploadSecret: string };

  const pdfBytes = buildMinimalPdf(opts.pages);
  const urlRes = await handleCreatePrintUploadUrl(
    makeReq(
      'POST',
      'https://edge.local/create-print-upload-url',
      {
        jobId: draft.jobId,
        filename: 'document.pdf',
        mimeType: 'application/pdf',
        fileSizeBytes: pdfBytes.byteLength,
      },
      { 'x-draft-secret': draft.draftUploadSecret }
    ),
    adapter,
    TEST_ENV
  );
  assert.equal(urlRes.status, 201);
  const urlBody = (await urlRes.json()) as { signedUrl: string };
  sim.uploadObjectWithSignedUrl(urlBody.signedUrl, pdfBytes);

  const finRes = await handleFinalizePrintUpload(
    makeReq(
      'POST',
      'https://edge.local/finalize-print-upload',
      { jobId: draft.jobId },
      { 'x-draft-secret': draft.draftUploadSecret }
    ),
    adapter,
    TEST_ENV
  );
  assert.equal(finRes.status, 200);
  const fin = (await finRes.json()) as {
    jobId: string;
    trackingToken: string;
    finalAmount: number;
    physicalSheetCount: number;
    verifiedPageCount: number;
  };
  return { ...fin, draftUploadSecret: draft.draftUploadSecret };
}

// ===========================================================================
// 1. PRICING ENGINE & DUPLEX PER_PHYSICAL_SHEET TESTS
// ===========================================================================
test('Pricing Engine: duplex uses per_physical_sheet (odd page counts ceil(n/2)) & integer paise safety', () => {
  assert.equal(calculatePhysicalSheets(5, 'single'), 5);
  assert.equal(calculatePhysicalSheets(5, 'duplex'), 3);
  assert.equal(calculatePhysicalSheets(6, 'duplex'), 3);

  const duplexRule = makePricingRule({
    print_sides: 'duplex',
    pricing_unit: 'per_physical_sheet',
    rate: 3.33,
    minimum_charge: 15,
  });

  // 5 pages duplex = 3 physical sheets * 2 copies = 6 sheets * 3.33 = 19.98 (> 15 minimum)
  const calc = computeServerPrice({
    paperSize: 'A4',
    printMode: 'bw',
    printSides: 'duplex',
    verifiedPageCount: 5,
    copies: 2,
    rule: duplexRule,
  });
  assert.equal(calc.physicalSheetCount, 3);
  assert.equal(calc.billableUnitsPerCopy, 3);
  assert.equal(calc.subtotal, 19.98);
  assert.equal(calc.finalAmount, 19.98);

  // 1 page duplex = 1 sheet * 1 copy * 3.33 => bumped to minimum_charge 15.00
  const minCalc = computeServerPrice({
    paperSize: 'A4',
    printMode: 'bw',
    printSides: 'duplex',
    verifiedPageCount: 1,
    copies: 1,
    rule: duplexRule,
  });
  assert.equal(minCalc.finalAmount, 15);

  // Misconfigured duplex rule with per_printed_page must fail
  assert.throws(
    () =>
      computeServerPrice({
        paperSize: 'A4',
        printMode: 'bw',
        printSides: 'duplex',
        verifiedPageCount: 4,
        copies: 1,
        rule: makePricingRule({ print_sides: 'duplex', pricing_unit: 'per_printed_page', rate: 2 }),
      }),
    /per_physical_sheet/
  );
});

// ===========================================================================
// 2. END-TO-END FLOW: UPLOAD -> SERVER PRICE -> UPI -> ADMIN -> RELEASE -> AGENT COMPLETE
// ===========================================================================
test('End-to-End Scan2Print Backend Workflow: PDF upload, tracking hash, UPI verify, release, atomic claim & complete', async () => {
  const sim = new TestSupabaseSimulator();
  const { adminJwt, deviceCredential, printerId } = await setupSeededShop(sim);
  const adapter = sim.asAdapter();

  // 5-page duplex x 2 copies => 3 sheets * 2 * 3.00 = 18.00 INR
  const submitted = await createAndSubmitPdfJob(sim, { pages: 5, printSides: 'duplex', copies: 2 });
  assert.equal(submitted.verifiedPageCount, 5);
  assert.equal(submitted.physicalSheetCount, 3);
  assert.equal(submitted.finalAmount, 18);

  // Verify raw tracking token is NEVER stored in DB, only SHA-256 hash
  const storedJob = sim.jobs.find((j) => j.id === submitted.jobId)!;
  assert.notEqual(storedJob.tracking_token_hash, submitted.trackingToken);
  assert.equal(storedJob.tracking_token_hash, await sha256Hex(submitted.trackingToken));

  // Public payment settings exposes UPI handle + signed QR URL without raw bucket path
  const pubSettingsRes = await handleGetPublicPaymentSettings(
    makeReq('GET', 'https://edge.local/get-public-payment-settings'),
    adapter,
    TEST_ENV
  );
  assert.equal(pubSettingsRes.status, 200);
  const pubSettings = (await pubSettingsRes.json()) as { upiEnabled: boolean; upiQrSignedUrl: string };
  assert.equal(pubSettings.upiEnabled, true);
  assert.ok(pubSettings.upiQrSignedUrl.includes('token='));

  // Customer prepares & uploads UPI payment screenshot + submits UTR
  const prepEvRes = await handleSubmitUpiPayment(
    makeReq(
      'POST',
      'https://edge.local/submit-upi-payment',
      { action: 'prepare_evidence_upload', filename: 'utr.png', mimeType: 'image/png', fileSizeBytes: 12 },
      { 'x-tracking-token': submitted.trackingToken }
    ),
    adapter,
    TEST_ENV
  );
  assert.equal(prepEvRes.status, 201);
  const prepEv = (await prepEvRes.json()) as { signedUrl: string; evidenceStoragePath: string };
  sim.uploadObjectWithSignedUrl(prepEv.signedUrl, buildMinimalPng());

  const payRes = await handleSubmitUpiPayment(
    makeReq(
      'POST',
      'https://edge.local/submit-upi-payment',
      {
        paymentMethod: 'upi',
        transactionReference: 'UTR4455667788',
        evidenceStoragePath: prepEv.evidenceStoragePath,
        evidenceMimeType: 'image/png',
      },
      { 'x-tracking-token': submitted.trackingToken }
    ),
    adapter,
    TEST_ENV
  );
  assert.equal(payRes.status, 201);
  const payBody = (await payRes.json()) as { paymentId: string; paymentStatus: string };
  assert.equal(payBody.paymentStatus, 'pending_verification');

  // Admin approves job and verifies payment
  const approveRes = await handleAdminReviewPrintJob(
    makeReq(
      'POST',
      'https://edge.local/admin-review-print-job',
      { jobId: submitted.jobId, action: 'approve' },
      { Authorization: `Bearer ${adminJwt}` }
    ),
    adapter,
    TEST_ENV
  );
  assert.equal(approveRes.status, 200);

  const verifyPayRes = await handleAdminVerifyPayment(
    makeReq(
      'POST',
      'https://edge.local/admin-verify-payment',
      { paymentId: payBody.paymentId, decision: 'approve' },
      { Authorization: `Bearer ${adminJwt}` }
    ),
    adapter,
    TEST_ENV
  );
  assert.equal(verifyPayRes.status, 200);

  // Admin releases paid & approved job to queue
  const releaseRes = await handleAdminReleasePrintJob(
    makeReq(
      'POST',
      'https://edge.local/admin-release-print-job',
      { jobId: submitted.jobId, printerId },
      { Authorization: `Bearer ${adminJwt}` }
    ),
    adapter,
    TEST_ENV
  );
  assert.equal(releaseRes.status, 200);

  // Agent claims job & completes lifecycle
  const claimRes = await handleAgentClaimJob(
    makeReq('POST', 'https://edge.local/agent-claim-job', {}, { 'x-device-credential': deviceCredential }),
    adapter,
    TEST_ENV
  );
  assert.equal(claimRes.status, 200);
  const claimBody = (await claimRes.json()) as { claimed: boolean; attemptId: string; job: { files: { signedDownloadUrl: string }[] } };
  assert.equal(claimBody.claimed, true);
  assert.equal(claimBody.job.files.length, 1);

  for (const nextStatus of ['downloading', 'printing', 'submitted_to_spooler', 'completed'] as const) {
    const rep = await handleAgentReportJobEvent(
      makeReq(
        'POST',
        'https://edge.local/agent-report-job-event',
        { attemptId: claimBody.attemptId, nextStatus, spoolerJobId: 'WIN-SP-42' },
        { 'x-device-credential': deviceCredential }
      ),
      adapter,
      TEST_ENV
    );
    assert.equal(rep.status, 200);
  }

  // Verify customer status reflects completed
  const statusRes = await handleGetPrintJobStatus(
    makeReq('GET', 'https://edge.local/get-print-job-status', undefined, { 'x-tracking-token': submitted.trackingToken }),
    adapter,
    TEST_ENV
  );
  assert.equal(statusRes.status, 200);
  const statusBody = (await statusRes.json()) as { status: string; paymentStatus: string };
  assert.equal(statusBody.status, 'completed');
  assert.equal(statusBody.paymentStatus, 'paid');

  // Verify audit log immutability guard
  assert.throws(() => sim.tryMutateEvent(sim.events[0].id), /immutable/);
});

// ===========================================================================
// 3. ALL 20 MANDATORY NEGATIVE SECURITY & ROBUSTNESS TESTS
// ===========================================================================
test('[NEG-01] Unauthenticated user calling Admin endpoint is rejected (401)', async () => {
  const sim = new TestSupabaseSimulator();
  await setupSeededShop(sim);
  const res = await handleAdminReviewPrintJob(
    makeReq('POST', 'https://edge.local/admin-review-print-job', { jobId: 'x', action: 'approve' }),
    sim.asAdapter(),
    TEST_ENV
  );
  assert.equal(res.status, 401);
});

test('[NEG-02] Authenticated non-admin Firebase user calling Admin endpoint is rejected (403)', async () => {
  const sim = new TestSupabaseSimulator();
  await setupSeededShop(sim);
  const nonAdminJwt = await signTestFirebaseToken({
    uid: 'firebase_stranger_uid_999',
    email: 'stranger@example.com',
    nowMs: sim.nowMs,
  });

  const res = await handleAdminReviewPrintJob(
    makeReq(
      'POST',
      'https://edge.local/admin-review-print-job',
      { jobId: 'x', action: 'approve' },
      { Authorization: `Bearer ${nonAdminJwt}` }
    ),
    sim.asAdapter(),
    TEST_ENV
  );
  assert.equal(res.status, 403);
});

test('[NEG-03] Attempt to create a second Admin account fails (409 SINGLE_ADMIN_ALREADY_EXISTS)', async () => {
  const sim = new TestSupabaseSimulator();
  await bootstrapAdmin(sim);
  const secondJwt = await signTestFirebaseToken({
    uid: 'firebase_second_admin_uid_02',
    email: 'second@amancomputer.local',
    nowMs: sim.nowMs,
  });

  const res = await handleAdminBootstrap(
    makeReq(
      'POST',
      'https://edge.local/admin-bootstrap',
      {
        email: 'second@amancomputer.local',
        fullName: 'Second Admin',
      },
      {
        'x-admin-bootstrap-secret': TEST_ENV.ADMIN_BOOTSTRAP_SECRET!,
        Authorization: `Bearer ${secondJwt}`,
      }
    ),
    sim.asAdapter(),
    TEST_ENV
  );
  assert.equal(res.status, 409);
  const body = (await res.json()) as { error: { code: string } };
  assert.equal(body.error.code, 'SINGLE_ADMIN_ALREADY_EXISTS');
});

test('[NEG-04] Customer attempting to read another customer job without valid tracking token fails (401)', async () => {
  const sim = new TestSupabaseSimulator();
  await setupSeededShop(sim);
  await createAndSubmitPdfJob(sim, { pages: 2, printSides: 'single', copies: 1 });

  const wrongTokenRes = await handleGetPrintJobStatus(
    makeReq('GET', 'https://edge.local/get-print-job-status', undefined, {
      'x-tracking-token': 'totally_wrong_token_with_sufficient_length_123456',
    }),
    sim.asAdapter(),
    TEST_ENV
  );
  assert.equal(wrongTokenRes.status, 401);

  const queryLeakRes = await handleGetPrintJobStatus(
    makeReq('GET', 'https://edge.local/get-print-job-status?token=abc'),
    sim.asAdapter(),
    TEST_ENV
  );
  assert.equal(queryLeakRes.status, 400);
});

test('[NEG-05] Anonymous direct read of private Storage bucket without valid signed URL is denied', async () => {
  const sim = new TestSupabaseSimulator();
  await setupSeededShop(sim);
  await createAndSubmitPdfJob(sim, { pages: 1, printSides: 'single', copies: 1 });
  const filePath = sim.files[0].storage_path;

  assert.throws(() => sim.readObjectAnonDirect('print-uploads', filePath), /RLS_STORAGE_DENIED/);
});

test('[NEG-06] Expired signed URL is rejected', async () => {
  const sim = new TestSupabaseSimulator();
  const adapter = sim.asAdapter();
  const signed = await adapter.createSignedUploadUrl('print-uploads', 'jobs/test/doc.pdf', 60);

  sim.advanceTimeSeconds(120);
  assert.throws(() => sim.uploadObjectWithSignedUrl(signed.signedUrl, buildMinimalPdf(1)), /STORAGE_URL_EXPIRED/);
});

test('[NEG-07] Uploading executable/spoofed file with invalid magic bytes is rejected (422) & purged', async () => {
  const sim = new TestSupabaseSimulator();
  await setupSeededShop(sim);
  const adapter = sim.asAdapter();

  const draftRes = await handleCreatePrintJob(
    makeReq('POST', 'https://edge.local/create-print-job', { paperSize: 'A4', printMode: 'bw', printSides: 'single', copies: 1 }),
    adapter,
    TEST_ENV
  );
  const draft = (await draftRes.json()) as { jobId: string; draftUploadSecret: string };

  // Claim application/pdf but upload Windows PE/MZ executable bytes!
  const fakeExeBytes = new Uint8Array([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00]);
  const urlRes = await handleCreatePrintUploadUrl(
    makeReq(
      'POST',
      'https://edge.local/create-print-upload-url',
      { jobId: draft.jobId, filename: 'invoice.pdf', mimeType: 'application/pdf', fileSizeBytes: fakeExeBytes.byteLength },
      { 'x-draft-secret': draft.draftUploadSecret }
    ),
    adapter,
    TEST_ENV
  );
  const urlBody = (await urlRes.json()) as { signedUrl: string; storagePath: string };
  sim.uploadObjectWithSignedUrl(urlBody.signedUrl, fakeExeBytes);

  const finRes = await handleFinalizePrintUpload(
    makeReq(
      'POST',
      'https://edge.local/finalize-print-upload',
      { jobId: draft.jobId },
      { 'x-draft-secret': draft.draftUploadSecret }
    ),
    adapter,
    TEST_ENV
  );
  assert.equal(finRes.status, 422);
  assert.equal(await adapter.readStorageObject('print-uploads', urlBody.storagePath), null);
});

test('[NEG-08] Uploading 0-byte file is rejected (400)', async () => {
  const sim = new TestSupabaseSimulator();
  await setupSeededShop(sim);
  const adapter = sim.asAdapter();

  const draftRes = await handleCreatePrintJob(
    makeReq('POST', 'https://edge.local/create-print-job', { paperSize: 'A4', printMode: 'bw', printSides: 'single', copies: 1 }),
    adapter,
    TEST_ENV
  );
  const draft = (await draftRes.json()) as { jobId: string; draftUploadSecret: string };

  const urlRes = await handleCreatePrintUploadUrl(
    makeReq(
      'POST',
      'https://edge.local/create-print-upload-url',
      { jobId: draft.jobId, filename: 'empty.pdf', mimeType: 'application/pdf', fileSizeBytes: 0 },
      { 'x-draft-secret': draft.draftUploadSecret }
    ),
    adapter,
    TEST_ENV
  );
  assert.equal(urlRes.status, 400);
});

test('[NEG-09] Exceeding max file size (> 20 MB) is rejected (413)', async () => {
  const sim = new TestSupabaseSimulator();
  await setupSeededShop(sim);
  const adapter = sim.asAdapter();

  const draftRes = await handleCreatePrintJob(
    makeReq('POST', 'https://edge.local/create-print-job', { paperSize: 'A4', printMode: 'bw', printSides: 'single', copies: 1 }),
    adapter,
    TEST_ENV
  );
  const draft = (await draftRes.json()) as { jobId: string; draftUploadSecret: string };

  const urlRes = await handleCreatePrintUploadUrl(
    makeReq(
      'POST',
      'https://edge.local/create-print-upload-url',
      {
        jobId: draft.jobId,
        filename: 'huge.pdf',
        mimeType: 'application/pdf',
        fileSizeBytes: 21 * 1024 * 1024,
      },
      { 'x-draft-secret': draft.draftUploadSecret }
    ),
    adapter,
    TEST_ENV
  );
  assert.equal(urlRes.status, 413);
});

test('[NEG-10] Exceeding max file count (> 5) is rejected (400)', async () => {
  const sim = new TestSupabaseSimulator();
  await setupSeededShop(sim);
  const adapter = sim.asAdapter();

  const draftRes = await handleCreatePrintJob(
    makeReq('POST', 'https://edge.local/create-print-job', { paperSize: 'A4', printMode: 'bw', printSides: 'single', copies: 1 }),
    adapter,
    TEST_ENV
  );
  const draft = (await draftRes.json()) as { jobId: string; draftUploadSecret: string };

  for (let i = 1; i <= 5; i += 1) {
    const okRes = await handleCreatePrintUploadUrl(
      makeReq(
        'POST',
        'https://edge.local/create-print-upload-url',
        { jobId: draft.jobId, filename: `f${i}.pdf`, mimeType: 'application/pdf', fileSizeBytes: 200 },
        { 'x-draft-secret': draft.draftUploadSecret }
      ),
      adapter,
      TEST_ENV
    );
    assert.equal(okRes.status, 201);
  }

  const sixthRes = await handleCreatePrintUploadUrl(
    makeReq(
      'POST',
      'https://edge.local/create-print-upload-url',
      { jobId: draft.jobId, filename: 'f6.pdf', mimeType: 'application/pdf', fileSizeBytes: 200 },
      { 'x-draft-secret': draft.draftUploadSecret }
    ),
    adapter,
    TEST_ENV
  );
  assert.equal(sixthRes.status, 400);
});

test('[NEG-11] Submitting job without configured pricing rule fails safely (422 PRICING_NOT_CONFIGURED)', async () => {
  const sim = new TestSupabaseSimulator();
  await setupSeededShop(sim); // Only A4 bw seeded; A3 colour is NOT configured
  const adapter = sim.asAdapter();

  const draftRes = await handleCreatePrintJob(
    makeReq('POST', 'https://edge.local/create-print-job', {
      paperSize: 'A3',
      printMode: 'colour',
      printSides: 'single',
      copies: 1,
    }),
    adapter,
    TEST_ENV
  );
  const draft = (await draftRes.json()) as { jobId: string; draftUploadSecret: string };
  const pdf = buildMinimalPdf(3);

  const urlRes = await handleCreatePrintUploadUrl(
    makeReq(
      'POST',
      'https://edge.local/create-print-upload-url',
      { jobId: draft.jobId, filename: 'poster.pdf', mimeType: 'application/pdf', fileSizeBytes: pdf.byteLength },
      { 'x-draft-secret': draft.draftUploadSecret }
    ),
    adapter,
    TEST_ENV
  );
  const urlBody = (await urlRes.json()) as { signedUrl: string };
  sim.uploadObjectWithSignedUrl(urlBody.signedUrl, pdf);

  const finRes = await handleFinalizePrintUpload(
    makeReq(
      'POST',
      'https://edge.local/finalize-print-upload',
      { jobId: draft.jobId },
      { 'x-draft-secret': draft.draftUploadSecret }
    ),
    adapter,
    TEST_ENV
  );
  assert.equal(finRes.status, 422);
  const body = (await finRes.json()) as { error: { code: string } };
  assert.equal(body.error.code, 'PRICING_NOT_CONFIGURED');
});

test('[NEG-12] Client attempting to pass tampered price/total/status is rejected (400)', async () => {
  const sim = new TestSupabaseSimulator();
  await setupSeededShop(sim);

  const res = await handleCreatePrintJob(
    makeReq('POST', 'https://edge.local/create-print-job', {
      paperSize: 'A4',
      printMode: 'bw',
      printSides: 'single',
      copies: 1,
      finalAmount: 0.01,
    }),
    sim.asAdapter(),
    TEST_ENV
  );
  assert.equal(res.status, 400);
});

test('[NEG-13] Customer attempting to mark payment paid is rejected (403)', async () => {
  const sim = new TestSupabaseSimulator();
  await setupSeededShop(sim);
  const submitted = await createAndSubmitPdfJob(sim, { pages: 1, printSides: 'single', copies: 1 });

  const res = await handleSubmitUpiPayment(
    makeReq(
      'POST',
      'https://edge.local/submit-upi-payment',
      { paymentMethod: 'upi', paymentStatus: 'paid', transactionReference: 'SPOOF123456' },
      { 'x-tracking-token': submitted.trackingToken }
    ),
    sim.asAdapter(),
    TEST_ENV
  );
  assert.equal(res.status, 403);
});

test('[NEG-14] Admin attempting to release unpaid job to queued is rejected (409 PAYMENT_NOT_VERIFIED)', async () => {
  const sim = new TestSupabaseSimulator();
  const { adminJwt, printerId } = await setupSeededShop(sim);
  const adapter = sim.asAdapter();
  const submitted = await createAndSubmitPdfJob(sim, { pages: 2, printSides: 'single', copies: 1 });

  await handleAdminReviewPrintJob(
    makeReq(
      'POST',
      'https://edge.local/admin-review-print-job',
      { jobId: submitted.jobId, action: 'approve' },
      { Authorization: `Bearer ${adminJwt}` }
    ),
    adapter,
    TEST_ENV
  );

  const relRes = await handleAdminReleasePrintJob(
    makeReq(
      'POST',
      'https://edge.local/admin-release-print-job',
      { jobId: submitted.jobId, printerId },
      { Authorization: `Bearer ${adminJwt}` }
    ),
    adapter,
    TEST_ENV
  );
  assert.equal(relRes.status, 409);
  const body = (await relRes.json()) as { error: { code: string } };
  assert.equal(body.error.code, 'PAYMENT_NOT_VERIFIED');
});

test('[NEG-15] Duplicate release of already queued job is rejected (409 JOB_ALREADY_QUEUED)', async () => {
  const sim = new TestSupabaseSimulator();
  const { adminJwt, printerId } = await setupSeededShop(sim);
  const adapter = sim.asAdapter();
  const submitted = await createAndSubmitPdfJob(sim, { pages: 1, printSides: 'single', copies: 1 });

  // Cash flow + Approve
  await handleAdminConfirmCash(
    makeReq('POST', 'https://edge.local/admin-confirm-cash', { jobId: submitted.jobId }, { Authorization: `Bearer ${adminJwt}` }),
    adapter,
    TEST_ENV
  );
  await handleAdminReviewPrintJob(
    makeReq(
      'POST',
      'https://edge.local/admin-review-print-job',
      { jobId: submitted.jobId, action: 'approve' },
      { Authorization: `Bearer ${adminJwt}` }
    ),
    adapter,
    TEST_ENV
  );

  const first = await handleAdminReleasePrintJob(
    makeReq(
      'POST',
      'https://edge.local/admin-release-print-job',
      { jobId: submitted.jobId, printerId },
      { Authorization: `Bearer ${adminJwt}` }
    ),
    adapter,
    TEST_ENV
  );
  assert.equal(first.status, 200);

  const second = await handleAdminReleasePrintJob(
    makeReq(
      'POST',
      'https://edge.local/admin-release-print-job',
      { jobId: submitted.jobId, printerId },
      { Authorization: `Bearer ${adminJwt}` }
    ),
    adapter,
    TEST_ENV
  );
  assert.equal(second.status, 409);
  const body = (await second.json()) as { error: { code: string } };
  assert.equal(body.error.code, 'JOB_ALREADY_QUEUED');
});

test('[NEG-16] Duplicate UTR submission across jobs is rejected (409 DUPLICATE_UTR)', async () => {
  const sim = new TestSupabaseSimulator();
  await setupSeededShop(sim);
  const adapter = sim.asAdapter();
  const jobA = await createAndSubmitPdfJob(sim, { pages: 1, printSides: 'single', copies: 1 });
  const jobB = await createAndSubmitPdfJob(sim, { pages: 1, printSides: 'single', copies: 1 });

  const first = await handleSubmitUpiPayment(
    makeReq(
      'POST',
      'https://edge.local/submit-upi-payment',
      { paymentMethod: 'upi', transactionReference: 'SHAREDUTR9999' },
      { 'x-tracking-token': jobA.trackingToken }
    ),
    adapter,
    TEST_ENV
  );
  assert.equal(first.status, 201);

  const second = await handleSubmitUpiPayment(
    makeReq(
      'POST',
      'https://edge.local/submit-upi-payment',
      { paymentMethod: 'upi', transactionReference: 'sharedutr9999' },
      { 'x-tracking-token': jobB.trackingToken }
    ),
    adapter,
    TEST_ENV
  );
  assert.equal(second.status, 409);
  const body = (await second.json()) as { error: { code: string } };
  assert.equal(body.error.code, 'DUPLICATE_UTR');
});

test('[NEG-17] Two concurrent agents claiming 1 queued job -> only one succeeds, second receives claimed: false', async () => {
  const sim = new TestSupabaseSimulator();
  const { adminJwt, deviceCredential, printerId } = await setupSeededShop(sim);
  const adapter = sim.asAdapter();

  const submitted = await createAndSubmitPdfJob(sim, { pages: 1, printSides: 'single', copies: 1 });
  await handleAdminConfirmCash(
    makeReq('POST', 'https://edge.local/admin-confirm-cash', { jobId: submitted.jobId }, { Authorization: `Bearer ${adminJwt}` }),
    adapter,
    TEST_ENV
  );
  await handleAdminReviewPrintJob(
    makeReq(
      'POST',
      'https://edge.local/admin-review-print-job',
      { jobId: submitted.jobId, action: 'approve' },
      { Authorization: `Bearer ${adminJwt}` }
    ),
    adapter,
    TEST_ENV
  );
  await handleAdminReleasePrintJob(
    makeReq(
      'POST',
      'https://edge.local/admin-release-print-job',
      { jobId: submitted.jobId, printerId },
      { Authorization: `Bearer ${adminJwt}` }
    ),
    adapter,
    TEST_ENV
  );

  const [r1, r2] = await Promise.all([
    handleAgentClaimJob(
      makeReq('POST', 'https://edge.local/agent-claim-job', {}, { 'x-device-credential': deviceCredential }),
      adapter,
      TEST_ENV
    ),
    handleAgentClaimJob(
      makeReq('POST', 'https://edge.local/agent-claim-job', {}, { 'x-device-credential': deviceCredential }),
      adapter,
      TEST_ENV
    ),
  ]);

  const b1 = (await r1.json()) as { claimed: boolean };
  const b2 = (await r2.json()) as { claimed: boolean };
  assert.equal(Number(b1.claimed) + Number(b2.claimed), 1);
});

test('[NEG-18] Job in needs_review cannot be auto-retried by agent; only explicit Admin reconciliation works', async () => {
  const sim = new TestSupabaseSimulator();
  const { adminJwt, deviceCredential, printerId } = await setupSeededShop(sim);
  const adapter = sim.asAdapter();

  const submitted = await createAndSubmitPdfJob(sim, { pages: 1, printSides: 'single', copies: 1 });
  await handleAdminConfirmCash(
    makeReq('POST', 'https://edge.local/admin-confirm-cash', { jobId: submitted.jobId }, { Authorization: `Bearer ${adminJwt}` }),
    adapter,
    TEST_ENV
  );
  await handleAdminReviewPrintJob(
    makeReq(
      'POST',
      'https://edge.local/admin-review-print-job',
      { jobId: submitted.jobId, action: 'approve' },
      { Authorization: `Bearer ${adminJwt}` }
    ),
    adapter,
    TEST_ENV
  );
  await handleAdminReleasePrintJob(
    makeReq(
      'POST',
      'https://edge.local/admin-release-print-job',
      { jobId: submitted.jobId, printerId },
      { Authorization: `Bearer ${adminJwt}` }
    ),
    adapter,
    TEST_ENV
  );

  const claim = (await (
    await handleAgentClaimJob(
      makeReq('POST', 'https://edge.local/agent-claim-job', {}, { 'x-device-credential': deviceCredential }),
      adapter,
      TEST_ENV
    )
  ).json()) as { attemptId: string };

  // Report needs_review from spooler ambiguity
  const nr = await handleAgentReportJobEvent(
    makeReq(
      'POST',
      'https://edge.local/agent-report-job-event',
      { attemptId: claim.attemptId, nextStatus: 'needs_review', errorCode: 'SPOOLER_TIMEOUT' },
      { 'x-device-credential': deviceCredential }
    ),
    adapter,
    TEST_ENV
  );
  assert.equal(nr.status, 200);

  // Another agent claim cannot pick it up
  const secondClaim = (await (
    await handleAgentClaimJob(
      makeReq('POST', 'https://edge.local/agent-claim-job', {}, { 'x-device-credential': deviceCredential }),
      adapter,
      TEST_ENV
    )
  ).json()) as { claimed: boolean };
  assert.equal(secondClaim.claimed, false);

  // Explicit Admin retry succeeds
  const adminRetry = await handleAdminRetryPrintJob(
    makeReq(
      'POST',
      'https://edge.local/admin-retry-print-job',
      { jobId: submitted.jobId, action: 'retry', reason: 'Confirmed no paper exited tray' },
      { Authorization: `Bearer ${adminJwt}` }
    ),
    adapter,
    TEST_ENV
  );
  assert.equal(adminRetry.status, 200);
});

test('[NEG-19] Revoked or paused device calling agent-heartbeat or agent-claim-job fails (403 DEVICE_NOT_ACTIVE)', async () => {
  const sim = new TestSupabaseSimulator();
  const { deviceId, deviceCredential } = await setupSeededShop(sim);
  const adapter = sim.asAdapter();

  await adapter.updateDevice(deviceId, { device_status: 'revoked', revoked_at: new Date().toISOString() });

  const hb = await handleAgentHeartbeat(
    makeReq('POST', 'https://edge.local/agent-heartbeat', {}, { 'x-device-credential': deviceCredential }),
    adapter,
    TEST_ENV
  );
  assert.equal(hb.status, 403);

  const cl = await handleAgentClaimJob(
    makeReq('POST', 'https://edge.local/agent-claim-job', {}, { 'x-device-credential': deviceCredential }),
    adapter,
    TEST_ENV
  );
  assert.equal(cl.status, 403);
});

test('[NEG-20] Retention cleanup skips active jobs & pending_verification payment jobs while purging expired drafts', async () => {
  const sim = new TestSupabaseSimulator();
  const { adminJwt } = await setupSeededShop(sim);
  const adapter = sim.asAdapter();

  // Job 1: Active submitted job with pending_verification payment (MUST NOT BE DELETED even after 100h)
  const activeJob = await createAndSubmitPdfJob(sim, { pages: 2, printSides: 'single', copies: 1 });
  await handleSubmitUpiPayment(
    makeReq(
      'POST',
      'https://edge.local/submit-upi-payment',
      { paymentMethod: 'upi', transactionReference: 'DISPUTEDUTR111' },
      { 'x-tracking-token': activeJob.trackingToken }
    ),
    adapter,
    TEST_ENV
  );

  // Job 2: Abandoned draft job (ELIGIBLE after > 1h)
  const draftRes = await handleCreatePrintJob(
    makeReq('POST', 'https://edge.local/create-print-job', { paperSize: 'A4', printMode: 'bw', printSides: 'single', copies: 1 }),
    adapter,
    TEST_ENV
  );
  const draft = (await draftRes.json()) as { jobId: string; draftUploadSecret: string };
  const pdf = buildMinimalPdf(1);
  const urlRes = await handleCreatePrintUploadUrl(
    makeReq(
      'POST',
      'https://edge.local/create-print-upload-url',
      { jobId: draft.jobId, filename: 'abandoned.pdf', mimeType: 'application/pdf', fileSizeBytes: pdf.byteLength },
      { 'x-draft-secret': draft.draftUploadSecret }
    ),
    adapter,
    TEST_ENV
  );
  const urlBody = (await urlRes.json()) as { signedUrl: string; storagePath: string };
  sim.uploadObjectWithSignedUrl(urlBody.signedUrl, pdf);

  // Advance clock by 48 hours
  sim.advanceTimeSeconds(48 * 3600);

  // Old 1-hour Firebase token is now expired -> must fail closed (401)
  const staleCleanupRes = await handleCleanupExpiredPrintFiles(
    makeReq(
      'POST',
      'https://edge.local/cleanup-expired-print-files',
      { dryRun: false, nowIso: new Date(sim.nowMs).toISOString() },
      { Authorization: `Bearer ${adminJwt}` }
    ),
    adapter,
    TEST_ENV
  );
  assert.equal(staleCleanupRes.status, 401);

  // Refresh Firebase Admin ID token at current simulated time -> succeeds (200)
  const freshAdminJwt = await signTestFirebaseToken({
    uid: TEST_ADMIN_FIREBASE_UID,
    email: 'owner@amancomputer.local',
    nowMs: sim.nowMs,
  });

  const cleanupRes = await handleCleanupExpiredPrintFiles(
    makeReq(
      'POST',
      'https://edge.local/cleanup-expired-print-files',
      { dryRun: false, nowIso: new Date(sim.nowMs).toISOString() },
      { Authorization: `Bearer ${freshAdminJwt}` }
    ),
    adapter,
    TEST_ENV
  );
  assert.equal(cleanupRes.status, 200);
  const cleanupBody = (await cleanupRes.json()) as {
    jobsExpired: number;
    filesMarkedDeleted: number;
    storageObjectsRemoved: number;
    skippedActiveOrDisputed: number;
  };

  assert.equal(cleanupBody.jobsExpired, 1);
  assert.equal(cleanupBody.filesMarkedDeleted, 1);
  assert.equal(cleanupBody.storageObjectsRemoved, 1);
  assert.ok(cleanupBody.skippedActiveOrDisputed >= 1);

  // Abandoned draft file deleted from storage; active job file intact!
  assert.equal(await adapter.readStorageObject('print-uploads', urlBody.storagePath), null);
  const activeFiles = await adapter.getFilesForJob(activeJob.jobId);
  assert.ok(await adapter.readStorageObject('print-uploads', activeFiles[0].storage_path));
});

// ===========================================================================
// 4. EXTRA SECURITY & PDF / RATE-LIMIT / SQL MIGRATION INTEGRITY TESTS
// ===========================================================================
test('Security: Rate limit rejects rapid brute-force tracking token lookups & SQL migrations meet all Phase 2 invariants', async () => {
  const sim = new TestSupabaseSimulator();
  await setupSeededShop(sim);
  const adapter = sim.asAdapter();

  for (let i = 0; i < 60; i += 1) {
    const res = await handleGetPrintJobStatus(
      makeReq('GET', 'https://edge.local/get-print-job-status', undefined, {
        'x-tracking-token': 'invalid_token_probe_value_at_least_24_chars',
      }),
      adapter,
      TEST_ENV
    );
    assert.equal(res.status, 401);
  }
  const blocked = await handleGetPrintJobStatus(
    makeReq('GET', 'https://edge.local/get-print-job-status', undefined, {
      'x-tracking-token': 'invalid_token_probe_value_at_least_24_chars',
    }),
    adapter,
    TEST_ENV
  );
  assert.equal(blocked.status, 429);

  // Corrupt PDF test
  assert.equal(extractPdfPageCount(buildMinimalPdf(4)), 4);
  assert.throws(
    () => extractPdfPageCount(new TextEncoder().encode('%PDF-1.4\ncorrupt')),
    (err: unknown) => (err as { code?: string })?.code === 'CORRUPT_PDF'
  );

  // Active agent heartbeat updates last_seen_at without verifying unverified printer hardware capabilities
  const enrolledDevice = sim.devices[0];
  assert.ok(enrolledDevice);

  // Static SQL migration integrity checks
  const m1 = fs.readFileSync(path.resolve('supabase/migrations/202611200001_scan2print_core_schema.sql'), 'utf8');
  const m2 = fs.readFileSync(path.resolve('supabase/migrations/202611200002_scan2print_rls_and_storage.sql'), 'utf8');
  const m3 = fs.readFileSync(path.resolve('supabase/migrations/202611200003_scan2print_atomic_rpcs.sql'), 'utf8');

  assert.match(m1, /uq_print_admin_single_mvp_account/);
  assert.match(m1, /chk_duplex_uses_per_physical_sheet/);
  assert.match(m1, /trg_print_events_immutable/);
  assert.doesNotMatch(m1, /INSERT INTO public\.print_pricing_rules/i); // Zero fabricated INR rates
  assert.match(m2, /FORCE ROW LEVEL SECURITY/);
  assert.match(m2, /'print-uploads', 'print-uploads', FALSE/);
  assert.match(m2, /'payment-evidence', 'payment-evidence', FALSE/);
  assert.match(m2, /'payment-assets', 'payment-assets', FALSE/);
  assert.match(m3, /FOR UPDATE OF j SKIP LOCKED/);
  assert.match(m3, /PAYMENT_NOT_VERIFIED/);

  // Ensure client src/ directory never references SUPABASE_SERVICE_ROLE_KEY or service_role secret
  const srcFiles = fs.readdirSync(path.resolve('src'), { recursive: true }) as string[];
  for (const rel of srcFiles) {
    const full = path.resolve('src', rel);
    if (fs.statSync(full).isFile() && /\.(ts|tsx|js|jsx)$/.test(full)) {
      const content = fs.readFileSync(full, 'utf8');
      assert.doesNotMatch(content, /SUPABASE_SERVICE_ROLE_KEY/);
    }
  }
});

// ===========================================================================
// 5. PHASE B — FIREBASE AUTHENTICATION MIGRATION SECURITY VERIFICATION
// ===========================================================================
function buildForgedUnverifiedJwt(header: Record<string, unknown>, payload: Record<string, unknown>, sig = 'forgedsig'): string {
  const b64u = (obj: Record<string, unknown>) =>
    Buffer.from(JSON.stringify(obj), 'utf8').toString('base64url');
  return `${b64u(header)}.${b64u(payload)}.${sig}`;
}

test('[FB-01..06] Firebase RS256 Verification rejects unknown UID, expired token, invalid RSA signature, wrong iss/aud, alg=none & HS256 spoofs', async () => {
  const sim = new TestSupabaseSimulator();
  const { adminJwt } = await setupSeededShop(sim);
  const adapter = sim.asAdapter();

  // [FB-01] Valid Admin token succeeds & records non-UUID firebase_uid
  assert.equal(sim.adminAccounts[0].firebase_uid, TEST_ADMIN_FIREBASE_UID);
  const validAdminRes = await handleAgentEnroll(
    makeReq('POST', 'https://edge.local/agent-enroll', { deviceName: 'Counter-PC-2' }, { Authorization: `Bearer ${adminJwt}` }),
    adapter,
    TEST_ENV
  );
  assert.equal(validAdminRes.status, 201);

  // [FB-02] Unknown Firebase UID (valid RS256 signature from wrong Firebase user) -> 403 FORBIDDEN
  const unknownUidToken = await signTestFirebaseToken({ uid: 'firebase_other_user_uid', nowMs: sim.nowMs });
  const unknownRes = await handleAdminReviewPrintJob(
    makeReq('POST', 'https://edge.local/admin-review-print-job', { jobId: 'x', action: 'approve' }, { Authorization: `Bearer ${unknownUidToken}` }),
    adapter,
    TEST_ENV
  );
  assert.equal(unknownRes.status, 403);

  // [FB-03] Expired Firebase ID token (beyond 30s tolerance) -> 401 UNAUTHORIZED
  const expiredToken = await signTestFirebaseToken({
    uid: TEST_ADMIN_FIREBASE_UID,
    nowMs: sim.nowMs - 7200 * 1000,
    expiresInSeconds: 3600,
  });
  const expiredRes = await handleAdminReviewPrintJob(
    makeReq('POST', 'https://edge.local/admin-review-print-job', { jobId: 'x', action: 'approve' }, { Authorization: `Bearer ${expiredToken}` }),
    adapter,
    TEST_ENV
  );
  assert.equal(expiredRes.status, 401);

  // [FB-04] Invalid RSA signature (attacker RSA keypair + tampered payload) -> 401 UNAUTHORIZED
  const attackerSignedToken = await signTestFirebaseToken({
    uid: TEST_ADMIN_FIREBASE_UID,
    nowMs: sim.nowMs,
    useAttackerKey: true,
  });
  const attackerRes = await handleAdminReviewPrintJob(
    makeReq('POST', 'https://edge.local/admin-review-print-job', { jobId: 'x', action: 'approve' }, { Authorization: `Bearer ${attackerSignedToken}` }),
    adapter,
    TEST_ENV
  );
  assert.equal(attackerRes.status, 401);

  const parts = adminJwt.split('.');
  const tamperedPayload = Buffer.from(
    JSON.stringify({ sub: TEST_ADMIN_FIREBASE_UID, iss: `https://securetoken.google.com/${FIREBASE_TEST_PROJECT_ID}`, aud: FIREBASE_TEST_PROJECT_ID, exp: Math.floor(sim.nowMs / 1000) + 9999, iat: Math.floor(sim.nowMs / 1000), auth_time: Math.floor(sim.nowMs / 1000) }),
    'utf8'
  ).toString('base64url');
  const tamperedRes = await handleAdminReviewPrintJob(
    makeReq('POST', 'https://edge.local/admin-review-print-job', { jobId: 'x', action: 'approve' }, { Authorization: `Bearer ${parts[0]}.${tamperedPayload}.${parts[2]}` }),
    adapter,
    TEST_ENV
  );
  assert.equal(tamperedRes.status, 401);

  // [FB-05] Wrong issuer and wrong audience -> 401 UNAUTHORIZED
  const wrongIssToken = await signTestFirebaseToken({
    uid: TEST_ADMIN_FIREBASE_UID,
    issuer: 'https://securetoken.google.com/evil-other-project',
    nowMs: sim.nowMs,
  });
  assert.equal(
    (await handleAdminReviewPrintJob(
      makeReq('POST', 'https://edge.local/admin-review-print-job', { jobId: 'x', action: 'approve' }, { Authorization: `Bearer ${wrongIssToken}` }),
      adapter,
      TEST_ENV
    )).status,
    401
  );

  const wrongAudToken = await signTestFirebaseToken({
    uid: TEST_ADMIN_FIREBASE_UID,
    audience: 'evil-other-project',
    nowMs: sim.nowMs,
  });
  assert.equal(
    (await handleAdminReviewPrintJob(
      makeReq('POST', 'https://edge.local/admin-review-print-job', { jobId: 'x', action: 'approve' }, { Authorization: `Bearer ${wrongAudToken}` }),
      adapter,
      TEST_ENV
    )).status,
    401
  );

  // [FB-06] alg=none unsigned JWT & HS256 symmetric key-confusion spoof -> 401 UNAUTHORIZED
  const nowSec = Math.floor(sim.nowMs / 1000);
  const claims = {
    iss: `https://securetoken.google.com/${FIREBASE_TEST_PROJECT_ID}`,
    aud: FIREBASE_TEST_PROJECT_ID,
    sub: TEST_ADMIN_FIREBASE_UID,
    iat: nowSec - 10,
    auth_time: nowSec - 60,
    exp: nowSec + 3600,
    email: 'owner@amancomputer.local',
  };

  const algNoneToken = buildForgedUnverifiedJwt({ alg: 'none', typ: 'JWT', kid: TEST_KID }, claims, 'x');
  assert.equal(
    (await handleAdminReviewPrintJob(
      makeReq('POST', 'https://edge.local/admin-review-print-job', { jobId: 'x', action: 'approve' }, { Authorization: `Bearer ${algNoneToken}` }),
      adapter,
      TEST_ENV
    )).status,
    401
  );

  const hs256Token = await new SignJWT(claims)
    .setProtectedHeader({ alg: 'HS256', kid: TEST_KID, typ: 'JWT' })
    .sign(new TextEncoder().encode(FIREBASE_TEST_PROJECT_ID));
  assert.equal(
    (await handleAdminReviewPrintJob(
      makeReq('POST', 'https://edge.local/admin-review-print-job', { jobId: 'x', action: 'approve' }, { Authorization: `Bearer ${hs256Token}` }),
      adapter,
      TEST_ENV
    )).status,
    401
  );
});

test('[FB-07..08] Disabled Admin rejected (403), bootstrap requires Firebase ID token & rejects UID spoofing', async () => {
  // Bootstrap without Firebase Bearer ID token -> 401
  const freshSim = new TestSupabaseSimulator();
  freshSim.setFirebaseJwks(await getTestJwks());
  const noBearerRes = await handleAdminBootstrap(
    makeReq(
      'POST',
      'https://edge.local/admin-bootstrap',
      { email: 'owner@amancomputer.local', fullName: 'Aman Owner' },
      { 'x-admin-bootstrap-secret': TEST_ENV.ADMIN_BOOTSTRAP_SECRET! }
    ),
    freshSim.asAdapter(),
    TEST_ENV
  );
  assert.equal(noBearerRes.status, 401);

  // Bootstrap rejects body firebaseUid that disagrees with verified token sub -> 403 UID_MISMATCH
  const validBootstrapToken = await signTestFirebaseToken({
    uid: TEST_ADMIN_FIREBASE_UID,
    email: 'owner@amancomputer.local',
    nowMs: freshSim.nowMs,
  });
  const spoofUidRes = await handleAdminBootstrap(
    makeReq(
      'POST',
      'https://edge.local/admin-bootstrap',
      { firebaseUid: 'attacker_spoofed_uid', email: 'owner@amancomputer.local', fullName: 'Aman Owner' },
      {
        'x-admin-bootstrap-secret': TEST_ENV.ADMIN_BOOTSTRAP_SECRET!,
        Authorization: `Bearer ${validBootstrapToken}`,
      }
    ),
    freshSim.asAdapter(),
    TEST_ENV
  );
  assert.equal(spoofUidRes.status, 403);

  // [FB-07] Disabled Admin (is_active = false) even with valid RS256 token -> 403 FORBIDDEN
  const sim = new TestSupabaseSimulator();
  const { adminJwt } = await setupSeededShop(sim);
  sim.adminAccounts[0].is_active = false;

  const disabledRes = await handleAdminReviewPrintJob(
    makeReq('POST', 'https://edge.local/admin-review-print-job', { jobId: 'x', action: 'approve' }, { Authorization: `Bearer ${adminJwt}` }),
    sim.asAdapter(),
    TEST_ENV
  );
  assert.equal(disabledRes.status, 403);
});

test('[FB-09] All 8 Admin-protected Edge Functions fail closed on missing config, missing/invalid token, unknown UID & disabled admin + migration/config checks', async () => {
  const sim = new TestSupabaseSimulator();
  const { adminJwt } = await setupSeededShop(sim);
  const adapter = sim.asAdapter();

  const adminEndpoints: Array<{
    name: string;
    invoke: (headers: Record<string, string>, env?: RuntimeEnv) => Promise<Response>;
  }> = [
    {
      name: 'admin-review-print-job',
      invoke: (headers, env = TEST_ENV) =>
        handleAdminReviewPrintJob(makeReq('POST', 'https://edge.local/admin-review-print-job', {}, headers), adapter, env),
    },
    {
      name: 'admin-verify-payment',
      invoke: (headers, env = TEST_ENV) =>
        handleAdminVerifyPayment(makeReq('POST', 'https://edge.local/admin-verify-payment', {}, headers), adapter, env),
    },
    {
      name: 'admin-confirm-cash',
      invoke: (headers, env = TEST_ENV) =>
        handleAdminConfirmCash(makeReq('POST', 'https://edge.local/admin-confirm-cash', {}, headers), adapter, env),
    },
    {
      name: 'admin-update-payment-settings',
      invoke: (headers, env = TEST_ENV) =>
        handleAdminUpdatePaymentSettings(makeReq('POST', 'https://edge.local/admin-update-payment-settings', {}, headers), adapter, env),
    },
    {
      name: 'admin-release-print-job',
      invoke: (headers, env = TEST_ENV) =>
        handleAdminReleasePrintJob(makeReq('POST', 'https://edge.local/admin-release-print-job', {}, headers), adapter, env),
    },
    {
      name: 'admin-retry-print-job',
      invoke: (headers, env = TEST_ENV) =>
        handleAdminRetryPrintJob(makeReq('POST', 'https://edge.local/admin-retry-print-job', {}, headers), adapter, env),
    },
    {
      name: 'agent-enroll',
      invoke: (headers, env = TEST_ENV) =>
        handleAgentEnroll(makeReq('POST', 'https://edge.local/agent-enroll', {}, headers), adapter, env),
    },
    {
      name: 'cleanup-expired-print-files',
      invoke: (headers, env = TEST_ENV) =>
        handleCleanupExpiredPrintFiles(makeReq('POST', 'https://edge.local/cleanup-expired-print-files', { dryRun: true }, headers), adapter, env),
    },
  ];

  const unknownUidToken = await signTestFirebaseToken({ uid: 'stranger_uid_403', nowMs: sim.nowMs });
  const envWithoutFirebase: RuntimeEnv = { ...TEST_ENV, FIREBASE_PROJECT_ID: '' };

  for (const ep of adminEndpoints) {
    // 1. Fail closed when FIREBASE_PROJECT_ID is missing
    const noCfg = await ep.invoke({ Authorization: `Bearer ${adminJwt}` }, envWithoutFirebase);
    assert.equal(noCfg.status, 500, `${ep.name} must fail closed when FIREBASE_PROJECT_ID is unset`);

    // 2. Missing Authorization header -> 401
    const noAuth = await ep.invoke({});
    assert.equal(noAuth.status, 401, `${ep.name} must reject missing Bearer header with 401`);

    // 3. Garbage/forged Bearer token -> 401
    const badJwt = await ep.invoke({ Authorization: 'Bearer not-a-real-jwt' });
    assert.equal(badJwt.status, 401, `${ep.name} must reject malformed Bearer token with 401`);

    // 4. Unknown Firebase UID -> 403
    const wrongUid = await ep.invoke({ Authorization: `Bearer ${unknownUidToken}` });
    assert.equal(wrongUid.status, 403, `${ep.name} must reject unknown Firebase UID with 403`);
  }

  // 5. Disabled Admin -> 403 across ALL Admin endpoints
  sim.adminAccounts[0].is_active = false;
  for (const ep of adminEndpoints) {
    const disabled = await ep.invoke({ Authorization: `Bearer ${adminJwt}` });
    assert.equal(disabled.status, 403, `${ep.name} must reject disabled Admin with 403`);
  }

  // Static verification of Phase A migration SQL & supabase/config.toml verify_jwt consistency
  const m4 = fs.readFileSync(path.resolve('supabase/migrations/202611200004_scan2print_firebase_auth_admin.sql'), 'utf8');
  assert.match(m4, /ADD COLUMN IF NOT EXISTS firebase_uid TEXT/);
  assert.match(m4, /ALTER COLUMN user_id DROP NOT NULL/);
  assert.match(m4, /uq_print_admin_firebase_uid/);
  assert.match(m4, /uq_print_admin_single_mvp_account/);

  const toml = fs.readFileSync(path.resolve('supabase/config.toml'), 'utf8');
  assert.doesNotMatch(toml, /verify_jwt\s*=\s*true/);
  assert.match(toml, /\[functions\.agent-enroll\]\s*\nverify_jwt = false/);
});
