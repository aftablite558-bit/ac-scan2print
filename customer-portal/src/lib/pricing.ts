// AC Scan2Print Customer Portal — Deterministic Pricing, Route Parsing & Customer-Safe Status Helpers

import type {
  CustomerRoute,
  JobStatus,
  PaperSize,
  PaymentMethod,
  PaymentStatus,
  PricingRulePublic,
  PrintMode,
  PrintSides,
} from '../types/portal';

export function parseCustomerRoute(pathname: string): CustomerRoute {
  const clean = pathname.replace(/\/+$/, '') || '/';
  switch (clean) {
    case '/':
    case '/quick-print':
      return '/quick-print';
    case '/quick-print/upload':
      return '/quick-print/upload';
    case '/quick-print/options':
      return '/quick-print/options';
    case '/quick-print/success':
      return '/quick-print/success';
    case '/quick-print/track':
      return '/quick-print/track';
    case '/quick-print/help':
      return '/quick-print/help';
    default:
      return '/quick-print';
  }
}

// Mirrors supabase/functions/_shared/pricing.ts calculatePhysicalSheets exactly
export function calculatePhysicalSheets(printedPages: number, printSides: PrintSides): number {
  if (!Number.isInteger(printedPages) || printedPages <= 0) return 0;
  return printSides === 'duplex' ? Math.ceil(printedPages / 2) : printedPages;
}

export interface EstimateBreakdown {
  pricingConfigured: boolean;
  matchedRule: PricingRulePublic | null;
  printedPagesTotal: number;
  physicalSheetsTotal: number;
  unitCount: number;
  subtotal: number | null;
  finalEstimatedAmount: number | null;
  minimumApplied: boolean;
  isMockEstimate: boolean;
}

export function calculateEstimateBreakdown(input: {
  pagesPerCopy: number;
  copies: number;
  paperSize: PaperSize;
  printMode: PrintMode;
  printSides: PrintSides;
  rules: PricingRulePublic[];
}): EstimateBreakdown {
  const safePages = Math.max(0, Math.floor(input.pagesPerCopy));
  const safeCopies = Math.max(1, Math.floor(input.copies));
  const printedPagesTotal = safePages * safeCopies;
  const physicalSheetsTotal =
    calculatePhysicalSheets(safePages, input.printSides) * safeCopies;

  const matchedRule =
    input.rules.find(
      (r) =>
        r.paperSize === input.paperSize &&
        r.printMode === input.printMode &&
        r.printSides === input.printSides
    ) ?? null;

  if (!matchedRule || safePages <= 0) {
    return {
      pricingConfigured: Boolean(matchedRule),
      matchedRule,
      printedPagesTotal,
      physicalSheetsTotal,
      unitCount:
        matchedRule?.pricingUnit === 'per_physical_sheet'
          ? physicalSheetsTotal
          : printedPagesTotal,
      subtotal: null,
      finalEstimatedAmount: null,
      minimumApplied: false,
      isMockEstimate: Boolean(matchedRule?.isMockSample),
    };
  }

  const unitCount =
    matchedRule.pricingUnit === 'per_physical_sheet'
      ? physicalSheetsTotal
      : printedPagesTotal;

  const rawSubtotal = Math.round(unitCount * matchedRule.rate * 100) / 100;
  const minimumApplied = rawSubtotal > 0 && rawSubtotal < matchedRule.minimumCharge;
  const finalEstimatedAmount = Math.max(rawSubtotal, matchedRule.minimumCharge);

  return {
    pricingConfigured: true,
    matchedRule,
    printedPagesTotal,
    physicalSheetsTotal,
    unitCount,
    subtotal: rawSubtotal,
    finalEstimatedAmount: Math.round(finalEstimatedAmount * 100) / 100,
    minimumApplied,
    isMockEstimate: matchedRule.isMockSample,
  };
}

export function formatInr(amount: number | null | undefined, currency = 'INR'): string {
  if (amount === null || amount === undefined || !Number.isFinite(amount)) {
    return 'Counter quote pending';
  }
  const symbol = currency === 'INR' ? '₹' : `${currency} `;
  return `${symbol}${amount.toFixed(2)}`;
}

export type SemanticTone = 'neutral' | 'info' | 'warn' | 'good' | 'bad';

export interface CustomerSafeStatusMeta {
  label: string;
  description: string;
  tone: SemanticTone;
  milestoneStep: number; // 0..5 for tracking stepper, -1 for terminal issue
}

