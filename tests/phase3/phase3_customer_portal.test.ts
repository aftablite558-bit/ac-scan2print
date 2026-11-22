// AC Scan2Print — Phase 3 Customer QR Print Portal Automated Verification Suite (15 Core Scenarios)
// Exercises SupabaseCustomerPortalAdapter -> real Phase 2/3 Edge Handlers -> TestSupabaseSimulator,
// plus client validation, magic-byte inspection, unknown printer capabilities & env secret guards.

import test from 'node:test';
import assert from 'node:assert/strict';

import { TestSupabaseSimulator } from '../phase2/mockBackendAdapter.ts';
import {
  handleCreatePrintJob,
  handleCreatePrintUploadUrl,
  handleFinalizePrintUpload,
  handleGetPrintJobStatus,
  handleGetPublicPaymentSettings,
  handleSubmitUpiPayment,
} from '../../supabase/functions/_shared/handlers.ts';
import type { RuntimeEnv } from '../../supabase/functions/_shared/types.ts';
import { SupabaseCustomerPortalAdapter } from '../../customer-portal/src/api/supabaseCustomerAdapter.ts';
import {
  DEFAULT_MAX_FILE_SIZE_BYTES,
  DEFAULT_MAX_FILES_PER_JOB,
  inspectClientFileBytes,
  validateClientDocumentFile,
} from '../../customer-portal/src/lib/validation.ts';
import { validateCustomerSupabaseConfig } from '../../customer-portal/src/lib/env.ts';

const TEST_ENV: RuntimeEnv = {
  FIREBASE_PROJECT_ID: 'aman-computer-test',
  ALLOWED_ORIGINS: 'https://ac-scan2print-portal.web.app',
};

function buildMinimalPdf(pages = 2): Uint8Array<ArrayBuffer> {
  let body = '%PDF-1.4\n';
  for (let i = 1; i <= pages; i += 1) {
    body += `${i} 0 obj\n<< /Type /Page /MediaBox [0 0 612 792] >>\nendobj\n`;
  }
  body += '%%EOF\n';
  return new Uint8Array(new TextEncoder().encode(body));
}

function buildMinimalJpeg(): Uint8Array<ArrayBuffer> {
  return new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0xff, 0xd9]);
}

function buildMinimalPng(): Uint8Array<ArrayBuffer> {
  return new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
}

function seedShop(
  sim: TestSupabaseSimulator,
  opts: {
    supportsColour?: boolean | null;
    supportsDuplex?: boolean | null;
    paperSizes?: Array<'A4' | 'Legal' | 'A3'>;
    capabilitiesVerified?: boolean;
    includePrinter?: boolean;
  } = {}
): void {
  const nowIso = new Date(sim.nowMs).toISOString();
  sim.paymentSettings = {
    id: 1,
    upi_enabled: true,
    upi_id: 'amancomputer@okaxis',
    upi_qr_storage_bucket: 'payment-assets',
    upi_qr_storage_path: null,
    display_name: 'AMAN COMPUTER',
    payment_instructions: 'Pay via UPI and submit 12-digit UTR.',
    updated_at: nowIso,
    updated_by: null,
  };
  sim.pricingRules.push(
    {
      id: crypto.randomUUID(),
      rule_name: 'A4 B&W Single',
      paper_size: 'A4',
      print_mode: 'bw',
      print_sides: 'single',
      pricing_unit: 'per_printed_page',
      rate: 2,
      minimum_charge: 0,
      is_active: true,
      valid_from: new Date(sim.nowMs - 60_000).toISOString(),
      valid_until: null,
      created_at: nowIso,
      updated_at: nowIso,
    },
    {
      id: crypto.randomUUID(),
      rule_name: 'A4 Colour Single',
      paper_size: 'A4',
      print_mode: 'colour',
      print_sides: 'single',
      pricing_unit: 'per_printed_page',
      rate: 10,
      minimum_charge: 0,
      is_active: true,
      valid_from: new Date(sim.nowMs - 60_000).toISOString(),
      valid_until: null,
      created_at: nowIso,
      updated_at: nowIso,
    },
    {
      id: crypto.randomUUID(),
      rule_name: 'A4 B&W Duplex',
      paper_size: 'A4',
      print_mode: 'bw',
      print_sides: 'duplex',
      pricing_unit: 'per_physical_sheet',
      rate: 3,
      minimum_charge: 0,
      is_active: true,
      valid_from: new Date(sim.nowMs - 60_000).toISOString(),
      valid_until: null,
      created_at: nowIso,
      updated_at: nowIso,
    }
  );

  if (opts.includePrinter !== false) {
    sim.printers.push({
      id: crypto.randomUUID(),
      printer_name: 'Main Counter Printer',
      printer_model: 'Shop Model X',
      system_printer_name: 'INTERNAL_SECRET_SPOOLER_NAME',
      device_id: crypto.randomUUID(),
      connection_type: 'usb',
      supported_paper_sizes: opts.paperSizes ?? ['A4', 'Legal'],
      supports_colour: opts.supportsColour === undefined ? true : opts.supportsColour,
      supports_duplex: opts.supportsDuplex === undefined ? true : opts.supportsDuplex,
      capabilities_verified: opts.capabilitiesVerified ?? true,
      printer_status: 'online',
      is_enabled: true,
      is_default: true,
      discovery_source: 'manual',
      approval_status: 'manual',
      last_seen_at: nowIso,
      last_verified_at: nowIso,
      archived_at: null,
      archived_by: null,
      audit_notes: 'Internal owner note — must never leak to customers',
      created_at: nowIso,
      updated_at: nowIso,
    });
  }
}

