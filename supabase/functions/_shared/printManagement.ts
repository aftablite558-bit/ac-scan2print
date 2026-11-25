// AC Scan2Print — Phase 4 Shared Pure Admin Print Management Calculations & Filters
// Runs identically in Supabase Edge Functions (Deno) and Node.js unit tests.

import type {
  JobStatus,
  PaperSize,
  PaymentMethod,
  PaymentStatus,
  PilotChecklist,
  PilotStage,
  PrintCleanupLog,
  PrintDevice,
  PrintEvent,
  PrintJob,
  PrintJobAttempt,
  PrintMode,
  PrintPayment,
  PrintPaymentSettings,
  PrintPricingRule,
  PrintPrinter,
  PrintSides,
  PrintSystemSettings,
} from './types.ts';

export type DeviceOnlineStatus = 'online' | 'offline' | 'pending' | 'paused' | 'revoked';

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

export interface AdminJobListFilter {
  search?: string;
  status?: string;
  paymentStatus?: string;
  paymentMethod?: string;
  printMode?: string;
  printSides?: string;
  paperSize?: string;
  dateFrom?: string;
  dateTo?: string;
  sortOrder?: 'asc' | 'desc';
}

const PENDING_STATUSES = new Set<JobStatus>(['submitted', 'under_review', 'awaiting_payment']);
const PROCESSING_STATUSES = new Set<JobStatus>([
  'claimed',
  'downloading',
  'printing',
  'submitted_to_spooler',
]);
const QUEUE_RELEVANT_STATUSES = new Set<JobStatus>([
  'queued',
  'claimed',
  'downloading',
  'printing',
  'submitted_to_spooler',
  'failed',
  'needs_review',
]);
const ACTIVE_QUEUE_ORDERED_STATUSES = new Set<JobStatus>([
  'queued',
  'claimed',
  'downloading',
  'printing',
  'submitted_to_spooler',
]);

function roundInr(value: number): number {
  return Math.round(value * 100) / 100;
}

export function computeDeviceHeartbeatStatus(
  device: Pick<PrintDevice, 'device_status' | 'last_heartbeat_at'> | null | undefined,
  nowMs: number = Date.now(),
  staleThresholdSeconds = 90
): DeviceOnlineStatus {
  if (!device) return 'offline';
  if (device.device_status === 'revoked') return 'revoked';
  if (device.device_status === 'paused') return 'paused';
  if (device.device_status === 'pending') return 'pending';
  if (!device.last_heartbeat_at) return 'offline';
  const hbMs = Date.parse(device.last_heartbeat_at);
  if (!Number.isFinite(hbMs)) return 'offline';
  return nowMs - hbMs <= staleThresholdSeconds * 1000 ? 'online' : 'offline';
}

