import React, { useState } from 'react';
import { Check, CheckCircle2, Copy, Plus, Search, Share2, ShieldCheck } from 'lucide-react';
import { StatusBadge } from '../components/StatusBadge';
import { WorkflowStepper } from '../components/WorkflowStepper';
import { usePortal } from '../context/PortalContext';
import { formatInr, getCustomerSafeStatusMeta, getFinishingAddon } from '../lib/pricing';
import { formatFileSize } from '../lib/validation';

export const ConfirmationPage: React.FC = () => {
  const { confirmation, navigate, startNewPrintOrder } = usePortal();
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedToken, setCopiedToken] = useState(false);

  if (!confirmation) {
    return (
      <section className="portal-card p-6 text-center space-y-3">
        <h1 className="text-[20px] font-bold">No recent submission in this session</h1>
        <p className="text-[13.5px] text-[var(--color-text-muted)]">
          Already have a tracking token? Open Job Tracking or upload a new document.
        </p>
        <div className="flex flex-col sm:flex-row justify-center gap-2.5 pt-1">
          <button
            type="button"
            onClick={() => navigate('/quick-print/track')}
            className="portal-btn-primary px-5 py-2.5 text-[14px] cursor-pointer"
          >
            Track Existing Job
          </button>
          <button
            type="button"
            onClick={() => navigate('/quick-print/upload')}
            className="portal-btn-secondary px-5 py-2.5 text-[14px] cursor-pointer"
          >
            Upload Document
          </button>
        </div>
      </section>
    );
  }

  const statusMeta = getCustomerSafeStatusMeta(
    confirmation.status,
    confirmation.paymentStatus,
    confirmation.paymentMethod
  );
  const trackingRelativeUrl = `/quick-print/track?token=${encodeURIComponent(
    confirmation.trackingToken
  )}`;
  const fullTrackingUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}${trackingRelativeUrl}`
      : trackingRelativeUrl;

  const [sharedOk, setSharedOk] = useState(false);

  const handleCopy = async (text: string, mode: 'link' | 'token') => {
    try {
      await navigator.clipboard.writeText(text);
      if (mode === 'link') {
        setCopiedLink(true);
        window.setTimeout(() => setCopiedLink(false), 1800);
      } else {
        setCopiedToken(true);
        window.setTimeout(() => setCopiedToken(false), 1800);
      }
    } catch {
      // Ignore clipboard failures
    }
  };

  const handleShareTracking = async () => {
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({
          title: `AC Scan2Print · ${confirmation.jobNumber}`,
          text: `Track print job ${confirmation.jobNumber} at Aman Computer`,
          url: fullTrackingUrl,
        });
        setSharedOk(true);
        window.setTimeout(() => setSharedOk(false), 1800);
        return;
      } catch {
        // User cancelled or share unsupported -> fallback to copy
      }
    }
    await handleCopy(fullTrackingUrl, 'link');
  };

  return (
    <div className="space-y-4">
      <WorkflowStepper currentStep="confirm" />

      <section className="portal-card p-5 sm:p-6 space-y-5">
        <div className="flex items-start gap-3">
          <div className="w-11 h-11 rounded-[12px] bg-[var(--good-soft)] text-[var(--good)] flex items-center justify-center shrink-0">
            <CheckCircle2 size={24} aria-hidden="true" />
          </div>
          <div className="space-y-1.5 min-w-0">
            <h1 className="text-[22px] sm:text-[24px] font-bold leading-tight">
              Print request submitted
            </h1>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[14px] font-bold tabular-nums px-2.5 py-0.5 rounded-[8px] bg-[#111318] text-[#25C7D9]">
                {confirmation.jobNumber}
              </span>
              <StatusBadge label={statusMeta.label} tone={statusMeta.tone} />
            </div>
            <p className="text-[12.5px] text-[var(--color-text-muted)] tabular-nums">
              Submitted on {new Date(confirmation.submittedAt).toLocaleString()}
            </p>
          </div>
        </div>

        {/* Next Step Callout */}
        <div className="portal-card-subtle p-4 space-y-1 text-[13.5px]">
          <div className="font-bold text-[var(--color-text-primary)]">Next step at Aman Computer</div>
          <p className="text-[var(--color-text-secondary)] m-0">
            {confirmation.paymentMethod === 'upi'
              ? `Show Job Number ${confirmation.jobNumber} at the counter if asked. Staff will review your document and verify your UPI UTR reference before printing starts.`
              : `Proceed to the Aman Computer counter with Job Number ${confirmation.jobNumber} to confirm the final price and complete your cash payment.`}
          </p>
        </div>

        {/* Secure Copyable Tracking Token & Link */}
        <div className="portal-card-subtle p-4 space-y-2.5">
          <div className="flex items-center gap-1.5 text-[13px] font-bold">
            <ShieldCheck size={16} className="text-[var(--color-accent)]" aria-hidden="true" />
            <span>Save your private tracking link</span>
          </div>
          <p className="text-[12px] text-[var(--color-text-muted)] m-0">
            Use this private token to track status. Do not share it publicly; refreshing this screen will not create a duplicate job.
          </p>
          <div className="font-mono text-[12px] p-2.5 rounded-[8px] bg-[var(--color-surface)] border border-[var(--color-border)] break-all select-all">
            {confirmation.trackingToken}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void handleCopy(fullTrackingUrl, 'link')}
              className="portal-btn-secondary px-3.5 py-2 text-[12.5px] inline-flex items-center gap-1.5 cursor-pointer"
            >
              {copiedLink ? <Check size={14} /> : <Copy size={14} />}
              <span>{copiedLink ? 'Tracking link copied' : 'Copy tracking link'}</span>
            </button>
            <button
              type="button"
              onClick={() => void handleCopy(confirmation.trackingToken, 'token')}
              className="portal-btn-secondary px-3.5 py-2 text-[12.5px] inline-flex items-center gap-1.5 cursor-pointer"
            >
              {copiedToken ? <Check size={14} /> : <Copy size={14} />}
              <span>{copiedToken ? 'Token copied' : 'Copy token'}</span>
            </button>
            <button
              type="button"
              onClick={() => void handleShareTracking()}
              className="portal-btn-secondary px-3.5 py-2 text-[12.5px] inline-flex items-center gap-1.5 cursor-pointer"
            >
              {sharedOk ? <Check size={14} /> : <Share2 size={14} />}
              <span>{sharedOk ? 'Shared' : 'Share link'}</span>
            </button>
          </div>
        </div>

        {/* Job Details Summary */}
        <div className="space-y-2 border-t border-[var(--color-border)] pt-4 text-[13px]">
          <div className="font-bold">Submitted Summary</div>
          <ul className="space-y-1 text-[var(--color-text-secondary)]">
            {confirmation.files.map((f, idx) => (
              <li key={`${f.filename}-${idx}`} className="flex justify-between gap-2">
                <span className="truncate">{f.filename}</span>
                <span className="tabular-nums text-[var(--color-text-muted)] shrink-0">
                  {f.pageCount}p · {formatFileSize(f.fileSizeBytes)}
                </span>
              </li>
            ))}
          </ul>
          <div className="flex justify-between gap-2 pt-2 text-[var(--color-text-secondary)]">
            <span>Print Settings</span>
            <span className="font-semibold text-right">
              {confirmation.preferences.paperSize} ·{' '}
              {confirmation.preferences.printMode === 'bw' ? 'B&W' : 'Colour'} ·{' '}
              {confirmation.preferences.printSides === 'duplex' ? 'Double-sided' : 'Single-sided'} ·{' '}
              {confirmation.preferences.copies} {confirmation.preferences.copies === 1 ? 'copy' : 'copies'}
              {confirmation.preferences.pagesPerSheet > 1
                ? ` · ${confirmation.preferences.pagesPerSheet}-in-1`
                : ''}
              {confirmation.preferences.finishingService !== 'none'
                ? ` · ${getFinishingAddon(confirmation.preferences.finishingService).label}`
                : ''}
            </span>
          </div>
          <div className="flex justify-between gap-2">
            <span>Estimated Amount</span>
            <span className="font-bold text-[var(--color-accent)] tabular-nums">
              {formatInr(confirmation.estimatedAmount, confirmation.currency)} (Estimate)
            </span>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-2.5 pt-1">
          <button
            type="button"
            onClick={() => navigate(trackingRelativeUrl)}
            className="portal-btn-primary px-5 py-2.5 text-[14.5px] flex-1 inline-flex items-center justify-center gap-2 cursor-pointer"
          >
            <Search size={16} aria-hidden="true" />
            <span>Track Job Status</span>
          </button>
          <button
            type="button"
            onClick={startNewPrintOrder}
            className="portal-btn-secondary px-4 py-2.5 text-[14px] inline-flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <Plus size={16} aria-hidden="true" />
            <span>Print Another Document</span>
          </button>
        </div>
      </section>
    </div>
  );
};