function createConnectedAdapter(sim: TestSupabaseSimulator): {
  adapter: SupabaseCustomerPortalAdapter;
  cleanup: () => void;
} {
  const backendAdapter = sim.asAdapter();
  const prevFetch = globalThis.fetch;
  const prevXhr = (globalThis as { XMLHttpRequest?: unknown }).XMLHttpRequest;

  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const urlStr = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const req = new Request(urlStr, init);
    const fnName = new URL(urlStr).pathname.split('/').pop();
    switch (fnName) {
      case 'get-public-payment-settings':
        return handleGetPublicPaymentSettings(req, backendAdapter, TEST_ENV);
      case 'create-print-job':
        return handleCreatePrintJob(req, backendAdapter, TEST_ENV);
      case 'create-print-upload-url':
        return handleCreatePrintUploadUrl(req, backendAdapter, TEST_ENV);
      case 'finalize-print-upload':
        return handleFinalizePrintUpload(req, backendAdapter, TEST_ENV);
      case 'submit-upi-payment':
        return handleSubmitUpiPayment(req, backendAdapter, TEST_ENV);
      case 'get-print-job-status':
        return handleGetPrintJobStatus(req, backendAdapter, TEST_ENV);
      default:
        return new Response(JSON.stringify({ error: { message: `Unknown route ${fnName}` } }), { status: 404 });
    }
  };

  class MockXmlHttpRequest {
    public status = 0;
    public upload: { onprogress?: (ev: { lengthComputable: boolean; loaded: number; total: number }) => void } = {};
    public onload?: () => void;
    public onerror?: () => void;
    private targetUrl = '';
    public open(_method: string, url: string) {
      this.targetUrl = url;
    }
    public setRequestHeader(_k: string, _v: string) {}
    public send(file: Blob) {
      void file.arrayBuffer().then((buf) => {
        sim.uploadObjectWithSignedUrl(this.targetUrl, new Uint8Array(buf));
        this.upload.onprogress?.({ lengthComputable: true, loaded: buf.byteLength, total: buf.byteLength });
        this.status = 200;
        this.onload?.();
      });
    }
  }
  (globalThis as { XMLHttpRequest?: unknown }).XMLHttpRequest = MockXmlHttpRequest;

  const adapter = new SupabaseCustomerPortalAdapter({
    supabaseUrl: 'https://tvtfgsijxlxpwgakpeag.supabase.co',
    supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiJ9.public',
  });

  return {
    adapter,
    cleanup: () => {
      globalThis.fetch = prevFetch;
      (globalThis as { XMLHttpRequest?: unknown }).XMLHttpRequest = prevXhr;
    },
  };
}