export function computeAdminPrintDashboardMetrics(
  jobs: readonly PrintJob[],
  payments: readonly PrintPayment[],
  nowIso: string = new Date().toISOString()
): AdminPrintDashboardMetrics {
  const todayDatePrefix = nowIso.slice(0, 10);

  let pendingJobs = 0;
  let approvedJobs = 0;
  let queuedJobs = 0;
  let processingJobs = 0;
  let completedJobs = 0;
  let failedJobs = 0;
  let needsReviewJobs = 0;
  let cancelledJobs = 0;
  let rejectedJobs = 0;
  let expiredJobs = 0;
  let draftJobs = 0;
  let todayJobs = 0;
  let todayCompletedJobs = 0;
  let totalPhysicalSheets = 0;
  let completedPhysicalSheets = 0;

  for (const job of jobs) {
    if (PENDING_STATUSES.has(job.status)) pendingJobs += 1;
    else if (job.status === 'approved') approvedJobs += 1;
    else if (job.status === 'queued') queuedJobs += 1;
    else if (PROCESSING_STATUSES.has(job.status)) processingJobs += 1;
    else if (job.status === 'completed') completedJobs += 1;
    else if (job.status === 'failed') failedJobs += 1;
    else if (job.status === 'needs_review') needsReviewJobs += 1;
    else if (job.status === 'cancelled') cancelledJobs += 1;
    else if (job.status === 'rejected') rejectedJobs += 1;
    else if (job.status === 'expired') expiredJobs += 1;
    else if (job.status === 'draft') draftJobs += 1;

    const activityRef = job.submitted_at ?? job.created_at;
    if (job.status !== 'draft' && activityRef.slice(0, 10) === todayDatePrefix) {
      todayJobs += 1;
    }
    if (job.status === 'completed' && (job.completed_at ?? job.updated_at).slice(0, 10) === todayDatePrefix) {
      todayCompletedJobs += 1;
    }

    const sheetsForJob = Math.max(0, job.physical_sheet_count ?? 0) * Math.max(1, job.copies ?? 1);
    if (
      job.status !== 'draft' &&
      job.status !== 'cancelled' &&
      job.status !== 'rejected' &&
      job.status !== 'expired'
    ) {
      totalPhysicalSheets += sheetsForJob;
    }
    if (job.status === 'completed') {
      completedPhysicalSheets += sheetsForJob;
    }
  }

  let totalRevenuePaise = 0;
  let todayRevenuePaise = 0;
  let upiRevenuePaise = 0;
  let cashRevenuePaise = 0;
  let pendingVerificationPayments = 0;

  for (const payment of payments) {
    if (payment.payment_status === 'pending_verification') {
      pendingVerificationPayments += 1;
    }
    if (payment.payment_status !== 'paid') continue;

    const amountPaise = Math.round(Number(payment.amount ?? 0) * 100);
    if (!Number.isFinite(amountPaise) || amountPaise < 0) continue;

    totalRevenuePaise += amountPaise;
    if (payment.payment_method === 'upi') upiRevenuePaise += amountPaise;
    else if (payment.payment_method === 'cash') cashRevenuePaise += amountPaise;

    const paidDateRef = (payment.verified_at ?? payment.created_at).slice(0, 10);
    if (paidDateRef === todayDatePrefix) {
      todayRevenuePaise += amountPaise;
    }
  }

  return {
    totalJobs: jobs.length,
    pendingJobs,
    approvedJobs,
    queuedJobs,
    processingJobs,
    completedJobs,
    failedJobs,
    needsReviewJobs,
    cancelledJobs,
    rejectedJobs,
    expiredJobs,
    draftJobs,
    todayJobs,
    todayCompletedJobs,
    totalPhysicalSheets,
    completedPhysicalSheets,
    totalConfirmedRevenue: roundInr(totalRevenuePaise / 100),
    todayRevenue: roundInr(todayRevenuePaise / 100),
    revenueByMethod: {
      upi: roundInr(upiRevenuePaise / 100),
      cash: roundInr(cashRevenuePaise / 100),
    },
    pendingVerificationPayments,
  };
}

export function filterAndSortAdminJobs(
  jobs: readonly PrintJob[],
  filters: AdminJobListFilter,
  latestPaymentRefByJobId: ReadonlyMap<string, string | null> = new Map()
): PrintJob[] {
  const q = (filters.search ?? '').trim().toLowerCase();
  const statusFilter = (filters.status ?? '').trim();
  const paymentStatusFilter = (filters.paymentStatus ?? '').trim();
  const paymentMethodFilter = (filters.paymentMethod ?? '').trim();
  const printModeFilter = (filters.printMode ?? '').trim();
  const printSidesFilter = (filters.printSides ?? '').trim();
  const paperSizeFilter = (filters.paperSize ?? '').trim();
  const dateFrom = (filters.dateFrom ?? '').trim();
  const dateTo = (filters.dateTo ?? '').trim();
  const sortOrder = filters.sortOrder === 'asc' ? 'asc' : 'desc';

  const filtered = jobs.filter((job) => {
    if (statusFilter && statusFilter !== 'all') {
      if (statusFilter === 'pending') {
        if (!PENDING_STATUSES.has(job.status)) return false;
      } else if (statusFilter === 'processing') {
        if (!PROCESSING_STATUSES.has(job.status)) return false;
      } else if (statusFilter === 'attention') {
        if (job.status !== 'failed' && job.status !== 'needs_review') return false;
      } else if (job.status !== statusFilter) {
        return false;
      }
    }

    if (paymentStatusFilter && paymentStatusFilter !== 'all' && job.payment_status !== paymentStatusFilter) {
      return false;
    }
    if (paymentMethodFilter && paymentMethodFilter !== 'all' && job.payment_method !== paymentMethodFilter) {
      return false;
    }
    if (printModeFilter && printModeFilter !== 'all' && job.print_mode !== printModeFilter) {
      return false;
    }
    if (printSidesFilter && printSidesFilter !== 'all' && job.print_sides !== printSidesFilter) {
      return false;
    }
    if (paperSizeFilter && paperSizeFilter !== 'all' && job.paper_size !== paperSizeFilter) {
      return false;
    }

    const createdDate = job.created_at.slice(0, 10);
    if (dateFrom && createdDate < dateFrom) return false;
    if (dateTo && createdDate > dateTo) return false;

    if (q) {
      const txnRef = (latestPaymentRefByJobId.get(job.id) ?? '').toLowerCase();
      const matches =
        job.job_number.toLowerCase().includes(q) ||
        job.id.toLowerCase().includes(q) ||
        (job.customer_name ?? '').toLowerCase().includes(q) ||
        (job.customer_phone ?? '').toLowerCase().includes(q) ||
        txnRef.includes(q);
      if (!matches) return false;
    }

    return true;
  });

  filtered.sort((a, b) => {
    const diff = Date.parse(a.created_at) - Date.parse(b.created_at);
    return sortOrder === 'asc' ? diff : -diff;
  });

  return filtered;
}

