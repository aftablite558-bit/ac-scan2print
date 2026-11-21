import React, { useCallback, useEffect, useId, useState } from 'react';
import {
  AlertTriangle,
  Check,
  Clock,
  FileText,
  RefreshCw,
  Search,
  ShieldAlert,
} from 'lucide-react';
import { ErrorAlert, LoadingCard } from '../components/LoadingEmptyError';
import { StatusBadge } from '../components/StatusBadge';
import { usePortal } from '../context/PortalContext';
import {
  buildCustomerTrackingTimeline,
  formatInr,
  getCustomerSafeStatusMeta,
} from '../lib/pricing';
import { formatFileSize } from '../lib/validation';
import type { CustomerJobStatusResponse } from '../types/portal';

export const TrackingPage: React.FC = () => {
  const { adapter, searchParams, recentSessionJobs, navigate } = usePortal();
  const initialUrlToken = searchParams.get('token')?.trim() || '';

  const [tokenInput, setTokenInput] = useState(initialUrlToken);
  const [activeToken, setActiveToken] = useState(initialUrlToken);
  const [jobData, setJobData] = useState<CustomerJobStatusResponse | null>(null);
  const [loading, setLoading] = useState(Boolean(initialUrlToken));
  const [error, setError] = useState<string | null>(null);

  const tokenFieldId = useId();

  const fetchStatus = useCallback(
    async (token: string) => {
      const clean = token.trim();
      if (!clean) {
        setError('Enter your private tracking token to check print status.');
        setJobData(null);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const res = await adapter.getJobStatusByToken(clean);
        setJobData(res);
        setActiveToken(clean);
      } catch (err) {
        setJobData(null);
        setError(
          err instanceof Error ? err.message : 'Unable to fetch status for this tracking token.'
        );
      } finally {
        setLoading(false);
      }
    },
    [adapter]
  );

  useEffect(() => {
    if (initialUrlToken) {
      setTokenInput(initialUrlToken);
      void fetchStatus(initialUrlToken);
    }
  }, [initialUrlToken, fetchStatus]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void fetchStatus(tokenInput);
  };

  const statusMeta = jobData
    ? getCustomerSafeStatusMeta(jobData.status, jobData.paymentStatus, jobData.paymentMethod)
    : null;
  const timeline = jobData
    ? buildCustomerTrackingTimeline(jobData.status, jobData.paymentStatus, jobData.paymentMethod)
    : [];

  return (
    <div className="space-y-4">
      {/* Secure Token Lookup Card */}
      <section className="portal-card p-5 sm:p-6 space-y-4">
        <div>
          <h1 className="text-[22px] sm:text-[24px] font-bold leading-tight">
            Track your print job
          </h1>
          <p className="text-[13px] text-[var(--color-text-muted)] mt-1">
            Enter the private tracking token from your submission confirmation screen.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-2.5">
          <label htmlFor={tokenFieldId} className="block text-[13px] font-bold">
            Private Tracking Token
          </label>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              id={tokenFieldId}
              type="text"
              value={tokenInput}
              onChange={(e) => setTokenInput(e.target.value)}
              placeholder="Paste tracking token (e.g. ac_track_...)"
              className="portal-input flex-1 px-3.5 text-[13.5px] font-mono"
            />
            <button
              type="submit"
              disabled={loading}
              className="portal-btn-primary px-5 py-2.5 text-[14px] inline-flex items-center justify-center gap-2 cursor-pointer"
            >
              <Search size={16} aria-hidden="true" />
              <span>{loading ? 'Checking...' : 'Check Status'}</span>
            </button>
          </div>
        </form>

        {recentSessionJobs.length > 0 && (
          <div className="pt-1 space-y-1.5">
            <div className="text-[12px] font-semibold text-[var(--color-text-muted)]">
              Recent uploads on this browser session:
            </div>
            <div className="flex flex-wrap gap-2">
              {recentSessionJobs.map((ref) => (
                <button
                  key={ref.trackingToken}
                  type="button"
                  onClick={() => {
                    setTokenInput(ref.trackingToken);
                    void fetchStatus(ref.trackingToken);
                  }}
                  className="portal-btn-secondary px-3 py-1.5 min-h-[36px] text-[12.5px] font-bold tabular-nums cursor-pointer"
                >
                  {ref.jobNumber}
                </button>
              ))}
            </div>
          </div>
        )}
      </section>

      {loading && <LoadingCard label="Fetching print job status..." />}

      {error && (
        <ErrorAlert
          title="Tracking lookup failed"
          message={error}
          onRetry={activeToken ? () => void fetchStatus(activeToken) : undefined}
        />
      )}

      {!loading && !error && !jobData && (
        <section className="portal-card p-6 text-center space-y-2.5">
          <div className="text-[15px] font-bold">No job loaded</div>
          <p className="text-[13px] text-[var(--color-text-muted)] max-w-md mx-auto">
            Paste your private tracking token above or upload a new document to receive a job number and tracking link.
          </p>
          <button
            type="button"
            onClick={() => navigate('/quick-print/upload')}
            className="portal-btn-secondary px-4 py-2 text-[13.5px] cursor-pointer"
          >
            Start New Print Upload
          </button>
        </section>
      )}

      {/* Loaded Job Tracking Details (Customer-Safe Only — Zero Document Download Links) */}
      {!loading && jobData && statusMeta && (
        <section className="portal-card p-5 sm:p-6 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-[20px] font-bold tabular-nums">{jobData.jobNumber}</h2>
                <StatusBadge label={statusMeta.label} tone={statusMeta.tone} />
              </div>
              <p className="text-[13.5px] text-[var(--color-text-secondary)] m-0">
                {statusMeta.description}
              </p>
            </div>

            <button
              type="button"
              onClick={() => void fetchStatus(activeToken)}
              className="portal-btn-secondary px-3.5 py-2 text-[13px] shrink-0 inline-flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <RefreshCw size={14} aria-hidden="true" />
              <span>Refresh</span>
            </button>
          </div>

          {jobData.rejectionReason && (
            <div className="rounded-[12px] bg-[var(--bad-soft)] border border-[var(--bad)]/30 p-3.5 text-[13px] text-[var(--bad)] flex items-start gap-2">
              <ShieldAlert size={17} className="shrink-0 mt-0.5" />
              <div>
                <strong>Counter Note: </strong>
                {jobData.rejectionReason}
              </div>
            </div>
          )}

          {/* 6-Stage Milestone Timeline */}
          <div className="space-y-2.5" aria-label="Job progress timeline">
            <h3 className="text-[14px] font-bold">Progress Timeline</h3>
            <ol className="space-y-2.5">
              {timeline.map((step) => (
                <li key={step.key} className="flex items-start gap-3">
                  <div
                    className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
                      step.state === 'done'
                        ? 'bg-[var(--good-soft)] text-[var(--good)]'
                        : step.state === 'current'
                          ? 'bg-[var(--color-accent-bg)] text-[var(--color-accent-ink)]'
                          : step.state === 'issue'
                            ? 'bg-[var(--bad-soft)] text-[var(--bad)]'
                            : 'bg-[var(--color-surface-subtle)] text-[var(--color-text-muted)] border border-[var(--color-border)]'
                    }`}
                  >
                    {step.state === 'done' ? (
                      <Check size={13} strokeWidth={2.5} aria-hidden="true" />
                    ) : step.state === 'issue' ? (
                      <AlertTriangle size={13} aria-hidden="true" />
                    ) : (
                      <Clock size={12} aria-hidden="true" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <div
                      className={`text-[13.5px] leading-tight ${
                        step.state === 'upcoming'
                          ? 'font-medium text-[var(--color-text-muted)]'
                          : 'font-bold text-[var(--color-text-primary)]'
                      }`}
                    >
                      {step.title}
                    </div>
                    <div className="text-[12px] text-[var(--color-text-muted)]">{step.subtitle}</div>
                  </div>
                </li>
              ))}
            </ol>
          </div>

          {/* Customer-Safe Summary (No public download URLs, no internal notes) */}
          <div className="portal-card-subtle p-4 space-y-2 text-[13px]">
            <div className="flex justify-between gap-2">
              <span className="text-[var(--color-text-muted)]">Payment Status</span>
              <span className="font-bold capitalize">
                {jobData.paymentStatus.replace('_', ' ')}
                {jobData.paymentMethod ? ` (${jobData.paymentMethod.toUpperCase()})` : ''}
              </span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-[var(--color-text-muted)]">Amount</span>
              <span className="font-bold tabular-nums">
                {formatInr(jobData.finalAmount, jobData.currency)}
                {jobData.paymentStatus !== 'paid' && jobData.finalAmount !== null ? ' (Estimate)' : ''}
              </span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-[var(--color-text-muted)]">Preferences</span>
              <span className="font-semibold">
                {jobData.paperSize} · {jobData.printMode === 'bw' ? 'B&W' : 'Colour'} ·{' '}
                {jobData.printSides === 'duplex' ? 'Double-sided' : 'Single-sided'} ·{' '}
                {jobData.copies} {jobData.copies === 1 ? 'copy' : 'copies'}
              </span>
            </div>
            <div className="pt-2 border-t border-[var(--color-border)] space-y-1">
              <div className="text-[12px] font-bold text-[var(--color-text-muted)]">
                Submitted Files (Names Only — Encrypted Storage)
              </div>
              {jobData.files.map((f) => (
                <div key={f.id} className="flex items-center justify-between gap-2 text-[12.5px]">
                  <span className="inline-flex items-center gap-1.5 truncate">
                    <FileText size={14} className="text-[var(--color-accent)] shrink-0" />
                    <span className="truncate">{f.originalFilename}</span>
                  </span>
                  <span className="tabular-nums text-[var(--color-text-muted)] shrink-0">
                    {f.detectedPageCount ?? 1}p · {formatFileSize(f.fileSizeBytes)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}
    </div>
  );
};
