// AC Scan2Print — Isolated Phase 3A Development Mock Adapter
// Clearly identified mock data; enforces Phase 2 validation, idempotency, and never fabricates verified payments or completed physical prints.

import { calculateEstimateBreakdown } from '../lib/pricing';
import {
  DEFAULT_MAX_FILE_SIZE_BYTES,
  DEFAULT_MAX_FILES_PER_JOB,
  DOCUMENT_EXTENSION_TO_MIME,
  estimateDocumentPageCountFromFile,
  inspectClientFileBytes,
  parseCustomPageRange,
  validateClientDocumentFile,
  validateClientEvidenceFile,
  validateUtrInput,
} from '../lib/validation';
import type {
  CustomerJobStatusResponse,
  JobStatus,
  PaymentMethod,
  PaymentStatus,
  PortalCapabilities,
  PublicPaymentSettingsResponse,
} from '../types/portal';
import type {
  CreateDraftJobRequest,
  CreateDraftJobResponse,
  CreateUploadUrlRequest,
  CreateUploadUrlResponse,
  CustomerPortalApiAdapter,
  FinalizePrintUploadRequest,
  FinalizePrintUploadResponse,
  PrepareEvidenceUploadResponse,
  RemoveDraftFileRequest,
  SubmitPaymentRequest,
  SubmitPaymentResponse,
} from './CustomerPortalAdapter';

const MOCK_STORAGE_KEY = 'ac-scan2print-phase3a-mock-jobs-v1';

interface MockStoredJob {
  jobId: string;
  jobNumber: string;
  draftUploadSecret: string;
  trackingToken: string | null;
  idempotencyKey: string;
  req: CreateDraftJobRequest;
  status: JobStatus;
  paymentStatus: PaymentStatus;
  paymentMethod: PaymentMethod | null;
  files: Array<{
    id: string;
    originalFilename: string;
    fileSizeBytes: number;
    detectedPageCount: number;
    uploaded: boolean;
  }>;
  verifiedPageCount: number | null;
  physicalSheetCount: number | null;
  subtotal: number | null;
  finalAmount: number | null;
  submittedAt: string | null;
  payment: {
    id: string;
    method: PaymentMethod;
    status: PaymentStatus;
    amount: number;
    utr: string | null;
    submittedAt: string;
  } | null;
}

const DEFAULT_MOCK_CAPABILITIES: PortalCapabilities = {
  maxFilesPerJob: DEFAULT_MAX_FILES_PER_JOB,
  maxFileSizeBytes: DEFAULT_MAX_FILE_SIZE_BYTES,
  maxCopies: 20,
  draftRetentionHours: 1,
  completedRetentionHours: 24,
  allowedExtensions: ['PDF', 'JPG', 'JPEG', 'PNG'],
  supportedPaperSizes: ['A4', 'Legal', 'A3'],
  supportedPrintModes: ['bw', 'colour'],
  supportedPrintSides: ['single', 'duplex'],
  supportedOrientations: ['auto', 'portrait', 'landscape'],
  supportedScalingModes: ['fit', 'actual'],
  capabilitiesKnown: true,
  configuredPrinterCount: 1,
  verifiedPrinterCount: 1,
  colourSupported: 'yes',
  duplexSupported: 'yes',
  paperSizesKnown: true,
  retentionNotice:
    'Documents remain encrypted in private storage during processing and are scheduled for automatic cleanup within 24 hours after completion.',
  shopName: 'AMAN COMPUTER',
  shopHours: 'Mon–Sat · 9:30 AM–8:00 PM',
  shopContactPhone: 'Counter assistance available in-store',
  shopAddress: 'Aman Computer Smart Print Counter',
  pricingRules: [
    {
      id: 'mock-a4-bw-single',
      ruleName: 'A4 B&W Single (Sample Rule)',
      paperSize: 'A4',
      printMode: 'bw',
      printSides: 'single',
      pricingUnit: 'per_printed_page',
      rate: 2,
      minimumCharge: 0,
      isMockSample: true,
    },
    {
      id: 'mock-a4-bw-duplex',
      ruleName: 'A4 B&W Duplex (Sample Rule)',
      paperSize: 'A4',
      printMode: 'bw',
      printSides: 'duplex',
      pricingUnit: 'per_physical_sheet',
      rate: 3,
      minimumCharge: 0,
      isMockSample: true,
    },
    {
      id: 'mock-a4-colour-single',
      ruleName: 'A4 Colour Single (Sample Rule)',
      paperSize: 'A4',
      printMode: 'colour',
      printSides: 'single',
      pricingUnit: 'per_printed_page',
      rate: 10,
      minimumCharge: 0,
      isMockSample: true,
    },
    {
      id: 'mock-a4-colour-duplex',
      ruleName: 'A4 Colour Duplex (Sample Rule)',
      paperSize: 'A4',
      printMode: 'colour',
      printSides: 'duplex',
      pricingUnit: 'per_physical_sheet',
      rate: 18,
      minimumCharge: 0,
      isMockSample: true,
    },
    {
      id: 'mock-legal-bw-single',
      ruleName: 'Legal B&W Single (Sample Rule)',
      paperSize: 'Legal',
      printMode: 'bw',
      printSides: 'single',
      pricingUnit: 'per_printed_page',
      rate: 3,
      minimumCharge: 0,
      isMockSample: true,
    },
  ],
};

