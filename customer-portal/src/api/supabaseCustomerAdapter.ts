// AC Scan2Print — Live Supabase Edge Function Customer Adapter (Phase 3)
// Connects Customer Portal directly to Supabase Edge Functions + private Storage signed URLs.

import { resolveCustomerShopPublicInfo } from '../lib/env';
import type {
  CustomerJobStatusResponse,
  PaperSize,
  PortalCapabilities,
  PrintMode,
  PrintSides,
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

export class SupabaseCustomerPortalAdapter implements CustomerPortalApiAdapter {
  public readonly isMockMode = false;
  private readonly baseUrl: string;
  private readonly anonKey: string;
  private bootstrapCache: {
    promise: Promise<PublicPaymentSettingsResponse>;
    fetchedAt: number;
  } | null = null;

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
    let parsed: Record<string, unknown> = {};
    if (text) {
      try {
        parsed = JSON.parse(text) as Record<string, unknown>;
      } catch {
        throw new Error(`Unexpected response from server (${res.status}).`);
      }
    }
    if (!res.ok) {
      const errObj = parsed.error as { message?: string } | undefined;
      throw new Error(errObj?.message || `Backend request failed (${res.status}).`);
    }
    return parsed as T;
  }

  private fetchBootstrapDeduplicated(): Promise<PublicPaymentSettingsResponse> {
    const now = Date.now();
    if (this.bootstrapCache && now - this.bootstrapCache.fetchedAt < 4000) {
      return this.bootstrapCache.promise;
    }
    const promise = this.invokeEdge<PublicPaymentSettingsResponse>('get-public-payment-settings', {
      method: 'GET',
    }).catch((err) => {
      this.bootstrapCache = null;
      throw err;
    });
    this.bootstrapCache = { promise, fetchedAt: now };
    return promise;
  }

  public async getPortalCapabilities(): Promise<PortalCapabilities> {
    const shopInfo = resolveCustomerShopPublicInfo();
    const res = await this.fetchBootstrapDeduplicated();
    const cfg = res.portalConfig;

    const maxFilesPerJob = cfg?.systemLimits.maxFilesPerJob ?? 5;
    const maxFileSizeBytes = cfg?.systemLimits.maxFileSizeBytes ?? 20 * 1024 * 1024;
    const maxCopies = cfg?.systemLimits.maxCopies ?? 20;
    const draftRetentionHours = cfg?.systemLimits.draftRetentionHours ?? 1;
    const completedRetentionHours = cfg?.systemLimits.completedRetentionHours ?? 24;

    const pc = cfg?.printerCapabilities;
    const colourSupported = pc?.colourSupported ?? 'unknown';
    const duplexSupported = pc?.duplexSupported ?? 'unknown';
    const paperSizesKnown = pc?.paperSizesKnown ?? false;
    const capabilitiesKnown = pc?.capabilitiesKnown ?? false;
    const configuredPrinterCount = pc?.configuredPrinterCount ?? 0;
    const verifiedPrinterCount = pc?.verifiedPrinterCount ?? 0;

    // Strict honesty rule: NEVER assume colour, duplex, or extra paper sizes when unknown
    const supportedPrintModes: PrintMode[] = colourSupported === 'yes' ? ['bw', 'colour'] : ['bw'];
    const supportedPrintSides: PrintSides[] = duplexSupported === 'yes' ? ['single', 'duplex'] : ['single'];
    const supportedPaperSizes: PaperSize[] =
      paperSizesKnown && pc && pc.supportedPaperSizes.length > 0 ? pc.supportedPaperSizes : ['A4'];

    return {
      maxFilesPerJob,
      maxFileSizeBytes,
      maxCopies,
      draftRetentionHours,
      completedRetentionHours,
      allowedExtensions: ['PDF', 'JPG', 'JPEG', 'PNG'],
      supportedPaperSizes,
      supportedPrintModes,
      supportedPrintSides,
      supportedOrientations: ['auto', 'portrait', 'landscape'],
      supportedScalingModes: ['fit', 'actual'],
      capabilitiesKnown,
      configuredPrinterCount,
      verifiedPrinterCount,
      colourSupported,
      duplexSupported,
      paperSizesKnown,
      retentionNotice: `Uploaded documents stay encrypted in private storage and are automatically scheduled for cleanup within ${completedRetentionHours} hour${completedRetentionHours === 1 ? '' : 's'} after completion.`,
      shopName: res.displayName || shopInfo.shopName,
      shopHours: shopInfo.shopHours,
      shopContactPhone: shopInfo.shopContactPhone,
      shopAddress: shopInfo.shopAddress,
      pricingRules: cfg?.pricingRules ?? [],
      pilotStage: cfg?.pilotStatus?.pilotStage ?? 'dry_run',
      intakePaused: Boolean(cfg?.pilotStatus?.intakePaused),
      pauseReason: cfg?.pilotStatus?.pauseReason ?? null,
    };
  }

  public async getPublicPaymentSettings(): Promise<PublicPaymentSettingsResponse> {
    return this.fetchBootstrapDeduplicated();
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

  public async removeDraftFile(req: RemoveDraftFileRequest): Promise<void> {
    await this.invokeEdge<{ removed: boolean }>('create-print-upload-url', {
      headers: { 'x-draft-secret': req.draftUploadSecret },
      body: {
        action: 'remove_file',
        jobId: req.jobId,
        fileId: req.fileId,
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
    const body: Record<string, unknown> = { jobId: req.jobId };
    if (req.paperSize !== undefined) body.paperSize = req.paperSize;
    if (req.printMode !== undefined) body.printMode = req.printMode;
    if (req.printSides !== undefined) body.printSides = req.printSides;
    if (req.copies !== undefined) body.copies = req.copies;
    if (req.orientation !== undefined) body.orientation = req.orientation;
    if (req.scaling !== undefined) body.scaling = req.scaling;
    if (req.requestedPageRange !== undefined) body.requestedPageRange = req.requestedPageRange;
    if (req.customerName !== undefined) body.customerName = req.customerName;
    if (req.customerPhone !== undefined) body.customerPhone = req.customerPhone;

    return this.invokeEdge<FinalizePrintUploadResponse>('finalize-print-upload', {
      headers: { 'x-draft-secret': req.draftUploadSecret },
      body,
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
    return this.invokeEdge<CustomerJobStatusResponse>('get-print-job-status', {
      method: 'GET',
      headers: { 'x-tracking-token': trackingToken },
    });
  }
}
