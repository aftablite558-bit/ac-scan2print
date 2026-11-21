import React from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';

export const LoadingCard: React.FC<{ label?: string }> = ({
  label = 'Loading print portal...',
}) => (
  <div className="portal-card p-6 space-y-3" role="status" aria-live="polite">
    <div className="h-4 w-40 rounded bg-[var(--color-surface-subtle)] animate-pulse" />
    <div className="h-3 w-full rounded bg-[var(--color-surface-subtle)] animate-pulse" />
    <div className="h-3 w-4/5 rounded bg-[var(--color-surface-subtle)] animate-pulse" />
    <p className="text-[12.5px] font-medium text-[var(--color-text-muted)] pt-1">{label}</p>
  </div>
);

export const ErrorAlert: React.FC<{
  title?: string;
  message: string;
  onRetry?: () => void;
}> = ({ title = 'Something went wrong', message, onRetry }) => (
  <div
    role="alert"
    className="rounded-[16px] bg-[var(--bad-soft)] border border-[var(--bad)]/35 p-4 text-[var(--bad)] space-y-2.5"
  >
    <div className="flex items-start gap-2.5">
      <AlertCircle size={18} className="shrink-0 mt-0.5" aria-hidden="true" />
      <div className="space-y-0.5">
        <div className="text-[13.5px] font-bold">{title}</div>
        <p className="text-[13px] font-medium leading-snug">{message}</p>
      </div>
    </div>
    {onRetry && (
      <button
        type="button"
        onClick={onRetry}
        className="portal-btn-secondary px-3.5 py-2 text-[12.5px] inline-flex items-center gap-1.5 cursor-pointer"
      >
        <RefreshCw size={14} />
        <span>Try again</span>
      </button>
    )}
  </div>
);
