// AC Scan2Print — Phase 4 Pure Frontend Types, Calculations, Formatting & Validation
// Never fabricates prices, fake jobs, fake revenue, or fake device online status.

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
export type PricingUnit = 'per_printed_page' | 'per_physical_sheet';
export type DeviceOnlineStatus = 'online' | 'offline' | 'pending' | 'paused' | 'revoked';

export interface AdminPrintJobSummary {
  id: string;
  job_number: string;
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
  orientation: 'auto' | 'portrait' | 'landscape';
  scaling: 'fit' | 'actual';
  requested_page_range: string;
  verified_page_count: number | null;
  physical_sheet_count: number | null;
  pricing_rule_id: string | null;
  price_override_reason: string | null;
  assigned_printer_id: string | null;
  assigned_printer_name?: string | null;
  pending_payment_id?: string | null;
  latest_transaction_reference?: string | null;
  rejection_reason: string | null;
  cancellation_reason: string | null;
  created_at: string;
  updated_at: string;
  submitted_at: string | null;
  approved_at: string | null;
  completed_at: string | null;
  expires_at: string | null;
}

export interface AdminPrintFileDetail {
  id: string;
  job_id: string;
  original_filename: string;
  detected_mime_type: string | null;
  file_size_bytes: number;
  sha256_checksum: string | null;
  detected_page_count: number | null;
  validation_status: 'pending' | 'valid' | 'invalid';
  validation_error: string | null;
  uploaded_at: string;
  deleted_at: string | null;
  signedDownloadUrl: string | null;
  expiresInSeconds: number | null;
  previewSupported: boolean;
}