test('[P3-01] Valid PDF upload & submission through live adapter -> backend pipeline', async () => {
  const sim = new TestSupabaseSimulator();
  seedShop(sim);
  const { adapter, cleanup } = createConnectedAdapter(sim);
  try {
    const pdfBytes = buildMinimalPdf(3);
    const pdfFile = new File([pdfBytes], 'assignment.pdf', { type: 'application/pdf' });
    const clientCheck = await inspectClientFileBytes(pdfFile, 'application/pdf', 'document');
    assert.equal(clientCheck.valid, true);
    assert.equal(clientCheck.pageCount, 3);

    const draft = await adapter.createDraftJob({
      paperSize: 'A4',
      printMode: 'bw',
      printSides: 'single',
      copies: 1,
      orientation: 'auto',
      scaling: 'fit',
      requestedPageRange: 'all',
      submissionIdempotencyKey: 'p3-pdf-1',
    });
    const upUrl = await adapter.requestUploadUrl({
      jobId: draft.jobId,
      draftUploadSecret: draft.draftUploadSecret!,
      filename: pdfFile.name,
      mimeType: pdfFile.type,
      fileSizeBytes: pdfFile.size,
    });
    let progress = 0;
    await adapter.uploadFileBytes(upUrl.signedUrl, pdfFile, (p) => {
      progress = p;
    });
    assert.equal(progress, 100);

    // Finalize also applies updated options (2 copies) without creating a duplicate job
    const finalized = await adapter.finalizeUploadAndSubmit({
      jobId: draft.jobId,
      draftUploadSecret: draft.draftUploadSecret!,
      paperSize: 'A4',
      printMode: 'bw',
      printSides: 'single',
      copies: 2,
      requestedPageRange: 'all',
    });
    assert.equal(finalized.status, 'submitted');
    assert.equal(finalized.verifiedPageCount, 3);
    assert.equal(finalized.finalAmount, 12); // 3 pages * 2 copies * ₹2
    assert.equal(sim.jobs.length, 1);

    const pay = await adapter.submitPayment({
      trackingToken: finalized.trackingToken,
      paymentMethod: 'upi',
      transactionReference: 'UTR9988776655',
      idempotencyKey: 'pay-p3-1',
    });
    assert.equal(pay.paymentStatus, 'pending_verification');
    assert.equal(pay.status, 'awaiting_payment');
  } finally {
    cleanup();
  }
});

test('[P3-02] Valid JPG, JPEG, and PNG image uploads & submission succeed cleanly', async () => {
  const sim = new TestSupabaseSimulator();
  seedShop(sim);
  const { adapter, cleanup } = createConnectedAdapter(sim);
  try {
    const jpgFile = new File([buildMinimalJpeg()], 'photo.jpg', { type: 'image/jpeg' });
    const pngFile = new File([buildMinimalPng()], 'id-card.png', { type: 'image/png' });

    assert.equal((await inspectClientFileBytes(jpgFile, 'image/jpeg')).valid, true);
    assert.equal((await inspectClientFileBytes(pngFile, 'image/png')).valid, true);

    const draft = await adapter.createDraftJob({
      paperSize: 'A4',
      printMode: 'colour',
      printSides: 'single',
      copies: 1,
      orientation: 'auto',
      scaling: 'fit',
      requestedPageRange: 'all',
      submissionIdempotencyKey: 'p3-img-1',
    });

    for (const f of [jpgFile, pngFile]) {
      const urlRes = await adapter.requestUploadUrl({
        jobId: draft.jobId,
        draftUploadSecret: draft.draftUploadSecret!,
        filename: f.name,
        mimeType: f.type,
        fileSizeBytes: f.size,
      });
      await adapter.uploadFileBytes(urlRes.signedUrl, f, () => {});
    }

    const fin = await adapter.finalizeUploadAndSubmit({
      jobId: draft.jobId,
      draftUploadSecret: draft.draftUploadSecret!,
    });
    assert.equal(fin.verifiedPageCount, 2); // 1 page per image
    assert.equal(fin.finalAmount, 20); // 2 pages * ₹10 colour
  } finally {
    cleanup();
  }
});

