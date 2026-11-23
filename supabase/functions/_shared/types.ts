// AC Scan2Print — Shared Phase 2 Backend Domain Types & Backend Adapter Contract

export const JOB_STATUSES = [
  'draft',
  'submitted',
  'under_review',
  'awaiting_payment',
  'approved',
  'queued',
  'claimed',
  'downloading',
  'printing',
  'submitted_to_spooler',
  'completed',
  'failed',
  'needs_review',
  'rejected',
  'cancelled',
  'expired',
] as const;

export type JobStatus = (typeof JOB_STATUSES)[number];

export const PAYMENT_STATUSES = [
  'unpaid',
  'pending_verification',
  'paid',
  'refunded',
] as const;

export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export type PaymentMethod = 'upi' | 'cash';
export type PaperSize = 'A4' | 'A3' | 'Legal';
export type PrinterPaperSize = PaperSize | 'Photo_4x6' | 'Photo_5x7';
export type PrinterConnectionType = 'usb' | 'wifi' | 'lan' | 'other' | 'unknown';
export type PrinterApprovalStatus = 'manual' | 'pending_review' | 'approved' | 'rejected';
export type PrinterDiscoverySource = 'manual' | 'agent';
export type PrintMode = 'bw' | 'colour';
export type PrintSides = 'single' | 'duplex';
export type PricingUnit = 'per_printed_page' | 'per_physical_sheet';
export type Orientation = 'auto' | 'portrait' | 'landscape';
export type ScalingMode = 'fit' | 'actual';
export type ActorType = 'customer' | 'admin' | 'agent' | 'system';

export interface PrintAdminAccount {
  id: string;
  firebase_uid: string | null;
  user_id: string | null;
  email: string;
  full_name: string;
  is_active: boolean;
  singleton_guard: boolean;
  created_at: string;
  updated_at: string;
}

export interface PrintDevice {
  id: string;
  device_name: string;
  device_status: 'pending' | 'active' | 'paused' | 'revoked';
  credential_hash: string;
  agent_version: string | null;
  os_version: string | null;
  last_heartbeat_at: string | null;
  approved_at: string | null;
  revoked_at: string | null;
  created_at: string;
}

export interface PrintPrinter {
  id: string;
  printer_name: string;
  printer_model?: string | null;
  system_printer_name: string | null;
  device_id: string | null;
  connection_type: PrinterConnectionType;
  supported_paper_sizes: PrinterPaperSize[];
  supports_colour: boolean | null;
  supports_duplex: boolean | null;
  capabilities_verified: boolean;
  printer_status: 'online' | 'offline' | 'error' | 'paused' | 'disabled' | 'unknown';
  is_enabled: boolean;
  is_default: boolean;
  discovery_source?: PrinterDiscoverySource;
  approval_status?: PrinterApprovalStatus;
  last_seen_at: string | null;
  last_verified_at?: string | null;
  archived_at?: string | null;
  archived_by?: string | null;
  audit_notes?: string | null;
  created_at: string;
  updated_at: string;
}

export interface PrintPricingRule {
  id: string;
  rule_name: string;
  paper_size: PaperSize;
  print_mode: PrintMode;
  print_sides: PrintSides;
  pricing_unit: PricingUnit;
  rate: number;
  minimum_charge: number;
  is_active: boolean;
  valid_from: string;
  valid_until: string | null;
  created_at: string;
  updated_at: string;
}

export interface PrintJob {
  id: string;
  job_number: string;
  tracking_token_hash: string | null;
  draft_upload_secret_hash: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  status: JobStatus;
  payment_status: PaymentStatus;
  payment_method: PaymentMethod | null;
  subtotal: number | null;
  final_amount: number | null;
  currency: string;
  paper_size: PaperSize;
  print_mode: PrintMode;
  print_sides: PrintSides;
  copies: number;
  orientation: Orientation;
  scaling: ScalingMode;
  requested_page_range: string;
  verified_page_count: number | null;
  physical_sheet_count: number | null;
  pricing_rule_id: string | null;
  price_override_reason: string | null;
  assigned_printer_id: string | null;
  rejection_reason: string | null;
  cancellation_reason: string | null;
  submission_idempotency_key: string | null;
  created_at: string;
  updated_at: string;
  submitted_at: string | null;
  approved_at: string | null;
  completed_at: string | null;
  expires_at: string | null;
}