function randomTokenHex(bytes = 16): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join('');
}

function generateMockJobNumber(): string {
  const d = new Date();
  const y = String(d.getUTCFullYear()).slice(-2);
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  const suffix = randomTokenHex(3).toUpperCase();
  return `AC${y}${m}${day}-${suffix}`;
}

export class MockCustomerPortalAdapter implements CustomerPortalApiAdapter {
  public readonly isMockMode = true;
  private jobs = new Map<string, MockStoredJob>();
  private idempotencyIndex = new Map<string, string>();
  private trackingIndex = new Map<string, string>();
  private usedUtrs = new Set<string>();
  private uploadedFileBlobs = new Map<string, File>();

  constructor() {
    this.hydrateFromSessionStorage();
  }

  private hydrateFromSessionStorage(): void {
    if (typeof window === 'undefined' || !window.sessionStorage) return;
    try {
      const raw = window.sessionStorage.getItem(MOCK_STORAGE_KEY);
      if (!raw) return;
      const list = JSON.parse(raw) as MockStoredJob[];
      for (const job of list) {
        this.jobs.set(job.jobId, job);
        if (job.idempotencyKey) this.idempotencyIndex.set(job.idempotencyKey, job.jobId);
        if (job.trackingToken) this.trackingIndex.set(job.trackingToken, job.jobId);
        if (job.payment?.utr) this.usedUtrs.add(job.payment.utr);
      }
    } catch {
      // Ignore corrupt browser sessionStorage
    }
  }

  private persistToSessionStorage(): void {
    if (typeof window === 'undefined' || !window.sessionStorage) return;
    try {
      window.sessionStorage.setItem(MOCK_STORAGE_KEY, JSON.stringify([...this.jobs.values()]));
    } catch {
      // Ignore quota errors
    }
  }

  public async getPortalCapabilities(): Promise<PortalCapabilities> {
    return DEFAULT_MOCK_CAPABILITIES;
  }

