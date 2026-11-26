// AC Scan2Print — Phase 12 Post-Launch Operations, Financial Reconciliation & E2E Polish QA Suite
// Covers Daily Shift Financial Closeout, CSV Formula-Injection Hardening, Full-DB Reconciliation
// Across Pagination, Single-Admin Governance & Audit Trail Alignment, and Dual-Surface /quick-print Serving.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { SignJWT, exportJWK, generateKeyPair, type JSONWebKeySet } from 'jose';

import {
  buildAuditEventsCsv as buildClientAuditEventsCsv,
  buildJobsLedgerCsv as buildClientJobsLedgerCsv,
  escapeCsvCell as clientEscapeCsvCell,
  type AdminPrintEvent,
  type AdminPrintJobSummary,
} from '../../src/utils/printManagement.ts';
import { handleAdminBootstrap, handleAdminPrintJobs } from '../../supabase/functions/_shared/handlers.ts';
import {
  buildAuditEventsCsv,
  buildJobsLedgerCsv,
  computeDailyFinancialReconciliation,
  escapeCsvCell,
  sanitizeCsvFormulaCell,
} from '../../supabase/functions/_shared/printManagement.ts';
import type { PrintEvent, PrintJob, PrintPayment, RuntimeEnv } from '../../supabase/functions/_shared/types.ts';
import { TestSupabaseSimulator } from '../phase2/mockBackendAdapter.ts';

const FIREBASE_TEST_PROJECT_ID = 'ac-scan2print-prod';
const TEST_ADMIN_UID = 'firebase_admin_uid_aman_p12';
const TEST_KID = 'firebase-phase12-kid-1';

const primaryKeys = generateKeyPair('RS256');

const BASE_ENV: RuntimeEnv = {
  FIREBASE_PROJECT_ID: FIREBASE_TEST_PROJECT_ID,
  ADMIN_BOOTSTRAP_SECRET: 'phase12-bootstrap-secret-32chars',
  CRON_SECRET: 'phase12-cron-secret-32chars-min',
  CUSTOMER_PORTAL_URL: 'https://ac-scan2print.web.app/quick-print',
};

async function getJwks(): Promise<JSONWebKeySet> {
  const { publicKey } = await primaryKeys;
  const jwk = await exportJWK(publicKey);
  return { keys: [{ ...jwk, kid: TEST_KID, alg: 'RS256', use: 'sig' }] };
}

async function signFirebaseJwt(): Promise<string> {
  const nowSec = Math.floor(Date.now() / 1000);
  const kp = await primaryKeys;
  return new SignJWT({
    email: 'owner@amancomputer.in',
    email_verified: true,
    auth_time: nowSec - 60,
    firebase: { sign_in_provider: 'password' },
  })
    .setProtectedHeader({ alg: 'RS256', kid: TEST_KID, typ: 'JWT' })
    .setIssuer(`https://securetoken.google.com/${FIREBASE_TEST_PROJECT_ID}`)
    .setAudience(FIREBASE_TEST_PROJECT_ID)
    .setSubject(TEST_ADMIN_UID)
    .setIssuedAt(nowSec - 10)
    .setExpirationTime(nowSec + 3600)
    .sign(kp.privateKey);
}