export function buildAdminQueueItems(
  jobs: readonly PrintJob[],
  printers: readonly PrintPrinter[],
  devices: readonly PrintDevice[],
  nowIso: string = new Date().toISOString()
): AdminQueueItem[] {
  const nowMs = Date.parse(nowIso);
  const printerMap = new Map(printers.map((p) => [p.id, p]));
  const deviceMap = new Map(devices.map((d) => [d.id, d]));

  const relevant = jobs
    .filter((job) => QUEUE_RELEVANT_STATUSES.has(job.status))
    .sort((a, b) => {
      const aActive = ACTIVE_QUEUE_ORDERED_STATUSES.has(a.status) ? 0 : 1;
      const bActive = ACTIVE_QUEUE_ORDERED_STATUSES.has(b.status) ? 0 : 1;
      if (aActive !== bActive) return aActive - bActive;
      const aTime = Date.parse(a.approved_at ?? a.submitted_at ?? a.created_at);
      const bTime = Date.parse(b.approved_at ?? b.submitted_at ?? b.created_at);
      return aTime - bTime;
    });

  let nextQueuePos = 1;
  return relevant.map((job) => {
    const printer = job.assigned_printer_id ? printerMap.get(job.assigned_printer_id) ?? null : null;
    const device = printer?.device_id ? deviceMap.get(printer.device_id) ?? null : null;
    const isActiveQueue = ACTIVE_QUEUE_ORDERED_STATUSES.has(job.status);
    const queuePosition = isActiveQueue ? nextQueuePos++ : null;
    return {
      queuePosition,
      jobId: job.id,
      jobNumber: job.job_number,
      customerName: job.customer_name,
      status: job.status,
      paymentStatus: job.payment_status,
      paymentMethod: job.payment_method,
      paperSize: job.paper_size,
      printMode: job.print_mode,
      printSides: job.print_sides,
      copies: job.copies,
      verifiedPageCount: job.verified_page_count,
      physicalSheetCount: job.physical_sheet_count,
      totalPhysicalSheets: Math.max(0, job.physical_sheet_count ?? 0) * Math.max(1, job.copies ?? 1),
      finalAmount: job.final_amount,
      assignedPrinterId: job.assigned_printer_id,
      assignedPrinterName: printer?.printer_name ?? null,
      deviceId: device?.id ?? null,
      deviceName: device?.device_name ?? null,
      deviceOnlineStatus: computeDeviceHeartbeatStatus(device, nowMs),
      submittedAt: job.submitted_at,
      approvedAt: job.approved_at,
      createdAt: job.created_at,
    };
  });
}

export interface PilotReadinessGate {
  id: string;
  label: string;
  passed: boolean;
  detail: string;
  blockingForGoLive: boolean;
}

