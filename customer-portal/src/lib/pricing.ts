// AC Scan2Print Customer Portal — Deterministic Pricing, Route Parsing & Customer-Safe Status Helpers

import type {
  CustomerRoute,
  FinishingServiceId,
  JobStatus,
  PagesPerSheet,
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
    case '/quick-print/kiosk':
      return '/quick-print/kiosk';
    case '/quick-print/photo-sheet':
      return '/quick-print/photo-sheet';
    case '/quick-print/exam-prep':
      return '/quick-print/exam-prep';
    case '/quick-print/batch-pack':
      return '/quick-print/batch-pack';
    default:
      return '/quick-print';
  }
}

export interface CustomerPhotoPresetSpec {
  id: 'passport_4x6_8' | 'passport_a4_24' | 'passport_a4_35' | 'id_card_a4_duplex';
  label: string;
  shortDesc: string;
  sheetWidthPx: number;
  sheetHeightPx: number;
  sheetWidthMm: number;
  sheetHeightMm: number;
  cols: number;
  rows: number;
  maxSlots: number;
  tileWidthMm: number;
  tileHeightMm: number;
  gapMm: number;
  suggestedPriceInr: number;
  mode: 'passport_grid' | 'id_card_pair';
}

export const PHOTO_SHEET_CUSTOMER_PRESETS: readonly CustomerPhotoPresetSpec[] = [
  {
    id: 'passport_4x6_8',
    label: '4×6 Glossy — 8 Passport Photos',
    shortDesc: 'Standard 35×45 mm passport grid on 4×6 photo paper',
    sheetWidthPx: 1800,
    sheetHeightPx: 1200,
    sheetWidthMm: 152.4,
    sheetHeightMm: 101.6,
    cols: 4,
    rows: 2,
    maxSlots: 8,
    tileWidthMm: 35,
    tileHeightMm: 45,
    gapMm: 3,
    suggestedPriceInr: 40,
    mode: 'passport_grid',
  },
  {
    id: 'passport_a4_24',
    label: 'A4 Sheet — 24 Passport Photos',
    shortDesc: 'Bulk 35×45 mm passport pack on A4 sheet',
    sheetWidthPx: 2480,
    sheetHeightPx: 3508,
    sheetWidthMm: 210,
    sheetHeightMm: 297,
    cols: 4,
    rows: 6,
    maxSlots: 24,
    tileWidthMm: 35,
    tileHeightMm: 45,
    gapMm: 3.5,
    suggestedPriceInr: 90,
    mode: 'passport_grid',
  },
  {
    id: 'passport_a4_35',
    label: 'A4 Stamp — 35 Mini Photos',
    shortDesc: '30×35 mm school/exam form mini photos',
    sheetWidthPx: 2480,
    sheetHeightPx: 3508,
    sheetWidthMm: 210,
    sheetHeightMm: 297,
    cols: 5,
    rows: 7,
    maxSlots: 35,
    tileWidthMm: 30,
    tileHeightMm: 35,
    gapMm: 4,
    suggestedPriceInr: 100,
    mode: 'passport_grid',
  },
  {
    id: 'id_card_a4_duplex',
    label: 'A4 ID Card (Front + Back)',
    shortDesc: 'Aadhaar / PAN / Voter ID CR80 size on one A4 page',
    sheetWidthPx: 2480,
    sheetHeightPx: 3508,
    sheetWidthMm: 210,
    sheetHeightMm: 297,
    cols: 1,
    rows: 2,
    maxSlots: 2,
    tileWidthMm: 85.6,
    tileHeightMm: 54,
    gapMm: 14,
    suggestedPriceInr: 20,
    mode: 'id_card_pair',
  },
] as const;

export interface CustomerExamPresetSpec {
  id: 'ssc_photo' | 'ssc_signature' | 'upsc_photo' | 'rrb_bpsc_photo' | 'pan_form_scan';
  label: string;
  shortDesc: string;
  widthPx: number;
  heightPx: number;
  minKb: number;
  maxKb: number;
  defaultScanClean: boolean;
}

export const EXAM_FORM_CUSTOMER_PRESETS: readonly CustomerExamPresetSpec[] = [
  {
    id: 'ssc_photo',
    label: 'SSC CGL / CHSL Photo',
    shortDesc: '413×531 px · 20–50 KB JPEG',
    widthPx: 413,
    heightPx: 531,
    minKb: 20,
    maxKb: 50,
    defaultScanClean: false,
  },
  {
    id: 'ssc_signature',
    label: 'SSC / RRB Signature',
    shortDesc: '472×236 px · 10–20 KB Clean Ink',
    widthPx: 472,
    heightPx: 236,
    minKb: 10,
    maxKb: 20,
    defaultScanClean: true,
  },
  {
    id: 'upsc_photo',
    label: 'UPSC CSE Portrait',
    shortDesc: '550×700 px · 20–300 KB JPEG',
    widthPx: 550,
    heightPx: 700,
    minKb: 20,
    maxKb: 300,
    defaultScanClean: false,
  },
  {
    id: 'rrb_bpsc_photo',
    label: 'BPSC / Police / RRB Photo',
    shortDesc: '320×400 px · 20–50 KB JPEG',
    widthPx: 320,
    heightPx: 400,
    minKb: 20,
    maxKb: 50,
    defaultScanClean: false,
  },
  {
    id: 'pan_form_scan',
    label: 'PAN / Document Scan Clean',
    shortDesc: '1240×1754 px · 40–200 KB Crisp B&W',
    widthPx: 1240,
    heightPx: 1754,
    minKb: 40,
    maxKb: 200,
    defaultScanClean: true,
  },
] as const;

