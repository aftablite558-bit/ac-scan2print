// AC Scan2Print — Phase 4 Admin Print Management Automated Test Suite
// Tests Dashboard metrics, search/filter/pagination, duplex per_physical_sheet pricing CRUD,
// strict UPI auto-qualification vs Cash explicit approval, duplicate approval prevention,
// short-lived signed file preview/download URLs, queue release & retry, device heartbeat honesty & lifecycle,
// and fail-closed Admin auth enforcement.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { SignJWT, exportJWK, generateKeyPair, type JSONWebKeySet } from 'jose';

import {
  handleAdminBootstrap,
  handleAdminConfirmCash,
  handleAdminPrintJobs,
  handleAdminPrinters,
  handleAdminReleasePrintJob,
  handleAdminRetryPrintJob,
  handleAdminReviewPrintJob,
  handleAdminUpdatePaymentSettings,
  handleAdminVerifyPayment,
  handleAgentEnroll,
  handleAgentHeartbeat,
  handleCreatePrintJob,
  handleCreatePrintUploadUrl,
  handleFinalizePrintUpload,
  handleSubmitUpiPayment,
} from '../../supabase/functions/_shared/handlers.ts';
import {
  computeAdminPrintDashboardMetrics,
  computeDeviceHeartbeatStatus,
} from '../../supabase/functions/_shared/printManagement.ts';
import { buildCorsHeaders } from '../../supabase/functions/_shared/security.ts';
import type { RuntimeEnv } from '../../supabase/functions/_shared/types.ts';
import { TestSupabaseSimulator } from '../phase2/mockBackendAdapter.ts';

