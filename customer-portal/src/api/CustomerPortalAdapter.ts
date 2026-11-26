// AC Scan2Print — Customer Portal API Adapter Contract (Phase 3A Frontend / Phase 3B Integration Ready)

import type {
  CustomerJobStatusResponse,
  FinishingServiceId,
  Orientation,
  PagesPerSheet,
  PaperSize,
  PaymentMethod,
  PortalCapabilities,
  PrintMode,
  PrintSides,
  PublicPaymentSettingsResponse,
  ScalingMode,
} from '../types/portal';

export interface CreateDraftJobRequest {
  paperSize: PaperSize;
  printMode: PrintMode;
  printSides: PrintSides;
  copies: number;
  orientation: Orientation;
  scaling: ScalingMode;
  pagesPerSheet?: PagesPerSheet;
  finishingService?: FinishingServiceId;
  requestedPageRange: string;
  customerName?: string;
  customerPhone?: string;
  submissionIdempotencyKey: string;
}

export interface CreateDraftJobResponse {
  jobId: string;
  jobNumber: string;
  status: string;
  draftUploadSecret?: string;
  maxFileSizeBytes?: number;
  maxFilesPerJob?: number;
  idempotentReplay?: boolean;
}

export interface CreateUploadUrlRequest {
  jobId: string;
  draftUploadSecret: string;
  filename: string;
  mimeType: string;
  fileSizeBytes: number;
}

export interface CreateUploadUrlResponse {
  fileId: string;
  bucket: string;
  storagePath: string;
  signedUrl: string;
  expiresInSeconds: number;
}

export interface RemoveDraftFileRequest {
  jobId: string;
  draftUploadSecret: string;
  fileId: string;
}

export interface FinalizePrintUploadRequest {
  jobId: string;
  draftUploadSecret: string;
  paperSize?: PaperSize;
  printMode?: PrintMode;
  printSides?: PrintSides;
  copies?: number;
  orientation?: Orientation;
  scaling?: ScalingMode;
  pagesPerSheet?: PagesPerSheet;
  finishingService?: FinishingServiceId;
  requestedPageRange?: string;
  customerName?: string;
  customerPhone?: string;
}

export interface FinalizePrintUploadResponse {
  jobId: string;
  jobNumber: string;
  status: string;
  paymentStatus: string;
  verifiedPageCount: number;
  physicalSheetCount: number;
  subtotal: number | null;
  finalAmount: number | null;
  currency: string;
  trackingToken: string;
}

export interface PrepareEvidenceUploadResponse {
  bucket: string;
  evidenceStoragePath: string;
  expectedMimeType: string;
  signedUrl: string;
  expiresInSeconds: number;
}

export interface SubmitPaymentRequest {
  trackingToken: string;
  paymentMethod: PaymentMethod;
  transactionReference?: string;
  evidenceStoragePath?: string;
  evidenceMimeType?: string;
  idempotencyKey?: string;
}

export interface SubmitPaymentResponse {
  paymentId?: string;
  jobId: string;
  status: string;
  paymentMethod: PaymentMethod;
  paymentStatus: string;
  amount: number | null;
}

export interface CustomerPortalApiAdapter {
  readonly isMockMode: boolean;

  getPortalCapabilities(): Promise<PortalCapabilities>;
  getPublicPaymentSettings(): Promise<PublicPaymentSettingsResponse>;

  createDraftJob(req: CreateDraftJobRequest): Promise<CreateDraftJobResponse>;
  requestUploadUrl(req: CreateUploadUrlRequest): Promise<CreateUploadUrlResponse>;
  removeDraftFile?(req: RemoveDraftFileRequest): Promise<void>;
  uploadFileBytes(
    signedUrl: string,
    file: File,
    onProgress: (pct: number) => void
  ): Promise<void>;
  finalizeUploadAndSubmit(req: FinalizePrintUploadRequest): Promise<FinalizePrintUploadResponse>;

  preparePaymentEvidenceUpload(input: {
    trackingToken: string;
    filename: string;
    mimeType: string;
    fileSizeBytes: number;
  }): Promise<PrepareEvidenceUploadResponse>;
  submitPayment(req: SubmitPaymentRequest): Promise<SubmitPaymentResponse>;

  getJobStatusByToken(trackingToken: string): Promise<CustomerJobStatusResponse>;
}