export interface AdminPilotSummary {
  pilotStage: PilotStage;
  intakePaused: boolean;
  pauseReason: string | null;
  pilotTargetJobs: number;
  goLiveApprovedAt: string | null;
  checklist: PilotChecklist;
  submittedJobsCount: number;
  progressPct: number;
  completedCount: number;
  failedCount: number;
  needsReviewCount: number;
  rejectedCount: number;
  cancelledCount: number;
  activeInFlightCount: number;
  completionRatePct: number | null;
  failureOrReviewRatePct: number | null;
  avgReviewToApproveMinutes: number | null;
  avgEndToEndMinutes: number | null;
  paymentMismatchOrRejectionCount: number;
  totalAttemptsCount: number;
  reprintOrRetryCount: number;
  lastCleanupRun: PrintCleanupLog | null;
  readinessGates: PilotReadinessGate[];
  readyForGoLive: boolean;
  blockingGateReasons: string[];
}

export const DEFAULT_PILOT_CHECKLIST: PilotChecklist = {
  shopPcInstalled: false,
  printerTested: false,
  qrPosterDisplayed: false,
  staffTrained: false,
  backupTested: false,
};

export function normalizePilotChecklist(raw: unknown): PilotChecklist {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ...DEFAULT_PILOT_CHECKLIST };
  }
  const obj = raw as Record<string, unknown>;
  return {
    shopPcInstalled: obj.shopPcInstalled === true,
    printerTested: obj.printerTested === true,
    qrPosterDisplayed: obj.qrPosterDisplayed === true,
    staffTrained: obj.staffTrained === true,
    backupTested: obj.backupTested === true,
  };
}