export interface FinishingAddonOption {
  id: FinishingServiceId;
  label: string;
  shortDesc: string;
  rateInr: number;
}

export const FINISHING_ADDONS: readonly FinishingAddonOption[] = [
  { id: 'none', label: 'Standard Print Only', shortDesc: 'Loose printed pages', rateInr: 0 },
  { id: 'staple_corner', label: 'Corner Stapling', shortDesc: 'Clean metal staple per copy', rateInr: 5 },
  { id: 'spiral_binding', label: 'Spiral Binding', shortDesc: 'Clear front, card back & coil', rateInr: 30 },
  { id: 'thermal_lamination', label: 'A4 Lamination', shortDesc: '125-micron waterproof seal', rateInr: 20 },
  { id: 'heavy_cover_bind', label: 'Project Cover Bind', shortDesc: 'Card cover & spine tape', rateInr: 45 },
] as const;

export const NUP_LAYOUT_OPTIONS: ReadonlyArray<{
  pagesPerSheet: PagesPerSheet;
  label: string;
  hint: string;
}> = [
  { pagesPerSheet: 1, label: '1-in-1 Normal', hint: 'Full page' },
  { pagesPerSheet: 2, label: '2-in-1 Notes', hint: 'Save 50% sheets' },
  { pagesPerSheet: 4, label: '4-in-1 Compact', hint: 'Save 75% sheets' },
] as const;

export function getFinishingAddon(id?: FinishingServiceId): FinishingAddonOption {
  return FINISHING_ADDONS.find((f) => f.id === id) ?? FINISHING_ADDONS[0];
}

// Mirrors supabase/functions/_shared/pricing.ts calculatePhysicalSheets exactly
export function calculatePhysicalSheets(printedPages: number, printSides: PrintSides): number {
  if (!Number.isInteger(printedPages) || printedPages <= 0) return 0;
  return printSides === 'duplex' ? Math.ceil(printedPages / 2) : printedPages;
}

export interface EstimateBreakdown {
  pricingConfigured: boolean;
  matchedRule: PricingRulePublic | null;
  pagesPerSheet: PagesPerSheet;
  impressionsPerCopy: number;
  printedPagesTotal: number;
  physicalSheetsTotal: number;
  sheetsSavedByNup: number;
  unitCount: number;
  subtotal: number | null;
  finishingAddon: FinishingAddonOption;
  finishingAmount: number;
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
  pagesPerSheet?: PagesPerSheet;
  finishingService?: FinishingServiceId;
  rules: PricingRulePublic[];
}): EstimateBreakdown {
  const safePages = Math.max(0, Math.floor(input.pagesPerCopy));
  const safeCopies = Math.max(1, Math.floor(input.copies));
  const pagesPerSheet: PagesPerSheet =
    input.pagesPerSheet === 2 || input.pagesPerSheet === 4 ? input.pagesPerSheet : 1;

  const impressionsPerCopy = safePages > 0 ? Math.ceil(safePages / pagesPerSheet) : 0;
  const printedPagesTotal = impressionsPerCopy * safeCopies;
  const physicalSheetsPerCopy = calculatePhysicalSheets(impressionsPerCopy, input.printSides);
  const physicalSheetsTotal = physicalSheetsPerCopy * safeCopies;

  const baselineSheetsPerCopy = calculatePhysicalSheets(safePages, input.printSides);
  const sheetsSavedByNup = Math.max(0, (baselineSheetsPerCopy - physicalSheetsPerCopy) * safeCopies);

  const finishingAddon = getFinishingAddon(input.finishingService);
  const finishingAmount = finishingAddon.rateInr * safeCopies;

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
      pagesPerSheet,
      impressionsPerCopy,
      printedPagesTotal,
      physicalSheetsTotal,
      sheetsSavedByNup,
      unitCount:
        matchedRule?.pricingUnit === 'per_physical_sheet'
          ? physicalSheetsTotal
          : printedPagesTotal,
      subtotal: null,
      finishingAddon,
      finishingAmount,
      finalEstimatedAmount: null,
      minimumApplied: false,
      isMockEstimate: Boolean(matchedRule?.isMockSample),
    };
  }

  const unitCount =
    matchedRule.pricingUnit === 'per_physical_sheet'
      ? physicalSheetsTotal
      : printedPagesTotal;

  const ratePaise = Math.round(matchedRule.rate * 100);
  const minPaise = Math.round(matchedRule.minimumCharge * 100);
  const rawPrintPaise = unitCount * ratePaise;
  const minimumApplied = rawPrintPaise > 0 && rawPrintPaise < minPaise;
  const printChargePaise = Math.max(rawPrintPaise, minPaise);
  const finishingPaise = Math.round(finishingAmount * 100);
  const totalPaise = printChargePaise + finishingPaise;

  return {
    pricingConfigured: true,
    matchedRule,
    pagesPerSheet,
    impressionsPerCopy,
    printedPagesTotal,
    physicalSheetsTotal,
    sheetsSavedByNup,
    unitCount,
    subtotal: Number((rawPrintPaise / 100).toFixed(2)),
    finishingAddon,
    finishingAmount,
    finalEstimatedAmount: Number((totalPaise / 100).toFixed(2)),
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
