// AC Scan2Print Customer Portal Types — Aligned 1:1 with Phase 2 Supabase Edge Contracts

export type CustomerRoute =
  | '/quick-print'
  | '/quick-print/upload'
  | '/quick-print/options'
  | '/quick-print/success'
  | '/quick-print/track'
  | '/quick-print/help'
  | '/quick-print/kiosk'
  | '/quick-print/photo-sheet'
  | '/quick-print/exam-prep'
  | '/quick-print/batch-pack';

export type JobStatus =
  | 'draft'
  | 'submitted'
  | 'under_review'
  | 'awaiting_payment'
  | 'approved'
  | 'queued'
  | 'claimed'
  | 'downloading'
  | 'printing'
  | 'submitted_to_spooler'
  | 'completed'
  | 'failed'
  | 'needs_review'
  | 'rejected'
  | 'cancelled'
  | 'expired';

export type PaymentStatus = 'unpaid' | 'pending_verification' | 'paid' | 'refunded';
export type PaymentMethod = 'upi' | 'cash';
export type PaperSize = 'A4' | 'A3' | 'Legal';
export type PrintMode = 'bw' | 'colour';
export type PrintSides = 'single' | 'duplex';
export type Orientation = 'auto' | 'portrait' | 'landscape';
export type ScalingMode = 'fit' | 'actual';
export type PagesPerSheet = 1 | 2 | 4;
export type FinishingServiceId =
  | 'none'
  | 'staple_corner'
  | 'spiral_binding'
  | 'thermal_lamination'
  | 'heavy_cover_bind';
export type PricingUnit = 'per_printed_page' | 'per_physical_sheet';

export interface PricingRulePublic {
  id: string;
  ruleName: string;
  paperSize: PaperSize;
  printMode: PrintMode;
  printSides: PrintSides;
  pricingUnit: PricingUnit;
  rate: number;
  minimumCharge: number;
  isMockSample: boolean;
}

export type TriStateCapability = 'yes' | 'no' | 'unknown';

export type PilotStage = 'dry_run' | 'supervised_pilot' | 'live_pilot' | 'production';

export interface PortalCapabilities {
  maxFilesPerJob: number;
  maxFileSizeBytes: number;
  maxCopies: number;
  draftRetentionHours?: number;
  completedRetentionHours?: number;
  allowedExtensions: readonly string[];
  supportedPaperSizes: readonly PaperSize[];
  supportedPrintModes: readonly PrintMode[];
  supportedPrintSides: readonly PrintSides[];
  supportedOrientations: readonly Orientation[];
  supportedScalingModes: readonly ScalingMode[];
  capabilitiesKnown: boolean;
  configuredPrinterCount: number;
  verifiedPrinterCount: number;
  colourSupported: TriStateCapability;
  duplexSupported: TriStateCapability;
  paperSizesKnown: boolean;
  retentionNotice: string;
  shopName: string;
  shopHours: string;
  shopContactPhone: string;
  shopAddress: string;
  pricingRules: PricingRulePublic[];
  pilotStage?: PilotStage;
  intakePaused?: boolean;
  pauseReason?: string | null;
}

export interface PublicPortalConfigPayload {
  systemLimits: {
    maxFilesPerJob: number;
    maxFileSizeBytes: number;
    maxCopies: number;
    draftRetentionHours: number;
    completedRetentionHours: number;
  };
  pilotStatus?: {
    pilotStage: PilotStage;
    intakePaused: boolean;
    pauseReason: string | null;
  };
  printerCapabilities: {
    configuredPrinterCount: number;
    verifiedPrinterCount: number;
    capabilitiesKnown: boolean;
    colourSupported: TriStateCapability;
    duplexSupported: TriStateCapability;
    paperSizesKnown: boolean;
    supportedPaperSizes: PaperSize[];
  };
  pricingRules: PricingRulePublic[];
}

export interface PublicPaymentSettingsResponse {
  upiEnabled: boolean;
  upiId: string | null;
  upiQrSignedUrl: string | null;
  displayName: string;
  paymentInstructions: string;
  cashEnabled: boolean;
  isMockMode?: boolean;
  portalConfig?: PublicPortalConfigPayload;
}

export interface SelectedUploadFileItem {
  localId: string;
  file: File;
  filename: string;
  mimeType: string;
  fileSizeBytes: number;
  estimatedPageCount: number;
  status: 'ready' | 'uploading' | 'uploaded' | 'error';
  progressPct: number;
  errorMessage: string | null;
  remoteFileId?: string;
  storagePath?: string;
}

export interface PrintPreferencesInput {
  paperSize: PaperSize;
  printMode: PrintMode;
  printSides: PrintSides;
  copies: number;
  orientation: Orientation;
  scaling: ScalingMode;
  pagesPerSheet: PagesPerSheet;
  finishingService: FinishingServiceId;
  requestedPageRange: string;
  customerName: string;
  customerPhone: string;
}

export interface SubmissionConfirmationRecord {
  jobId: string;
  jobNumber: string;
  trackingToken: string;
  status: JobStatus;
  paymentStatus: PaymentStatus;
  paymentMethod: PaymentMethod | null;
  verifiedPageCount: number;
  physicalSheetCount: number;
  estimatedAmount: number | null;
  currency: string;
  submittedAt: string;
  files: Array<{
    filename: string;
    fileSizeBytes: number;
    pageCount: number;
  }>;
  preferences: PrintPreferencesInput;
  isMockMode: boolean;
}

export interface CustomerTrackedFile {
  id: string;
  originalFilename: string;
  fileSizeBytes: number;
  detectedPageCount: number | null;
  validationStatus: 'pending' | 'valid' | 'invalid';
}

export interface CustomerTrackedPayment {
  id: string;
  method: PaymentMethod;
  status: PaymentStatus;
  amount: number;
  submittedAt: string | null;
  verifiedAt: string | null;
  rejectionReason: string | null;
}

export interface CustomerJobStatusResponse {
  jobId: string;
  jobNumber: string;
  status: JobStatus;
  paymentStatus: PaymentStatus;
  paymentMethod: PaymentMethod | null;
  paperSize: PaperSize;
  printMode: PrintMode;
  printSides: PrintSides;
  copies: number;
  verifiedPageCount: number | null;
  physicalSheetCount: number | null;
  subtotal: number | null;
  finalAmount: number | null;
  currency: string;
  rejectionReason: string | null;
  submittedAt: string | null;
  approvedAt: string | null;
  completedAt: string | null;
  files: CustomerTrackedFile[];
  payment: CustomerTrackedPayment | null;
  isMockMode?: boolean;
}
