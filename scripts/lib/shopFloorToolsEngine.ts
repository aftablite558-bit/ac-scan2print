// AC Scan2Print — Phase 20: Exam Form Document Spec Engine, Paper Wastage Root-Cause Analytics
// & Daily Counter Shift Handoff Checklist (Strictly Single-Shop)

import { sanitizeCsvValue } from './fleetKioskAndGstEngine.ts';

export type ExamPresetId =
  | 'ssc_photo'
  | 'ssc_signature'
  | 'upsc_photo'
  | 'rrb_bpsc_photo'
  | 'pan_form_scan';

export interface ExamFormPresetSpec {
  id: ExamPresetId;
  portalLabel: string;
  assetKind: 'photo' | 'signature' | 'document_scan';
  widthPx: number;
  heightPx: number;
  minKb: number;
  maxKb: number;
  recommendedDpi: number;
  mimeType: 'image/jpeg';
  defaultScanClean: boolean;
  guidance: string;
}

export const EXAM_FORM_PRESETS: readonly ExamFormPresetSpec[] = [
  {
    id: 'ssc_photo',
    portalLabel: 'SSC CGL / CHSL — Passport Photo (3.5×4.5 cm)',
    assetKind: 'photo',
    widthPx: 413,
    heightPx: 531,
    minKb: 20,
    maxKb: 50,
    recommendedDpi: 300,
    mimeType: 'image/jpeg',
    defaultScanClean: false,
    guidance: 'Plain white background, eyes open, JPEG between 20 KB and 50 KB.',
  },
  {
    id: 'ssc_signature',
    portalLabel: 'SSC / RRB — Signature Strip (4.0×2.0 cm)',
    assetKind: 'signature',
    widthPx: 472,
    heightPx: 236,
    minKb: 10,
    maxKb: 20,
    recommendedDpi: 300,
    mimeType: 'image/jpeg',
    defaultScanClean: true,
    guidance: 'Black/blue ink on plain white paper, scan-cleaned contrast, 10–20 KB JPEG.',
  },
  {
    id: 'upsc_photo',
    portalLabel: 'UPSC CSE / NDA — Portrait Photo',
    assetKind: 'photo',
    widthPx: 550,
    heightPx: 700,
    minKb: 20,
    maxKb: 300,
    recommendedDpi: 300,
    mimeType: 'image/jpeg',
    defaultScanClean: false,
    guidance: 'Square/portrait sharp face crop, minimum 350×350 px up to 1000×1000 px, 20–300 KB.',
  },
  {
    id: 'rrb_bpsc_photo',
    portalLabel: 'BPSC / Bihar Police / Railway — Standard Form Photo',
    assetKind: 'photo',
    widthPx: 320,
    heightPx: 400,
    minKb: 20,
    maxKb: 50,
    recommendedDpi: 200,
    mimeType: 'image/jpeg',
    defaultScanClean: false,
    guidance: 'Color JPEG with light background, 20–50 KB strictly.',
  },
  {
    id: 'pan_form_scan',
    portalLabel: 'PAN / Aadhaar / Document Clean A4 Scan (JPEG)',
    assetKind: 'document_scan',
    widthPx: 1240,
    heightPx: 1754,
    minKb: 40,
    maxKb: 200,
    recommendedDpi: 150,
    mimeType: 'image/jpeg',
    defaultScanClean: true,
    guidance: 'Brightened background & darkened ink text for crisp portal uploads under 200 KB.',
  },
] as const;

export function getExamFormPreset(id: string | undefined | null): ExamFormPresetSpec {
  return EXAM_FORM_PRESETS.find((p) => p.id === id) ?? EXAM_FORM_PRESETS[0];
}

export interface ExamAssetComplianceReport {
  preset: ExamFormPresetSpec;
  actualWidthPx: number;
  actualHeightPx: number;
  actualKb: number;
  dimensionsMatch: boolean;
  kbInRange: boolean;
  status: 'within_spec' | 'too_large_kb' | 'too_small_kb' | 'wrong_dimensions';
  summary: string;
}

