import React from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Clock,
  FileText,
  HelpCircle,
  Lock,
  Search,
  ShieldCheck,
  Upload,
} from 'lucide-react';
import { ErrorAlert, LoadingCard } from '../components/LoadingEmptyError';
import { usePortal } from '../context/PortalContext';
import { formatFileSize } from '../lib/validation';

const STEPS = [
  { num: '1', title: 'Upload Documents', desc: 'Pick PDF or image files from your phone or laptop.' },
  { num: '2', title: 'Choose Print Options', desc: 'Set B&W/Colour, copies, paper size, and sides.' },
  { num: '3', title: 'UPI or Counter Cash', desc: 'Submit UPI reference or choose Cash at counter.' },
  { num: '4', title: 'Track & Collect', desc: 'Follow live approval and collect at Aman Computer.' },
];

export const PrintHomePage: React.FC = () => {
  const { capabilities, capabilitiesLoading, capabilitiesError, reloadCapabilities, navigate } =
    usePortal();

  if (capabilitiesLoading) {
    return <LoadingCard label="Loading shop print capabilities..." />;
  }

  if (capabilitiesError || !capabilities) {
    return (
      <ErrorAlert
        title="Unable to load AC Scan2Print portal settings"
        message={capabilitiesError || 'Print settings could not be loaded.'}
        onRetry={() => void reloadCapabilities()}
      />
    );
  }

  const intakePaused = Boolean(capabilities.intakePaused);

  return (
    <div className="space-y-5">
      {/* Primary Hero & Above-the-Fold Upload Action (Spec §7.1) */}
      <section className="portal-card p-5 sm:p-7 space-y-5">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[var(--ac-cyan-soft)] border border-[var(--ac-cyan-border)] text-[11.5px] font-bold uppercase tracking-[0.05em] text-[var(--color-accent)]">
            <span>{capabilities.shopName} · Smart QR Print</span>
          </div>
          <h1 className="text-[26px] sm:text-[32px] font-bold tracking-tight leading-tight">
            Smart Print — Scan. Upload. Print.
          </h1>
          <p className="text-[14px] sm:text-[15px] text-[var(--color-text-secondary)]">
            Send your documents straight to the counter print queue without WhatsApp chats, USB drives, or account sign-ups.
          </p>
        </div>

        {intakePaused && (
          <div
            role="status"
            className="rounded-[16px] p-4 bg-[var(--warn-soft)] border border-[var(--warn)]/35 flex items-start gap-3"
          >
            <AlertTriangle size={18} className="text-[var(--warn)] shrink-0 mt-0.5" aria-hidden="true" />
            <div className="space-y-1 text-[13px]">
              <div className="font-bold text-[var(--color-text-primary)]">
                New Print Uploads Temporarily Paused
              </div>
              <p className="m-0 text-[var(--color-text-secondary)]">
                {capabilities.pauseReason ||
                  'Counter intake is temporarily paused for maintenance or rush queue clearance. You can still track existing orders below or ask at the counter.'}
              </p>
            </div>
          </div>
        )}

        <div className="flex flex-col sm:flex-row flex-wrap gap-2.5">
          <button
            type="button"
            disabled={intakePaused}
            onClick={() => navigate('/quick-print/upload')}
            className="portal-btn-primary px-5 py-3 text-[15px] flex-1 min-w-[200px] inline-flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Upload size={18} aria-hidden="true" />
            <span>{intakePaused ? 'Uploads Temporarily Paused' : 'Upload Document'}</span>
            {!intakePaused && <ArrowRight size={16} aria-hidden="true" />}
          </button>

          <button
            type="button"
            onClick={() => navigate('/quick-print/photo-sheet')}
            className="portal-btn-secondary px-4 py-3 text-[14px] inline-flex items-center justify-center gap-2 cursor-pointer"
          >
            <span>Passport Photo Sheet</span>
          </button>

          <button
            type="button"
            onClick={() => navigate('/quick-print/exam-prep')}
            className="portal-btn-secondary px-4 py-3 text-[14px] inline-flex items-center justify-center gap-2 cursor-pointer"
          >
            <span>Exam KB Prep</span>
          </button>

          <button
            type="button"
            onClick={() => navigate('/quick-print/batch-pack')}
            className="portal-btn-secondary px-4 py-3 text-[14px] inline-flex items-center justify-center gap-2 cursor-pointer"
          >
            <span>Bulk Notes Pack</span>
          </button>

          <button
            type="button"
            onClick={() => navigate('/quick-print/track')}
            className="portal-btn-secondary px-4 py-3 text-[14px] inline-flex items-center justify-center gap-2 cursor-pointer"
          >
            <Search size={16} aria-hidden="true" />
            <span>Track Job</span>
          </button>
        </div>

        {/* File Limits & Shop Info Strip */}
        <div className="portal-card-subtle p-3.5 grid grid-cols-1 sm:grid-cols-2 gap-3 text-[12.5px]">
          <div className="flex items-center gap-2">
            <FileText size={16} className="text-[var(--color-accent)] shrink-0" aria-hidden="true" />
            <div>
              <div className="font-bold text-[var(--color-text-primary)]">Supported Formats</div>
              <div className="text-[var(--color-text-muted)]">
                {capabilities.allowedExtensions.join(', ')}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <ShieldCheck size={16} className="text-[var(--color-accent)] shrink-0" aria-hidden="true" />
            <div>
              <div className="font-bold text-[var(--color-text-primary)]">Upload Limits</div>
              <div className="text-[var(--color-text-muted)] tabular-nums">
                Up to {capabilities.maxFilesPerJob} files · {formatFileSize(capabilities.maxFileSizeBytes)} each
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Clock size={16} className="text-[var(--color-accent)] shrink-0" aria-hidden="true" />
            <div>
              <div className="font-bold text-[var(--color-text-primary)]">Shop Hours</div>
              <div className="text-[var(--color-text-muted)]">{capabilities.shopHours}</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <HelpCircle size={16} className="text-[var(--color-accent)] shrink-0" aria-hidden="true" />
            <div>
              <div className="font-bold text-[var(--color-text-primary)]">Shop Assistance</div>
              <div className="text-[var(--color-text-muted)]">
                {capabilities.shopAddress} · {capabilities.shopContactPhone}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Short Scan -> Upload -> Collect Instructions */}
      <section className="portal-card p-5 space-y-3.5" aria-labelledby="how-it-works-heading">
        <h2 id="how-it-works-heading" className="text-[16px] font-bold">
          How AC Scan2Print works
        </h2>
        <ol className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {STEPS.map((step) => (
            <li
              key={step.num}
              className="portal-card-subtle p-3.5 flex items-start gap-3"
            >
              <span className="w-7 h-7 rounded-full bg-[#111318] text-[#25C7D9] text-[12.5px] font-bold flex items-center justify-center shrink-0 tabular-nums">
                {step.num}
              </span>
              <div>
                <div className="text-[13.5px] font-bold">{step.title}</div>
                <p className="text-[12.5px] text-[var(--color-text-muted)] mt-0.5">{step.desc}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* Privacy & Retention Notice + Help Link */}
      <section className="portal-card p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-start gap-2.5 text-[12.5px] text-[var(--color-text-secondary)]">
          <Lock size={16} className="text-[var(--good)] shrink-0 mt-0.5" aria-hidden="true" />
          <p className="m-0">
            <strong className="text-[var(--color-text-primary)]">Private & Auto-Cleaned: </strong>
            {capabilities.retentionNotice}
          </p>
        </div>
        <button
          type="button"
          onClick={() => navigate('/quick-print/help')}
          className="portal-btn-secondary px-3.5 py-2 text-[13px] shrink-0 inline-flex items-center justify-center gap-1.5 cursor-pointer"
        >
          <HelpCircle size={15} aria-hidden="true" />
          <span>Help & FAQ</span>
        </button>
      </section>
    </div>
  );
};