// Accurate microcopy aligned strictly with UI/UX Spec §4.3 & §17
export function getCustomerSafeStatusMeta(
  status: JobStatus,
  paymentStatus: PaymentStatus,
  paymentMethod: PaymentMethod | null
): CustomerSafeStatusMeta {
  switch (status) {
    case 'draft':
      return {
        label: 'Draft',
        description: 'Upload and review your document before submitting.',
        tone: 'neutral',
        milestoneStep: 0,
      };
    case 'submitted':
      return {
        label: 'Submitted',
        description:
          paymentStatus === 'pending_verification'
            ? 'Your request and UPI reference were received and await counter staff review.'
            : 'Your print request is in the Aman Computer review queue.',
        tone: 'info',
        milestoneStep: 0,
      };
    case 'under_review':
      return {
        label: 'Under Review',
        description: 'Shop staff are checking page count, quality, and print settings.',
        tone: 'info',
        milestoneStep: 1,
      };
    case 'awaiting_payment':
      if (paymentStatus === 'pending_verification') {
        return {
          label: 'Payment Pending Verification',
          description: 'Your UPI payment details are awaiting manual confirmation by shop staff.',
          tone: 'warn',
          milestoneStep: 2,
        };
      }
      return {
        label: paymentMethod === 'cash' ? 'Pay Cash at Counter' : 'Awaiting Payment',
        description:
          paymentMethod === 'cash'
            ? 'Please pay cash at the Aman Computer counter to authorize printing.'
            : 'Complete payment or submit your UPI reference so staff can approve printing.',
        tone: 'warn',
        milestoneStep: 2,
      };
    case 'approved':
      return {
        label: 'Approved',
        description: 'Payment verified and print settings approved. Waiting to enter print queue.',
        tone: 'info',
        milestoneStep: 3,
      };
    case 'queued':
    case 'claimed':
    case 'downloading':
      return {
        label: 'In Print Queue',
        description: 'Your job has been released to the shop print station.',
        tone: 'info',
        milestoneStep: 4,
      };
    case 'printing':
      return {
        label: 'Printing in Progress',
        description: 'Your pages are currently being prepared for printing.',
        tone: 'info',
        milestoneStep: 4,
      };
    case 'submitted_to_spooler':
      // UI/UX Spec §17: Never claim "Printed successfully" just because spooler accepted
      return {
        label: 'Sent to Shop Printer Queue',
        description: 'Submitted to the shop printer. Counter staff are verifying physical output.',
        tone: 'info',
        milestoneStep: 4,
      };
    case 'completed':
      return {
        label: 'Ready for Collection',
        description: 'Your printed pages are ready to collect at the Aman Computer counter.',
        tone: 'good',
        milestoneStep: 5,
      };
    case 'needs_review':
      // UI/UX Spec §14 & §17: Uncertain print outcomes distinct from confirmed failure
      return {
        label: 'Staff Verification Needed',
        description: 'Counter staff are checking the printer output tray before handing over.',
        tone: 'warn',
        milestoneStep: 4,
      };
    case 'failed':
      return {
        label: 'Print Attention Needed',
        description: 'Printing paused before completion. Please speak with shop counter staff.',
        tone: 'bad',
        milestoneStep: -1,
      };
    case 'rejected':
      return {
        label: 'Request Declined',
        description: 'Your print request could not be processed. Check the reason below or contact staff.',
        tone: 'bad',
        milestoneStep: -1,
      };
    case 'cancelled':
      return {
        label: 'Cancelled',
        description: 'This print job was cancelled.',
        tone: 'neutral',
        milestoneStep: -1,
      };
    case 'expired':
      return {
        label: 'Expired & Purged',
        description: 'Temporary uploaded files for this job have passed retention cleanup.',
        tone: 'neutral',
        milestoneStep: -1,
      };
  }
}

export interface TrackingTimelineMilestone {
  key: string;
  title: string;
  subtitle: string;
  state: 'done' | 'current' | 'upcoming' | 'issue';
}

export function buildCustomerTrackingTimeline(
  status: JobStatus,
  paymentStatus: PaymentStatus,
  paymentMethod: PaymentMethod | null
): TrackingTimelineMilestone[] {
  const meta = getCustomerSafeStatusMeta(status, paymentStatus, paymentMethod);
  const steps = [
    { key: 'submitted', title: 'Request Submitted', subtitle: 'Files encrypted & queued' },
    { key: 'review', title: 'Staff Review', subtitle: 'Page count & settings checked' },
    {
      key: 'payment',
      title: 'Payment Verification',
      subtitle:
        paymentStatus === 'paid'
          ? 'Confirmed by shop staff'
          : paymentStatus === 'pending_verification'
            ? 'UPI UTR pending check'
            : 'Cash or UPI verification',
    },
    { key: 'approved', title: 'Approved for Print', subtitle: 'Cleared for counter printer' },
    { key: 'printing', title: 'Printing Queue', subtitle: 'Sent to shop print station' },
    { key: 'collection', title: 'Ready for Collection', subtitle: 'Pick up at Aman Computer' },
  ];

  if (meta.milestoneStep === -1) {
    return steps.map((s, idx) => ({
      ...s,
      state: idx === 0 ? 'done' : idx === 1 ? 'issue' : 'upcoming',
    }));
  }

  return steps.map((s, idx) => {
    if (idx < meta.milestoneStep) return { ...s, state: 'done' };
    if (idx === meta.milestoneStep) return { ...s, state: status === 'completed' ? 'done' : 'current' };
    return { ...s, state: 'upcoming' };
  });
}