export function evaluateExamAssetCompliance(input: {
  presetId?: string | null;
  widthPx: number;
  heightPx: number;
  sizeBytes: number;
}): ExamAssetComplianceReport {
  const preset = getExamFormPreset(input.presetId);
  const w = Math.max(0, Math.round(Number(input.widthPx) || 0));
  const h = Math.max(0, Math.round(Number(input.heightPx) || 0));
  const actualKb = Number((Math.max(0, Number(input.sizeBytes) || 0) / 1024).toFixed(1));
  const dimensionsMatch = w === preset.widthPx && h === preset.heightPx;
  const kbInRange = actualKb >= preset.minKb && actualKb <= preset.maxKb;

  let status: ExamAssetComplianceReport['status'] = 'within_spec';
  let summary = `Ready for ${preset.portalLabel} (${w}×${h} px · ${actualKb} KB)`;

  if (!dimensionsMatch) {
    status = 'wrong_dimensions';
    summary = `Expected ${preset.widthPx}×${preset.heightPx} px, got ${w}×${h} px.`;
  } else if (actualKb > preset.maxKb) {
    status = 'too_large_kb';
    summary = `File is ${actualKb} KB (max ${preset.maxKb} KB). Reduce JPEG quality.`;
  } else if (actualKb < preset.minKb) {
    status = 'too_small_kb';
    summary = `File is ${actualKb} KB (min ${preset.minKb} KB). Increase JPEG quality.`;
  }

  return {
    preset,
    actualWidthPx: w,
    actualHeightPx: h,
    actualKb,
    dimensionsMatch,
    kbInRange,
    status,
    summary,
  };
}

// --- Paper Wastage & Reprint Root-Cause Analytics ---

export type WastageReasonId =
  | 'paper_jam'
  | 'ink_streak'
  | 'wrong_settings'
  | 'toner_faint'
  | 'customer_reprint';

export interface WastageReasonSpec {
  id: WastageReasonId;
  label: string;
  hint: string;
}

export const WASTAGE_REASONS: readonly WastageReasonSpec[] = [
  { id: 'paper_jam', label: 'Paper Jam / Crinkled Feed', hint: 'Tray pick-up roller slipped or double-fed' },
  { id: 'ink_streak', label: 'Ink Streak / Nozzle Banding', hint: 'Colour printhead needed nozzle cleaning' },
  { id: 'wrong_settings', label: 'Wrong Duplex / Scale Setup', hint: 'Orientation, N-Up, or page-range mismatch' },
  { id: 'toner_faint', label: 'Toner Faint / Low Contrast', hint: 'Laser drum/cartridge smudge or light page' },
  { id: 'customer_reprint', label: 'Customer Edit / Replacement', hint: 'Customer spotted typo after initial print' },
] as const;

export function getWastageReasonSpec(id: string | undefined | null): WastageReasonSpec {
  return WASTAGE_REASONS.find((r) => r.id === id) ?? WASTAGE_REASONS[0];
}

export function unitCostPaiseForPaperItem(paperItemId: string): number {
  switch (paperItemId) {
    case 'paper-photo-4x6':
      return 450; // ₹4.50 per glossy 4x6 sheet cost
    case 'paper-legal-80gsm':
      return 120; // ₹1.20 per Legal sheet cost
    case 'paper-a4-75gsm':
    default:
      return 85; // ₹0.85 per A4 sheet cost
  }
}

export function evaluateWastageCostPaise(paperItemId: string, sheetsWasted: number): number {
  const safeSheets = Math.max(0, Math.min(1000, Math.round(Number(sheetsWasted) || 0)));
  return safeSheets * unitCostPaiseForPaperItem(paperItemId);
}

export interface WastageLogEntry {
  id: string;
  stationId: string;
  paperItemId: string;
  sheetsWasted: number;
  reasonCode: WastageReasonId;
  estimatedLossPaise: number;
  jobNumber: string;
  note: string;
  actorUid: string;
  createdAt: string;
}

export interface WastageRootCauseSummary {
  totalSpoiledSheets: number;
  totalEstimatedLossPaise: number;
  totalEstimatedLossInr: number;
  topReasonCode: WastageReasonId | null;
  topReasonLabel: string;
  byReason: Array<{
    reasonCode: WastageReasonId;
    label: string;
    sheets: number;
    lossInr: number;
    sharePct: number;
  }>;
}