function makeJob(overrides: Partial<PrintJob> = {}): PrintJob {
  const now = '2026-11-25T10:15:00.000Z';
  return {
    id: crypto.randomUUID(),
    job_number: `AC-P12-${Math.floor(1000 + Math.random() * 8999)}`,
    tracking_token_hash: null,
    draft_upload_secret_hash: null,
    customer_name: 'Walk-in Customer',
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

function makePayment(overrides: Partial<PrintPayment> = {}): PrintPayment {
  const now = '2026-11-25T10:16:00.000Z';
  return {
    id: crypto.randomUUID(),
    job_id: crypto.randomUUID(),
    payment_method: 'upi',
    payment_status: 'paid',
    amount: 12.34,
    currency: 'INR',
    transaction_reference: 'UTR123456789012',
    screenshot_storage_bucket: null,
    screenshot_storage_path: null,
    submitted_at: now,
    verified_at: now,
    verified_by: TEST_ADMIN_UID,
    rejection_reason: null,
    idempotency_key: null,
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

test('[P12-01] computeDailyFinancialReconciliation computes exact shift totals in paise without fabrication', () => {
  const empty = computeDailyFinancialReconciliation([], [], '2026-11-25');
  assert.equal(empty.dateIso, '2026-11-25');
  assert.equal(empty.confirmedTotalInr, 0);
  assert.equal(empty.upiConfirmedInr, 0);
  assert.equal(empty.cashConfirmedInr, 0);
  assert.equal(empty.submittedJobsCount, 0);
  assert.equal(empty.completedPhysicalSheets, 0);

  const jobs: PrintJob[] = [
    // Completed duplex colour job today (3 sheets * 2 copies = 6 sheets)
    makeJob({
      status: 'completed',
      payment_status: 'paid',
      payment_method: 'upi',
      print_mode: 'colour',
      print_sides: 'duplex',
      copies: 2,
      physical_sheet_count: 3,
      final_amount: 40.1,
    }),
    // Pending counter cash unpaid job today
    makeJob({
      status: 'submitted',
      payment_status: 'unpaid',
      payment_method: 'cash',
      print_mode: 'bw',
      print_sides: 'single',
      copies: 1,
      physical_sheet_count: 4,
      final_amount: 8.2,
    }),
    // Draft excluded
    makeJob({
      status: 'draft',
      payment_status: 'unpaid',
      final_amount: null,
    }),
    // Yesterday completed job excluded from 2026-11-25 reconciliation
    makeJob({
      status: 'completed',
      payment_status: 'paid',
      created_at: '2026-11-24T11:00:00.000Z',
      submitted_at: '2026-11-24T11:00:00.000Z',
      completed_at: '2026-11-24T11:05:00.000Z',
      final_amount: 99,
    }),
  ];

  const payments: PrintPayment[] = [
    makePayment({ payment_method: 'upi', payment_status: 'paid', amount: 40.1 }),
    makePayment({ payment_method: 'cash', payment_status: 'paid', amount: 15.2 }),
    makePayment({ payment_method: 'upi', payment_status: 'pending_verification', amount: 25.0 }),
    makePayment({ payment_method: 'upi', payment_status: 'refunded', amount: 10.0 }),
    makePayment({
      payment_method: 'cash',
      payment_status: 'paid',
      amount: 99,
      verified_at: '2026-11-24T11:05:00.000Z',
      created_at: '2026-11-24T11:00:00.000Z',
    }),
  ];

  const rec = computeDailyFinancialReconciliation(jobs, payments, '2026-11-25');
  assert.equal(rec.submittedJobsCount, 2);
  assert.equal(rec.completedJobsCount, 1);
  assert.equal(rec.completedPhysicalSheets, 6);
  assert.equal(rec.colourJobsCount, 1);
  assert.equal(rec.bwJobsCount, 1);
  assert.equal(rec.duplexJobsCount, 1);
  assert.equal(rec.singleJobsCount, 1);
  assert.equal(rec.confirmedPaidCount, 2);
  assert.equal(rec.upiConfirmedCount, 1);
  assert.equal(rec.upiConfirmedInr, 40.1);
  assert.equal(rec.cashConfirmedCount, 1);
  assert.equal(rec.cashConfirmedInr, 15.2);
  assert.equal(rec.confirmedTotalInr, 55.3); // exact paise sum (40.1 + 15.2 === 55.3)
  assert.equal(rec.pendingVerificationCount, 1);
  assert.equal(rec.pendingVerificationInr, 25);
  assert.equal(rec.unpaidCounterExposureCount, 1);
  assert.equal(rec.unpaidCounterExposureInr, 8.2);
  assert.equal(rec.refundedCount, 1);
  assert.equal(rec.refundedInr, 10);
});

test('[P12-02] CSV formula-injection neutralization and RFC-4180 escaping protect backend and client exports', () => {
  assert.equal(sanitizeCsvFormulaCell('=CMD("calc")'), `'=CMD("calc")`);
  assert.equal(sanitizeCsvFormulaCell('+SUM(A1:A2)'), `'+SUM(A1:A2)`);
  assert.equal(sanitizeCsvFormulaCell('-10+20'), `'-10+20`);
  assert.equal(sanitizeCsvFormulaCell('@SUM(1,2)'), `'@SUM(1,2)`);
  assert.equal(sanitizeCsvFormulaCell('  =HYPERLINK("https://evil")'), `'  =HYPERLINK("https://evil")`);
  assert.equal(escapeCsvCell('Aman, "Print" Shop'), `"Aman, ""Print"" Shop"`);
  assert.equal(clientEscapeCsvCell('=1+1'), `'=1+1`);

  const jobRow: AdminPrintJobSummary = {
    id: crypto.randomUUID(),
    job_number: 'AC-0099',
    customer_name: '=IMPORTXML("https://evil.example","//a")',
    customer_phone: '+919876543210',
    status: 'completed',
    payment_status: 'paid',
    payment_method: 'upi',
    subtotal: 20,
    final_amount: 20,
    currency: 'INR',
    paper_size: 'A4',
    print_mode: 'bw',
    print_sides: 'duplex',
    copies: 2,
    orientation: 'auto',
    scaling: 'fit',
    requested_page_range: 'all',
    verified_page_count: 5,
    physical_sheet_count: 3,
    pricing_rule_id: null,
    price_override_reason: null,
    assigned_printer_id: null,
    latest_transaction_reference: 'UTR123456789012',
    rejection_reason: null,
    cancellation_reason: null,
    created_at: '2026-11-25T10:00:00.000Z',
    updated_at: '2026-11-25T10:05:00.000Z',
    submitted_at: '2026-11-25T10:00:00.000Z',
    approved_at: '2026-11-25T10:01:00.000Z',
    completed_at: '2026-11-25T10:05:00.000Z',
    expires_at: null,
  };

  const serverCsv = buildJobsLedgerCsv([jobRow]);
  const clientCsv = buildClientJobsLedgerCsv([jobRow]);
  assert.equal(serverCsv, clientCsv);
  assert.ok(serverCsv.includes(`"'=IMPORTXML(""https://evil.example"",""//a"")"`));
  assert.ok(serverCsv.includes(`'+919876543210`));
  assert.ok(serverCsv.includes(',6,completed,upi,paid,20.00,UTR123456789012'));

  const ev: PrintEvent & AdminPrintEvent = {
    id: 'ev-1',
    job_id: 'job-1',
    actor_type: 'admin',
    actor_id: 'uid-1',
    event_type: 'payment_verified',
    previous_status: 'submitted',
    new_status: 'approved',
    metadata: { note: '=1+1' },
    created_at: '2026-11-25T10:01:00.000Z',
  };
  const auditCsv = buildAuditEventsCsv([ev]);
  assert.equal(auditCsv, buildClientAuditEventsCsv([ev]));
  assert.ok(auditCsv.includes('payment_verified'));
});

test('[P12-03] handleAdminPrintJobs returns authoritative dailyReconciliation & recentEvents across pagination', async () => {
  const sim = new TestSupabaseSimulator();
  sim.setFirebaseJwks(await getJwks());
  const adapter = sim.asAdapter();
  const adminJwt = await signFirebaseJwt();

  const bootRes = await handleAdminBootstrap(
    new Request('https://edge.test/admin-bootstrap', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-bootstrap-secret': BASE_ENV.ADMIN_BOOTSTRAP_SECRET!,
        Authorization: `Bearer ${adminJwt}`,
      },
      body: JSON.stringify({ email: 'owner@amancomputer.in', fullName: 'Aman Owner' }),
    }),
    adapter,
    BASE_ENV
  );
  assert.equal(bootRes.status, 201);

  const job1 = makeJob({
    job_number: 'AC-2001',
    created_at: '2026-11-25T08:00:00.000Z',
    submitted_at: '2026-11-25T08:00:00.000Z',
    completed_at: '2026-11-25T08:05:00.000Z',
    final_amount: 30,
  });
  const job2 = makeJob({
    job_number: 'AC-2002',
    created_at: '2026-11-25T09:00:00.000Z',
    submitted_at: '2026-11-25T09:00:00.000Z',
    completed_at: '2026-11-25T09:05:00.000Z',
    final_amount: 20,
  });
  sim.jobs.push(job1, job2);
  sim.payments.push(
    makePayment({
      job_id: job1.id,
      payment_method: 'upi',
      payment_status: 'paid',
      amount: 30,
      verified_at: '2026-11-25T08:02:00.000Z',
    }),
    makePayment({
      job_id: job2.id,
      payment_method: 'cash',
      payment_status: 'paid',
      amount: 20,
      verified_at: '2026-11-25T09:02:00.000Z',
    })
  );
  sim.events.push({
    id: crypto.randomUUID(),
    job_id: job1.id,
    actor_type: 'admin',
    actor_id: TEST_ADMIN_UID,
    event_type: 'custom_counter_check',
    previous_status: 'submitted',
    new_status: 'approved',
    metadata: { ok: true },
    created_at: '2026-11-25T09:03:00.000Z',
  });

  // Request with pageSize=1 to prove reconciliation sums ALL DB records, not just page 1
  const res = await handleAdminPrintJobs(
    new Request('https://edge.test/admin-print-jobs', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminJwt}`,
      },
      body: JSON.stringify({
        action: 'list',
        page: 1,
        pageSize: 1,
        reconciliationDate: '2026-11-25',
      }),
    }),
    adapter,
    BASE_ENV
  );
  assert.equal(res.status, 200);
  const body = (await res.json()) as {
    jobs: unknown[];
    pagination: { totalItems: number; totalPages: number };
    dailyReconciliation: ReturnType<typeof computeDailyFinancialReconciliation>;
    recentEvents: PrintEvent[];
  };
  assert.equal(body.jobs.length, 1);
  assert.equal(body.pagination.totalItems, 2);
  assert.equal(body.dailyReconciliation.dateIso, '2026-11-25');
  assert.equal(body.dailyReconciliation.confirmedTotalInr, 50);
  assert.equal(body.dailyReconciliation.upiConfirmedInr, 30);
  assert.equal(body.dailyReconciliation.cashConfirmedInr, 20);
  assert.ok(body.recentEvents.some((e) => e.event_type === 'custom_counter_check'));
});

test('[P12-04] Admin UI alignment: no dead multi-admin form, shift reconciliation & snapshot exports wired safely', () => {
  const root = process.cwd();
  const accessPage = fs.readFileSync(path.join(root, 'src', 'pages', 'AccessAuditPage.tsx'), 'utf8');
  assert.equal(
    accessPage.includes('Create Internal Admin Account'),
    false,
    'AccessAuditPage must not display dead multi-admin creation form'
  );
  assert.ok(
    accessPage.includes('Single Super Admin Security Policy Active'),
    'AccessAuditPage must surface singleton Super Admin security governance'
  );
  assert.ok(
    accessPage.includes('buildAuditEventsCsv'),
    'AccessAuditPage must support immutable Scan2Print audit CSV export'
  );

  const printPage = fs.readFileSync(path.join(root, 'src', 'pages', 'PrintManagementPage.tsx'), 'utf8');
  assert.ok(printPage.includes('Daily Shift Financial Closeout'));
  assert.ok(printPage.includes('buildJobsLedgerCsv'));
  assert.equal(/\bwindow\.(alert|open)\s*\(/.test(printPage), false);

  const settingsPage = fs.readFileSync(path.join(root, 'src', 'pages', 'SettingsPage.tsx'), 'utf8');
  assert.ok(settingsPage.includes('Scan2Print Live Cloud Snapshot'));
  assert.ok(settingsPage.includes('Export Scan2Print JSON'));

  const adminTypes = fs.readFileSync(path.join(root, 'src', 'types', 'admin.ts'), 'utf8');
  assert.ok(adminTypes.includes("'overview'") && adminTypes.includes("'payments'") && adminTypes.includes("'pilot'"));
});

test('[P12-05] Unified Express server serves Customer Portal under /quick-print without breaking security or Admin Firebase hosting', () => {
  const root = process.cwd();
  const serverTs = fs.readFileSync(path.join(root, 'server.ts'), 'utf8');
  assert.ok(serverTs.includes("customer-portal', 'vite.config.ts'"));
  assert.ok(serverTs.includes("base: '/quick-print/'"));
  assert.ok(serverTs.includes("dist-customer"));
  assert.ok(serverTs.includes('/quick-print/*'));
  assert.ok(serverTs.includes('secure: IS_PROD'));
  assert.ok(serverTs.includes('assertSafeExternalSourceUrl'));

  const rootFirebaseJson = JSON.parse(fs.readFileSync(path.join(root, 'firebase.json'), 'utf8'));
  assert.equal(rootFirebaseJson.hosting.public, 'dist');
});
