import React from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  FileCheck2,
  Printer,
  XCircle,
} from 'lucide-react';
import type { SemanticTone } from '../lib/pricing';

interface StatusBadgeProps {
  label: string;
  tone: SemanticTone;
}

const TONE_CLASS: Record<SemanticTone, string> = {
  neutral:
    'bg-[var(--color-surface-subtle)] text-[var(--color-text-secondary)] border-[var(--color-border-strong)]',
  info: 'bg-[var(--info-soft)] text-[var(--info)] border-[var(--info)]/30',
  warn: 'bg-[var(--warn-soft)] text-[var(--warn)] border-[var(--warn)]/35',
  good: 'bg-[var(--good-soft)] text-[var(--good)] border-[var(--good)]/35',
  bad: 'bg-[var(--bad-soft)] text-[var(--bad)] border-[var(--bad)]/35',
};

function renderToneIcon(tone: SemanticTone, label: string) {
  if (tone === 'good') return <CheckCircle2 size={14} aria-hidden="true" />;
  if (tone === 'bad') return <XCircle size={14} aria-hidden="true" />;
  if (tone === 'warn') return <AlertTriangle size={14} aria-hidden="true" />;
  if (label.toLowerCase().includes('print')) return <Printer size={14} aria-hidden="true" />;
  if (label.toLowerCase().includes('approved')) return <FileCheck2 size={14} aria-hidden="true" />;
  return <Clock size={14} aria-hidden="true" />;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ label, tone }) => {
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[12px] font-bold leading-none ${TONE_CLASS[tone]}`}
    >
      {renderToneIcon(tone, label)}
      <span>{label}</span>
    </span>
  );
};
