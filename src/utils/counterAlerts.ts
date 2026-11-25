export type CounterAlertKind = 'new_job' | 'payment_claim' | 'attention' | 'completed';

export interface QueueAlertSnapshot {
  totalJobs: number;
  pendingPayments: number;
  attentionJobs: number;
  completedJobs: number;
}

export interface CounterNotificationEvent {
  kind: CounterAlertKind;
  title: string;
  tone: 'info' | 'good' | 'warn' | 'bad';
}

export function detectQueueNotifications(
  previous: QueueAlertSnapshot | null,
  current: QueueAlertSnapshot
): CounterNotificationEvent[] {
  if (!previous) return [];
  const events: CounterNotificationEvent[] = [];

  if (current.attentionJobs > previous.attentionJobs) {
    const diff = current.attentionJobs - previous.attentionJobs;
    events.push({
      kind: 'attention',
      title: `${diff} print job(s) failed or require manual counter review.`,
      tone: 'bad',
    });
  }

  if (current.pendingPayments > previous.pendingPayments) {
    const diff = current.pendingPayments - previous.pendingPayments;
    events.push({
      kind: 'payment_claim',
      title: `${diff} new UPI/payment claim waiting for verification.`,
      tone: 'warn',
    });
  }

  if (current.totalJobs > previous.totalJobs) {
    const diff = current.totalJobs - previous.totalJobs;
    events.push({
      kind: 'new_job',
      title: `${diff} new customer print request(s) received.`,
      tone: 'info',
    });
  }

  if (current.completedJobs > previous.completedJobs && events.length === 0) {
    const diff = current.completedJobs - previous.completedJobs;
    events.push({
      kind: 'completed',
      title: `${diff} print job(s) completed and ready for customer pickup.`,
      tone: 'good',
    });
  }

  return events;
}

export function playCounterChime(kind: CounterAlertKind): void {
  if (typeof window === 'undefined') return;
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return;

  try {
    const ctx = new AudioCtx();
    const now = ctx.currentTime;
    const notes =
      kind === 'attention'
        ? [440, 330]
        : kind === 'completed'
          ? [587.33, 880]
          : kind === 'payment_claim'
            ? [523.25, 659.25]
            : [659.25, 783.99];

    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = kind === 'attention' ? 'triangle' : 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.11);

      gain.gain.setValueAtTime(0.001, now + idx * 0.11);
      gain.gain.exponentialRampToValueAtTime(0.08, now + idx * 0.11 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.11 + 0.24);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + idx * 0.11);
      osc.stop(now + idx * 0.11 + 0.25);
    });

    window.setTimeout(() => {
      void ctx.close().catch(() => {});
    }, 900);
  } catch {
    // Ignore autoplay restriction errors when user hasn't interacted yet
  }
}

export const SOUND_ALERTS_STORAGE_KEY = 'ac_scan2print_sound_alerts';

export function loadSoundAlertsEnabled(): boolean {
  try {
    return window.localStorage.getItem(SOUND_ALERTS_STORAGE_KEY) !== 'false';
  } catch {
    return true;
  }
}

export function saveSoundAlertsEnabled(enabled: boolean): void {
  try {
    window.localStorage.setItem(SOUND_ALERTS_STORAGE_KEY, enabled ? 'true' : 'false');
  } catch {
    // Ignore storage restriction
  }
}