export function isValidPortalUrl(rawUrl: string | null | undefined): boolean {
  if (!rawUrl || typeof rawUrl !== 'string') return false;
  const trimmed = rawUrl.trim();
  if (!trimmed) return false;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'https:') return true;
    if (
      parsed.protocol === 'http:' &&
      (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1')
    ) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

const ACTIVE_IN_FLIGHT_STATUSES = new Set<JobStatus>([
  'submitted',
  'under_review',
  'awaiting_payment',
  'approved',
  'queued',
  'claimed',
  'downloading',
  'printing',
  'submitted_to_spooler',
]);

export function computeAdminPilotSummary(input: {
  systemSettings: PrintSystemSettings;
  paymentSettings: PrintPaymentSettings;
  jobs: readonly PrintJob[];
  payments: readonly PrintPayment[];
  printers: readonly PrintPrinter[];
  devices: readonly PrintDevice[];
  pricingRules: readonly PrintPricingRule[];
  attempts?: readonly PrintJobAttempt[];
  events?: readonly PrintEvent[];
  cleanupLogs?: readonly PrintCleanupLog[];
  nowIso?: string;
}): AdminPilotSummary {
  const nowIso = input.nowIso ?? new Date().toISOString();
  const nowMs = Date.parse(nowIso);
  const sys = input.systemSettings;
  const checklist = normalizePilotChecklist(sys.pilot_checklist);
  const pilotStage: PilotStage =
    sys.pilot_stage === 'supervised_pilot' ||
    sys.pilot_stage === 'live_pilot' ||
    sys.pilot_stage === 'production'
      ? sys.pilot_stage
      : 'dry_run';
  const pilotTargetJobs = Math.max(10, Math.min(500, Number(sys.pilot_target_jobs || 100)));

  const nonDraftJobs = input.jobs.filter((j) => j.status !== 'draft');
  const submittedJobsCount = nonDraftJobs.length;
  let completedCount = 0;
  let failedCount = 0;
  let needsReviewCount = 0;
  let rejectedCount = 0;
  let cancelledCount = 0;
  let activeInFlightCount = 0;

  let reviewApproveSumMin = 0;
  let reviewApproveSamples = 0;
  let endToEndSumMin = 0;
  let endToEndSamples = 0;

  for (const job of nonDraftJobs) {
    if (job.status === 'completed') completedCount += 1;
    else if (job.status === 'failed') failedCount += 1;
    else if (job.status === 'needs_review') needsReviewCount += 1;
    else if (job.status === 'rejected') rejectedCount += 1;
    else if (job.status === 'cancelled') cancelledCount += 1;

    if (ACTIVE_IN_FLIGHT_STATUSES.has(job.status)) {
      activeInFlightCount += 1;
    }

    const subMs = job.submitted_at ? Date.parse(job.submitted_at) : NaN;
    const appMs = job.approved_at ? Date.parse(job.approved_at) : NaN;
    const compMs = job.completed_at ? Date.parse(job.completed_at) : NaN;

    if (Number.isFinite(subMs) && Number.isFinite(appMs) && appMs >= subMs) {
      reviewApproveSumMin += (appMs - subMs) / 60000;
      reviewApproveSamples += 1;
    }
    if (job.status === 'completed' && Number.isFinite(subMs) && Number.isFinite(compMs) && compMs >= subMs) {
      endToEndSumMin += (compMs - subMs) / 60000;
      endToEndSamples += 1;
    }
  }

  const rejectedPaymentIds = new Set<string>();
  let fallbackRejectedEvents = 0;
  for (const p of input.payments) {
    if (p.rejection_reason && p.rejection_reason.trim()) {
      rejectedPaymentIds.add(p.id);
    }
  }
  for (const ev of input.events ?? []) {
    if (ev.event_type === 'payment_verification_rejected') {
      const pid = typeof ev.metadata?.payment_id === 'string' ? ev.metadata.payment_id : '';
      if (pid) rejectedPaymentIds.add(pid);
      else fallbackRejectedEvents += 1;
    }
  }
  const paymentMismatchOrRejectionCount = rejectedPaymentIds.size + fallbackRejectedEvents;

  const attempts = input.attempts ?? [];
  const totalAttemptsCount = attempts.length;
  const retryEventsCount = (input.events ?? []).filter(
    (e) => e.event_type === 'admin_manual_retry_authorized'
  ).length;
  const multiAttemptCount = attempts.filter((a) => a.attempt_number > 1).length;
  const reprintOrRetryCount = Math.max(multiAttemptCount, retryEventsCount);

  const completionRatePct =
    submittedJobsCount > 0 ? roundInr((completedCount / submittedJobsCount) * 100) : null;
  const failureOrReviewRatePct =
    submittedJobsCount > 0
      ? roundInr(((failedCount + needsReviewCount) / submittedJobsCount) * 100)
      : null;
  const avgReviewToApproveMinutes =
    reviewApproveSamples > 0 ? Math.round((reviewApproveSumMin / reviewApproveSamples) * 10) / 10 : null;
  const avgEndToEndMinutes =
    endToEndSamples > 0 ? Math.round((endToEndSumMin / endToEndSamples) * 10) / 10 : null;

  const progressPct = Math.min(100, Math.round((submittedJobsCount / pilotTargetJobs) * 100));

  const onlineAgents = input.devices.filter((d) => computeDeviceHeartbeatStatus(d, nowMs) === 'online');
  const verifiedEnabledPrinters = input.printers.filter(
    (p) =>
      !p.archived_at &&
      p.is_enabled &&
      (p.approval_status === 'manual' || p.approval_status === 'approved') &&
      p.printer_status !== 'disabled' &&
      p.capabilities_verified
  );
  const activePricingRules = input.pricingRules.filter((r) => r.is_active);
  const upiConfigured = Boolean(
    input.paymentSettings.upi_enabled &&
      input.paymentSettings.upi_id &&
      input.paymentSettings.upi_qr_storage_path
  );
  const paidJobsExist = input.payments.some((p) => p.payment_status === 'paid');
  const portalUrlValid = isValidPortalUrl(sys.customer_portal_url);
  const checklistComplete =
    checklist.shopPcInstalled &&
    checklist.printerTested &&
    checklist.qrPosterDisplayed &&
    checklist.staffTrained &&
    checklist.backupTested;

  const lastCleanupRun =
    input.cleanupLogs && input.cleanupLogs.length > 0
      ? [...input.cleanupLogs].sort((a, b) => Date.parse(b.executed_at) - Date.parse(a.executed_at))[0]
      : null;

  const readinessGates: PilotReadinessGate[] = [
    {
      id: 'agent_online',
      label: 'Shop PC Print Agent Online',
      passed: onlineAgents.length > 0,
      detail:
        onlineAgents.length > 0
          ? `${onlineAgents.length} active agent(s) reporting heartbeat within 90s.`
          : 'No Print Agent heartbeat detected within last 90 seconds.',
      blockingForGoLive: false,
    },
    {
      id: 'verified_printer',
      label: 'Physically Verified Enabled Printer',
      passed: verifiedEnabledPrinters.length > 0,
      detail:
        verifiedEnabledPrinters.length > 0
          ? `${verifiedEnabledPrinters.length} verified & enabled counter printer(s) ready.`
          : 'Verify capabilities and enable at least one counter printer.',
      blockingForGoLive: true,
    },
    {
      id: 'active_pricing_rule',
      label: 'Active Authoritative Pricing Rule',
      passed: activePricingRules.length > 0,
      detail:
        activePricingRules.length > 0
          ? `${activePricingRules.length} active pricing rule(s) enforced server-side.`
          : 'Create and activate at least one paper/mode pricing rule.',
      blockingForGoLive: true,
    },
    {
      id: 'payment_ready',
      label: 'Payment Channel Ready (UPI or Counter Cash)',
      passed: upiConfigured || paidJobsExist,
      detail: upiConfigured
        ? `UPI (${input.paymentSettings.upi_id}) + QR configured with Counter Cash fallback.`
        : paidJobsExist
          ? 'Counter Cash payment verified on real job (UPI optional or pending QR upload).'
          : 'Configure UPI ID + QR code or verify at least one Counter Cash payment.',
      blockingForGoLive: false,
    },
    {
      id: 'portal_url_configured',
      label: 'Permanent Customer QR Portal URL',
      passed: portalUrlValid,
      detail: portalUrlValid
        ? `Locked to ${sys.customer_portal_url}`
        : 'Save a valid HTTPS customer portal URL for counter QR standees.',
      blockingForGoLive: true,
    },
    {
      id: 'retention_confirmed',
      label: 'Retention Policy Confirmed & Cleanup Active',
      passed: Boolean(sys.retention_policy_confirmed && sys.auto_cleanup_enabled),
      detail: sys.retention_policy_confirmed
        ? sys.auto_cleanup_enabled
          ? `Confirmed (Draft ${sys.draft_retention_hours}h · Completed ${sys.completed_retention_hours}h · Failed ${sys.failed_retention_hours}h).`
          : 'Retention policy confirmed, but automatic cleanup is still disabled.'
        : 'Review and confirm document auto-purge retention policy.',
      blockingForGoLive: true,
    },
    {
      id: 'dry_run_completed',
      label: 'End-to-End Dry Run Completed',
      passed: completedCount >= 1,
      detail:
        completedCount >= 1
          ? `${completedCount} real job(s) completed end-to-end.`
          : 'Complete at least 1 real end-to-end print job before approving Go-Live.',
      blockingForGoLive: true,
    },
    {
      id: 'checklist_signed_off',
      label: 'Operator Counter Checklist Signed Off',
      passed: checklistComplete,
      detail: checklistComplete
        ? 'All 5 physical counter & operator readiness items confirmed.'
        : 'Confirm all 5 counter checklist items (PC, printer, QR poster, staff SOP, backup check).',
      blockingForGoLive: true,
    },
  ];

  const blockingGateReasons = readinessGates
    .filter((g) => g.blockingForGoLive && !g.passed)
    .map((g) => `${g.label}: ${g.detail}`);

  return {
    pilotStage,
    intakePaused: Boolean(sys.pilot_intake_paused),
    pauseReason: sys.pilot_pause_reason ?? null,
    pilotTargetJobs,
    goLiveApprovedAt: sys.pilot_go_live_approved_at ?? null,
    checklist,
    submittedJobsCount,
    progressPct,
    completedCount,
    failedCount,
    needsReviewCount,
    rejectedCount,
    cancelledCount,
    activeInFlightCount,
    completionRatePct,
    failureOrReviewRatePct,
    avgReviewToApproveMinutes,
    avgEndToEndMinutes,
    paymentMismatchOrRejectionCount,
    totalAttemptsCount,
    reprintOrRetryCount,
    lastCleanupRun,
    readinessGates,
    readyForGoLive: blockingGateReasons.length === 0,
    blockingGateReasons,
  };
}