export interface PrintFile {
  id: string;
  job_id: string;
  storage_bucket: string;
  storage_path: string;
  original_filename: string;
  detected_mime_type: string | null;
  file_size_bytes: number;
  sha256_checksum: string | null;
  detected_page_count: number | null;
  validation_status: 'pending' | 'valid' | 'invalid';
  validation_error: string | null;
  uploaded_at: string;
  deleted_at: string | null;
}

export interface PrintPayment {
  id: string;
  job_id: string;
  payment_method: PaymentMethod;
  payment_status: PaymentStatus;
  amount: number;
  currency: string;
  transaction_reference: string | null;
  screenshot_storage_bucket: string | null;
  screenshot_storage_path: string | null;
  submitted_at: string | null;
  verified_at: string | null;
  verified_by: string | null;
  rejection_reason: string | null;
  idempotency_key: string | null;
  created_at: string;
  updated_at: string;
}

export interface PrintJobAttempt {
  id: string;
  job_id: string;
  attempt_number: number;
  idempotency_key: string;
  device_id: string;
  printer_id: string;
  attempt_status:
    | 'claimed'
    | 'downloading'
    | 'printing'
    | 'submitted_to_spooler'
    | 'completed'
    | 'failed'
    | 'needs_review'
    | 'aborted';
  lease_expires_at: string;
  windows_spooler_job_id: string | null;
  started_at: string;
  submitted_to_spooler_at: string | null;
  completed_at: string | null;
  finished_at: string | null;
  error_code: string | null;
  error_message: string | null;
}

