import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import {
  AlertTriangle,
  Banknote,
  Bell,
  BellOff,
  Check,
  CheckCircle2,
  Clock,
  FileText,
  Pause,
  Play,
  QrCode,
  RefreshCw,
  Search,
  ShieldAlert,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { ErrorAlert, LoadingCard } from '../components/LoadingEmptyError';
import { StatusBadge } from '../components/StatusBadge';
import { usePortal } from '../context/PortalContext';
import {
  buildCustomerTrackingTimeline,
  formatInr,
  getCustomerSafeStatusMeta,
} from '../lib/pricing';
import { formatFileSize, validateUtrInput } from '../lib/validation';
import type { CustomerJobStatusResponse, JobStatus, PaymentMethod } from '../types/portal';

const ACTIVE_POLLABLE_STATUSES = new Set<JobStatus>([
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

function playCustomerPickupChime(isReady: boolean): void {
  if (typeof window === 'undefined') return;
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return;
  try {
    const ctx = new AudioCtx();
    const now = ctx.currentTime;
    const notes = isReady ? [587.33, 783.99, 1046.5] : [523.25, 659.25];
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.11);
      gain.gain.setValueAtTime(0.001, now + idx * 0.11);
      gain.gain.exponentialRampToValueAtTime(0.08, now + idx * 0.11 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.11 + 0.28);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + idx * 0.11);
      osc.stop(now + idx * 0.11 + 0.3);
    });
    window.setTimeout(() => void ctx.close().catch(() => {}), 1000);
  } catch {
    // Ignore autoplay errors
  }
}

