import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Banknote,
  CheckCircle2,
  Clock,
  Download,
  Eye,
  FileText,
  Printer,
  QrCode,
  RefreshCw,
  ShieldCheck,
  X,
  XCircle,
} from 'lucide-react';
import {
  calculatePhysicalSheetsPerCopy,
  canAdminApproveCashJob,
  canAdminCancelJob,
  canAdminReleaseJobToQueue,
  canAdminRetryOrReconcileJob,
  formatCurrencyInr,
  formatDateTime,
  formatFileSize,
  getEligiblePrinters,
  getJobStatusMeta,
  getPaymentStatusMeta,
  type AdminJobDetailResponse,
  type AdminPrinterSummary,
} from '../../utils/printManagement';
import type { ConfirmDialogConfig } from './ConfirmActionDialog';

interface PrintJobDetailModalProps {
  open: boolean;
  loading: boolean;
  error: string | null;
  detail: AdminJobDetailResponse | null;
  printers: AdminPrinterSummary[];
  busy: boolean;
  onClose: () => void;
  onRefresh: () => void;
  onRequestConfirm: (config: ConfirmDialogConfig) => void;
  onExecuteAction: (fn: () => Promise<void>) => Promise<void>;
  invokeAdminEdgeFunction: <T = unknown>(fnName: string, body?: Record<string, unknown>) => Promise<T>;
  showToast: (text: string, tone?: 'good' | 'bad') => void;
}