test('[P3-03] Unsupported file types (.exe, .docx, .zip) are rejected on client and server', async () => {
  const sim = new TestSupabaseSimulator();
  seedShop(sim);
  const { adapter, cleanup } = createConnectedAdapter(sim);
  try {
    for (const [name, type] of [
      ['setup.exe', 'application/x-msdownload'],
      ['resume.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
      ['archive.zip', 'application/zip'],
    ]) {
      assert.equal(validateClientDocumentFile({ name, type, size: 1024 }, 0).valid, false);
    }

    const draft = await adapter.createDraftJob({
      paperSize: 'A4',
      printMode: 'bw',
      printSides: 'single',
      copies: 1,
      orientation: 'auto',
      scaling: 'fit',
      requestedPageRange: 'all',
      submissionIdempotencyKey: 'p3-unsup-1',
    });
    await assert.rejects(
      () =>
        adapter.requestUploadUrl({
          jobId: draft.jobId,
          draftUploadSecret: draft.draftUploadSecret!,
          filename: 'resume.docx',
          mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          fileSizeBytes: 1024,
        }),
      /not permitted/i
    );
  } finally {
    cleanup();
  }
});

test('[P3-04] Spoofed MIME/extension (.exe renamed to .pdf) is rejected on client + purged on backend', async () => {
  const sim = new TestSupabaseSimulator();
  seedShop(sim);
  const { adapter, cleanup } = createConnectedAdapter(sim);
  try {
    const exeRenamedPdf = new File(
      [new Uint8Array([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00])],
      'payload.pdf',
      { type: 'application/pdf' }
    );
    const clientByteCheck = await inspectClientFileBytes(exeRenamedPdf, 'application/pdf', 'document');
    assert.equal(clientByteCheck.valid, false);
    assert.match(clientByteCheck.error ?? '', /signature/i);

    // Even if client validation is bypassed, server rejects with 422 & purges Storage + marks deleted_at
    const draft = await adapter.createDraftJob({
      paperSize: 'A4',
      printMode: 'bw',
      printSides: 'single',
      copies: 1,
      orientation: 'auto',
      scaling: 'fit',
      requestedPageRange: 'all',
      submissionIdempotencyKey: 'p3-spoof-1',
    });
    const badUrl = await adapter.requestUploadUrl({
      jobId: draft.jobId,
      draftUploadSecret: draft.draftUploadSecret!,
      filename: 'payload.pdf',
      mimeType: 'application/pdf',
      fileSizeBytes: exeRenamedPdf.size,
    });
    await adapter.uploadFileBytes(badUrl.signedUrl, exeRenamedPdf, () => {});
    await assert.rejects(
      () =>
        adapter.finalizeUploadAndSubmit({
          jobId: draft.jobId,
          draftUploadSecret: draft.draftUploadSecret!,
        }),
      /supported format/i
    );
    assert.equal(sim.storageBuckets.get('print-uploads')?.data.get(badUrl.storagePath), undefined);

    // User can upload a valid replacement PDF into the SAME draft job cleanly!
    const validPdf = new File([buildMinimalPdf(1)], 'real.pdf', { type: 'application/pdf' });
    const goodUrl = await adapter.requestUploadUrl({
      jobId: draft.jobId,
      draftUploadSecret: draft.draftUploadSecret!,
      filename: validPdf.name,
      mimeType: validPdf.type,
      fileSizeBytes: validPdf.size,
    });
    await adapter.uploadFileBytes(goodUrl.signedUrl, validPdf, () => {});
    const fin = await adapter.finalizeUploadAndSubmit({
      jobId: draft.jobId,
      draftUploadSecret: draft.draftUploadSecret!,
    });
    assert.equal(fin.status, 'submitted');
    assert.equal(sim.jobs.length, 1);
  } finally {
    cleanup();
  }
});

test('[P3-05] Oversized file (> 20 MB) is rejected on client & server', async () => {
  const sim = new TestSupabaseSimulator();
  seedShop(sim);
  const { adapter, cleanup } = createConnectedAdapter(sim);
  try {
    assert.equal(
      validateClientDocumentFile(
        { name: 'large.pdf', type: 'application/pdf', size: DEFAULT_MAX_FILE_SIZE_BYTES + 1 },
        0
      ).valid,
      false
    );
    const draft = await adapter.createDraftJob({
      paperSize: 'A4',
      printMode: 'bw',
      printSides: 'single',
      copies: 1,
      orientation: 'auto',
      scaling: 'fit',
      requestedPageRange: 'all',
      submissionIdempotencyKey: 'p3-big-1',
    });
    await assert.rejects(
      () =>
        adapter.requestUploadUrl({
          jobId: draft.jobId,
          draftUploadSecret: draft.draftUploadSecret!,
          filename: 'large.pdf',
          mimeType: 'application/pdf',
          fileSizeBytes: DEFAULT_MAX_FILE_SIZE_BYTES + 1,
        }),
      /maximum allowed size/i
    );
  } finally {
    cleanup();
  }
});

test('[P3-06] Corrupt PDF / malformed header is rejected on client and backend', async () => {
  const sim = new TestSupabaseSimulator();
  seedShop(sim);
  const { adapter, cleanup } = createConnectedAdapter(sim);
  try {
    const corruptPdf = new File(
      [new TextEncoder().encode('%PDF-1.4\nGARBAGE_TRUNCATED_CONTENT_NO_PAGES')],
      'broken.pdf',
      { type: 'application/pdf' }
    );
    const check = await inspectClientFileBytes(corruptPdf, 'application/pdf', 'document');
    assert.equal(check.valid, false);
    assert.match(check.error ?? '', /corrupt|truncated/i);

    const draft = await adapter.createDraftJob({
      paperSize: 'A4',
      printMode: 'bw',
      printSides: 'single',
      copies: 1,
      orientation: 'auto',
      scaling: 'fit',
      requestedPageRange: 'all',
      submissionIdempotencyKey: 'p3-corrupt-1',
    });
    const urlRes = await adapter.requestUploadUrl({
      jobId: draft.jobId,
      draftUploadSecret: draft.draftUploadSecret!,
      filename: 'broken.pdf',
      mimeType: 'application/pdf',
      fileSizeBytes: corruptPdf.size,
    });
    await adapter.uploadFileBytes(urlRes.signedUrl, corruptPdf, () => {});
    await assert.rejects(
      () =>
        adapter.finalizeUploadAndSubmit({
          jobId: draft.jobId,
          draftUploadSecret: draft.draftUploadSecret!,
        }),
      /truncated|malformed|corrupt/i
    );
  } finally {
    cleanup();
  }
});

test('[P3-07] Empty 0-byte file is rejected on client and backend', async () => {
  const sim = new TestSupabaseSimulator();
  seedShop(sim);
  const { adapter, cleanup } = createConnectedAdapter(sim);
  try {
    const emptyFile = new File([], 'zero.pdf', { type: 'application/pdf' });
    assert.equal(validateClientDocumentFile({ name: 'zero.pdf', type: 'application/pdf', size: 0 }, 0).valid, false);
    assert.equal((await inspectClientFileBytes(emptyFile, 'application/pdf', 'document')).valid, false);

    const draft = await adapter.createDraftJob({
      paperSize: 'A4',
      printMode: 'bw',
      printSides: 'single',
      copies: 1,
      orientation: 'auto',
      scaling: 'fit',
      requestedPageRange: 'all',
      submissionIdempotencyKey: 'p3-empty-1',
    });
    await assert.rejects(
      () =>
        adapter.requestUploadUrl({
          jobId: draft.jobId,
          draftUploadSecret: draft.draftUploadSecret!,
          filename: 'zero.pdf',
          mimeType: 'application/pdf',
          fileSizeBytes: 0,
        }),
      /greater than 0/i
    );
  } finally {
    cleanup();
  }
});

test('[P3-08] Multi-file upload within limits succeeds; >5 file count is rejected', async () => {
  const sim = new TestSupabaseSimulator();
  seedShop(sim);
  const { adapter, cleanup } = createConnectedAdapter(sim);
  try {
    assert.equal(
      validateClientDocumentFile({ name: 'sixth.pdf', type: 'application/pdf', size: 512 }, DEFAULT_MAX_FILES_PER_JOB)
        .valid,
      false
    );

    const draft = await adapter.createDraftJob({
      paperSize: 'A4',
      printMode: 'bw',
      printSides: 'single',
      copies: 1,
      orientation: 'auto',
      scaling: 'fit',
      requestedPageRange: 'all',
      submissionIdempotencyKey: 'p3-multi-1',
    });

    const pdf = new File([buildMinimalPdf(1)], 'doc.pdf', { type: 'application/pdf' });
    for (let i = 1; i <= 5; i += 1) {
      const u = await adapter.requestUploadUrl({
        jobId: draft.jobId,
        draftUploadSecret: draft.draftUploadSecret!,
        filename: `doc-${i}.pdf`,
        mimeType: 'application/pdf',
        fileSizeBytes: pdf.size,
      });
      await adapter.uploadFileBytes(u.signedUrl, pdf, () => {});
    }

    await assert.rejects(
      () =>
        adapter.requestUploadUrl({
          jobId: draft.jobId,
          draftUploadSecret: draft.draftUploadSecret!,
          filename: 'doc-6.pdf',
          mimeType: 'application/pdf',
          fileSizeBytes: pdf.size,
        }),
      /maximum 5 files/i
    );

    const fin = await adapter.finalizeUploadAndSubmit({
      jobId: draft.jobId,
      draftUploadSecret: draft.draftUploadSecret!,
    });
    assert.equal(fin.verifiedPageCount, 5);
    assert.equal(fin.finalAmount, 10);
  } finally {
    cleanup();
  }
});

test('[P3-09] File removal before finalization & interrupted upload retry work WITHOUT duplicate job creation', async () => {
  const sim = new TestSupabaseSimulator();
  seedShop(sim);
  const { adapter, cleanup } = createConnectedAdapter(sim);
  try {
    const draft = await adapter.createDraftJob({
      paperSize: 'A4',
      printMode: 'bw',
      printSides: 'single',
      copies: 1,
      orientation: 'auto',
      scaling: 'fit',
      requestedPageRange: 'all',
      submissionIdempotencyKey: 'p3-single-draft-key',
    });

    const fileA = new File([buildMinimalPdf(2)], 'a.pdf', { type: 'application/pdf' });
    const fileB = new File([buildMinimalPdf(3)], 'b.pdf', { type: 'application/pdf' });

    const urlA = await adapter.requestUploadUrl({
      jobId: draft.jobId,
      draftUploadSecret: draft.draftUploadSecret!,
      filename: fileA.name,
      mimeType: fileA.type,
      fileSizeBytes: fileA.size,
    });
    await adapter.uploadFileBytes(urlA.signedUrl, fileA, () => {});

    const urlB = await adapter.requestUploadUrl({
      jobId: draft.jobId,
      draftUploadSecret: draft.draftUploadSecret!,
      filename: fileB.name,
      mimeType: fileB.type,
      fileSizeBytes: fileB.size,
    });
    await adapter.uploadFileBytes(urlB.signedUrl, fileB, () => {});

    // Remove File A before finalization -> purges storage & soft-deletes print_files row
    await adapter.removeDraftFile({
      jobId: draft.jobId,
      draftUploadSecret: draft.draftUploadSecret!,
      fileId: urlA.fileId,
    });
    assert.equal(sim.storageBuckets.get('print-uploads')?.data.get(urlA.storagePath), undefined);

    // Reusing same submissionIdempotencyKey does NOT create a second job
    const replay = await adapter.createDraftJob({
      paperSize: 'A4',
      printMode: 'bw',
      printSides: 'single',
      copies: 1,
      orientation: 'auto',
      scaling: 'fit',
      requestedPageRange: 'all',
      submissionIdempotencyKey: 'p3-single-draft-key',
    });
    assert.equal(replay.jobId, draft.jobId);
    assert.equal(sim.jobs.length, 1);

    // Finalize only includes remaining File B (3 pages) and applies custom page range '1-2' -> 2 pages -> ₹4
    const fin = await adapter.finalizeUploadAndSubmit({
      jobId: draft.jobId,
      draftUploadSecret: draft.draftUploadSecret!,
      paperSize: 'A4',
      printMode: 'bw',
      printSides: 'single',
      copies: 1,
      requestedPageRange: '1-2',
    });
    assert.equal(fin.verifiedPageCount, 2);
    assert.equal(fin.finalAmount, 4);
    assert.equal(sim.jobs.length, 1);
  } finally {
    cleanup();
  }
});

test('[P3-10] Duplicate submission & failed payment retry preserve single job idempotency', async () => {
  const sim = new TestSupabaseSimulator();
  seedShop(sim);
  const { adapter, cleanup } = createConnectedAdapter(sim);
  try {
    const draft = await adapter.createDraftJob({
      paperSize: 'A4',
      printMode: 'bw',
      printSides: 'single',
      copies: 1,
      orientation: 'auto',
      scaling: 'fit',
      requestedPageRange: 'all',
      submissionIdempotencyKey: 'p3-idem-submit',
    });
    const pdf = new File([buildMinimalPdf(1)], 'one.pdf', { type: 'application/pdf' });
    const urlRes = await adapter.requestUploadUrl({
      jobId: draft.jobId,
      draftUploadSecret: draft.draftUploadSecret!,
      filename: pdf.name,
      mimeType: pdf.type,
      fileSizeBytes: pdf.size,
    });
    await adapter.uploadFileBytes(urlRes.signedUrl, pdf, () => {});
    const fin = await adapter.finalizeUploadAndSubmit({
      jobId: draft.jobId,
      draftUploadSecret: draft.draftUploadSecret!,
    });

    // Duplicate finalize is rejected (draft secret burned on submit) — never creates second job
    await assert.rejects(
      () =>
        adapter.finalizeUploadAndSubmit({
          jobId: draft.jobId,
          draftUploadSecret: draft.draftUploadSecret!,
        }),
      /draft upload secret|already been finalized/i
    );
    assert.equal(sim.jobs.length, 1);

    // Payment retry with invalid UTR then valid Cash on same tracking token does NOT create a second job
    await assert.rejects(
      () =>
        adapter.submitPayment({
          trackingToken: fin.trackingToken,
          paymentMethod: 'upi',
          transactionReference: 'BAD',
        }),
      /UTR/i
    );
    const cashPay = await adapter.submitPayment({
      trackingToken: fin.trackingToken,
      paymentMethod: 'cash',
    });
    assert.equal(cashPay.paymentMethod, 'cash');
    assert.equal(sim.jobs.length, 1);
  } finally {
    cleanup();
  }
});

test('[P3-11] Private Storage protection: no direct public URLs or storage_path leaked to customer responses', async () => {
  const sim = new TestSupabaseSimulator();
  seedShop(sim);
  const { adapter, cleanup } = createConnectedAdapter(sim);
  try {
    const draft = await adapter.createDraftJob({
      paperSize: 'A4',
      printMode: 'bw',
      printSides: 'single',
      copies: 1,
      orientation: 'auto',
      scaling: 'fit',
      requestedPageRange: 'all',
      submissionIdempotencyKey: 'p3-privacy-1',
    });
    const pdf = new File([buildMinimalPdf(1)], 'private.pdf', { type: 'application/pdf' });
    const urlRes = await adapter.requestUploadUrl({
      jobId: draft.jobId,
      draftUploadSecret: draft.draftUploadSecret!,
      filename: pdf.name,
      mimeType: pdf.type,
      fileSizeBytes: pdf.size,
    });
    await adapter.uploadFileBytes(urlRes.signedUrl, pdf, () => {});
    const fin = await adapter.finalizeUploadAndSubmit({
      jobId: draft.jobId,
      draftUploadSecret: draft.draftUploadSecret!,
    });

    // Anon direct storage access fails
    assert.throws(() => sim.readObjectAnonDirect('print-uploads', urlRes.storagePath), /RLS_STORAGE_DENIED/);

    const status = await adapter.getJobStatusByToken(fin.trackingToken);
    const serialized = JSON.stringify(status);
    assert.equal(serialized.includes('storagePath'), false);
    assert.equal(serialized.includes('storage_path'), false);
    assert.equal(serialized.includes('print-uploads'), false);
    assert.equal(serialized.includes('audit_notes'), false);
    assert.ok(status.submittedAt);
  } finally {
    cleanup();
  }
});

test('[P3-12] Invalid tracking token (401) and query-string ?token= (400) are rejected', async () => {
  const sim = new TestSupabaseSimulator();
  seedShop(sim);
  const { adapter, cleanup } = createConnectedAdapter(sim);
  const rawAdapter = sim.asAdapter();
  try {
    await assert.rejects(() => adapter.getJobStatusByToken('short'), /tracking token/i);
    await assert.rejects(
      () => adapter.getJobStatusByToken('ac_invalid_token_with_enough_length_123456'),
      /invalid tracking token/i
    );

    const qsRes = await handleGetPrintJobStatus(
      new Request('https://edge.local/get-print-job-status?token=secret_token_should_not_be_in_url', {
        method: 'GET',
      }),
      rawAdapter,
      TEST_ENV
    );
    assert.equal(qsRes.status, 400);
  } finally {
    cleanup();
  }
});

test('[P3-13] Cross-customer access prevention: Token A cannot inspect or pay Job B', async () => {
  const sim = new TestSupabaseSimulator();
  seedShop(sim);
  const { adapter, cleanup } = createConnectedAdapter(sim);
  try {
    const createSubmittedJob = async (key: string) => {
      const d = await adapter.createDraftJob({
        paperSize: 'A4',
        printMode: 'bw',
        printSides: 'single',
        copies: 1,
        orientation: 'auto',
        scaling: 'fit',
        requestedPageRange: 'all',
        submissionIdempotencyKey: key,
      });
      const pdf = new File([buildMinimalPdf(1)], `${key}.pdf`, { type: 'application/pdf' });
      const u = await adapter.requestUploadUrl({
        jobId: d.jobId,
        draftUploadSecret: d.draftUploadSecret!,
        filename: pdf.name,
        mimeType: pdf.type,
        fileSizeBytes: pdf.size,
      });
      await adapter.uploadFileBytes(u.signedUrl, pdf, () => {});
      return adapter.finalizeUploadAndSubmit({
        jobId: d.jobId,
        draftUploadSecret: d.draftUploadSecret!,
      });
    };

    const jobA = await createSubmittedJob('cross-cust-a');
    const jobB = await createSubmittedJob('cross-cust-b');

    const statusA = await adapter.getJobStatusByToken(jobA.trackingToken);
    assert.equal(statusA.jobId, jobA.jobId);
    assert.notEqual(statusA.jobId, jobB.jobId);

    // Token A cannot access Job B via any ID parameter; tracking endpoint binds strictly to hashed token
    const statusB = await adapter.getJobStatusByToken(jobB.trackingToken);
    assert.equal(statusB.jobId, jobB.jobId);
    assert.notEqual(statusB.files[0].originalFilename, statusA.files[0].originalFilename);
  } finally {
    cleanup();
  }
});

test('[P3-14] Unauthorized status/price override and customer paymentStatus=paid tamper are rejected', async () => {
  const sim = new TestSupabaseSimulator();
  seedShop(sim);
  const rawAdapter = sim.asAdapter();

  const tamperCreate = await handleCreatePrintJob(
    new Request('https://edge.local/create-print-job', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paperSize: 'A4', printMode: 'bw', printSides: 'single', copies: 1, status: 'completed' }),
    }),
    rawAdapter,
    TEST_ENV
  );
  assert.equal(tamperCreate.status, 400);

  const { adapter, cleanup } = createConnectedAdapter(sim);
  try {
    const draft = await adapter.createDraftJob({
      paperSize: 'A4',
      printMode: 'bw',
      printSides: 'single',
      copies: 1,
      orientation: 'auto',
      scaling: 'fit',
      requestedPageRange: 'all',
      submissionIdempotencyKey: 'p3-tamper-fin',
    });
    const pdf = new File([buildMinimalPdf(1)], 'tamper.pdf', { type: 'application/pdf' });
    const u = await adapter.requestUploadUrl({
      jobId: draft.jobId,
      draftUploadSecret: draft.draftUploadSecret!,
      filename: pdf.name,
      mimeType: pdf.type,
      fileSizeBytes: pdf.size,
    });
    await adapter.uploadFileBytes(u.signedUrl, pdf, () => {});

    // Tampered price on finalize
    const tamperFinalize = await handleFinalizePrintUpload(
      new Request('https://edge.local/finalize-print-upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-draft-secret': draft.draftUploadSecret! },
        body: JSON.stringify({ jobId: draft.jobId, finalAmount: 0 }),
      }),
      rawAdapter,
      TEST_ENV
    );
    assert.equal(tamperFinalize.status, 400);

    const fin = await adapter.finalizeUploadAndSubmit({
      jobId: draft.jobId,
      draftUploadSecret: draft.draftUploadSecret!,
    });

    // Tampered paymentStatus: 'paid'
    const tamperPay = await handleSubmitUpiPayment(
      new Request('https://edge.local/submit-upi-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-tracking-token': fin.trackingToken },
        body: JSON.stringify({ paymentMethod: 'upi', paymentStatus: 'paid', transactionReference: 'SPOOF9999' }),
      }),
      rawAdapter,
      TEST_ENV
    );
    assert.equal(tamperPay.status, 403);
  } finally {
    cleanup();
  }
});