export interface AdminPrintPaymentDetail {
  id: string;
  job_id: string;
  payment_method: PaymentMethod;
  payment_status: PaymentStatus;
  amount: number;
  currency: string;
  transaction_reference: string | null;
  screenshot_storage_bucket: string | null;
  screenshot_storage_path: string | null;
  screenshotSignedUrl: string | null;
  expiresInSeconds: number | null;
  submitted_at: string | null;
  verified_at: string | null;
  verified_by: string | null;
  rejection_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface AdminPrintJobAttempt {
  id: string;
  job_id: string;
  attempt_number: number;
  device_id: string;
  printer_id: string;
  attempt_status: string;
  lease_expires_at: string;
  windows_spooler_job_id: string | null;
  started_at: string;
  submitted_to_spooler_at: string | null;
  completed_at: string | null;
  finished_at: string | null;
  error_code: string | null;
  error_message: string | null;
}

export interface AdminPrintEvent {
  id: string;
  job_id: string | null;
  actor_type: 'customer' | 'admin' | 'agent' | 'system';
  actor_id: string | null;
  event_type: string;
  previous_status: string | null;
  new_status: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface AdminPrintPricingRule {
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

export interface AdminPrintPaymentSettings {
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

export interface AdminPrintDashboardMetrics {
  totalJobs: number;
  pendingJobs: number;
  approvedJobs: number;
  queuedJobs: number;
  processingJobs: number;
  completedJobs: number;
  failedJobs: number;
  needsReviewJobs: number;
  cancelledJobs: number;
  rejectedJobs: number;
  expiredJobs: number;
  draftJobs: number;
  todayJobs: number;
  todayCompletedJobs: number;
  totalPhysicalSheets: number;
  completedPhysicalSheets: number;
  totalConfirmedRevenue: number;
  todayRevenue: number;
  revenueByMethod: {
    upi: number;
    cash: number;
  };
  pendingVerificationPayments: number;
}

export interface AdminQueueItem {
  queuePosition: number | null;
  jobId: string;
  jobNumber: string;
  customerName: string | null;
  status: JobStatus;
  paymentStatus: PaymentStatus;
  paymentMethod: PaymentMethod | null;
  paperSize: PaperSize;
  printMode: PrintMode;
  printSides: PrintSides;
  copies: number;
  verifiedPageCount: number | null;
  physicalSheetCount: number | null;
  totalPhysicalSheets: number;
  finalAmount: number | null;
  assignedPrinterId: string | null;
  assignedPrinterName: string | null;
  deviceId: string | null;
  deviceName: string | null;
  deviceOnlineStatus: DeviceOnlineStatus;
  submittedAt: string | null;
  approvedAt: string | null;
  createdAt: string;
}

export interface AdminDeviceSummary {
  id: string;
  device_name: string;
  device_status: 'pending' | 'active' | 'paused' | 'revoked';
  agent_version: string | null;
  os_version: string | null;
  last_heartbeat_at: string | null;
  approved_at: string | null;
  revoked_at: string | null;
  created_at: string;
  onlineStatus: DeviceOnlineStatus;
}

export interface AdminPrinterSummary {
  id: string;
  printer_name: string;
  printer_model?: string | null;
  system_printer_name: string | null;
  device_id: string | null;
  connection_type: string;
  supported_paper_sizes: string[];
  supports_colour: boolean | null;
  supports_duplex: boolean | null;
  printer_status: string;
  is_enabled: boolean;
  archived_at?: string | null;
  approval_status?: string;
}

export interface AdminJobDetailResponse {
  job: AdminPrintJobSummary;
  files: AdminPrintFileDetail[];
  payments: AdminPrintPaymentDetail[];
  attempts: AdminPrintJobAttempt[];
  events: AdminPrintEvent[];
  assignedPrinter: AdminPrinterSummary | null;
  pricingRule: AdminPrintPricingRule | null;
}

export interface PricingRuleFormDraft {
  ruleId: string | null;
  ruleName: string;
  paperSize: PaperSize;
  printMode: PrintMode;
  printSides: PrintSides;
  pricingUnit: PricingUnit;
  rate: string;
  minimumCharge: string;
  isActive: boolean;
}

export interface JobStatusBadgeMeta {
  label: string;
  colorVar: string;
  bgVar: string;
}

export const JOB_STATUS_META: Record<JobStatus, JobStatusBadgeMeta> = {
  draft: { label: 'Draft', colorVar: 'var(--muted)', bgVar: 'var(--card-2)' },
  submitted: { label: 'Submitted', colorVar: 'var(--info)', bgVar: 'var(--info-soft)' },
  under_review: { label: 'Under Review', colorVar: 'var(--info)', bgVar: 'var(--info-soft)' },
  awaiting_payment: { label: 'Awaiting Payment', colorVar: 'var(--warn)', bgVar: 'var(--warn-soft)' },
  approved: { label: 'Approved', colorVar: 'var(--accent-text)', bgVar: 'var(--accent-soft)' },
  queued: { label: 'Queued', colorVar: 'var(--info)', bgVar: 'var(--info-soft)' },
  claimed: { label: 'Claimed', colorVar: 'var(--info)', bgVar: 'var(--info-soft)' },
  downloading: { label: 'Downloading', colorVar: 'var(--info)', bgVar: 'var(--info-soft)' },
  printing: { label: 'Printing', colorVar: 'var(--accent-text)', bgVar: 'var(--accent-soft)' },
  submitted_to_spooler: { label: 'In Spooler', colorVar: 'var(--accent-text)', bgVar: 'var(--accent-soft)' },
  completed: { label: 'Completed', colorVar: 'var(--good)', bgVar: 'var(--good-soft)' },
  failed: { label: 'Failed', colorVar: 'var(--bad)', bgVar: 'var(--bad-soft)' },
  needs_review: { label: 'Needs Review', colorVar: 'var(--warn)', bgVar: 'var(--warn-soft)' },
  rejected: { label: 'Rejected', colorVar: 'var(--bad)', bgVar: 'var(--bad-soft)' },
  cancelled: { label: 'Cancelled', colorVar: 'var(--muted)', bgVar: 'var(--card-2)' },
  expired: { label: 'Expired', colorVar: 'var(--muted)', bgVar: 'var(--card-2)' },
};

export const PAYMENT_STATUS_META: Record<PaymentStatus, JobStatusBadgeMeta> = {
  unpaid: { label: 'Unpaid', colorVar: 'var(--warn)', bgVar: 'var(--warn-soft)' },
  pending_verification: { label: 'UPI Pending Verify', colorVar: 'var(--info)', bgVar: 'var(--info-soft)' },
  paid: { label: 'Paid', colorVar: 'var(--good)', bgVar: 'var(--good-soft)' },
  refunded: { label: 'Refunded', colorVar: 'var(--muted)', bgVar: 'var(--card-2)' },
};

export const DEVICE_STATUS_META: Record<DeviceOnlineStatus, JobStatusBadgeMeta> = {
  online: { label: 'Online', colorVar: 'var(--good)', bgVar: 'var(--good-soft)' },
  offline: { label: 'Offline (No Heartbeat)', colorVar: 'var(--warn)', bgVar: 'var(--warn-soft)' },
  pending: { label: 'Pending Activation', colorVar: 'var(--info)', bgVar: 'var(--info-soft)' },
  paused: { label: 'Paused', colorVar: 'var(--warn)', bgVar: 'var(--warn-soft)' },
  revoked: { label: 'Revoked', colorVar: 'var(--bad)', bgVar: 'var(--bad-soft)' },
};

export function getJobStatusMeta(status: string | null | undefined): JobStatusBadgeMeta {
  if (status && status in JOB_STATUS_META) {
    return JOB_STATUS_META[status as JobStatus];
  }
  return {
    label: status ? String(status).replace(/_/g, ' ') : 'Unknown',
    colorVar: 'var(--muted)',
    bgVar: 'var(--card-2)',
  };
}

export function getPaymentStatusMeta(status: string | null | undefined): JobStatusBadgeMeta {
  if (status && status in PAYMENT_STATUS_META) {
    return PAYMENT_STATUS_META[status as PaymentStatus];
  }
  return {
    label: status ? String(status).replace(/_/g, ' ') : 'Unpaid',
    colorVar: 'var(--muted)',
    bgVar: 'var(--card-2)',
  };
}

export function getDeviceStatusMeta(status: string | null | undefined): JobStatusBadgeMeta {
  if (status && status in DEVICE_STATUS_META) {
    return DEVICE_STATUS_META[status as DeviceOnlineStatus];
  }
  return DEVICE_STATUS_META.offline;
}

export function calculatePhysicalSheetsPerCopy(verifiedPageCount: number, printSides: PrintSides): number {
  if (!Number.isFinite(verifiedPageCount) || verifiedPageCount < 1) return 0;
  const pages = Math.floor(verifiedPageCount);
  return printSides === 'duplex' ? Math.ceil(pages / 2) : pages;
}

export function computeDeviceOnlineStatus(
  device: Pick<AdminDeviceSummary, 'device_status' | 'last_heartbeat_at'> | null | undefined,
  nowMs: number = Date.now(),
  staleThresholdSeconds = 90
): DeviceOnlineStatus {
  if (!device) return 'offline';
  if (device.device_status === 'revoked') return 'revoked';
  if (device.device_status === 'paused') return 'paused';
  if (device.device_status === 'pending') return 'pending';
  if (!device.last_heartbeat_at) return 'offline';
  const parsed = Date.parse(device.last_heartbeat_at);
  if (!Number.isFinite(parsed)) return 'offline';
  return nowMs - parsed <= staleThresholdSeconds * 1000 ? 'online' : 'offline';
}

export function formatCurrencyInr(amount: number | null | undefined): string {
  if (amount === null || amount === undefined || !Number.isFinite(Number(amount))) return '—';
  return `₹${Number(amount).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatDateTime(iso: string | null | undefined, fallback = '—'): string {
  if (!iso) return fallback;
  const parsed = Date.parse(iso);
  if (!Number.isFinite(parsed)) return fallback;
  return new Date(parsed).toLocaleString([], {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

export function formatFileSize(bytes: number | null | undefined): string {
  if (!bytes || !Number.isFinite(bytes)) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function getEligiblePrinters(printers: readonly AdminPrinterSummary[]): AdminPrinterSummary[] {
  return printers.filter(
    (p) =>
      !p.archived_at &&
      p.is_enabled &&
      p.printer_status !== 'disabled' &&
      p.approval_status !== 'pending_review' &&
      p.approval_status !== 'rejected'
  );
}

export function canAdminApproveCashJob(job: Pick<AdminPrintJobSummary, 'status' | 'payment_method'>): boolean {
  const reviewable = job.status === 'submitted' || job.status === 'under_review' || job.status === 'awaiting_payment';
  if (!reviewable) return false;
  // UPI verification auto-qualifies for the queue; explicit manual Approve is for Cash / non-UPI pending jobs
  return job.payment_method !== 'upi';
}

export function canAdminReleaseJobToQueue(job: Pick<AdminPrintJobSummary, 'status' | 'payment_status'>): boolean {
  return job.status === 'approved' && job.payment_status === 'paid';
}

export function canAdminCancelJob(job: Pick<AdminPrintJobSummary, 'status'>): boolean {
  return (
    job.status === 'draft' ||
    job.status === 'submitted' ||
    job.status === 'under_review' ||
    job.status === 'awaiting_payment' ||
    job.status === 'approved' ||
    job.status === 'queued' ||
    job.status === 'failed' ||
    job.status === 'needs_review'
  );
}

export function canAdminRetryOrReconcileJob(job: Pick<AdminPrintJobSummary, 'status'>): boolean {
  return job.status === 'failed' || job.status === 'needs_review';
}

export function isValidUpiHandle(upiId: string): boolean {
  return /^[a-zA-Z0-9._-]{2,64}@[a-zA-Z0-9.-]{2,64}$/.test(upiId.trim());
}

export function createEmptyPricingRuleDraft(): PricingRuleFormDraft {
  return {
    ruleId: null,
    ruleName: '',
    paperSize: 'A4',
    printMode: 'bw',
    printSides: 'single',
    pricingUnit: 'per_printed_page',
    rate: '',
    minimumCharge: '0',
    isActive: true,
  };
}

export function pricingRuleToDraft(rule: AdminPrintPricingRule): PricingRuleFormDraft {
  return {
    ruleId: rule.id,
    ruleName: rule.rule_name,
    paperSize: rule.paper_size,
    printMode: rule.print_mode,
    printSides: rule.print_sides,
    pricingUnit: rule.print_sides === 'duplex' ? 'per_physical_sheet' : rule.pricing_unit,
    rate: String(rule.rate),
    minimumCharge: String(rule.minimum_charge),
    isActive: rule.is_active,
  };
}

export function validatePricingRuleDraft(draft: PricingRuleFormDraft): string | null {
  if (draft.ruleName.trim().length < 2) {
    return 'Enter a rule name (at least 2 characters).';
  }
  if (draft.printSides === 'duplex' && draft.pricingUnit !== 'per_physical_sheet') {
    return 'Duplex print rules must strictly bill per_physical_sheet.';
  }
  const rate = Number(draft.rate);
  if (draft.rate.trim() === '' || !Number.isFinite(rate) || rate < 0) {
    return 'Enter a valid non-negative rate in INR.';
  }
  const minCharge = Number(draft.minimumCharge);
  if (draft.minimumCharge.trim() === '' || !Number.isFinite(minCharge) || minCharge < 0) {
    return 'Enter a valid non-negative minimum charge in INR.';
  }
  return null;
}