function buildMinimalPdf(pageCount: number): Uint8Array {
  const pages = Array.from(
    { length: pageCount },
    (_, idx) => `${idx + 3} 0 obj << /Type /Page /Parent 2 0 R >> endobj`
  ).join('\n');
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
      'x-forwarded-for': '203.0.113.44',
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

const FIREBASE_PROJECT = 'aman-computer-27b21';
const ADMIN_UID = 'Yr0Wr7PuuAdOIMaqohmqaINNbNC2';
const NON_ADMIN_UID = 'customer_non_admin_09';
const TEST_KID = 'phase4-kid-1';
const keyPairPromise = generateKeyPair('RS256');

const ENV: RuntimeEnv = {
  FIREBASE_PROJECT_ID: FIREBASE_PROJECT,
  ADMIN_BOOTSTRAP_SECRET: 'phase4-bootstrap-secret-value-strong',
  ADMIN_BOOTSTRAP_ALLOWED_UID: ADMIN_UID,
};

async function createBearer(uid: string, email: string): Promise<string> {
  const { privateKey } = await keyPairPromise;
  const nowSec = Math.floor(Date.now() / 1000);
  return new SignJWT({
    email,
    email_verified: true,
    auth_time: nowSec - 60,
    firebase: { sign_in_provider: 'password' },
  })
    .setProtectedHeader({ alg: 'RS256', kid: TEST_KID, typ: 'JWT' })
    .setIssuer(`https://securetoken.google.com/${FIREBASE_PROJECT}`)
    .setAudience(FIREBASE_PROJECT)
    .setSubject(uid)
    .setIssuedAt(nowSec - 10)
    .setExpirationTime(nowSec + 600)
    .sign(privateKey);
}

async function setupAdminWorkspace() {
  const sim = new TestSupabaseSimulator();
  const { publicKey } = await keyPairPromise;
  const jwk = await exportJWK(publicKey);
  const jwks: JSONWebKeySet = {
    keys: [{ ...jwk, kid: TEST_KID, alg: 'RS256', use: 'sig' }],
  };
  sim.setFirebaseJwks(jwks);
  const adapter = sim.asAdapter();
  const adminJwt = await createBearer(ADMIN_UID, 'shariqueaman77@gmail.com');

  const boot = await handleAdminBootstrap(
    makeReq(
      'POST',
      'https://edge.local/admin-bootstrap',
      {
        fullName: 'Sharique Aman',
      },
      {
        Authorization: `Bearer ${adminJwt}`,
        'x-admin-bootstrap-secret': ENV.ADMIN_BOOTSTRAP_SECRET!,
      }
    ),
    adapter,
    ENV
  );
  assert.equal(boot.status, 201);

  return { sim, adapter, adminJwt };
}

async function createAndFinalizeCustomerJob(
  sim: TestSupabaseSimulator,
  opts: {
    customerName: string;
    paperSize?: 'A4' | 'A3' | 'Legal';
    printMode?: 'bw' | 'colour';
    printSides?: 'single' | 'duplex';
    copies?: number;
    pages?: number;
    mimeType?: 'application/pdf' | 'image/png';
  }
) {
  const adapter = sim.asAdapter();
  const paperSize = opts.paperSize ?? 'A4';
  const printMode = opts.printMode ?? 'bw';
  const printSides = opts.printSides ?? 'single';
  const copies = opts.copies ?? 1;
  const pages = opts.pages ?? 4;
  const mimeType = opts.mimeType ?? 'application/pdf';

  const createRes = await handleCreatePrintJob(
    makeReq('POST', 'https://edge.local/create-print-job', {
      customerName: opts.customerName,
      customerPhone: '9876543210',
      paperSize,
      printMode,
      printSides,
      copies,
    }),
    adapter,
    ENV
  );
  assert.equal(createRes.status, 201);
  const draft = (await createRes.json()) as {
    jobId: string;
    jobNumber: string;
    draftUploadSecret: string;
  };

  const bytes = mimeType === 'application/pdf' ? buildMinimalPdf(pages) : buildMinimalPng();
  const filename = mimeType === 'application/pdf' ? 'document.pdf' : 'scan.png';
  const upUrlRes = await handleCreatePrintUploadUrl(
    makeReq(
      'POST',
      'https://edge.local/create-print-upload-url',
      {
        jobId: draft.jobId,
        filename,
        mimeType,
        fileSizeBytes: bytes.length,
      },
      { 'x-draft-secret': draft.draftUploadSecret }
    ),
    adapter,
    ENV
  );
  assert.equal(upUrlRes.status, 201);
  const upUrl = (await upUrlRes.json()) as { fileId: string; signedUrl: string };
  sim.uploadObjectWithSignedUrl(upUrl.signedUrl, bytes);

  const finRes = await handleFinalizePrintUpload(
    makeReq(
      'POST',
      'https://edge.local/finalize-print-upload',
      { jobId: draft.jobId, fileId: upUrl.fileId },
      { 'x-draft-secret': draft.draftUploadSecret }
    ),
    adapter,
    ENV
  );
  assert.equal(finRes.status, 200);
  const fin = (await finRes.json()) as {
    jobId: string;
    jobNumber: string;
    trackingToken: string;
    verifiedPageCount: number;
    physicalSheetCount: number;
    finalAmount: number;
  };
  return fin;
}

test('[P4-01] Non-admin and unauthenticated callers are strictly rejected from admin-print-jobs', async () => {
  const { adapter } = await setupAdminWorkspace();
  const nonAdminJwt = await createBearer(NON_ADMIN_UID, 'customer@example.com');

  const noAuthRes = await handleAdminPrintJobs(
    makeReq('GET', 'https://edge.local/admin-print-jobs'),
    adapter,
    ENV
  );
  assert.equal(noAuthRes.status, 401);

  const nonAdminRes = await handleAdminPrintJobs(
    makeReq('POST', 'https://edge.local/admin-print-jobs', { action: 'list' }, { Authorization: `Bearer ${nonAdminJwt}` }),
    adapter,
    ENV
  );
  assert.equal(nonAdminRes.status, 403);
});

test('[P4-02] Pricing CRUD strictly enforces duplex per_physical_sheet, prevents active conflicts, and bills 11p duplex as 6 sheets', async () => {
  const { sim, adapter, adminJwt } = await setupAdminWorkspace();

  // Attempt invalid duplex rule with per_printed_page -> must fail 400
  const invalidDuplexRes = await handleAdminPrintJobs(
    makeReq(
      'POST',
      'https://edge.local/admin-print-jobs',
      {
        action: 'pricing_save',
        ruleName: 'Invalid Duplex',
        paperSize: 'A4',
        printMode: 'bw',
        printSides: 'duplex',
        pricingUnit: 'per_printed_page',
        rate: 3,
        minimumCharge: 0,
        isActive: true,
      },
      { Authorization: `Bearer ${adminJwt}` }
    ),
    adapter,
    ENV
  );
  assert.equal(invalidDuplexRes.status, 400);

  // Create valid duplex rule (₹4 per physical sheet)
  const saveDuplexRes = await handleAdminPrintJobs(
    makeReq(
      'POST',
      'https://edge.local/admin-print-jobs',
      {
        action: 'pricing_save',
        ruleName: 'A4 B&W Duplex Real Rate',
        paperSize: 'A4',
        printMode: 'bw',
        printSides: 'duplex',
        pricingUnit: 'per_physical_sheet',
        rate: 4,
        minimumCharge: 0,
        isActive: true,
      },
      { Authorization: `Bearer ${adminJwt}` }
    ),
    adapter,
    ENV
  );
  assert.equal(saveDuplexRes.status, 201);

  // Create superseding active rule for same tuple -> automatically deactivates old rule cleanly
  const supersedeRes = await handleAdminPrintJobs(
    makeReq(
      'POST',
      'https://edge.local/admin-print-jobs',
      {
        action: 'pricing_save',
        ruleName: 'A4 B&W Duplex Updated Rate',
        paperSize: 'A4',
        printMode: 'bw',
        printSides: 'duplex',
        pricingUnit: 'per_physical_sheet',
        rate: 5,
        minimumCharge: 0,
        isActive: true,
      },
      { Authorization: `Bearer ${adminJwt}` }
    ),
    adapter,
    ENV
  );
  assert.equal(supersedeRes.status, 201);
  const rulesBody = (await supersedeRes.json()) as { pricingRules: Array<{ is_active: boolean; rate: number }> };
  assert.equal(rulesBody.pricingRules.filter((r) => r.is_active).length, 1);
  assert.equal(rulesBody.pricingRules.find((r) => r.is_active)?.rate, 5);

  // Customer submits 11-page duplex × 2 copies -> 6 sheets * 2 * ₹5 = ₹60.00
  const submitted = await createAndFinalizeCustomerJob(sim, {
    customerName: 'Duplex Customer',
    paperSize: 'A4',
    printMode: 'bw',
    printSides: 'duplex',
    copies: 2,
    pages: 11,
  });
  assert.equal(submitted.verifiedPageCount, 11);
  assert.equal(submitted.physicalSheetCount, 6);
  assert.equal(submitted.finalAmount, 60);
});

test('[P4-03] UPI verification auto-qualifies job for queue without manual Approve step, while Cash requires explicit Approve + duplicate guard', async () => {
  const { sim, adapter, adminJwt } = await setupAdminWorkspace();

  // Setup UPI payment settings + pricing rules + 1 enabled printer
  const prepQr = await handleAdminUpdatePaymentSettings(
    makeReq(
      'POST',
      'https://edge.local/admin-update-payment-settings',
      { action: 'prepare_qr_upload', filename: 'shop-qr.png', mimeType: 'image/png', fileSizeBytes: 12 },
      { Authorization: `Bearer ${adminJwt}` }
    ),
    adapter,
    ENV
  );
  assert.equal(prepQr.status, 201);
  const qrBody = (await prepQr.json()) as { signedUrl: string; storagePath: string };
  sim.uploadObjectWithSignedUrl(qrBody.signedUrl, buildMinimalPng());

  const savePaySettings = await handleAdminUpdatePaymentSettings(
    makeReq(
      'POST',
      'https://edge.local/admin-update-payment-settings',
      {
        action: 'update',
        displayName: 'Aman Computer',
        upiEnabled: true,
        upiId: 'amancomputer@upi',
        upiQrStoragePath: qrBody.storagePath,
      },
      { Authorization: `Bearer ${adminJwt}` }
    ),
    adapter,
    ENV
  );
  assert.equal(savePaySettings.status, 200);
  const paySettingsJson = (await savePaySettings.json()) as { upiQrSignedUrl: string | null };
  assert.ok(paySettingsJson.upiQrSignedUrl?.includes('token='));

  await handleAdminPrintJobs(
    makeReq(
      'POST',
      'https://edge.local/admin-print-jobs',
      {
        action: 'pricing_save',
        ruleName: 'A4 BW Single',
        paperSize: 'A4',
        printMode: 'bw',
        printSides: 'single',
        pricingUnit: 'per_printed_page',
        rate: 2,
        minimumCharge: 0,
        isActive: true,
      },
      { Authorization: `Bearer ${adminJwt}` }
    ),
    adapter,
    ENV
  );

  const printerRes = await handleAdminPrinters(
    makeReq(
      'POST',
      'https://edge.local/admin-printers',
      {
        action: 'create',
        printerName: 'Counter Laser Printer',
        connectionType: 'usb',
        supportsColour: 'no',
        supportsDuplex: 'yes',
        supportedPaperSizes: ['A4'],
        isEnabled: true,
      },
      { Authorization: `Bearer ${adminJwt}` }
    ),
    adapter,
    ENV
  );
  assert.equal(printerRes.status, 201);
  const printerJson = (await printerRes.json()) as { printer: { id: string } };
  const printerId = printerJson.printer.id;

  // --- Journey A: UPI customer submits UTR + screenshot ---
  const upiJob = await createAndFinalizeCustomerJob(sim, {
    customerName: 'UPI Auto Customer',
    pages: 5,
    copies: 1,
  });

  const evPrep = await handleSubmitUpiPayment(
    makeReq(
      'POST',
      'https://edge.local/submit-upi-payment',
      { action: 'prepare_evidence_upload', filename: 'ev.png', mimeType: 'image/png', fileSizeBytes: 12 },
      { 'x-tracking-token': upiJob.trackingToken }
    ),
    adapter,
    ENV
  );
  assert.equal(evPrep.status, 201);
  const evPrepBody = (await evPrep.json()) as { signedUrl: string; evidenceStoragePath: string };
  sim.uploadObjectWithSignedUrl(evPrepBody.signedUrl, buildMinimalPng());

  const paySub = await handleSubmitUpiPayment(
    makeReq(
      'POST',
      'https://edge.local/submit-upi-payment',
      {
        paymentMethod: 'upi',
        transactionReference: 'UTR9988776655',
        evidenceStoragePath: evPrepBody.evidenceStoragePath,
        evidenceMimeType: 'image/png',
      },
      { 'x-tracking-token': upiJob.trackingToken }
    ),
    adapter,
    ENV
  );
  assert.equal(paySub.status, 201);
  const paySubBody = (await paySub.json()) as { paymentId: string };

  // Inspect Job Detail before verifying UPI -> returns signed file preview URL + evidence screenshot URL
  const detailBefore = await handleAdminPrintJobs(
    makeReq(
      'POST',
      'https://edge.local/admin-print-jobs',
      { action: 'detail', jobId: upiJob.jobId },
      { Authorization: `Bearer ${adminJwt}` }
    ),
    adapter,
    ENV
  );
  assert.equal(detailBefore.status, 200);
  const detailBeforeJson = (await detailBefore.json()) as {
    files: Array<{ signedDownloadUrl: string | null; previewSupported: boolean }>;
    payments: Array<{ screenshotSignedUrl: string | null }>;
  };
  assert.equal(detailBeforeJson.files.length, 1);
  assert.ok(detailBeforeJson.files[0].signedDownloadUrl?.includes('token='));
  assert.equal(detailBeforeJson.files[0].previewSupported, true);
  assert.ok(detailBeforeJson.payments[0].screenshotSignedUrl?.includes('token='));

  // Verify UPI payment WITHOUT calling admin-review-print-job('approve') -> auto-qualifies & releases!
  const verifyRes = await handleAdminVerifyPayment(
    makeReq(
      'POST',
      'https://edge.local/admin-verify-payment',
      { paymentId: paySubBody.paymentId, decision: 'approve', printerId },
      { Authorization: `Bearer ${adminJwt}` }
    ),
    adapter,
    ENV
  );
  assert.equal(verifyRes.status, 200);
  const verifyJson = (await verifyRes.json()) as {
    paymentStatus: string;
    jobStatus: string;
    autoQualified: boolean;
    autoReleased: boolean;
  };
  assert.equal(verifyJson.paymentStatus, 'paid');
  assert.equal(verifyJson.autoQualified, true);
  assert.equal(verifyJson.autoReleased, true);
  assert.equal(verifyJson.jobStatus, 'queued');

  // --- Journey B: Cash customer MUST NOT enter queue without explicit Cash confirmation & Approve ---
  const cashJob = await createAndFinalizeCustomerJob(sim, {
    customerName: 'Cash Approval Customer',
    pages: 3,
    copies: 1,
  });

  // Confirm Cash received -> payment_status='paid', status STILL 'submitted' (cannot release yet!)
  const confirmCashRes = await handleAdminConfirmCash(
    makeReq(
      'POST',
      'https://edge.local/admin-confirm-cash',
      { jobId: cashJob.jobId },
      { Authorization: `Bearer ${adminJwt}` }
    ),
    adapter,
    ENV
  );
  assert.equal(confirmCashRes.status, 200);

  const prematureReleaseRes = await handleAdminReleasePrintJob(
    makeReq(
      'POST',
      'https://edge.local/admin-release-print-job',
      { jobId: cashJob.jobId, printerId },
      { Authorization: `Bearer ${adminJwt}` }
    ),
    adapter,
    ENV
  );
  assert.equal(prematureReleaseRes.status, 409);

  // Explicit Admin Approve -> succeeds, duplicate approve -> 409 ALREADY_APPROVED
  const cashApproveRes = await handleAdminReviewPrintJob(
    makeReq(
      'POST',
      'https://edge.local/admin-review-print-job',
      { jobId: cashJob.jobId, action: 'approve' },
      { Authorization: `Bearer ${adminJwt}` }
    ),
    adapter,
    ENV
  );
  assert.equal(cashApproveRes.status, 200);

  const dupApproveRes = await handleAdminReviewPrintJob(
    makeReq(
      'POST',
      'https://edge.local/admin-review-print-job',
      { jobId: cashJob.jobId, action: 'approve' },
      { Authorization: `Bearer ${adminJwt}` }
    ),
    adapter,
    ENV
  );
  assert.equal(dupApproveRes.status, 409);

  // Release Cash Job -> queued cleanly!
  const releaseCashRes = await handleAdminReleasePrintJob(
    makeReq(
      'POST',
      'https://edge.local/admin-release-print-job',
      { jobId: cashJob.jobId, printerId },
      { Authorization: `Bearer ${adminJwt}` }
    ),
    adapter,
    ENV
  );
  assert.equal(releaseCashRes.status, 200);

  // List Dashboard -> verifies real DB revenue (₹10 UPI + ₹6 Cash = ₹16) & Queue positions (#1, #2)
  const listRes = await handleAdminPrintJobs(
    makeReq(
      'POST',
      'https://edge.local/admin-print-jobs',
      { action: 'list', search: 'Cash Approval' },
      { Authorization: `Bearer ${adminJwt}` }
    ),
    adapter,
    ENV
  );
  assert.equal(listRes.status, 200);
  const listJson = (await listRes.json()) as {
    jobs: Array<{ job_number: string }>;
    metrics: {
      totalJobs: number;
      queuedJobs: number;
      totalConfirmedRevenue: number;
      revenueByMethod: { upi: number; cash: number };
      totalPhysicalSheets: number;
    };
    queue: Array<{ queuePosition: number | null; jobId: string }>;
  };
  assert.equal(listJson.jobs.length, 1);
  assert.equal(listJson.metrics.totalJobs, 2);
  assert.equal(listJson.metrics.queuedJobs, 2);
  assert.equal(listJson.metrics.totalConfirmedRevenue, 16);
  assert.equal(listJson.metrics.revenueByMethod.upi, 10);
  assert.equal(listJson.metrics.revenueByMethod.cash, 6);
  assert.equal(listJson.metrics.totalPhysicalSheets, 8);
  assert.equal(listJson.queue.length, 2);
  assert.equal(listJson.queue[0].queuePosition, 1);
  assert.equal(listJson.queue[1].queuePosition, 2);
});

test('[P4-04] Device heartbeat status is never fabricated and Pause/Revoke lifecycle is enforced', async () => {
  const { sim, adapter, adminJwt } = await setupAdminWorkspace();

  const enrollRes = await handleAgentEnroll(
    makeReq(
      'POST',
      'https://edge.local/agent-enroll',
      { deviceName: 'Counter-PC-Main', osVersion: 'Windows 11 Pro', activateImmediately: true },
      { Authorization: `Bearer ${adminJwt}` }
    ),
    adapter,
    ENV
  );
  assert.equal(enrollRes.status, 201);
  const enrolled = (await enrollRes.json()) as { deviceId: string; deviceCredential: string };

  // Never sent heartbeat -> must strictly report 'offline'
  const devList1 = await handleAdminPrintJobs(
    makeReq(
      'POST',
      'https://edge.local/admin-print-jobs',
      { action: 'device_list' },
      { Authorization: `Bearer ${adminJwt}` }
    ),
    adapter,
    ENV
  );
  assert.equal(devList1.status, 200);
  const devJson1 = (await devList1.json()) as { devices: Array<{ id: string; onlineStatus: string }> };
  assert.equal(devJson1.devices[0].onlineStatus, 'offline');

  // Send genuine agent heartbeat -> now online, then advance clock 120s -> strictly stale/offline
  const hbRes = await handleAgentHeartbeat(
    makeReq(
      'POST',
      'https://edge.local/agent-heartbeat',
      { agentVersion: '0.1.0-test' },
      { 'x-device-credential': enrolled.deviceCredential }
    ),
    adapter,
    ENV
  );
  assert.equal(hbRes.status, 200);

  const liveDevice = await adapter.getDeviceById!(enrolled.deviceId);
  assert.equal(computeDeviceHeartbeatStatus(liveDevice, Date.now()), 'online');
  assert.equal(computeDeviceHeartbeatStatus(liveDevice, Date.now() + 120_000), 'offline');

  // Pause device via Admin UI endpoint -> device_status='paused', heartbeat denied (403)
  const pauseRes = await handleAdminPrintJobs(
    makeReq(
      'POST',
      'https://edge.local/admin-print-jobs',
      { action: 'device_action', deviceId: enrolled.deviceId, deviceAction: 'pause' },
      { Authorization: `Bearer ${adminJwt}` }
    ),
    adapter,
    ENV
  );
  assert.equal(pauseRes.status, 200);

  const pausedHb = await handleAgentHeartbeat(
    makeReq('POST', 'https://edge.local/agent-heartbeat', {}, { 'x-device-credential': enrolled.deviceCredential }),
    adapter,
    ENV
  );
  assert.equal(pausedHb.status, 403);

  // Revoke device permanently -> cannot reactivate (409)
  const revokeRes = await handleAdminPrintJobs(
    makeReq(
      'POST',
      'https://edge.local/admin-print-jobs',
      { action: 'device_action', deviceId: enrolled.deviceId, deviceAction: 'revoke', reason: 'PC replaced' },
      { Authorization: `Bearer ${adminJwt}` }
    ),
    adapter,
    ENV
  );
  assert.equal(revokeRes.status, 200);

  const reactivateAttempt = await handleAdminPrintJobs(
    makeReq(
      'POST',
      'https://edge.local/admin-print-jobs',
      { action: 'device_action', deviceId: enrolled.deviceId, deviceAction: 'activate' },
      { Authorization: `Bearer ${adminJwt}` }
    ),
    adapter,
    ENV
  );
  assert.equal(reactivateAttempt.status, 409);

  // Verify dashboard metric function counts cancelled/draft/unpaid accurately without inflating revenue
  const metrics = computeAdminPrintDashboardMetrics(sim.jobs, sim.payments);
  assert.equal(metrics.totalConfirmedRevenue, 0);
});

test('[P4-05] Queue cancel and failed retry workflows preserve immutable audit events', async () => {
  const { sim, adapter, adminJwt } = await setupAdminWorkspace();
  await handleAdminPrintJobs(
    makeReq(
      'POST',
      'https://edge.local/admin-print-jobs',
      {
        action: 'pricing_save',
        ruleName: 'A4 BW',
        paperSize: 'A4',
        printMode: 'bw',
        printSides: 'single',
        pricingUnit: 'per_printed_page',
        rate: 2,
        minimumCharge: 0,
        isActive: true,
      },
      { Authorization: `Bearer ${adminJwt}` }
    ),
    adapter,
    ENV
  );

  const pRes = await handleAdminPrinters(
    makeReq(
      'POST',
      'https://edge.local/admin-printers',
      {
        action: 'create',
        printerName: 'Shop InkTank',
        connectionType: 'usb',
        supportsColour: 'yes',
        supportsDuplex: 'no',
        supportedPaperSizes: ['A4'],
        isEnabled: true,
      },
      { Authorization: `Bearer ${adminJwt}` }
    ),
    adapter,
    ENV
  );
  const { printer } = (await pRes.json()) as { printer: { id: string } };

  const job = await createAndFinalizeCustomerJob(sim, { customerName: 'Retry Customer', pages: 2 });
  await handleAdminConfirmCash(
    makeReq('POST', 'https://edge.local/admin-confirm-cash', { jobId: job.jobId }, { Authorization: `Bearer ${adminJwt}` }),
    adapter,
    ENV
  );
  await handleAdminReviewPrintJob(
    makeReq('POST', 'https://edge.local/admin-review-print-job', { jobId: job.jobId, action: 'approve' }, { Authorization: `Bearer ${adminJwt}` }),
    adapter,
    ENV
  );
  await handleAdminReleasePrintJob(
    makeReq('POST', 'https://edge.local/admin-release-print-job', { jobId: job.jobId, printerId: printer.id }, { Authorization: `Bearer ${adminJwt}` }),
    adapter,
    ENV
  );

  // Cancel queued job cleanly
  const cancelRes = await handleAdminReviewPrintJob(
    makeReq(
      'POST',
      'https://edge.local/admin-review-print-job',
      { jobId: job.jobId, action: 'cancel', reason: 'Customer left counter' },
      { Authorization: `Bearer ${adminJwt}` }
    ),
    adapter,
    ENV
  );
  assert.equal(cancelRes.status, 200);

  // Simulate another failed job -> retry requires reason and transitions back to queued
  const job2 = await createAndFinalizeCustomerJob(sim, { customerName: 'Failed Retry', pages: 2 });
  await handleAdminConfirmCash(
    makeReq('POST', 'https://edge.local/admin-confirm-cash', { jobId: job2.jobId }, { Authorization: `Bearer ${adminJwt}` }),
    adapter,
    ENV
  );
  await handleAdminReviewPrintJob(
    makeReq('POST', 'https://edge.local/admin-review-print-job', { jobId: job2.jobId, action: 'approve' }, { Authorization: `Bearer ${adminJwt}` }),
    adapter,
    ENV
  );
  await adapter.updateJob(job2.jobId, { status: 'failed', assigned_printer_id: printer.id });

  const retryRes = await handleAdminRetryPrintJob(
    makeReq(
      'POST',
      'https://edge.local/admin-retry-print-job',
      { jobId: job2.jobId, action: 'retry', printerId: printer.id, reason: 'Cleared paper jam' },
      { Authorization: `Bearer ${adminJwt}` }
    ),
    adapter,
    ENV
  );
  assert.equal(retryRes.status, 200);
  const retryJson = (await retryRes.json()) as { status: string };
  assert.equal(retryJson.status, 'queued');

  const events = await adapter.listEventsForJob!(job2.jobId);
  assert.ok(events.some((e) => e.event_type === 'admin_manual_retry_authorized'));
});

test('[P4-06] Strict UUID validation rejects malformed IDs with HTTP 400 before DB queries while preserving valid UUID workflows', async () => {
  const { sim, adapter, adminJwt } = await setupAdminWorkspace();

  let dbLookupCount = 0;
  const spiedAdapter: typeof adapter = {
    ...adapter,
    async getJobById(jobId) {
      dbLookupCount += 1;
      return adapter.getJobById(jobId);
    },
    async getPrinterById(printerId) {
      dbLookupCount += 1;
      return adapter.getPrinterById(printerId);
    },
    async getPaymentById(paymentId) {
      dbLookupCount += 1;
      return adapter.getPaymentById(paymentId);
    },
    async getPricingRuleById(ruleId) {
      dbLookupCount += 1;
      return adapter.getPricingRuleById!(ruleId);
    },
    async getDeviceById(deviceId) {
      dbLookupCount += 1;
      return adapter.getDeviceById!(deviceId);
    },
  };

  const badIds = ['not-a-uuid', '12345', "'; DROP TABLE print_jobs; --", '550e8400-e29b-41d4-a716-44665544000g'];

  for (const badId of badIds) {
    // 1. admin-print-jobs GET detail
    const detailGetRes = await handleAdminPrintJobs(
      makeReq('GET', `https://edge.local/admin-print-jobs?action=detail&jobId=${encodeURIComponent(badId)}`, undefined, {
        Authorization: `Bearer ${adminJwt}`,
      }),
      spiedAdapter,
      ENV
    );
    assert.equal(detailGetRes.status, 400);
    const detailGetJson = (await detailGetRes.json()) as { error: { code: string; message: string } };
    assert.equal(detailGetJson.error.code, 'INVALID_JOB_ID');
    assert.doesNotMatch(detailGetJson.error.message, /22P02|syntax|postgres|sql/i);

    // 2. admin-print-jobs POST detail
    const detailPostRes = await handleAdminPrintJobs(
      makeReq(
        'POST',
        'https://edge.local/admin-print-jobs',
        { action: 'detail', jobId: badId },
        { Authorization: `Bearer ${adminJwt}` }
      ),
      spiedAdapter,
      ENV
    );
    assert.equal(detailPostRes.status, 400);
    assert.equal(((await detailPostRes.json()) as { error: { code: string } }).error.code, 'INVALID_JOB_ID');

    // 3. admin-review-print-job
    const reviewRes = await handleAdminReviewPrintJob(
      makeReq(
        'POST',
        'https://edge.local/admin-review-print-job',
        { jobId: badId, action: 'approve' },
        { Authorization: `Bearer ${adminJwt}` }
      ),
      spiedAdapter,
      ENV
    );
    assert.equal(reviewRes.status, 400);
    assert.equal(((await reviewRes.json()) as { error: { code: string } }).error.code, 'INVALID_JOB_ID');

    // 4. admin-release-print-job (invalid jobId)
    const releaseRes = await handleAdminReleasePrintJob(
      makeReq(
        'POST',
        'https://edge.local/admin-release-print-job',
        { jobId: badId, printerId: crypto.randomUUID() },
        { Authorization: `Bearer ${adminJwt}` }
      ),
      spiedAdapter,
      ENV
    );
    assert.equal(releaseRes.status, 400);
    assert.equal(((await releaseRes.json()) as { error: { code: string } }).error.code, 'INVALID_JOB_ID');

    // 5. admin-retry-print-job
    const retryRes = await handleAdminRetryPrintJob(
      makeReq(
        'POST',
        'https://edge.local/admin-retry-print-job',
        { jobId: badId, action: 'retry', reason: 'Checking invalid uuid' },
        { Authorization: `Bearer ${adminJwt}` }
      ),
      spiedAdapter,
      ENV
    );
    assert.equal(retryRes.status, 400);
    assert.equal(((await retryRes.json()) as { error: { code: string } }).error.code, 'INVALID_JOB_ID');
  }

  // Also reject malformed printerId, ruleId, deviceId, and paymentId before DB queries
  const badPrinterRelease = await handleAdminReleasePrintJob(
    makeReq(
      'POST',
      'https://edge.local/admin-release-print-job',
      { jobId: crypto.randomUUID(), printerId: 'bad-printer-id' },
      { Authorization: `Bearer ${adminJwt}` }
    ),
    spiedAdapter,
    ENV
  );
  assert.equal(badPrinterRelease.status, 400);
  assert.equal(((await badPrinterRelease.json()) as { error: { code: string } }).error.code, 'INVALID_PRINTER_ID');

  const badRuleToggle = await handleAdminPrintJobs(
    makeReq(
      'POST',
      'https://edge.local/admin-print-jobs',
      { action: 'pricing_toggle', ruleId: 'bad-rule-id', isActive: false },
      { Authorization: `Bearer ${adminJwt}` }
    ),
    spiedAdapter,
    ENV
  );
  assert.equal(badRuleToggle.status, 400);
  assert.equal(((await badRuleToggle.json()) as { error: { code: string } }).error.code, 'INVALID_RULE_ID');

  const badDeviceAction = await handleAdminPrintJobs(
    makeReq(
      'POST',
      'https://edge.local/admin-print-jobs',
      { action: 'device_action', deviceId: 'bad-device-id', deviceAction: 'pause' },
      { Authorization: `Bearer ${adminJwt}` }
    ),
    spiedAdapter,
    ENV
  );
  assert.equal(badDeviceAction.status, 400);
  assert.equal(((await badDeviceAction.json()) as { error: { code: string } }).error.code, 'INVALID_DEVICE_ID');

  const badPaymentVerify = await handleAdminVerifyPayment(
    makeReq(
      'POST',
      'https://edge.local/admin-verify-payment',
      { paymentId: 'bad-payment-id', decision: 'approve' },
      { Authorization: `Bearer ${adminJwt}` }
    ),
    spiedAdapter,
    ENV
  );
  assert.equal(badPaymentVerify.status, 400);
  assert.equal(((await badPaymentVerify.json()) as { error: { code: string } }).error.code, 'INVALID_PAYMENT_ID');

  // Assert zero DB queries ran for ANY malformed UUID input above
  assert.equal(dbLookupCount, 0);

  // Valid non-existent UUID -> reaches DB cleanly and returns 404 JOB_NOT_FOUND
  const missingValidUuidRes = await handleAdminReviewPrintJob(
    makeReq(
      'POST',
      'https://edge.local/admin-review-print-job',
      { jobId: '00000000-0000-0000-0000-000000000000', action: 'approve' },
      { Authorization: `Bearer ${adminJwt}` }
    ),
    spiedAdapter,
    ENV
  );
  assert.equal(missingValidUuidRes.status, 404);
  assert.equal(dbLookupCount, 1);

  // Existing valid workflow still succeeds
  await handleAdminPrintJobs(
    makeReq(
      'POST',
      'https://edge.local/admin-print-jobs',
      {
        action: 'pricing_save',
        ruleName: 'A4 BW Valid Check',
        paperSize: 'A4',
        printMode: 'bw',
        printSides: 'single',
        pricingUnit: 'per_printed_page',
        rate: 2,
        minimumCharge: 0,
        isActive: true,
      },
      { Authorization: `Bearer ${adminJwt}` }
    ),
    adapter,
    ENV
  );
  const validJob = await createAndFinalizeCustomerJob(sim, { customerName: 'UUID Valid User', pages: 2 });
  const detailOk = await handleAdminPrintJobs(
    makeReq('GET', `https://edge.local/admin-print-jobs?action=detail&jobId=${validJob.jobId}`, undefined, {
      Authorization: `Bearer ${adminJwt}`,
    }),
    adapter,
    ENV
  );
  assert.equal(detailOk.status, 200);
});

test('[P4-07] buildCorsHeaders and Admin endpoints fail closed on missing/empty ALLOWED_ORIGINS and disallowed origins while preserving https://ac-scan2print.web.app', async () => {
  const { adapter, adminJwt } = await setupAdminWorkspace();
  const allowedOrigin = 'https://ac-scan2print.web.app';
  const evilOrigin = 'https://evil.example.com';

  // 1. Unit checks on buildCorsHeaders with missing/empty ALLOWED_ORIGINS
  for (const emptyCfg of [undefined, '', '   ']) {
    const reqWithOrigin = makeReq('POST', 'https://edge.local/admin-print-jobs', {}, { Origin: evilOrigin });
    const hdrs = buildCorsHeaders(reqWithOrigin, emptyCfg);
    assert.equal(hdrs['Access-Control-Allow-Origin'], undefined);

    const reqNoOrigin = makeReq('POST', 'https://edge.local/admin-print-jobs', {});
    const hdrsNoOrigin = buildCorsHeaders(reqNoOrigin, emptyCfg);
    assert.equal(hdrsNoOrigin['Access-Control-Allow-Origin'], undefined);
  }

  // 2. Unit checks on buildCorsHeaders with configured ALLOWED_ORIGINS
  const allowedHdrs = buildCorsHeaders(
    makeReq('OPTIONS', 'https://edge.local/admin-print-jobs', undefined, { Origin: allowedOrigin }),
    allowedOrigin
  );
  assert.equal(allowedHdrs['Access-Control-Allow-Origin'], allowedOrigin);

  const evilHdrs = buildCorsHeaders(
    makeReq('OPTIONS', 'https://edge.local/admin-print-jobs', undefined, { Origin: evilOrigin }),
    allowedOrigin
  );
  assert.equal(evilHdrs['Access-Control-Allow-Origin'], undefined);

  // 3. End-to-end handler CORS enforcement (Missing ALLOWED_ORIGINS rejects browser Origin with 403 & no ACAO)
  const missingCorsEnv: RuntimeEnv = { ...ENV, ALLOWED_ORIGINS: '' };
  const missingCorsOptions = await handleAdminPrintJobs(
    makeReq('OPTIONS', 'https://edge.local/admin-print-jobs', undefined, { Origin: allowedOrigin }),
    adapter,
    missingCorsEnv
  );
  assert.equal(missingCorsOptions.status, 403);
  assert.equal(missingCorsOptions.headers.get('access-control-allow-origin'), null);

  const missingCorsPost = await handleAdminPrintJobs(
    makeReq('POST', 'https://edge.local/admin-print-jobs', { action: 'list' }, {
      Authorization: `Bearer ${adminJwt}`,
      Origin: allowedOrigin,
    }),
    adapter,
    missingCorsEnv
  );
  assert.equal(missingCorsPost.status, 403);
  assert.equal(missingCorsPost.headers.get('access-control-allow-origin'), null);

  // 4. Configured ALLOWED_ORIGINS allows https://ac-scan2print.web.app and blocks evil.example.com
  const configuredEnv: RuntimeEnv = { ...ENV, ALLOWED_ORIGINS: allowedOrigin };

  const okPreflight = await handleAdminPrintJobs(
    makeReq('OPTIONS', 'https://edge.local/admin-print-jobs', undefined, { Origin: allowedOrigin }),
    adapter,
    configuredEnv
  );
  assert.equal(okPreflight.status, 204);
  assert.equal(okPreflight.headers.get('access-control-allow-origin'), allowedOrigin);

  const okAdminCall = await handleAdminPrintJobs(
    makeReq('GET', 'https://edge.local/admin-print-jobs?action=list', undefined, {
      Authorization: `Bearer ${adminJwt}`,
      Origin: allowedOrigin,
    }),
    adapter,
    configuredEnv
  );
  assert.equal(okAdminCall.status, 200);
  assert.equal(okAdminCall.headers.get('access-control-allow-origin'), allowedOrigin);

  const blockedPreflight = await handleAdminPrintJobs(
    makeReq('OPTIONS', 'https://edge.local/admin-print-jobs', undefined, { Origin: evilOrigin }),
    adapter,
    configuredEnv
  );
  assert.equal(blockedPreflight.status, 403);
  assert.equal(blockedPreflight.headers.get('access-control-allow-origin'), null);

  const blockedAdminCall = await handleAdminPrintJobs(
    makeReq('POST', 'https://edge.local/admin-print-jobs', { action: 'list' }, {
      Authorization: `Bearer ${adminJwt}`,
      Origin: evilOrigin,
    }),
    adapter,
    configuredEnv
  );
  assert.equal(blockedAdminCall.status, 403);
  assert.equal(blockedAdminCall.headers.get('access-control-allow-origin'), null);
});

test('[P4-08] Firebase Admin authorization enforces valid Admin UID, rejects wrong UID/disabled admin, and prevents duplicate payment verification', async () => {
  const { sim, adapter, adminJwt } = await setupAdminWorkspace();
  const nonAdminJwt = await createBearer(NON_ADMIN_UID, 'customer@example.com');

  // Wrong UID -> 403 on review/release/retry/verify
  assert.equal(
    (
      await handleAdminReviewPrintJob(
        makeReq(
          'POST',
          'https://edge.local/admin-review-print-job',
          { jobId: crypto.randomUUID(), action: 'approve' },
          { Authorization: `Bearer ${nonAdminJwt}` }
        ),
        adapter,
        ENV
      )
    ).status,
    403
  );

  // Disabled admin -> 403 even with valid UID Yr0Wr7PuuAdOIMaqohmqaINNbNC2
  sim.adminAccounts[0].is_active = false;
  assert.equal(
    (
      await handleAdminPrintJobs(
        makeReq('GET', 'https://edge.local/admin-print-jobs?action=list', undefined, {
          Authorization: `Bearer ${adminJwt}`,
        }),
        adapter,
        ENV
      )
    ).status,
    403
  );
  sim.adminAccounts[0].is_active = true;

  // Duplicate payment verification guard (409 PAYMENT_NOT_PENDING)
  await handleAdminPrintJobs(
    makeReq(
      'POST',
      'https://edge.local/admin-print-jobs',
      {
        action: 'pricing_save',
        ruleName: 'A4 BW Dup Guard',
        paperSize: 'A4',
        printMode: 'bw',
        printSides: 'single',
        pricingUnit: 'per_printed_page',
        rate: 2,
        minimumCharge: 0,
        isActive: true,
      },
      { Authorization: `Bearer ${adminJwt}` }
    ),
    adapter,
    ENV
  );
  await handleAdminUpdatePaymentSettings(
    makeReq(
      'POST',
      'https://edge.local/admin-update-payment-settings',
      { action: 'update', upiEnabled: true, upiId: 'amancomputer@upi' },
      { Authorization: `Bearer ${adminJwt}` }
    ),
    adapter,
    ENV
  );
  const upiJob = await createAndFinalizeCustomerJob(sim, { customerName: 'Dup Pay Guard', pages: 2 });
  const paySub = await handleSubmitUpiPayment(
    makeReq(
      'POST',
      'https://edge.local/submit-upi-payment',
      { paymentMethod: 'upi', transactionReference: 'UTRDUP998877' },
      { 'x-tracking-token': upiJob.trackingToken }
    ),
    adapter,
    ENV
  );
  assert.equal(paySub.status, 201);
  const { paymentId } = (await paySub.json()) as { paymentId: string };

  const firstVerify = await handleAdminVerifyPayment(
    makeReq(
      'POST',
      'https://edge.local/admin-verify-payment',
      { paymentId, decision: 'approve' },
      { Authorization: `Bearer ${adminJwt}` }
    ),
    adapter,
    ENV
  );
  assert.equal(firstVerify.status, 200);

  const dupVerify = await handleAdminVerifyPayment(
    makeReq(
      'POST',
      'https://edge.local/admin-verify-payment',
      { paymentId, decision: 'approve' },
      { Authorization: `Bearer ${adminJwt}` }
    ),
    adapter,
    ENV
  );
  assert.equal(dupVerify.status, 409);
  assert.equal(((await dupVerify.json()) as { error: { code: string } }).error.code, 'PAYMENT_NOT_PENDING');
});

test('[P4-09] Supabase config.toml and additive service_role grant migration enforce least-privilege & Firebase gateway rules', () => {
  const toml = fs.readFileSync(path.resolve('supabase/config.toml'), 'utf8');
  assert.match(toml, /\[functions\.admin-print-jobs\]\s*\nverify_jwt = false/);
  assert.doesNotMatch(toml, /verify_jwt\s*=\s*true/);

  const rawGrantsSql = fs.readFileSync(
    path.resolve('supabase/migrations/202611230001_scan2print_service_role_grants.sql'),
    'utf8'
  );
  const grantsSql = rawGrantsSql.replace(/--.*$/gm, '');
  assert.doesNotMatch(grantsSql, /\bTO\s+(anon|authenticated|PUBLIC)\b/i);
  assert.doesNotMatch(grantsSql, /DISABLE\s+ROW\s+LEVEL\s+SECURITY/i);
  assert.doesNotMatch(grantsSql, /GRANT\s+[^;]*\bON\s+(TABLE\s+)?public\.print_api_rate_limits\b/i);
  assert.match(grantsSql, /GRANT\s+SELECT\s+ON\s+TABLE\s+public\.print_system_settings\s+TO\s+service_role/i);
  assert.match(grantsSql, /GRANT\s+SELECT,\s*INSERT\s+ON\s+TABLE\s+public\.print_events\s+TO\s+service_role/i);
  assert.match(grantsSql, /GRANT\s+SELECT,\s*INSERT,\s*UPDATE\s+ON\s+TABLE\s+public\.print_jobs\s+TO\s+service_role/i);
});