export const TrackingPage: React.FC = () => {
  const { adapter, paymentSettings, searchParams, recentSessionJobs, navigate } = usePortal();
  const initialUrlToken = searchParams.get('token')?.trim() || '';

  const [tokenInput, setTokenInput] = useState(initialUrlToken);
  const [activeToken, setActiveToken] = useState(initialUrlToken);
  const [jobData, setJobData] = useState<CustomerJobStatusResponse | null>(null);
  const [loading, setLoading] = useState(Boolean(initialUrlToken));
  const [error, setError] = useState<string | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [browserNotifyEnabled, setBrowserNotifyEnabled] = useState(false);
  const [statusUpdateBanner, setStatusUpdateBanner] = useState<{
    message: string;
    tone: 'good' | 'info' | 'warn';
  } | null>(null);

  const [retryPayMethod, setRetryPayMethod] = useState<PaymentMethod>('upi');
  const [retryUtr, setRetryUtr] = useState('');
  const [retryPayBusy, setRetryPayBusy] = useState(false);
  const [retryPayError, setRetryPayError] = useState<string | null>(null);
  const [retryPaySuccess, setRetryPaySuccess] = useState<string | null>(null);

  const tokenFieldId = useId();
  const retryUtrId = useId();
  const prevJobStatusRef = useRef<{ jobNumber: string; status: JobStatus; paymentStatus: string } | null>(null);

  const fetchStatus = useCallback(
    async (token: string, silent = false) => {
      const clean = token.trim();
      if (!clean) {
        setError('Enter your private tracking token to check print status.');
        setJobData(null);
        return;
      }
      if (!silent) setLoading(true);
      setError(null);
      try {
        const res = await adapter.getJobStatusByToken(clean);
        const prev = prevJobStatusRef.current;
        if (
          prev &&
          prev.jobNumber === res.jobNumber &&
          (prev.status !== res.status || prev.paymentStatus !== res.paymentStatus)
        ) {
          const meta = getCustomerSafeStatusMeta(res.status, res.paymentStatus, res.paymentMethod);
          const isReady = res.status === 'completed';
          const isIssue = res.status === 'failed' || res.status === 'rejected' || res.status === 'cancelled';
          const msg = isReady
            ? `${res.jobNumber} is ready for pickup at Aman Computer counter!`
            : `Status updated to ${meta.label}: ${meta.description}`;
          setStatusUpdateBanner({
            message: msg,
            tone: isReady ? 'good' : isIssue ? 'warn' : 'info',
          });
          if (soundEnabled) {
            playCustomerPickupChime(isReady);
          }
          if (
            browserNotifyEnabled &&
            typeof Notification !== 'undefined' &&
            Notification.permission === 'granted'
          ) {
            try {
              new Notification(`AC Scan2Print · ${res.jobNumber}`, { body: msg });
            } catch {
              // Ignore browser notification failure
            }
          }
        }
        prevJobStatusRef.current = {
          jobNumber: res.jobNumber,
          status: res.status,
          paymentStatus: res.paymentStatus,
        };
        setJobData(res);
        setActiveToken(clean);
        setLastSyncedAt(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
      } catch (err) {
        if (!silent) {
          setJobData(null);
          setError(
            err instanceof Error ? err.message : 'Unable to fetch status for this tracking token.'
          );
        }
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [adapter, browserNotifyEnabled, soundEnabled]
  );

  useEffect(() => {
    if (initialUrlToken) {
      setTokenInput(initialUrlToken);
      // Scrub ?token= from visible browser URL bar immediately so token does not linger in history/Referer
      if (typeof window !== 'undefined' && window.location.search.includes('token=')) {
        window.history.replaceState(null, '', '/quick-print/track');
      }
      void fetchStatus(initialUrlToken);
    }
  }, [initialUrlToken, fetchStatus]);

  const isJobActiveForPolling = Boolean(jobData && ACTIVE_POLLABLE_STATUSES.has(jobData.status));

  useEffect(() => {
    if (!autoRefresh || !activeToken || !isJobActiveForPolling) return;
    const timer = window.setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      void fetchStatus(activeToken, true);
    }, 5000);
    return () => window.clearInterval(timer);
  }, [activeToken, autoRefresh, fetchStatus, isJobActiveForPolling]);

  const handleToggleBrowserNotify = async () => {
    if (browserNotifyEnabled) {
      setBrowserNotifyEnabled(false);
      return;
    }
    if (typeof Notification === 'undefined') {
      setStatusUpdateBanner({
        message: 'Browser notifications are not supported on this device; keep this tab open for live updates.',
        tone: 'info',
      });
      return;
    }
    if (Notification.permission === 'granted') {
      setBrowserNotifyEnabled(true);
      return;
    }
    if (Notification.permission !== 'denied') {
      const perm = await Notification.requestPermission();
      setBrowserNotifyEnabled(perm === 'granted');
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setRetryPaySuccess(null);
    setRetryPayError(null);
    setStatusUpdateBanner(null);
    prevJobStatusRef.current = null;
    void fetchStatus(tokenInput);
  };

  const canResubmitPayment = Boolean(
    jobData &&
      ['submitted', 'under_review', 'awaiting_payment'].includes(jobData.status) &&
      jobData.paymentStatus === 'unpaid' &&
      jobData.finalAmount !== null
  );
  const upiAvailable = Boolean(paymentSettings?.upiEnabled && paymentSettings.upiId);

  const handleRetryPaymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeToken || !jobData) return;
    setRetryPayError(null);
    setRetryPaySuccess(null);

    const method: PaymentMethod = retryPayMethod === 'upi' && upiAvailable ? 'upi' : 'cash';
    let normalizedUtr: string | undefined;
    if (method === 'upi') {
      const utrCheck = validateUtrInput(retryUtr);
      if (!utrCheck.valid) {
        setRetryPayError(utrCheck.error || 'Enter a valid UPI Transaction Reference (UTR).');
        return;
      }
      normalizedUtr = utrCheck.normalized;
    }

    setRetryPayBusy(true);
    try {
      await adapter.submitPayment({
        trackingToken: activeToken,
        paymentMethod: method,
        transactionReference: normalizedUtr,
        idempotencyKey: `track-pay-${crypto.randomUUID()}`,
      });
      setRetryUtr('');
      setRetryPaySuccess(
        method === 'upi'
          ? 'UPI reference submitted for staff verification.'
          : 'Counter cash payment selected. Pay at Aman Computer counter.'
      );
      await fetchStatus(activeToken);
    } catch (err) {
      setRetryPayError(err instanceof Error ? err.message : 'Unable to submit payment update.');
    } finally {
      setRetryPayBusy(false);
    }
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

      {/* Loaded Job Tracking Details (Customer-Safe Only — Zero Document Download Links or Internal IDs) */}
      {!loading && jobData && statusMeta && (
        <section className="portal-card p-5 sm:p-6 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-[20px] font-bold tabular-nums">{jobData.jobNumber}</h2>
                <StatusBadge label={statusMeta.label} tone={statusMeta.tone} />
              </div>
              <p className="text-[13.5px] text-[var(--color-text-secondary)] m-0">
                {statusMeta.description}
              </p>
              {jobData.submittedAt && (
                <p className="text-[12px] text-[var(--color-text-muted)] tabular-nums m-0">
                  Submitted on {new Date(jobData.submittedAt).toLocaleString()}
                </p>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {isJobActiveForPolling && (
                <button
                  type="button"
                  onClick={() => setAutoRefresh((v) => !v)}
                  className="portal-btn-secondary px-3 py-2 text-[12.5px] inline-flex items-center gap-1.5 cursor-pointer"
                  aria-pressed={autoRefresh}
                >
                  {autoRefresh ? (
                    <>
                      <span className="w-2 h-2 rounded-full bg-[#25C7D9] animate-pulse" aria-hidden="true" />
                      <Pause size={13} aria-hidden="true" />
                      <span>Live (5s)</span>
                    </>
                  ) : (
                    <>
                      <Play size={13} aria-hidden="true" />
                      <span>Resume Live</span>
                    </>
                  )}
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  const next = !soundEnabled;
                  setSoundEnabled(next);
                  if (next) playCustomerPickupChime(false);
                }}
                className="portal-btn-secondary px-3 py-2 text-[12.5px] inline-flex items-center gap-1.5 cursor-pointer"
                aria-pressed={soundEnabled}
                title="Play chime when job finishes"
              >
                {soundEnabled ? <Volume2 size={14} /> : <VolumeX size={14} />}
                <span className="hidden sm:inline">{soundEnabled ? 'Chime On' : 'Chime Off'}</span>
              </button>
              <button
                type="button"
                onClick={() => void handleToggleBrowserNotify()}
                className="portal-btn-secondary px-3 py-2 text-[12.5px] inline-flex items-center gap-1.5 cursor-pointer"
                aria-pressed={browserNotifyEnabled}
              >
                {browserNotifyEnabled ? <Bell size={14} /> : <BellOff size={14} />}
                <span className="hidden sm:inline">{browserNotifyEnabled ? 'Alerts On' : 'Notify Me'}</span>
              </button>
              <button
                type="button"
                onClick={() => void fetchStatus(activeToken)}
                className="portal-btn-secondary px-3.5 py-2 text-[13px] inline-flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <RefreshCw size={14} aria-hidden="true" />
                <span>Refresh</span>
              </button>
            </div>
          </div>

          {lastSyncedAt && (
            <div className="text-[11.5px] text-[var(--color-text-muted)] tabular-nums">
              Last synced at {lastSyncedAt}
              {isJobActiveForPolling && autoRefresh ? ' · Auto-updating every 5s' : ''}
            </div>
          )}

          {statusUpdateBanner && (
            <div
              role="status"
              className={`rounded-[12px] p-3.5 text-[13px] flex items-start gap-2 border ${
                statusUpdateBanner.tone === 'good'
                  ? 'bg-[var(--good-soft)] border-[var(--good)]/30 text-[var(--good)]'
                  : statusUpdateBanner.tone === 'warn'
                    ? 'bg-[var(--warn-soft)] border-[var(--warn)]/30 text-[var(--warn)]'
                    : 'bg-[var(--ac-cyan-soft)] border-[var(--ac-cyan-border)] text-[var(--color-text-primary)]'
              }`}
            >
              <CheckCircle2 size={17} className="shrink-0 mt-0.5" />
              <div className="font-semibold">{statusUpdateBanner.message}</div>
            </div>
          )}

          {jobData.rejectionReason && (
            <div className="rounded-[12px] bg-[var(--bad-soft)] border border-[var(--bad)]/30 p-3.5 text-[13px] text-[var(--bad)] flex items-start gap-2">
              <ShieldAlert size={17} className="shrink-0 mt-0.5" />
              <div>
                <strong>Counter Note: </strong>
                {jobData.rejectionReason}
              </div>
            </div>
          )}

          {jobData.payment?.rejectionReason && jobData.paymentStatus === 'unpaid' && (
            <div className="rounded-[12px] bg-[var(--warn-soft)] border border-[var(--warn)]/30 p-3.5 text-[13px] text-[var(--warn)] flex items-start gap-2">
              <AlertTriangle size={17} className="shrink-0 mt-0.5" />
              <div>
                <strong>Payment Verification Note: </strong>
                {jobData.payment.rejectionReason}
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
              <span className="font-semibold text-right">
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

          {/* Retry / Submit Payment on Unpaid Active Job */}
          {canResubmitPayment && (
            <form
              onSubmit={handleRetryPaymentSubmit}
              className="portal-card-subtle p-4 space-y-3 border border-[var(--ac-cyan-border)]"
            >
              <div className="text-[13.5px] font-bold">Complete or Update Payment Reference</div>
              <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Payment method">
                <button
                  type="button"
                  role="radio"
                  aria-checked={retryPayMethod === 'upi' && upiAvailable}
                  disabled={!upiAvailable}
                  onClick={() => setRetryPayMethod('upi')}
                  className={`min-h-[42px] px-3 py-2 rounded-[10px] border text-[12.5px] font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-45 ${
                    retryPayMethod === 'upi' && upiAvailable
                      ? 'bg-[var(--ac-cyan-soft)] border-[var(--ac-cyan)]'
                      : 'bg-[var(--color-surface)] border-[var(--color-border)]'
                  }`}
                >
                  <QrCode size={14} />
                  <span>Submit UPI UTR</span>
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={retryPayMethod === 'cash' || !upiAvailable}
                  onClick={() => setRetryPayMethod('cash')}
                  className={`min-h-[42px] px-3 py-2 rounded-[10px] border text-[12.5px] font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer ${
                    retryPayMethod === 'cash' || !upiAvailable
                      ? 'bg-[var(--ac-cyan-soft)] border-[var(--ac-cyan)]'
                      : 'bg-[var(--color-surface)] border-[var(--color-border)]'
                  }`}
                >
                  <Banknote size={14} />
                  <span>Pay Counter Cash</span>
                </button>
              </div>

              {retryPayMethod === 'upi' && upiAvailable && (
                <div>
                  <label htmlFor={retryUtrId} className="block text-[12px] font-bold mb-1">
                    UPI UTR / Transaction Reference
                  </label>
                  <input
                    id={retryUtrId}
                    type="text"
                    value={retryUtr}
                    onChange={(e) => setRetryUtr(e.target.value)}
                    placeholder="Enter 12-digit UTR"
                    className="portal-input w-full px-3 text-[13.5px] tabular-nums"
                  />
                </div>
              )}

              {retryPayError && (
                <p className="text-[12px] font-semibold text-[var(--bad)] m-0">{retryPayError}</p>
              )}
              {retryPaySuccess && (
                <p className="text-[12px] font-semibold text-[var(--good)] m-0">{retryPaySuccess}</p>
              )}

              <button
                type="submit"
                disabled={retryPayBusy}
                className="portal-btn-primary px-4 py-2 text-[13px] cursor-pointer"
              >
                {retryPayBusy
                  ? 'Updating Payment...'
                  : retryPayMethod === 'upi' && upiAvailable
                    ? 'Submit UPI Reference'
                    : 'Confirm Pay Cash at Counter'}
              </button>
            </form>
          )}
        </section>
      )}
    </div>
  );
};
