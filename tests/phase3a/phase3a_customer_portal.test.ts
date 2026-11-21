import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  DEFAULT_MAX_FILE_SIZE_BYTES,
  DEFAULT_MAX_FILES_PER_JOB,
  formatFileSize,
  parseCustomPageRange,
  validateClientDocumentFile,
  validateClientEvidenceFile,
  validateOptionalPhone,
  validateUtrInput,
} from '../../customer-portal/src/lib/validation';
import {
  buildCustomerTrackingTimeline,
  calculateEstimateBreakdown,
  calculatePhysicalSheets,
  formatInr,
  getCustomerSafeStatusMeta,
  parseCustomerRoute,
} from '../../customer-portal/src/lib/pricing';
import { MockCustomerPortalAdapter } from '../../customer-portal/src/api/mockCustomerAdapter';
import type { PricingRulePublic } from '../../customer-portal/src/types/portal';

test('validateClientDocumentFile accepts valid PDF, JPG, JPEG, PNG and rejects invalid inputs', () => {
  const validPdf = validateClientDocumentFile(
    { name: 'notes.pdf', type: 'application/pdf', size: 1024 },
    0
  );
  assert.equal(validPdf.valid, true);
  assert.equal(validPdf.normalizedMime, 'application/pdf');
  assert.equal(validPdf.extension, 'pdf');

  const validJpg = validateClientDocumentFile(
    { name: 'scan.JPG', type: 'image/jpg', size: 2048 },
    1
  );
  assert.equal(validJpg.valid, true);
  assert.equal(validJpg.normalizedMime, 'image/jpeg');

  const exeRejected = validateClientDocumentFile(
    { name: 'malware.exe', type: 'application/x-msdownload', size: 500 },
    0
  );
  assert.equal(exeRejected.valid, false);

  const docxRejected = validateClientDocumentFile(
    { name: 'resume.docx', type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', size: 500 },
    0
  );
  assert.equal(docxRejected.valid, false);

  const spoofedMimeRejected = validateClientDocumentFile(
    { name: 'document.pdf', type: 'image/png', size: 500 },
    0
  );
  assert.equal(spoofedMimeRejected.valid, false);

  const zeroByteRejected = validateClientDocumentFile(
    { name: 'empty.pdf', type: 'application/pdf', size: 0 },
    0
  );
  assert.equal(zeroByteRejected.valid, false);

  const oversizedRejected = validateClientDocumentFile(
    { name: 'huge.pdf', type: 'application/pdf', size: DEFAULT_MAX_FILE_SIZE_BYTES + 1 },
    0
  );
  assert.equal(oversizedRejected.valid, false);

  const maxFilesRejected = validateClientDocumentFile(
    { name: 'sixth.png', type: 'image/png', size: 500 },
    DEFAULT_MAX_FILES_PER_JOB
  );
  assert.equal(maxFilesRejected.valid, false);

  const traversalRejected = validateClientDocumentFile(
    { name: '../secret.pdf', type: 'application/pdf', size: 500 },
    0
  );
  assert.equal(traversalRejected.valid, false);
});

test('validateClientEvidenceFile enforces screenshot formats and size caps', () => {
  assert.equal(
    validateClientEvidenceFile({ name: 'upi.webp', type: 'image/webp', size: 4096 }).valid,
    true
  );
  assert.equal(
    validateClientEvidenceFile({ name: 'receipt.pdf', type: 'application/pdf', size: 4096 }).valid,
    false
  );
  assert.equal(
    validateClientEvidenceFile({ name: 'zero.png', type: 'image/png', size: 0 }).valid,
    false
  );
  assert.equal(formatFileSize(1536), '1.5 KB');
  assert.equal(formatFileSize(2 * 1024 * 1024), '2.00 MB');
});

test('parseCustomPageRange, validateUtrInput, and validateOptionalPhone handle valid and invalid values', () => {
  assert.deepEqual(parseCustomPageRange('all', 8), {
    valid: true,
    selectedPageCount: 8,
    normalized: 'all',
    error: null,
  });

  const customValid = parseCustomPageRange('1-3, 5', 8);
  assert.equal(customValid.valid, true);
  assert.equal(customValid.selectedPageCount, 4);

  const outOfRange = parseCustomPageRange('1-10', 8);
  assert.equal(outOfRange.valid, false);

  const invertedRange = parseCustomPageRange('5-2', 8);
  assert.equal(invertedRange.valid, false);

  assert.deepEqual(validateUtrInput('  utr432198765432 '), {
    valid: true,
    normalized: 'UTR432198765432',
    error: null,
  });
  assert.equal(validateUtrInput('123').valid, false);
  assert.equal(validateUtrInput('UTR WITH SPACE').valid, false);

  assert.equal(validateOptionalPhone('').valid, true);
  assert.equal(validateOptionalPhone('+91 98765 43210').valid, true);
  assert.equal(validateOptionalPhone('abc').valid, false);
});

test('calculatePhysicalSheets and calculateEstimateBreakdown mirror Phase 2 pricing rules without inventing totals', () => {
  assert.equal(calculatePhysicalSheets(5, 'single'), 5);
  assert.equal(calculatePhysicalSheets(5, 'duplex'), 3);
  assert.equal(calculatePhysicalSheets(4, 'duplex'), 2);

  const rules: PricingRulePublic[] = [
    {
      id: 'r1',
      ruleName: 'A4 B&W Single',
      paperSize: 'A4',
      printMode: 'bw',
      printSides: 'single',
      pricingUnit: 'per_printed_page',
      rate: 2,
      minimumCharge: 10,
      isMockSample: true,
    },
    {
      id: 'r2',
      ruleName: 'A4 B&W Duplex',
      paperSize: 'A4',
      printMode: 'bw',
      printSides: 'duplex',
      pricingUnit: 'per_physical_sheet',
      rate: 3,
      minimumCharge: 0,
      isMockSample: true,
    },
  ];

  // 3 pages * 1 copy = ₹6 subtotal -> minimum charge ₹10 applies
  const minApplied = calculateEstimateBreakdown({
    pagesPerCopy: 3,
    copies: 1,
    paperSize: 'A4',
    printMode: 'bw',
    printSides: 'single',
    rules,
  });
  assert.equal(minApplied.pricingConfigured, true);
  assert.equal(minApplied.subtotal, 6);
  assert.equal(minApplied.minimumApplied, true);
  assert.equal(minApplied.finalEstimatedAmount, 10);

  // Duplex per_physical_sheet: 5 pages -> 3 physical sheets * 2 copies = 6 sheets * ₹3 = ₹18
  const duplexEstimate = calculateEstimateBreakdown({
    pagesPerCopy: 5,
    copies: 2,
    paperSize: 'A4',
    printMode: 'bw',
    printSides: 'duplex',
    rules,
  });
  assert.equal(duplexEstimate.printedPagesTotal, 10);
  assert.equal(duplexEstimate.physicalSheetsTotal, 6);
  assert.equal(duplexEstimate.finalEstimatedAmount, 18);

  // Unconfigured combination must NOT invent fake currency
  const unconfigured = calculateEstimateBreakdown({
    pagesPerCopy: 4,
    copies: 1,
    paperSize: 'A3',
    printMode: 'colour',
    printSides: 'single',
    rules,
  });
  assert.equal(unconfigured.pricingConfigured, false);
  assert.equal(unconfigured.finalEstimatedAmount, null);
  assert.equal(formatInr(unconfigured.finalEstimatedAmount), 'Counter quote pending');
});

test('parseCustomerRoute, getCustomerSafeStatusMeta, and buildCustomerTrackingTimeline enforce safe wording', () => {
  assert.equal(parseCustomerRoute('/'), '/quick-print');
  assert.equal(parseCustomerRoute('/quick-print/'), '/quick-print');
  assert.equal(parseCustomerRoute('/quick-print/upload'), '/quick-print/upload');
  assert.equal(parseCustomerRoute('/quick-print/options'), '/quick-print/options');
  assert.equal(parseCustomerRoute('/quick-print/success'), '/quick-print/success');
  assert.equal(parseCustomerRoute('/quick-print/track'), '/quick-print/track');
  assert.equal(parseCustomerRoute('/quick-print/help'), '/quick-print/help');
  assert.equal(parseCustomerRoute('/unknown'), '/quick-print');

  const spoolerMeta = getCustomerSafeStatusMeta('submitted_to_spooler', 'paid', 'upi');
  assert.doesNotMatch(spoolerMeta.label, /printed successfully/i);
  assert.match(spoolerMeta.description, /verifying physical output/i);

  const reviewMeta = getCustomerSafeStatusMeta('needs_review', 'paid', 'upi');
  assert.equal(reviewMeta.tone, 'warn');
  assert.match(reviewMeta.description, /counter staff are checking/i);

  const timelineCompleted = buildCustomerTrackingTimeline('completed', 'paid', 'upi');
  assert.equal(timelineCompleted.length, 6);
  assert.equal(timelineCompleted.every((s) => s.state === 'done'), true);

  const timelineFailed = buildCustomerTrackingTimeline('rejected', 'unpaid', 'cash');
  assert.equal(timelineFailed[1].state, 'issue');
});

test('MockCustomerPortalAdapter executes full upload -> finalize -> UPI/Cash -> track flow securely', async () => {
  const adapter = new MockCustomerPortalAdapter();
  const caps = await adapter.getPortalCapabilities();
  assert.equal(caps.maxFilesPerJob, 5);
  assert.ok(caps.pricingRules.length >= 4);

  const payCfg = await adapter.getPublicPaymentSettings();
  assert.equal(payCfg.upiEnabled, true);
  assert.equal(payCfg.isMockMode, true);

  const draft1 = await adapter.createDraftJob({
    paperSize: 'A4',
    printMode: 'bw',
    printSides: 'single',
    copies: 2,
    orientation: 'auto',
    scaling: 'fit',
    requestedPageRange: 'all',
    submissionIdempotencyKey: 'idem-key-1',
  });
  const replayDraft = await adapter.createDraftJob({
    paperSize: 'A4',
    printMode: 'bw',
    printSides: 'single',
    copies: 2,
    orientation: 'auto',
    scaling: 'fit',
    requestedPageRange: 'all',
    submissionIdempotencyKey: 'idem-key-1',
  });
  assert.equal(replayDraft.jobId, draft1.jobId);
  assert.equal(replayDraft.idempotentReplay, true);

  const pdfBytes = new Uint8Array(
    Buffer.from('%PDF-1.4\n1 0 obj<< /Type /Page >>endobj\n2 0 obj<< /Type /Page >>endobj\n%%EOF')
  );
  const samplePdf = new File([pdfBytes], 'handout.pdf', { type: 'application/pdf' });

  const uploadUrlRes = await adapter.requestUploadUrl({
    jobId: draft1.jobId,
    draftUploadSecret: draft1.draftUploadSecret!,
    filename: samplePdf.name,
    mimeType: samplePdf.type,
    fileSizeBytes: samplePdf.size,
  });
  assert.ok(uploadUrlRes.signedUrl.startsWith('mock://upload/'));

  let lastPct = 0;
  await adapter.uploadFileBytes(uploadUrlRes.signedUrl, samplePdf, (pct) => {
    lastPct = pct;
  });
  assert.equal(lastPct, 100);

  const finalized = await adapter.finalizeUploadAndSubmit({
    jobId: draft1.jobId,
    draftUploadSecret: draft1.draftUploadSecret!,
  });
  assert.equal(finalized.status, 'submitted');
  assert.equal(finalized.verifiedPageCount, 4); // 2 detected PDF pages * 2 copies
  assert.equal(finalized.finalAmount, 8);
  assert.ok(finalized.trackingToken.startsWith('ac_track_'));

  const paymentRes = await adapter.submitPayment({
    trackingToken: finalized.trackingToken,
    paymentMethod: 'upi',
    transactionReference: '432198765432',
    idempotencyKey: 'pay-idem-1',
  });
  // Strict guarantee: mock payment MUST remain pending_verification, never auto-paid
  assert.equal(paymentRes.paymentStatus, 'pending_verification');

  await assert.rejects(
    () =>
      adapter.submitPayment({
        trackingToken: finalized.trackingToken,
        paymentMethod: 'upi',
        transactionReference: '432198765432',
        idempotencyKey: 'pay-idem-2',
      }),
    /already been submitted/i
  );

  const tracked = await adapter.getJobStatusByToken(finalized.trackingToken);
  assert.equal(tracked.jobNumber, finalized.jobNumber);
  assert.equal(tracked.paymentStatus, 'pending_verification');
  assert.equal('storagePath' in tracked.files[0], false);

  await assert.rejects(() => adapter.getJobStatusByToken('short'), /valid/i);
  await assert.rejects(
    () => adapter.getJobStatusByToken('ac_track_nonexistent_token_value'),
    /no print job found/i
  );

  // Custom page range '1' on a 2-page colour PDF with 2 copies should price 2 printed pages (₹20), not 4 (₹40)
  const customDraft = await adapter.createDraftJob({
    paperSize: 'A4',
    printMode: 'colour',
    printSides: 'single',
    copies: 2,
    orientation: 'auto',
    scaling: 'fit',
    requestedPageRange: '1',
    submissionIdempotencyKey: 'idem-custom-range-1',
  });
  const customUrl = await adapter.requestUploadUrl({
    jobId: customDraft.jobId,
    draftUploadSecret: customDraft.draftUploadSecret!,
    filename: samplePdf.name,
    mimeType: samplePdf.type,
    fileSizeBytes: samplePdf.size,
  });
  await adapter.uploadFileBytes(customUrl.signedUrl, samplePdf, () => {});
  const customFinalized = await adapter.finalizeUploadAndSubmit({
    jobId: customDraft.jobId,
    draftUploadSecret: customDraft.draftUploadSecret!,
  });
  assert.equal(customFinalized.verifiedPageCount, 2);
  assert.equal(customFinalized.finalAmount, 20);
});

test('Phase 3A isolation boundary keeps Admin Dashboard and Phase 2 backend untouched', () => {
  const portalFiles: string[] = [];
  function walk(dir: string) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(ts|tsx)$/.test(entry.name)) portalFiles.push(full);
    }
  }
  walk(path.resolve('customer-portal/src'));
  assert.ok(portalFiles.length >= 10);

  for (const filePath of portalFiles) {
    const content = fs.readFileSync(filePath, 'utf8');
    assert.equal(
      /from ['"](\.\.\/)+src\//.test(content),
      false,
      `Customer portal file ${filePath} must not import Admin Dashboard modules`
    );
  }

  const adminApp = fs.readFileSync(path.resolve('src/App.tsx'), 'utf8');
  assert.equal(/customer-portal|MockCustomerPortalAdapter/.test(adminApp), false);
});
