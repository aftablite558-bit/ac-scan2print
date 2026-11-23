// AC Scan2Print — Phase 4 Shared Pure Admin Print Management Calculations & Filters
// Runs identically in Supabase Edge Functions (Deno) and Node.js unit tests.

import type {
  JobStatus,
  PaperSize,
  PaymentMethod,
  PaymentStatus,
  PrintDevice,
  PrintJob,
  PrintMode,
  PrintPayment,
  PrintPrinter,
  PrintSides,
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
