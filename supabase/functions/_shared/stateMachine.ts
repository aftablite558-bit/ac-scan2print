// AC Scan2Print — Authoritative 16-State Job Lifecycle & Transition Guards
import { AppError, type JobStatus, type PrintJob } from './types.ts';

export const TERMINAL_JOB_STATUSES = new Set<JobStatus>([
  'completed',
  'rejected',
  'cancelled',
  'expired',
]);

export const ACTIVE_EXECUTION_STATUSES = new Set<JobStatus>([
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

const ALLOWED_TRANSITIONS: Record<JobStatus, readonly JobStatus[]> = {
  draft: ['submitted', 'cancelled', 'expired'],
  submitted: ['under_review', 'awaiting_payment', 'approved', 'rejected', 'cancelled', 'expired'],
  under_review: ['awaiting_payment', 'approved', 'rejected', 'cancelled', 'expired'],
  awaiting_payment: ['approved', 'rejected', 'cancelled', 'expired'],
  approved: ['queued', 'rejected', 'cancelled', 'expired'],
  queued: ['claimed', 'cancelled', 'failed'],
  claimed: ['downloading', 'queued', 'failed', 'needs_review'],
  downloading: ['printing', 'failed', 'needs_review'],
  printing: ['submitted_to_spooler', 'completed', 'failed', 'needs_review'],
  submitted_to_spooler: ['completed', 'failed', 'needs_review'],
  failed: ['queued', 'cancelled', 'expired'],
  needs_review: ['completed', 'failed', 'queued', 'cancelled', 'expired'],
  completed: [],
  rejected: [],
  cancelled: [],
  expired: [],
};

export function isTerminalStatus(status: JobStatus): boolean {
  return TERMINAL_JOB_STATUSES.has(status);
}

export function canTransition(from: JobStatus, to: JobStatus): boolean {
  if (from === to) return false;
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export function assertTransition(from: JobStatus, to: JobStatus, reason?: string): void {
  if (!canTransition(from, to)) {
    throw new AppError(
      409,
      'INVALID_STATE_TRANSITION',
      reason ?? `Transition from '${from}' to '${to}' is not permitted.`
    );
  }
}

export function assertCanReleaseToQueue(job: Pick<PrintJob, 'status' | 'payment_status'>): void {
  if (job.status === 'queued') {
    throw new AppError(409, 'JOB_ALREADY_QUEUED', 'Print job is already queued.');
  }
  if (job.status !== 'approved') {
    throw new AppError(
      409,
      'INVALID_STATE_TRANSITION',
      `Job must be in 'approved' state before queue release (current='${job.status}').`
    );
  }
  if (job.payment_status !== 'paid') {
    throw new AppError(
      409,
      'PAYMENT_NOT_VERIFIED',
      'Payment must be verified as paid before queue release.'
    );
  }
}

export function assertAgentMayRetry(status: JobStatus): void {
  if (status === 'needs_review') {
    throw new AppError(
      409,
      'MANUAL_RECONCILIATION_REQUIRED',
      'Jobs in needs_review cannot be auto-retried; explicit Admin review is required.'
    );
  }
}

export function canCleanupDeleteFiles(
  job: Pick<PrintJob, 'status' | 'payment_status' | 'created_at' | 'updated_at' | 'completed_at'>,
  hasPendingVerificationPayment: boolean,
  nowMs: number,
  retentionHours: {
    draftHours: number;
    completedHours: number;
    failedHours: number;
  }
): { eligible: boolean; reason: string } {
  if (hasPendingVerificationPayment || job.payment_status === 'pending_verification') {
    return { eligible: false, reason: 'disputed_or_pending_payment' };
  }
  if (ACTIVE_EXECUTION_STATUSES.has(job.status)) {
    return { eligible: false, reason: 'active_job_protected' };
  }

  const refIso = job.completed_at ?? job.updated_at ?? job.created_at;
  const ageMs = nowMs - Date.parse(refIso);
  const hourMs = 3600 * 1000;

  if (job.status === 'draft') {
    const eligible = ageMs >= retentionHours.draftHours * hourMs;
    return { eligible, reason: eligible ? 'draft_ttl_expired' : 'within_draft_ttl' };
  }

  if (job.status === 'completed' || job.status === 'rejected' || job.status === 'cancelled' || job.status === 'expired') {
    const eligible = ageMs >= retentionHours.completedHours * hourMs;
    return { eligible, reason: eligible ? 'terminal_ttl_expired' : 'within_terminal_ttl' };
  }

  if (job.status === 'failed' || job.status === 'needs_review') {
    const eligible = ageMs >= retentionHours.failedHours * hourMs;
    return { eligible, reason: eligible ? 'failed_ttl_expired' : 'within_failed_ttl' };
  }

  return { eligible: false, reason: 'protected_state' };
}
