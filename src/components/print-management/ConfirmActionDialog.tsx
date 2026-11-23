import React, { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, ShieldAlert, X } from 'lucide-react';

export interface ConfirmDialogConfig {
  title: string;
  description: string;
  confirmLabel: string;
  tone: 'primary' | 'danger' | 'warn';
  requireReason?: boolean;
  reasonLabel?: string;
  reasonPlaceholder?: string;
  minReasonLength?: number;
  onConfirm: (reason: string) => Promise<void>;
}

export const ConfirmActionDialog: React.FC<{
  config: ConfirmDialogConfig | null;
  busy: boolean;
  onClose: () => void;
}> = ({ config, busy, onClose }) => {
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setReason('');
    setError(null);
  }, [config]);

  if (!config) return null;

  const minLen = config.minReasonLength ?? 3;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (config.requireReason && reason.trim().length < minLen) {
      setError(`Please enter a clear reason (at least ${minLen} characters).`);
      return;
    }
    setError(null);
    await config.onConfirm(reason.trim());
  };

  return (
    <div className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="fixed inset-0" onClick={() => !busy && onClose()} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={config.title}
        className="relative w-full max-w-[480px] glass-solid rounded-[24px] p-6 shadow-2xl border border-[var(--line)]"
      >
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-[12px] flex items-center justify-center shrink-0"
              style={{
                background:
                  config.tone === 'danger'
                    ? 'var(--bad-soft)'
                    : config.tone === 'warn'
                      ? 'var(--warn-soft)'
                      : 'var(--accent-soft)',
                color:
                  config.tone === 'danger'
                    ? 'var(--bad)'
                    : config.tone === 'warn'
                      ? 'var(--warn)'
                      : 'var(--accent-text)',
              }}
            >
              {config.tone === 'danger' ? (
                <ShieldAlert size={18} />
              ) : config.tone === 'warn' ? (
                <AlertTriangle size={18} />
              ) : (
                <CheckCircle2 size={18} />
              )}
            </div>
            <h3 className="text-[18px] font-bold leading-snug">{config.title}</h3>
          </div>
          <button
            type="button"
            disabled={busy}
            aria-label="Close confirmation dialog"
            onClick={onClose}
            className="w-8 h-8 rounded-[10px] btn-ghost flex items-center justify-center cursor-pointer disabled:opacity-50"
          >
            <X size={16} />
          </button>
        </div>

        <p className="text-[13.5px] text-[var(--ink-2)] leading-relaxed mb-4">
          {config.description}
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          {config.requireReason && (
            <div>
              <label
                htmlFor="confirm-action-reason"
                className="block text-[12.5px] font-semibold text-[var(--ink-2)] mb-1.5"
              >
                {config.reasonLabel || 'Audit Reason (Required)'}
              </label>
              <textarea
                id="confirm-action-reason"
                rows={3}
                value={reason}
                onChange={(e) => {
                  setReason(e.target.value);
                  if (error) setError(null);
                }}
                placeholder={config.reasonPlaceholder || 'Explain why this action is being taken...'}
                className="w-full rounded-[12px] bg-[var(--card-2)] border border-[var(--line)] px-3 py-2 text-[13.5px] focus:outline-none focus:border-[var(--accent)]"
                disabled={busy}
              />
            </div>
          )}

          {error && (
            <div className="rounded-[12px] px-3 py-2 text-[12.5px] font-medium bg-[var(--bad-soft)] text-[var(--bad)]">
              {error}
            </div>
          )}

          <div className="flex items-center justify-end gap-2.5 pt-1">
            <button
              type="button"
              disabled={busy}
              onClick={onClose}
              className="btn-ghost px-4 py-2 rounded-[12px] text-[13px] font-medium cursor-pointer disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy}
              className="px-4 py-2 rounded-[12px] text-[13px] font-semibold cursor-pointer transition-opacity disabled:opacity-50"
              style={{
                background:
                  config.tone === 'danger'
                    ? 'var(--bad)'
                    : config.tone === 'warn'
                      ? 'var(--warn)'
                      : 'var(--accent)',
                color: config.tone === 'primary' ? 'var(--accent-ink)' : '#ffffff',
              }}
            >
              {busy ? 'Processing...' : config.confirmLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