export function summarizeWastageLogs(logs: WastageLogEntry[]): WastageRootCauseSummary {
  const bucket = new Map<WastageReasonId, { sheets: number; lossPaise: number }>();
  for (const r of WASTAGE_REASONS) {
    bucket.set(r.id, { sheets: 0, lossPaise: 0 });
  }

  let totalSpoiledSheets = 0;
  let totalEstimatedLossPaise = 0;

  for (const log of logs) {
    const code = getWastageReasonSpec(log.reasonCode).id;
    const prev = bucket.get(code) ?? { sheets: 0, lossPaise: 0 };
    prev.sheets += log.sheetsWasted;
    prev.lossPaise += log.estimatedLossPaise;
    bucket.set(code, prev);
    totalSpoiledSheets += log.sheetsWasted;
    totalEstimatedLossPaise += log.estimatedLossPaise;
  }

  const byReason = WASTAGE_REASONS.map((r) => {
    const stat = bucket.get(r.id) ?? { sheets: 0, lossPaise: 0 };
    return {
      reasonCode: r.id,
      label: r.label,
      sheets: stat.sheets,
      lossInr: Number((stat.lossPaise / 100).toFixed(2)),
      sharePct: totalSpoiledSheets > 0 ? Math.round((stat.sheets / totalSpoiledSheets) * 100) : 0,
    };
  }).sort((a, b) => b.sheets - a.sheets);

  const top = byReason[0];
  return {
    totalSpoiledSheets,
    totalEstimatedLossPaise,
    totalEstimatedLossInr: Number((totalEstimatedLossPaise / 100).toFixed(2)),
    topReasonCode: top && top.sheets > 0 ? top.reasonCode : null,
    topReasonLabel: top && top.sheets > 0 ? top.label : 'No wastage logged',
    byReason,
  };
}

export function buildWastageLogCsv(logs: WastageLogEntry[]): string {
  const headers = [
    'Timestamp',
    'Station',
    'Paper Stock SKU',
    'Spoiled Sheets',
    'Root Cause',
    'Estimated Loss (INR)',
    'Job Reference',
    'Operator Note',
  ];
  const rows = logs.map((l) => [
    l.createdAt,
    l.stationId,
    l.paperItemId,
    String(l.sheetsWasted),
    getWastageReasonSpec(l.reasonCode).label,
    (l.estimatedLossPaise / 100).toFixed(2),
    l.jobNumber || '-',
    l.note || '-',
  ]);
  return [
    headers.map(sanitizeCsvValue).join(','),
    ...rows.map((r) => r.map(sanitizeCsvValue).join(',')),
  ].join('\r\n');
}

// --- Opening & Closing Counter Shift Handoff Checklist ---

export type ShiftType = 'opening' | 'closing';

export interface ShiftChecklistItemState {
  itemKey: string;
  shiftType: ShiftType;
  label: string;
  required: boolean;
  checked: boolean;
  checkedAt: string | null;
}

export const DEFAULT_SHIFT_CHECKLIST_TEMPLATES: ReadonlyArray<{
  itemKey: string;
  shiftType: ShiftType;
  label: string;
  required: boolean;
}> = [
  {
    itemKey: 'open_paper_trays',
    shiftType: 'opening',
    label: 'Refill HP M507dn & Canon LBP226dw A4 trays (min 250 sheets)',
    required: true,
  },
  {
    itemKey: 'open_nozzle_check',
    shiftType: 'opening',
    label: 'Run Epson L8050 1-page colour nozzle check strip',
    required: true,
  },
  {
    itemKey: 'open_thermal_roll',
    shiftType: 'opening',
    label: 'Verify 80mm thermal POS paper roll & Scan2Print QR standee',
    required: true,
  },
  {
    itemKey: 'open_petty_float',
    shiftType: 'opening',
    label: 'Count opening cash drawer change float (coins + ₹10/₹20/₹50)',
    required: true,
  },
  {
    itemKey: 'close_cash_zreport',
    shiftType: 'closing',
    label: 'Complete Phase 18 Cash Drawer Denomination Tally & Z-Report',
    required: true,
  },
  {
    itemKey: 'close_pending_purge',
    shiftType: 'closing',
    label: 'Verify pending customer print queue cleared & expired uploads purged',
    required: true,
  },
  {
    itemKey: 'close_printer_park',
    shiftType: 'closing',
    label: 'Park Epson L8050 head & power down laser heaters safely',
    required: true,
  },
  {
    itemKey: 'close_khata_sync',
    shiftType: 'closing',
    label: 'Verify Walk-In POS Khata bills posted to Regular Client Ledger',
    required: false,
  },
] as const;

export function evaluateShiftReadiness(
  items: ShiftChecklistItemState[],
  shiftType: ShiftType
): {
  totalCount: number;
  checkedCount: number;
  requiredRemaining: number;
  readyForSignoff: boolean;
} {
  const scoped = items.filter((i) => i.shiftType === shiftType);
  const checkedCount = scoped.filter((i) => i.checked).length;
  const requiredRemaining = scoped.filter((i) => i.required && !i.checked).length;
  return {
    totalCount: scoped.length,
    checkedCount,
    requiredRemaining,
    readyForSignoff: scoped.length > 0 && requiredRemaining === 0,
  };
}
