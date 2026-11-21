// AC Scan2Print — Phase 3B Supabase Edge Function Customer Adapter Shell
// Implements exact Phase 2 API signatures for drop-in backend connection in Phase 3B without UI rewrites.

import type {
  CustomerJobStatusResponse,
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
  SubmitPaymentRequest,
  SubmitPaymentResponse,
} from './CustomerPortalAdapter';

export class SupabaseCustomerPortalAdapter implements CustomerPortalApiAdapter {
  public readonly isMockMode = false;
  private readonly baseUrl: string;
  private readonly anonKey: string;

  constructor(config: { supabaseUrl: string; supabaseAnonKey: string }) {
    this.baseUrl = config.supabaseUrl.replace(/\/+$/, '');
    this.anonKey = config.supabaseAnonKey;
  }

  private async invokeEdge<T>(
    fnName: string,
    opts: { method?: 'GET' | 'POST'; body?: unknown; headers?: Record<string, string> } = {}
  ): Promise<T> {
    const res = await fetch(`${this.baseUrl}/functions/v1/${fnName}`, {
      method: opts.method ?? 'POST',
      headers: {
        apikey: this.anonKey,
        ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
        ...(opts.headers ?? {}),
      },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    const text = await res.text();
    const parsed = text ? (JSON.parse(text) as Record<string, unknown>) : {};
    if (!res.ok) {
      const errObj = parsed.error as { message?: string } | undefined;
      throw new Error(errObj?.message || `Backend request failed (${res.status}).`);
    }
    return parsed as T;
  }

  public async getPortalCapabilities(): Promise<PortalCapabilities> {
    // Phase 3B can source active print_system_settings / pricing rules; returns Phase 1/2 baseline defaults
    return {
      maxFilesPerJob: 5,
      maxFileSizeBytes: 20 * 1024 * 1024,
      maxCopies: 20,
      allowedExtensions: ['PDF', 'JPG', 'JPEG', 'PNG'],
      supportedPaperSizes: ['A4', 'Legal', 'A3'],
      supportedPrintModes: ['bw', 'colour'],
      supportedPrintSides: ['single', 'duplex'],
      supportedOrientations: ['auto', 'portrait', 'landscape'],
      supportedScalingModes: ['fit', 'actual'],
      retentionNotice:
        'Uploaded files are stored in encrypted private storage and removed per shop retention policy.',
      shopName: 'AMAN COMPUTER',
      shopHours: 'Shop counter hours apply',
      shopContactPhone: 'Ask at counter',
      shopAddress: 'Aman Computer Print Counter',
      pricingRules: [],
    };
  }

  public async getPublicPaymentSettings(): Promise<PublicPaymentSettingsResponse> {
    return this.invokeEdge<PublicPaymentSettingsResponse>('get-public-payment-settings', {
      method: 'GET',
    });
  }

  public async createDraftJob(req: CreateDraftJobRequest): Promise<CreateDraftJobResponse> {
    return this.invokeEdge<CreateDraftJobResponse>('create-print-job', { body: req });
  }

  public async requestUploadUrl(req: CreateUploadUrlRequest): Promise<CreateUploadUrlResponse> {
    return this.invokeEdge<CreateUploadUrlResponse>('create-print-upload-url', {
      headers: { 'x-draft-secret': req.draftUploadSecret },
      body: {
        jobId: req.jobId,
        filename: req.filename,
        mimeType: req.mimeType,
        fileSizeBytes: req.fileSizeBytes,
      },
    });
  }

  public async uploadFileBytes(
    signedUrl: string,
    file: File,
    onProgress: (pct: number) => void
  ): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', signedUrl, true);
      xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
      xhr.upload.onprogress = (ev) => {
        if (ev.lengthComputable && ev.total > 0) {
          onProgress(Math.min(100, Math.round((ev.loaded / ev.total) * 100)));
        }
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          onProgress(100);
          resolve();
        } else {
          reject(new Error(`Storage upload failed (${xhr.status}).`));
        }
      };
      xhr.onerror = () => reject(new Error('Network error during document upload.'));
      xhr.send(file);
    });
  }

  public async finalizeUploadAndSubmit(
    req: FinalizePrintUploadRequest
  ): Promise<FinalizePrintUploadResponse> {
    return this.invokeEdge<FinalizePrintUploadResponse>('finalize-print-upload', {
      headers: { 'x-draft-secret': req.draftUploadSecret },
      body: { jobId: req.jobId },
    });
  }

  public async preparePaymentEvidenceUpload(input: {
    trackingToken: string;
    filename: string;
    mimeType: string;
    fileSizeBytes: number;
  }): Promise<PrepareEvidenceUploadResponse> {
    return this.invokeEdge<PrepareEvidenceUploadResponse>('submit-upi-payment', {
      headers: { 'x-tracking-token': input.trackingToken },
      body: {
        action: 'prepare_evidence_upload',
        filename: input.filename,
        mimeType: input.mimeType,
        fileSizeBytes: input.fileSizeBytes,
      },
    });
  }

  public async submitPayment(req: SubmitPaymentRequest): Promise<SubmitPaymentResponse> {
    return this.invokeEdge<SubmitPaymentResponse>('submit-upi-payment', {
      headers: { 'x-tracking-token': req.trackingToken },
      body: {
        action: 'submit',
        paymentMethod: req.paymentMethod,
        transactionReference: req.transactionReference,
        evidenceStoragePath: req.evidenceStoragePath,
        evidenceMimeType: req.evidenceMimeType,
        idempotencyKey: req.idempotencyKey,
      },
    });
  }

  public async getJobStatusByToken(trackingToken: string): Promise<CustomerJobStatusResponse> {
    // Phase 2 forbids ?token= query param on API calls; sends via x-tracking-token header
    return this.invokeEdge<CustomerJobStatusResponse>('get-print-job-status', {
      method: 'GET',
      headers: { 'x-tracking-token': trackingToken },
    });
  }
}