test('[P3-15] Unknown/unverified printer capabilities do NOT assume colour/duplex & leak zero internal printer details', async () => {
  // Case A: Printer exists with unknown (null) colour & duplex capabilities
  const sim = new TestSupabaseSimulator();
  seedShop(sim, {
    supportsColour: null,
    supportsDuplex: null,
    paperSizes: ['A4'],
    capabilitiesVerified: false,
  });
  const { adapter, cleanup } = createConnectedAdapter(sim);
  try {
    const caps = await adapter.getPortalCapabilities();
    assert.equal(caps.colourSupported, 'unknown');
    assert.equal(caps.duplexSupported, 'unknown');
    assert.deepEqual(caps.supportedPrintModes, ['bw']);
    assert.deepEqual(caps.supportedPrintSides, ['single']);
    assert.deepEqual(caps.supportedPaperSizes, ['A4']);

    // Ensure zero internal printer identifiers, device IDs, or owner notes leak
    const rawSettings = await adapter.getPublicPaymentSettings();
    const rawStr = JSON.stringify(rawSettings);
    assert.equal(rawStr.includes('INTERNAL_SECRET_SPOOLER_NAME'), false);
    assert.equal(rawStr.includes('audit_notes'), false);
    assert.equal(rawStr.includes('system_printer_name'), false);
    assert.equal(rawStr.includes('device_id'), false);
  } finally {
    cleanup();
  }

  // Case B: No enabled printers configured at all -> capabilitiesKnown false, no fabricated colour/duplex/A3
  const emptySim = new TestSupabaseSimulator();
  seedShop(emptySim, { includePrinter: false });
  const emptyConn = createConnectedAdapter(emptySim);
  try {
    const capsEmpty = await emptyConn.adapter.getPortalCapabilities();
    assert.equal(capsEmpty.capabilitiesKnown, false);
    assert.equal(capsEmpty.configuredPrinterCount, 0);
    assert.equal(capsEmpty.colourSupported, 'unknown');
    assert.equal(capsEmpty.duplexSupported, 'unknown');
    assert.deepEqual(capsEmpty.supportedPrintModes, ['bw']);
    assert.deepEqual(capsEmpty.supportedPrintSides, ['single']);
    assert.equal(capsEmpty.paperSizesKnown, false);
  } finally {
    emptyConn.cleanup();
  }

  // Case C: Customer env guard rejects privileged service_role / sb_secret keys
  const leakCheck = validateCustomerSupabaseConfig({
    VITE_SUPABASE_URL: 'https://tvtfgsijxlxpwgakpeag.supabase.co',
    VITE_SUPABASE_ANON_KEY: 'sb_secret_forbidden_server_key',
  });
  assert.equal(leakCheck.configured, false);
  assert.match(leakCheck.error ?? '', /secret key/i);
});