export interface PrintEvent {
  id: string;
  job_id: string | null;
  actor_type: ActorType;
  actor_id: string | null;
  event_type: string;
  previous_status: string | null;
  new_status: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface PrintPaymentSettings {
  id: number;
  upi_enabled: boolean;
  upi_id: string | null;
  upi_qr_storage_bucket: string;
  upi_qr_storage_path: string | null;
  display_name: string;
  payment_instructions: string;
  updated_at: string;
  updated_by: string | null;
}

export interface PrintSystemSettings {
  id: number;
  customer_portal_url: string | null;
  max_file_size_bytes: number;
  max_files_per_job: number;
  max_copies: number;
  draft_retention_hours: number;
  completed_retention_hours: number;
  failed_retention_hours: number;
  retention_policy_confirmed: boolean;
  auto_cleanup_enabled: boolean;
  updated_at: string;
  updated_by: string | null;
}

export interface PrintCleanupLog {
  id: string;
  run_mode: 'dry_run' | 'execute';
  jobs_expired: number;
  files_marked_deleted: number;
  storage_objects_removed: number;
  skipped_active_or_disputed: number;
  details: Record<string, unknown>;
  executed_by: string;
  executed_at: string;
}

export interface ClaimedJobResult {
  job_id: string;
  job_number: string;
  attempt_id: string;
  attempt_number: number;
  printer_id: string;
  lease_expires_at: string;
}

export interface PublicPortalBootstrapData {
  systemSettings: Pick<
    PrintSystemSettings,
    | 'max_file_size_bytes'
    | 'max_files_per_job'
    | 'max_copies'
    | 'draft_retention_hours'
    | 'completed_retention_hours'
  >;
  printers: Array<
    Pick<
      PrintPrinter,
      | 'is_enabled'
      | 'approval_status'
      | 'archived_at'
      | 'printer_status'
      | 'supported_paper_sizes'
      | 'supports_colour'
      | 'supports_duplex'
      | 'capabilities_verified'
    >
  >;
  pricingRules: Array<
    Pick<
      PrintPricingRule,
      | 'id'
      | 'rule_name'
      | 'paper_size'
      | 'print_mode'
      | 'print_sides'
      | 'pricing_unit'
      | 'rate'
      | 'minimum_charge'
      | 'is_active'
      | 'valid_from'
      | 'valid_until'
    >
  >;
}

export interface RuntimeEnv {
  FIREBASE_PROJECT_ID?: string;
  CUSTOMER_PORTAL_URL?: string;
  ADMIN_BOOTSTRAP_SECRET?: string;
  ADMIN_BOOTSTRAP_ALLOWED_UID?: string;
  CRON_SECRET?: string;
  ALLOWED_ORIGINS?: string;
  AGENT_CLAIM_LEASE_SECONDS?: string;
}

export class AppError extends Error {
  public readonly status: number;
  public readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export interface Scan2PrintBackendAdapter {
  // Auth & Rate Limit
  verifyFirebaseAdminToken(
    bearerToken: string,
    env: RuntimeEnv
  ): Promise<{ firebaseUid: string; email: string | null } | null>;
  getActiveAdminByFirebaseUid(firebaseUid: string): Promise<PrintAdminAccount | null>;
  countAdminAccounts(): Promise<number>;
  createAdminAccount(input: {
    firebaseUid: string;
    email: string;
    fullName: string;
  }): Promise<PrintAdminAccount>;
  checkRateLimit(key: string, maxHits: number, windowSeconds: number): Promise<boolean>;

  // System & Payment Settings
  getSystemSettings(): Promise<PrintSystemSettings>;
  getPaymentSettings(): Promise<PrintPaymentSettings>;
  getPublicPortalBootstrapData?(): Promise<PublicPortalBootstrapData>;
  updatePaymentSettings(
    patch: Partial<
      Pick<
        PrintPaymentSettings,
        'upi_enabled' | 'upi_id' | 'upi_qr_storage_path' | 'display_name' | 'payment_instructions' | 'updated_by'
      >
    >
  ): Promise<PrintPaymentSettings>;

  // Pricing
  findActivePricingRule(input: {
    paperSize: PaperSize;
    printMode: PrintMode;
    printSides: PrintSides;
    nowIso?: string;
  }): Promise<PrintPricingRule | null>;

  // Jobs
  createJob(input: {
    jobNumber: string;
    draftUploadSecretHash: string;
    customerName: string | null;
    customerPhone: string | null;
    paperSize: PaperSize;
    printMode: PrintMode;
    printSides: PrintSides;
    copies: number;
    orientation: Orientation;
    scaling: ScalingMode;
    requestedPageRange: string;
    submissionIdempotencyKey: string | null;
  }): Promise<PrintJob>;
  getJobById(jobId: string): Promise<PrintJob | null>;
  getJobByTrackingHash(trackingTokenHash: string): Promise<PrintJob | null>;
  getJobByIdempotencyKey(key: string): Promise<PrintJob | null>;
  updateJob(jobId: string, patch: Partial<PrintJob>): Promise<PrintJob>;
  listJobsForRetentionCheck(): Promise<PrintJob[]>;

  // Files
  countActiveFilesForJob(jobId: string): Promise<number>;
  createFileRecord(input: {
    jobId: string;
    storageBucket: string;
    storagePath: string;
    originalFilename: string;
    detectedMimeType: string | null;
    fileSizeBytes: number;
  }): Promise<PrintFile>;
  getFilesForJob(jobId: string): Promise<PrintFile[]>;
  updateFileRecord(fileId: string, patch: Partial<PrintFile>): Promise<PrintFile>;

  // Payments
  getPaymentsForJob(jobId: string): Promise<PrintPayment[]>;
  getPaymentById(paymentId: string): Promise<PrintPayment | null>;
  findActivePaymentByUtr(utrNormalized: string): Promise<PrintPayment | null>;
  createPayment(input: {
    jobId: string;
    paymentMethod: PaymentMethod;
    paymentStatus: PaymentStatus;
    amount: number;
    currency: string;
    transactionReference: string | null;
    screenshotStorageBucket: string | null;
    screenshotStoragePath: string | null;
    submittedAt: string | null;
    verifiedAt: string | null;
    verifiedBy: string | null;
    idempotencyKey: string | null;
  }): Promise<PrintPayment>;
  updatePayment(paymentId: string, patch: Partial<PrintPayment>): Promise<PrintPayment>;

  // Printers, Devices & Attempts
  listPrinters?(options?: { includeArchived?: boolean }): Promise<PrintPrinter[]>;
  getPrinterById(printerId: string): Promise<PrintPrinter | null>;
  createPrinter?(input: {
    printerName: string;
    printerModel: string | null;
    systemPrinterName: string | null;
    deviceId: string | null;
    connectionType: PrinterConnectionType;
    supportedPaperSizes: PrinterPaperSize[];
    supportsColour: boolean | null;
    supportsDuplex: boolean | null;
    capabilitiesVerified: boolean;
    printerStatus: PrintPrinter['printer_status'];
    isEnabled: boolean;
    isDefault: boolean;
    discoverySource: PrinterDiscoverySource;
    approvalStatus: PrinterApprovalStatus;
    lastSeenAt: string | null;
    lastVerifiedAt: string | null;
    auditNotes: string | null;
  }): Promise<PrintPrinter>;
  updatePrinter?(printerId: string, patch: Partial<PrintPrinter>): Promise<PrintPrinter>;
  deletePrinter?(printerId: string): Promise<void>;
  countPrinterReferences?(printerId: string): Promise<{ jobs: number; attempts: number; activeJobs: number }>;
  updatePrinterStatus?(
    printerId: string,
    patch: Partial<Pick<PrintPrinter, 'printer_status' | 'last_seen_at'>>
  ): Promise<PrintPrinter | null>;
  listDevices?(): Promise<PrintDevice[]>;
  getDeviceById?(deviceId: string): Promise<PrintDevice | null>;
  getDeviceByCredentialHash(hash: string): Promise<PrintDevice | null>;
  createDevice(input: {
    deviceName: string;
    credentialHash: string;
    osVersion: string | null;
    agentVersion: string | null;
    activateImmediately?: boolean;
  }): Promise<PrintDevice>;
  updateDevice(deviceId: string, patch: Partial<PrintDevice>): Promise<PrintDevice>;
  getActiveAttemptsForJob(jobId: string): Promise<PrintJobAttempt[]>;
  getAttemptById(attemptId: string): Promise<PrintJobAttempt | null>;
  updateAttempt(attemptId: string, patch: Partial<PrintJobAttempt>): Promise<PrintJobAttempt>;
  listRecentEvents?(limit?: number, eventTypes?: string[]): Promise<PrintEvent[]>;

  // Atomic RPCs
  releaseJobToQueue(input: {
    jobId: string;
    printerId: string;
    adminId: string;
  }): Promise<PrintJob>;
  claimNextJob(input: {
    deviceId: string;
    leaseSeconds: number;
    idempotencyKey: string;
  }): Promise<ClaimedJobResult | null>;

  // Audit & Cleanup Logs
  appendEvent(input: {
    jobId: string | null;
    actorType: ActorType;
    actorId: string | null;
    eventType: string;
    previousStatus: string | null;
    newStatus: string | null;
    metadata?: Record<string, unknown>;
  }): Promise<PrintEvent>;
  createCleanupLog(input: Omit<PrintCleanupLog, 'id' | 'executed_at'>): Promise<PrintCleanupLog>;

  // Private Storage
  createSignedUploadUrl(
    bucket: string,
    path: string,
    expiresInSeconds: number
  ): Promise<{ signedUrl: string; token?: string; expiresInSeconds: number }>;
  createSignedDownloadUrl(
    bucket: string,
    path: string,
    expiresInSeconds: number
  ): Promise<{ signedUrl: string; expiresInSeconds: number }>;
  readStorageObject(bucket: string, path: string): Promise<Uint8Array | null>;
  deleteStorageObject(bucket: string, path: string): Promise<boolean>;
}
