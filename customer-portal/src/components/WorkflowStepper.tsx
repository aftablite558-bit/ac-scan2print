import React from 'react';
import { Check } from 'lucide-react';

export type StepKey = 'upload' | 'options' | 'payment' | 'confirm';

interface WorkflowStepperProps {
  currentStep: StepKey;
}

const STEPS: Array<{ key: StepKey; number: number; label: string }> = [
  { key: 'upload', number: 1, label: 'Upload' },
  { key: 'options', number: 2, label: 'Options' },
  { key: 'payment', number: 3, label: 'Payment' },
  { key: 'confirm', number: 4, label: 'Submitted' },
];

export const WorkflowStepper: React.FC<WorkflowStepperProps> = ({ currentStep }) => {
  const currentIndex = STEPS.findIndex((s) => s.key === currentStep);

  return (
    <nav aria-label="Print submission steps" className="portal-card px-3.5 py-3">
      <ol className="grid grid-cols-4 gap-1.5">
        {STEPS.map((step, idx) => {
          const isDone = idx < currentIndex;
          const isActive = idx === currentIndex;
          return (
            <li key={step.key} className="flex flex-col items-center text-center gap-1 min-w-0">
              <div
                aria-current={isActive ? 'step' : undefined}
                className={`w-7 h-7 rounded-full text-[12px] font-bold flex items-center justify-center transition-colors ${
                  isDone
                    ? 'bg-[var(--good-soft)] text-[var(--good)] border border-[var(--good)]/30'
                    : isActive
                      ? 'bg-[var(--color-accent-bg)] text-[var(--color-accent-ink)]'
                      : 'bg-[var(--color-surface-subtle)] text-[var(--color-text-muted)] border border-[var(--color-border)]'
                }`}
              >
                {isDone ? <Check size={14} strokeWidth={2.6} /> : step.number}
              </div>
              <span
                className={`text-[11px] sm:text-[12px] truncate max-w-full ${
                  isActive
                    ? 'font-bold text-[var(--color-text-primary)]'
                    : isDone
                      ? 'font-semibold text-[var(--good)]'
                      : 'font-medium text-[var(--color-text-muted)]'
                }`}
              >
                {step.label}
              </span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
};