export const PrintJobDetailModal: React.FC<PrintJobDetailModalProps> = ({
  open,
  loading,
  error,
  detail,
  printers,
  busy,
  onClose,
  onRefresh,
  onRequestConfirm,
  onExecuteAction,
  invokeAdminEdgeFunction,
  showToast,
}) => {
  const [selectedPrinterId, setSelectedPrinterId] = useState('');
  const [previewFileId, setPreviewFileId] = useState<string | null>(null);
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [overrideAmount, setOverrideAmount] = useState('');
  const [overrideReason, setOverrideReason] = useState('');

  const eligiblePrinters = getEligiblePrinters(printers);

  useEffect(() => {
    setPreviewFileId(null);
    setOverrideOpen(false);
    if (!detail?.job) {
      setSelectedPrinterId('');
      return;
    }
    const existingEligible =
      detail.job.assigned_printer_id &&
      eligiblePrinters.some((p) => p.id === detail.job.assigned_printer_id)
        ? detail.job.assigned_printer_id
        : '';
    setSelectedPrinterId(existingEligible || (eligiblePrinters[0]?.id ?? ''));
    setOverrideAmount(detail.job.final_amount !== null ? String(detail.job.final_amount) : '');
    setOverrideReason('');
  }, [detail?.job?.id, detail?.job?.assigned_printer_id, eligiblePrinters.length]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, busy, onClose]);

  if (!open) return null;

  const job = detail?.job ?? null;
  const pendingUpiPayment =
    detail?.payments.find(
      (p) => p.payment_method === 'upi' && p.payment_status === 'pending_verification'
    ) ?? null;

  const verifiedPages = job?.verified_page_count ?? 0;
  const calculatedSheetsPerCopy =
    job && verifiedPages > 0
      ? calculatePhysicalSheetsPerCopy(verifiedPages, job.print_sides)
      : job?.physical_sheet_count ?? 0;
  const totalPhysicalSheets = calculatedSheetsPerCopy * Math.max(1, job?.copies ?? 1);

  const previewFile = detail?.files.find((f) => f.id === previewFileId) ?? null;

  const handleOverridePrice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!job || busy) return;
    const numericAmount = Number(overrideAmount);
    if (!Number.isFinite(numericAmount) || numericAmount < 0) {
      showToast('Enter a valid non-negative final amount.', 'bad');
      return;
    }
    if (overrideReason.trim().length < 5) {
      showToast('Price override requires a reason of at least 5 characters.', 'bad');
      return;
    }
    await onExecuteAction(async () => {
      await invokeAdminEdgeFunction('admin-review-print-job', {
        jobId: job.id,
        action: 'override_price',
        finalAmount: numericAmount,
        reason: overrideReason.trim(),
      });
      setOverrideOpen(false);
      showToast('Job price updated with audit record.', 'good');
      onRefresh();
    });
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4">
      <div className="fixed inset-0" onClick={() => !busy && onClose()} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={job ? `Print Job ${job.job_number} Details` : 'Print Job Details'}
        className="relative w-full max-w-[960px] max-h-[92vh] glass-solid rounded-[24px] border border-[var(--line)] shadow-2xl flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-[var(--line)] flex items-start justify-between gap-4 shrink-0">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-[19px] font-bold tracking-tight">
                {job ? `Job ${job.job_number}` : 'Print Job Details'}
              </h2>
              {job && (
                <>
                  {(() => {
                    const statusMeta = getJobStatusMeta(job.status);
                    const payMeta = getPaymentStatusMeta(job.payment_status);
                    return (
                      <>
                        <span
                          className="px-2.5 py-0.5 rounded-full text-[11.5px] font-semibold"
                          style={{
                            color: statusMeta.colorVar,
                            background: statusMeta.bgVar,
                          }}
                        >
                          {statusMeta.label}
                        </span>
                        <span
                          className="px-2.5 py-0.5 rounded-full text-[11.5px] font-semibold"
                          style={{
                            color: payMeta.colorVar,
                            background: payMeta.bgVar,
                          }}
                        >
                          {payMeta.label}
                        </span>
                      </>
                    );
                  })()}
                </>
              )}
            </div>
            {job && (
              <p className="text-[12px] text-[var(--muted)] mt-1 font-mono break-all">
                ID: {job.id} · Created {formatDateTime(job.created_at)}
              </p>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              disabled={loading || busy}
              onClick={onRefresh}
              aria-label="Refresh job details"
              className="w-8 h-8 rounded-[10px] btn-ghost flex items-center justify-center cursor-pointer"
            >
              <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={onClose}
              aria-label="Close job detail modal"
              className="w-8 h-8 rounded-[10px] btn-ghost flex items-center justify-center cursor-pointer"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto custom-scroll p-5 space-y-5">
          {loading && !detail && (
            <div className="py-12 text-center text-[13.5px] text-[var(--muted)]">
              Loading job documents, payments, and audit log...
            </div>
          )}

          {error && (
            <div className="rounded-[14px] p-3.5 bg-[var(--bad-soft)] text-[var(--bad)] text-[13px] font-medium">
              {error}
            </div>
          )}

          {detail && job && (
            <>
              {/* Strict Payment & Approval Rule Banner */}
              <div className="rounded-[16px] p-3.5 bg-[var(--card-2)] border border-[var(--line)] text-[12.5px] text-[var(--ink-2)] flex items-start gap-2.5">
                <ShieldCheck size={16} className="text-[var(--accent-text)] shrink-0 mt-0.5" />
                <div>
                  {pendingUpiPayment ? (
                    <span>
                      <strong>UPI Workflow:</strong> Verifying this UPI payment automatically marks the job{' '}
                      <strong>Paid</strong> and qualifies it for the Print Queue without needing a separate manual
                      Approve click. Select a printer below to release directly, or verify first and assign later.
                    </span>
                  ) : job.payment_method === 'cash' || job.payment_status === 'unpaid' ? (
                    <span>
                      <strong>Cash / Unverified Workflow:</strong> Cash print jobs require explicit Admin{' '}
                      <strong>Confirm Cash</strong> and <strong>Approve Job</strong> actions before release to the
                      Print Queue. Unpaid jobs are strictly blocked from execution.
                    </span>
                  ) : (
                    <span>
                      <strong>Print Execution Guard:</strong> Only Paid + Approved jobs may be released to an enabled
                      printer in the Print Queue. All actions are recorded in the immutable audit log.
                    </span>
                  )}
                </div>
              </div>

              {/* Action Controls */}
              <div className="rounded-[18px] p-4 bg-[var(--card-2)] border border-[var(--line)] space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="text-[13px] font-bold">Administrative Actions</div>
                  {(pendingUpiPayment || canAdminReleaseJobToQueue(job) || canAdminRetryOrReconcileJob(job)) && (
                    <div className="flex items-center gap-2 min-w-[230px]">
                      <label htmlFor="detail-printer-select" className="text-[12px] text-[var(--muted)] shrink-0">
                        Target Printer:
                      </label>
                      <select
                        id="detail-printer-select"
                        value={selectedPrinterId}
                        onChange={(e) => setSelectedPrinterId(e.target.value)}
                        disabled={busy || eligiblePrinters.length === 0}
                        className="flex-1 rounded-[10px] bg-[var(--card-1)] border border-[var(--line)] px-2.5 py-1.5 text-[12.5px]"
                      >
                        {eligiblePrinters.length === 0 ? (
                          <option value="">No enabled printers available</option>
                        ) : (
                          eligiblePrinters.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.printer_name} ({p.printer_status})
                            </option>
                          ))
                        )}
                      </select>
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2.5">
                  {/* UPI Verify & Auto-Qualify / Auto-Release */}
                  {pendingUpiPayment && (
                    <>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          onRequestConfirm({
                            title: `Verify UPI Payment (${pendingUpiPayment.transaction_reference || 'UTR'})`,
                            description: selectedPrinterId
                              ? `Confirm ₹${pendingUpiPayment.amount.toFixed(2)} UPI receipt? Job ${job.job_number} will automatically qualify and be released to the Print Queue on the selected printer.`
                              : `Confirm ₹${pendingUpiPayment.amount.toFixed(2)} UPI receipt? Job ${job.job_number} will automatically qualify (status: Approved, payment: Paid) with no extra Approve step needed.`,
                            confirmLabel: selectedPrinterId
                              ? 'Verify UPI & Release to Queue'
                              : 'Verify UPI & Qualify Job',
                            tone: 'primary',
                            onConfirm: async () => {
                              await onExecuteAction(async () => {
                                await invokeAdminEdgeFunction('admin-verify-payment', {
                                  paymentId: pendingUpiPayment.id,
                                  decision: 'approve',
                                  ...(selectedPrinterId ? { printerId: selectedPrinterId } : {}),
                                });
                                showToast(
                                  selectedPrinterId
                                    ? 'UPI verified and job released to Print Queue.'
                                    : 'UPI verified and job qualified for Print Queue.',
                                  'good'
                                );
                                onRefresh();
                              });
                            },
                          })
                        }
                        className="btn-primary px-3.5 py-2 rounded-[11px] text-[12.5px] font-semibold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                      >
                        <QrCode size={14} />
                        <span>
                          {selectedPrinterId ? 'Verify UPI & Release to Queue' : 'Verify UPI & Qualify'}
                        </span>
                      </button>

                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          onRequestConfirm({
                            title: 'Reject UPI Payment Claim',
                            description: `Reject UPI reference ${pendingUpiPayment.transaction_reference || ''} and reset job payment status to unpaid so the customer can re-submit valid proof.`,
                            confirmLabel: 'Reject UPI Payment',
                            tone: 'danger',
                            requireReason: true,
                            reasonLabel: 'Rejection Reason',
                            reasonPlaceholder: 'e.g., UTR not matched in bank / unreadable screenshot',
                            onConfirm: async (reason) => {
                              await onExecuteAction(async () => {
                                await invokeAdminEdgeFunction('admin-verify-payment', {
                                  paymentId: pendingUpiPayment.id,
                                  decision: 'reject',
                                  reason,
                                });
                                showToast('UPI payment claim rejected.', 'good');
                                onRefresh();
                              });
                            },
                          })
                        }
                        className="px-3.5 py-2 rounded-[11px] text-[12.5px] font-semibold bg-[var(--bad-soft)] text-[var(--bad)] inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                      >
                        <XCircle size={14} />
                        <span>Reject UPI</span>
                      </button>
                    </>
                  )}

                  {/* Cash Payment Confirmation */}
                  {job.payment_status === 'unpaid' &&
                    job.status !== 'completed' &&
                    job.status !== 'rejected' &&
                    job.status !== 'cancelled' &&
                    job.status !== 'expired' && (
                      <button
                        type="button"
                        disabled={busy || job.final_amount === null}
                        onClick={() =>
                          onRequestConfirm({
                            title: 'Confirm Cash Payment Received',
                            description: `Record ₹${(job.final_amount ?? 0).toFixed(2)} received in cash at counter for ${job.job_number}. Note: Cash jobs still require explicit Admin approval before queue release.`,
                            confirmLabel: 'Confirm Cash Paid',
                            tone: 'primary',
                            onConfirm: async () => {
                              await onExecuteAction(async () => {
                                await invokeAdminEdgeFunction('admin-confirm-cash', {
                                  jobId: job.id,
                                  idempotencyKey: `cash-${job.id}`,
                                });
                                showToast('Cash payment recorded.', 'good');
                                onRefresh();
                              });
                            },
                          })
                        }
                        className="btn-ghost px-3.5 py-2 rounded-[11px] text-[12.5px] font-semibold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                      >
                        <Banknote size={14} />
                        <span>Confirm Cash Received</span>
                      </button>
                    )}

                  {/* Explicit Approve Job (for Cash / non-UPI pending jobs) */}
                  {canAdminApproveCashJob(job) && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        onRequestConfirm({
                          title: `Approve Cash Print Job ${job.job_number}`,
                          description:
                            job.payment_status === 'paid'
                              ? 'Payment is confirmed. Approving allows releasing this job to an enabled printer.'
                              : 'Approving marks this job ready for payment settlement. It still cannot enter the executable print queue until Cash/UPI payment is confirmed paid.',
                          confirmLabel: 'Approve Job',
                          tone: 'primary',
                          onConfirm: async () => {
                            await onExecuteAction(async () => {
                              await invokeAdminEdgeFunction('admin-review-print-job', {
                                jobId: job.id,
                                action: 'approve',
                              });
                              showToast(`Job ${job.job_number} approved.`, 'good');
                              onRefresh();
                            });
                          },
                        })
                      }
                      className="btn-primary px-3.5 py-2 rounded-[11px] text-[12.5px] font-semibold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                    >
                      <CheckCircle2 size={14} />
                      <span>Approve Job</span>
                    </button>
                  )}

                  {/* Release Paid + Approved Job to Queue */}
                  {canAdminReleaseJobToQueue(job) && (
                    <button
                      type="button"
                      disabled={busy || !selectedPrinterId}
                      onClick={() => {
                        const targetPrinter = eligiblePrinters.find((p) => p.id === selectedPrinterId);
                        onRequestConfirm({
                          title: `Release ${job.job_number} to Print Queue`,
                          description: `Assign to "${targetPrinter?.printer_name || 'Selected Printer'}" and transition status to Queued. Only Windows Print Agent devices bound to this printer will claim it.`,
                          confirmLabel: 'Release to Queue',
                          tone: 'primary',
                          onConfirm: async () => {
                            await onExecuteAction(async () => {
                              await invokeAdminEdgeFunction('admin-release-print-job', {
                                jobId: job.id,
                                printerId: selectedPrinterId,
                              });
                              showToast(`Job ${job.job_number} released to Print Queue.`, 'good');
                              onRefresh();
                            });
                          },
                        });
                      }}
                      className="btn-primary px-3.5 py-2 rounded-[11px] text-[12.5px] font-semibold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                    >
                      <Printer size={14} />
                      <span>Release to Queue</span>
                    </button>
                  )}

                  {/* Retry / Reconcile Failed or Needs Review */}
                  {canAdminRetryOrReconcileJob(job) && (
                    <>
                      <button
                        type="button"
                        disabled={busy || !selectedPrinterId || job.payment_status !== 'paid'}
                        onClick={() =>
                          onRequestConfirm({
                            title: `Retry Print Job ${job.job_number}`,
                            description:
                              'Requeue this failed/review job onto the selected enabled printer. A reason is required for the audit log.',
                            confirmLabel: 'Requeue Job',
                            tone: 'warn',
                            requireReason: true,
                            reasonLabel: 'Retry Reason',
                            reasonPlaceholder: 'e.g., Paper tray refilled and printer cleared',
                            onConfirm: async (reason) => {
                              await onExecuteAction(async () => {
                                await invokeAdminEdgeFunction('admin-retry-print-job', {
                                  jobId: job.id,
                                  action: 'retry',
                                  printerId: selectedPrinterId,
                                  reason,
                                });
                                showToast(`Job ${job.job_number} requeued.`, 'good');
                                onRefresh();
                              });
                            },
                          })
                        }
                        className="px-3.5 py-2 rounded-[11px] text-[12.5px] font-semibold bg-[var(--warn-soft)] text-[var(--warn)] inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                      >
                        <RefreshCw size={14} />
                        <span>Retry Job</span>
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          onRequestConfirm({
                            title: `Confirm Manual Completion (${job.job_number})`,
                            description:
                              'Mark this job as completed after verifying all physical sheets printed cleanly at the shop.',
                            confirmLabel: 'Mark Completed',
                            tone: 'primary',
                            requireReason: true,
                            reasonLabel: 'Verification Note',
                            reasonPlaceholder: 'e.g., Physical pages counted and handed to customer',
                            onConfirm: async (reason) => {
                              await onExecuteAction(async () => {
                                await invokeAdminEdgeFunction('admin-retry-print-job', {
                                  jobId: job.id,
                                  action: 'mark_completed',
                                  reason,
                                });
                                showToast(`Job ${job.job_number} marked completed.`, 'good');
                                onRefresh();
                              });
                            },
                          })
                        }
                        className="btn-ghost px-3.5 py-2 rounded-[11px] text-[12.5px] font-semibold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                      >
                        <CheckCircle2 size={14} />
                        <span>Mark Completed</span>
                      </button>
                    </>
                  )}

                  {/* Reject Job */}
                  {(job.status === 'submitted' ||
                    job.status === 'under_review' ||
                    job.status === 'awaiting_payment' ||
                    job.status === 'approved') && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        onRequestConfirm({
                          title: `Reject Print Job ${job.job_number}`,
                          description:
                            'Rejecting permanently stops this job and notifies customer status tracking with your reason.',
                          confirmLabel: 'Reject Job',
                          tone: 'danger',
                          requireReason: true,
                          reasonLabel: 'Rejection Reason',
                          reasonPlaceholder: 'e.g., Corrupted file / unsupported document format',
                          onConfirm: async (reason) => {
                            await onExecuteAction(async () => {
                              await invokeAdminEdgeFunction('admin-review-print-job', {
                                jobId: job.id,
                                action: 'reject',
                                reason,
                              });
                              showToast(`Job ${job.job_number} rejected.`, 'good');
                              onRefresh();
                            });
                          },
                        })
                      }
                      className="px-3.5 py-2 rounded-[11px] text-[12.5px] font-semibold bg-[var(--bad-soft)] text-[var(--bad)] inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                    >
                      <XCircle size={14} />
                      <span>Reject Job</span>
                    </button>
                  )}

                  {/* Cancel Job */}
                  {canAdminCancelJob(job) && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        onRequestConfirm({
                          title: `Cancel Print Job ${job.job_number}`,
                          description:
                            job.status === 'queued'
                              ? 'Remove this job from the active Print Queue and mark it cancelled.'
                              : 'Cancel this print job. This terminal action cannot be undone.',
                          confirmLabel: 'Cancel Print Job',
                          tone: 'danger',
                          requireReason: true,
                          reasonLabel: 'Cancellation Reason',
                          reasonPlaceholder: 'e.g., Customer requested cancellation at counter',
                          onConfirm: async (reason) => {
                            await onExecuteAction(async () => {
                              if (canAdminRetryOrReconcileJob(job)) {
                                await invokeAdminEdgeFunction('admin-retry-print-job', {
                                  jobId: job.id,
                                  action: 'cancel',
                                  reason,
                                });
                              } else {
                                await invokeAdminEdgeFunction('admin-review-print-job', {
                                  jobId: job.id,
                                  action: 'cancel',
                                  reason,
                                });
                              }
                              showToast(`Job ${job.job_number} cancelled.`, 'good');
                              onRefresh();
                            });
                          },
                        })
                      }
                      className="btn-ghost px-3.5 py-2 rounded-[11px] text-[12.5px] font-medium text-[var(--bad)] inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                    >
                      <span>Cancel Job</span>
                    </button>
                  )}
                </div>
              </div>

              {/* 2-Column Details Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Customer & Print Spec */}
                <div className="rounded-[18px] p-4 bg-[var(--card-2)] border border-[var(--line)] space-y-3">
                  <div className="text-[13px] font-bold">Customer & Print Configuration</div>
                  <dl className="grid grid-cols-2 gap-y-2 gap-x-3 text-[12.5px]">
                    <dt className="text-[var(--muted)]">Customer Name</dt>
                    <dd className="font-medium text-right">{job.customer_name || 'Walk-in / Anonymous'}</dd>
                    <dt className="text-[var(--muted)]">Phone</dt>
                    <dd className="font-medium text-right">{job.customer_phone || 'Not provided'}</dd>
                    <dt className="text-[var(--muted)]">Paper Size</dt>
                    <dd className="font-medium text-right">{job.paper_size}</dd>
                    <dt className="text-[var(--muted)]">Print Mode</dt>
                    <dd className="font-medium text-right uppercase">
                      {job.print_mode === 'colour' ? 'Colour' : 'Black & White'}
                    </dd>
                    <dt className="text-[var(--muted)]">Sides</dt>
                    <dd className="font-medium text-right">
                      {job.print_sides === 'duplex' ? 'Duplex (Double-Sided)' : 'Single-Sided'}
                    </dd>
                    <dt className="text-[var(--muted)]">Copies</dt>
                    <dd className="font-medium text-right">{job.copies}</dd>
                    <dt className="text-[var(--muted)]">Orientation / Scaling</dt>
                    <dd className="font-medium text-right capitalize">
                      {job.orientation} / {job.scaling}
                    </dd>
                    <dt className="text-[var(--muted)]">Page Range</dt>
                    <dd className="font-medium text-right">{job.requested_page_range}</dd>
                    <dt className="text-[var(--muted)]">Assigned Printer</dt>
                    <dd className="font-medium text-right">
                      {detail.assignedPrinter?.printer_name || 'Not assigned yet'}
                    </dd>
                  </dl>
                </div>

                {/* Sheets & Billing Breakdown */}
                <div className="rounded-[18px] p-4 bg-[var(--card-2)] border border-[var(--line)] space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-[13px] font-bold">Physical Sheets & Billing</div>
                    {job.payment_status !== 'paid' &&
                      job.payment_status !== 'pending_verification' &&
                      job.status !== 'queued' &&
                      job.status !== 'claimed' &&
                      job.status !== 'downloading' &&
                      job.status !== 'printing' &&
                      job.status !== 'submitted_to_spooler' &&
                      job.status !== 'completed' &&
                      job.status !== 'rejected' &&
                      job.status !== 'cancelled' &&
                      job.status !== 'expired' && (
                        <button
                          type="button"
                          onClick={() => setOverrideOpen((o) => !o)}
                          className="text-[12px] text-[var(--accent-text)] font-semibold hover:underline cursor-pointer"
                        >
                          {overrideOpen ? 'Close Override' : 'Override Price'}
                        </button>
                      )}
                  </div>

                  <dl className="grid grid-cols-2 gap-y-2 gap-x-3 text-[12.5px]">
                    <dt className="text-[var(--muted)]">Verified Pages</dt>
                    <dd className="font-semibold text-right tabular-nums">
                      {job.verified_page_count ?? 'Pending'}
                    </dd>
                    <dt className="text-[var(--muted)]">Physical Sheets / Copy</dt>
                    <dd className="font-semibold text-right tabular-nums">
                      {calculatedSheetsPerCopy || '—'}
                      {job.print_sides === 'duplex' && verifiedPages > 0
                        ? ` (ceil(${verifiedPages}/2))`
                        : ''}
                    </dd>
                    <dt className="text-[var(--muted)]">Total Physical Sheets</dt>
                    <dd className="font-semibold text-right tabular-nums">
                      {totalPhysicalSheets || '—'}
                    </dd>
                    <dt className="text-[var(--muted)]">Pricing Rule</dt>
                    <dd className="font-medium text-right">
                      {detail.pricingRule
                        ? `${detail.pricingRule.rule_name} (${formatCurrencyInr(detail.pricingRule.rate)} / ${
                            detail.pricingRule.pricing_unit === 'per_physical_sheet' ? 'sheet' : 'page'
                          })`
                        : '—'}
                    </dd>
                    <dt className="text-[var(--muted)]">Calculated Subtotal</dt>
                    <dd className="font-medium text-right tabular-nums">
                      {formatCurrencyInr(job.subtotal)}
                    </dd>
                    <dt className="text-[var(--ink)] font-bold">Final Total</dt>
                    <dd className="text-[15px] font-bold text-right tabular-nums text-[var(--accent-text)]">
                      {formatCurrencyInr(job.final_amount)}
                    </dd>
                  </dl>

                  {job.price_override_reason && (
                    <div className="rounded-[10px] px-3 py-2 text-[12px] bg-[var(--warn-soft)] text-[var(--warn)]">
                      <strong>Price Override Note:</strong> {job.price_override_reason}
                    </div>
                  )}

                  {overrideOpen && (
                    <form
                      onSubmit={handleOverridePrice}
                      className="pt-2 border-t border-[var(--line)] space-y-2.5"
                    >
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div>
                          <label htmlFor="override-amount" className="block text-[11.5px] font-semibold mb-1">
                            New Final Amount (₹)
                          </label>
                          <input
                            id="override-amount"
                            type="number"
                            min="0"
                            step="0.01"
                            value={overrideAmount}
                            onChange={(e) => setOverrideAmount(e.target.value)}
                            className="w-full rounded-[10px] bg-[var(--card-1)] border border-[var(--line)] px-2.5 py-1.5 text-[12.5px]"
                          />
                        </div>
                        <div>
                          <label htmlFor="override-reason" className="block text-[11.5px] font-semibold mb-1">
                            Override Reason (Required)
                          </label>
                          <input
                            id="override-reason"
                            type="text"
                            value={overrideReason}
                            onChange={(e) => setOverrideReason(e.target.value)}
                            placeholder="Min 5 characters"
                            className="w-full rounded-[10px] bg-[var(--card-1)] border border-[var(--line)] px-2.5 py-1.5 text-[12.5px]"
                          />
                        </div>
                      </div>
                      <button
                        type="submit"
                        disabled={busy}
                        className="btn-primary px-3 py-1.5 rounded-[10px] text-[12px] font-semibold cursor-pointer"
                      >
                        Save Price Override
                      </button>
                    </form>
                  )}
                </div>
              </div>

              {/* Uploaded Files + Preview */}
              <div className="rounded-[18px] p-4 bg-[var(--card-2)] border border-[var(--line)] space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-[13px] font-bold">
                    Uploaded Documents ({detail.files.length})
                  </div>
                  <span className="text-[11.5px] text-[var(--muted)]">
                    Short-lived signed download URLs (120s TTL)
                  </span>
                </div>

                {detail.files.length === 0 ? (
                  <div className="text-[12.5px] text-[var(--muted)]">No files recorded on this job.</div>
                ) : (
                  <div className="space-y-2">
                    {detail.files.map((file) => (
                      <div
                        key={file.id}
                        className="rounded-[12px] p-3 bg-[var(--card-1)] border border-[var(--line)] flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                      >
                        <div className="flex items-start gap-2.5 min-w-0">
                          <FileText size={16} className="text-[var(--accent-text)] shrink-0 mt-0.5" />
                          <div className="min-w-0">
                            <div className="text-[13px] font-semibold truncate">
                              {file.original_filename}
                            </div>
                            <div className="text-[11.5px] text-[var(--muted)]">
                              {file.detected_mime_type || 'unknown MIME'} ·{' '}
                              {formatFileSize(file.file_size_bytes)} · Pages:{' '}
                              {file.detected_page_count ?? '—'} · Status: {file.validation_status}
                            </div>
                            {file.deleted_at && (
                              <div className="text-[11.5px] text-[var(--bad)] mt-0.5">
                                File expired/purged at {formatDateTime(file.deleted_at)}
                              </div>
                            )}
                          </div>
                        </div>

                        {!file.deleted_at && file.signedDownloadUrl && (
                          <div className="flex items-center gap-2 shrink-0">
                            {file.previewSupported && (
                              <button
                                type="button"
                                onClick={() =>
                                  setPreviewFileId((cur) => (cur === file.id ? null : file.id))
                                }
                                className="btn-ghost px-3 py-1.5 rounded-[10px] text-[12px] font-medium inline-flex items-center gap-1.5 cursor-pointer"
                              >
                                <Eye size={13} />
                                <span>{previewFileId === file.id ? 'Hide Preview' : 'Preview'}</span>
                              </button>
                            )}
                            <a
                              href={file.signedDownloadUrl}
                              download={file.original_filename}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="btn-primary px-3 py-1.5 rounded-[10px] text-[12px] font-semibold inline-flex items-center gap-1.5"
                            >
                              <Download size={13} />
                              <span>Download</span>
                            </a>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {previewFile && previewFile.signedDownloadUrl && (
                  <div className="rounded-[14px] border border-[var(--line)] bg-[var(--card-1)] p-3 space-y-2">
                    <div className="flex items-center justify-between text-[12px] font-semibold">
                      <span>Preview: {previewFile.original_filename}</span>
                      <button
                        type="button"
                        onClick={() => setPreviewFileId(null)}
                        className="text-[var(--muted)] hover:text-[var(--ink)] cursor-pointer"
                      >
                        Close Preview
                      </button>
                    </div>
                    {previewFile.detected_mime_type === 'application/pdf' ? (
                      <iframe
                        title={`Preview ${previewFile.original_filename}`}
                        src={previewFile.signedDownloadUrl}
                        className="w-full h-[380px] rounded-[10px] border border-[var(--line)] bg-white"
                      />
                    ) : (
                      <img
                        src={previewFile.signedDownloadUrl}
                        alt={previewFile.original_filename}
                        className="max-h-[420px] mx-auto rounded-[10px] object-contain border border-[var(--line)]"
                      />
                    )}
                  </div>
                )}
              </div>

              {/* Payment Records & UPI Evidence */}
              <div className="rounded-[18px] p-4 bg-[var(--card-2)] border border-[var(--line)] space-y-3">
                <div className="text-[13px] font-bold">
                  Payments & UPI Verification Evidence ({detail.payments.length})
                </div>
                {detail.payments.length === 0 ? (
                  <div className="text-[12.5px] text-[var(--muted)]">
                    No payment submission recorded yet.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {detail.payments.map((p) => (
                      <div
                        key={p.id}
                        className="rounded-[12px] p-3 bg-[var(--card-1)] border border-[var(--line)] flex flex-col sm:flex-row justify-between gap-3"
                      >
                        <div className="space-y-1 text-[12.5px]">
                          <div className="flex items-center gap-2 font-semibold">
                            <span className="uppercase">{p.payment_method}</span>
                            <span>· {formatCurrencyInr(p.amount)}</span>
                            {(() => {
                              const pMeta = getPaymentStatusMeta(p.payment_status);
                              return (
                                <span
                                  className="px-2 py-0.5 rounded-full text-[11px]"
                                  style={{
                                    color: pMeta.colorVar,
                                    background: pMeta.bgVar,
                                  }}
                                >
                                  {pMeta.label}
                                </span>
                              );
                            })()}
                          </div>
                          {p.transaction_reference && (
                            <div className="text-[var(--ink-2)] font-mono text-[12px]">
                              UTR / Ref: {p.transaction_reference}
                            </div>
                          )}
                          <div className="text-[11.5px] text-[var(--muted)]">
                            Submitted: {formatDateTime(p.submitted_at ?? p.created_at)}
                            {p.verified_at ? ` · Verified: ${formatDateTime(p.verified_at)}` : ''}
                          </div>
                          {p.rejection_reason && (
                            <div className="text-[12px] text-[var(--bad)]">
                              Rejection Reason: {p.rejection_reason}
                            </div>
                          )}
                        </div>
                        {p.screenshotSignedUrl && (
                          <div className="shrink-0">
                            <a
                              href={p.screenshotSignedUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="block group"
                              title="Open UPI payment screenshot in full size"
                            >
                              <img
                                src={p.screenshotSignedUrl}
                                alt="UPI Payment Evidence Screenshot"
                                className="w-28 h-28 object-cover rounded-[10px] border border-[var(--line)] group-hover:opacity-90"
                              />
                            </a>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Job Attempts & Audit Timeline */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="rounded-[18px] p-4 bg-[var(--card-2)] border border-[var(--line)] space-y-2.5">
                  <div className="text-[13px] font-bold">
                    Execution Attempts ({detail.attempts.length})
                  </div>
                  {detail.attempts.length === 0 ? (
                    <div className="text-[12.5px] text-[var(--muted)]">
                      No print agent execution attempts yet.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {detail.attempts.map((a) => (
                        <div
                          key={a.id}
                          className="rounded-[10px] p-2.5 bg-[var(--card-1)] border border-[var(--line)] text-[12px]"
                        >
                          <div className="flex items-center justify-between font-semibold">
                            <span>Attempt #{a.attempt_number}</span>
                            <span className="capitalize">{a.attempt_status.replace(/_/g, ' ')}</span>
                          </div>
                          <div className="text-[var(--muted)] mt-0.5">
                            Started: {formatDateTime(a.started_at)}
                            {a.windows_spooler_job_id
                              ? ` · Spooler ID: ${a.windows_spooler_job_id}`
                              : ''}
                          </div>
                          {a.error_message && (
                            <div className="text-[var(--bad)] mt-1 flex items-center gap-1">
                              <AlertTriangle size={12} />
                              <span>{a.error_message}</span>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="rounded-[18px] p-4 bg-[var(--card-2)] border border-[var(--line)] space-y-2.5">
                  <div className="text-[13px] font-bold">
                    Immutable Audit History ({detail.events.length})
                  </div>
                  {detail.events.length === 0 ? (
                    <div className="text-[12.5px] text-[var(--muted)]">No audit events recorded.</div>
                  ) : (
                    <div className="space-y-2 max-h-[240px] overflow-y-auto custom-scroll pr-1">
                      {detail.events.map((evt) => (
                        <div
                          key={evt.id}
                          className="rounded-[10px] p-2.5 bg-[var(--card-1)] border border-[var(--line)] text-[12px]"
                        >
                          <div className="flex items-center justify-between gap-2 font-semibold">
                            <span>{evt.event_type.replace(/_/g, ' ')}</span>
                            <span className="text-[11px] uppercase text-[var(--muted)]">
                              {evt.actor_type}
                            </span>
                          </div>
                          {(evt.previous_status || evt.new_status) && (
                            <div className="text-[11.5px] text-[var(--ink-2)] mt-0.5">
                              {evt.previous_status ?? 'none'} → {evt.new_status ?? 'none'}
                            </div>
                          )}
                          <div className="text-[11px] text-[var(--muted)] mt-0.5 flex items-center gap-1">
                            <Clock size={11} />
                            <span>{formatDateTime(evt.created_at)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