  public async getPublicPaymentSettings(): Promise<PublicPaymentSettingsResponse> {
    // SVG Data URI placeholder QR strictly labeled for Phase 3A UI development preview (no real UPI account)
    const sampleQrSvg = encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 180 180" width="180" height="180">
        <rect width="180" height="180" fill="#ffffff"/>
        <rect x="14" y="14" width="44" height="44" fill="#111318"/><rect x="22" y="22" width="28" height="28" fill="#ffffff"/><rect x="28" y="28" width="16" height="16" fill="#111318"/>
        <rect x="122" y="14" width="44" height="44" fill="#111318"/><rect x="130" y="22" width="28" height="28" fill="#ffffff"/><rect x="136" y="28" width="16" height="16" fill="#111318"/>
        <rect x="14" y="122" width="44" height="44" fill="#111318"/><rect x="22" y="130" width="28" height="28" fill="#ffffff"/><rect x="28" y="136" width="16" height="16" fill="#111318"/>
        <rect x="70" y="70" width="40" height="40" rx="6" fill="#25C7D9"/>
        <text x="90" y="94" font-family="sans-serif" font-size="11" font-weight="700" text-anchor="middle" fill="#111318">MOCK QR</text>
      </svg>`
    );

    return {
      upiEnabled: true,
      upiId: 'amancomputer-dev-sample@upi',
      upiQrSignedUrl: `data:image/svg+xml;utf8,${sampleQrSvg}`,
      displayName: 'AMAN COMPUTER (Preview Mode)',
      paymentInstructions:
        'Development preview only — live shop mode displays the official UPI QR configured by Aman Computer Admin.',
      cashEnabled: true,
      isMockMode: true,
    };
  }

  public async createDraftJob(req: CreateDraftJobRequest): Promise<CreateDraftJobResponse> {
    const existingId = this.idempotencyIndex.get(req.submissionIdempotencyKey);
    if (existingId && this.jobs.has(existingId)) {
      const existing = this.jobs.get(existingId)!;
      return {
        jobId: existing.jobId,
        jobNumber: existing.jobNumber,
        status: existing.status,
        draftUploadSecret: existing.draftUploadSecret,
        idempotentReplay: true,
      };
    }

    const jobId = crypto.randomUUID();
    const jobNumber = generateMockJobNumber();
    const draftUploadSecret = `draft_${randomTokenHex(16)}`;
    const record: MockStoredJob = {
      jobId,
      jobNumber,
      draftUploadSecret,
      trackingToken: null,
      idempotencyKey: req.submissionIdempotencyKey,
      req,
      status: 'draft',
      paymentStatus: 'unpaid',
      paymentMethod: null,
      files: [],
      verifiedPageCount: null,
      physicalSheetCount: null,
      subtotal: null,
      finalAmount: null,
      submittedAt: null,
      payment: null,
    };

    this.jobs.set(jobId, record);
    this.idempotencyIndex.set(req.submissionIdempotencyKey, jobId);
    this.persistToSessionStorage();

    return {
      jobId,
      jobNumber,
      status: 'draft',
      draftUploadSecret,
      maxFileSizeBytes: DEFAULT_MAX_FILE_SIZE_BYTES,
      maxFilesPerJob: DEFAULT_MAX_FILES_PER_JOB,
    };
  }

  public async requestUploadUrl(req: CreateUploadUrlRequest): Promise<CreateUploadUrlResponse> {
    const job = this.jobs.get(req.jobId);
    if (!job || job.draftUploadSecret !== req.draftUploadSecret) {
      throw new Error('Invalid or expired upload session.');
    }
    const check = validateClientDocumentFile(
      { name: req.filename, type: req.mimeType, size: req.fileSizeBytes },
      job.files.length
    );
    if (!check.valid) {
      throw new Error(check.error || 'File failed upload validation.');
    }

    const fileId = crypto.randomUUID();
    const storagePath = `mock-print-uploads/jobs/${job.jobId}/${fileId}.${check.extension}`;
    job.files.push({
      id: fileId,
      originalFilename: req.filename,
      fileSizeBytes: req.fileSizeBytes,
      detectedPageCount: 1,
      uploaded: false,
    });
    this.persistToSessionStorage();

    return {
      fileId,
      bucket: 'print-uploads',
      storagePath,
      signedUrl: `mock://upload/${job.jobId}/${fileId}`,
      expiresInSeconds: 120,
    };
  }

  public async removeDraftFile(req: RemoveDraftFileRequest): Promise<void> {
    const job = this.jobs.get(req.jobId);
    if (!job || job.draftUploadSecret !== req.draftUploadSecret) {
      throw new Error('Invalid or expired upload session.');
    }
    if (job.status !== 'draft') {
      throw new Error('Cannot remove files after submission.');
    }
    job.files = job.files.filter((f) => f.id !== req.fileId);
    this.uploadedFileBlobs.delete(req.fileId);
    this.persistToSessionStorage();
  }

  public async uploadFileBytes(
    signedUrl: string,
    file: File,
    onProgress: (pct: number) => void
  ): Promise<void> {
    const parts = signedUrl.split('/');
    const fileId = parts[parts.length - 1];
    const jobId = parts[parts.length - 2];

    for (const step of [25, 65, 100]) {
      await new Promise((r) => setTimeout(r, 70));
      onProgress(step);
    }

    this.uploadedFileBlobs.set(fileId, file);
    const job = this.jobs.get(jobId);
    if (job) {
      const target = job.files.find((f) => f.id === fileId);
      if (target) {
        target.uploaded = true;
        target.detectedPageCount = await estimateDocumentPageCountFromFile(file);
      }
      this.persistToSessionStorage();
    }
  }

  public async finalizeUploadAndSubmit(
    req: FinalizePrintUploadRequest
  ): Promise<FinalizePrintUploadResponse> {
    const job = this.jobs.get(req.jobId);
    if (!job || job.draftUploadSecret !== req.draftUploadSecret) {
      throw new Error('Upload session not found.');
    }
    if (job.status !== 'draft' && job.trackingToken) {
      return {
        jobId: job.jobId,
        jobNumber: job.jobNumber,
        status: job.status,
        paymentStatus: job.paymentStatus,
        verifiedPageCount: job.verifiedPageCount ?? 1,
        physicalSheetCount: job.physicalSheetCount ?? 1,
        subtotal: job.subtotal,
        finalAmount: job.finalAmount,
        currency: 'INR',
        trackingToken: job.trackingToken,
      };
    }
    if (job.files.length === 0 || job.files.some((f) => !f.uploaded)) {
      throw new Error('Upload at least one file completely before finalizing.');
    }

    // Apply latest print preferences submitted on finalization
    job.req = {
      ...job.req,
      ...(req.paperSize !== undefined ? { paperSize: req.paperSize } : {}),
      ...(req.printMode !== undefined ? { printMode: req.printMode } : {}),
      ...(req.printSides !== undefined ? { printSides: req.printSides } : {}),
      ...(req.copies !== undefined ? { copies: req.copies } : {}),
      ...(req.orientation !== undefined ? { orientation: req.orientation } : {}),
      ...(req.scaling !== undefined ? { scaling: req.scaling } : {}),
      ...(req.requestedPageRange !== undefined ? { requestedPageRange: req.requestedPageRange } : {}),
      ...(req.customerName !== undefined ? { customerName: req.customerName } : {}),
      ...(req.customerPhone !== undefined ? { customerPhone: req.customerPhone } : {}),
    };

    for (const f of job.files) {
      const blob = this.uploadedFileBlobs.get(f.id);
      if (blob) {
        const ext = f.originalFilename.split('.').pop()?.toLowerCase() ?? '';
        const expectedMime = DOCUMENT_EXTENSION_TO_MIME[ext] ?? blob.type;
        const byteCheck = await inspectClientFileBytes(blob, expectedMime, 'document');
        if (!byteCheck.valid) {
          job.files = job.files.filter((x) => x.id !== f.id);
          this.uploadedFileBlobs.delete(f.id);
          this.persistToSessionStorage();
          throw new Error(byteCheck.error || 'Uploaded file failed signature inspection.');
        }
        f.detectedPageCount = byteCheck.pageCount;
      }
    }

    const totalPages = job.files.reduce((sum, f) => sum + f.detectedPageCount, 0);
    const rangeRes = parseCustomPageRange(job.req.requestedPageRange, totalPages);
    if (!rangeRes.valid) {
      throw new Error(rangeRes.error || 'Invalid page range.');
    }
    const pagesPerCopy =
      rangeRes.valid && rangeRes.selectedPageCount !== null
        ? rangeRes.selectedPageCount
        : totalPages;
    const estimate = calculateEstimateBreakdown({
      pagesPerCopy,
      copies: job.req.copies,
      paperSize: job.req.paperSize,
      printMode: job.req.printMode,
      printSides: job.req.printSides,
      rules: DEFAULT_MOCK_CAPABILITIES.pricingRules,
    });

    const trackingToken = `ac_track_${randomTokenHex(18)}`;
    job.trackingToken = trackingToken;
    job.status = 'submitted';
    job.verifiedPageCount = estimate.printedPagesTotal;
    job.physicalSheetCount = estimate.physicalSheetsTotal;
    job.subtotal = estimate.subtotal;
    job.finalAmount = estimate.finalEstimatedAmount;
    job.submittedAt = new Date().toISOString();

    this.trackingIndex.set(trackingToken, job.jobId);
    this.persistToSessionStorage();

    return {
      jobId: job.jobId,
      jobNumber: job.jobNumber,
      status: job.status,
      paymentStatus: job.paymentStatus,
      verifiedPageCount: job.verifiedPageCount,
      physicalSheetCount: job.physicalSheetCount,
      subtotal: job.subtotal,
      finalAmount: job.finalAmount,
      currency: 'INR',
      trackingToken,
    };
  }

  public async preparePaymentEvidenceUpload(input: {
    trackingToken: string;
    filename: string;
    mimeType: string;
    fileSizeBytes: number;
  }): Promise<PrepareEvidenceUploadResponse> {
    const jobId = this.trackingIndex.get(input.trackingToken);
    if (!jobId) throw new Error('Invalid tracking token.');
    const check = validateClientEvidenceFile({
      name: input.filename,
      type: input.mimeType,
      size: input.fileSizeBytes,
    });
    if (!check.valid || !check.normalizedMime) {
      throw new Error(check.error || 'Invalid payment screenshot.');
    }
    const evidenceId = crypto.randomUUID();
    return {
      bucket: 'payment-evidence',
      evidenceStoragePath: `evidence/${jobId}/${evidenceId}.${check.extension}`,
      expectedMimeType: check.normalizedMime,
      signedUrl: `mock://upload/${jobId}/${evidenceId}`,
      expiresInSeconds: 120,
    };
  }

  public async submitPayment(req: SubmitPaymentRequest): Promise<SubmitPaymentResponse> {
    const jobId = this.trackingIndex.get(req.trackingToken);
    const job = jobId ? this.jobs.get(jobId) : undefined;
    if (!job) throw new Error('Tracking token does not match any submitted print job.');

    if (req.paymentMethod === 'cash') {
      job.paymentMethod = 'cash';
      job.paymentStatus = 'unpaid';
      job.status = 'awaiting_payment';
      this.persistToSessionStorage();
      return {
        jobId: job.jobId,
        status: job.status,
        paymentMethod: 'cash',
        paymentStatus: 'unpaid',
        amount: job.finalAmount,
      };
    }

    const utrCheck = validateUtrInput(req.transactionReference || '');
    if (!utrCheck.valid) {
      throw new Error(utrCheck.error || 'Valid UTR reference required.');
    }
    if (this.usedUtrs.has(utrCheck.normalized)) {
      throw new Error('This UTR transaction reference has already been submitted.');
    }

    this.usedUtrs.add(utrCheck.normalized);
    const paymentId = crypto.randomUUID();
    job.paymentMethod = 'upi';
    // Strict security boundary: payment MUST stay pending_verification until staff confirms
    job.paymentStatus = 'pending_verification';
    job.status = 'awaiting_payment';
    job.payment = {
      id: paymentId,
      method: 'upi',
      status: 'pending_verification',
      amount: job.finalAmount ?? 0,
      utr: utrCheck.normalized,
      submittedAt: new Date().toISOString(),
    };
    this.persistToSessionStorage();

    return {
      paymentId,
      jobId: job.jobId,
      status: job.status,
      paymentMethod: 'upi',
      paymentStatus: 'pending_verification',
      amount: job.finalAmount,
    };
  }

  public async getJobStatusByToken(trackingToken: string): Promise<CustomerJobStatusResponse> {
    const clean = trackingToken.trim();
    if (!clean || clean.length < 16) {
      throw new Error('Enter a valid AC Scan2Print tracking token.');
    }
    const jobId = this.trackingIndex.get(clean);
    const job = jobId ? this.jobs.get(jobId) : undefined;
    if (!job) {
      throw new Error('No print job found for this tracking token. Check the token or scan the poster again.');
    }

    return {
      jobId: job.jobId,
      jobNumber: job.jobNumber,
      status: job.status,
      paymentStatus: job.paymentStatus,
      paymentMethod: job.paymentMethod,
      paperSize: job.req.paperSize,
      printMode: job.req.printMode,
      printSides: job.req.printSides,
      copies: job.req.copies,
      verifiedPageCount: job.verifiedPageCount,
      physicalSheetCount: job.physicalSheetCount,
      subtotal: job.subtotal,
      finalAmount: job.finalAmount,
      currency: 'INR',
      rejectionReason: null,
      submittedAt: job.submittedAt,
      approvedAt: null,
      completedAt: null,
      files: job.files.map((f) => ({
        id: f.id,
        originalFilename: f.originalFilename,
        fileSizeBytes: f.fileSizeBytes,
        detectedPageCount: f.detectedPageCount,
        validationStatus: 'valid',
      })),
      payment: job.payment
        ? {
            id: job.payment.id,
            method: job.payment.method,
            status: job.payment.status,
            amount: job.payment.amount,
            submittedAt: job.payment.submittedAt,
            verifiedAt: null,
            rejectionReason: null,
          }
        : null,
      isMockMode: true,
    };
  }
}
