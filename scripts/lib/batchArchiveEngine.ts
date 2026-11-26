// AC Scan2Print — Phase 21: Bulk Coaching Batch Estimator, Saved Shop Job Templates
// & Unified Single-Shop Print History Search Archive (Integer-Paise Deterministic Engine)

import { sanitizeCsvValue } from './fleetKioskAndGstEngine.ts';
import {
  getFinishingServiceSpec,
  type FinishingServiceId,
  type PagesPerSheet,
} from './shopCounterOpsEngine.ts';
import { unitCostPaiseForPaperItem } from './shopFloorToolsEngine.ts';

export type PaperSize = 'A4' | 'A3' | 'Legal';
export type PrintMode = 'bw' | 'colour';
export type PrintSides = 'single' | 'duplex';

export interface BatchDocumentLineInput {
  title: string;
  pageCount: number;
  paperSize: PaperSize;
  printMode: PrintMode;
  printSides: PrintSides;
  pagesPerSheet: PagesPerSheet;
  finishingService: FinishingServiceId;
}

export interface BatchVolumeTierSpec {
  id: 'standard' | 'notes_slab_10' | 'coaching_slab_18' | 'institution_slab_25';
  label: string;
  minSheets: number;
  discountPct: number;
}

export const BATCH_VOLUME_TIERS: readonly BatchVolumeTierSpec[] = [
  { id: 'standard', label: 'Standard Rate (< 100 sheets)', minSheets: 0, discountPct: 0 },
  { id: 'notes_slab_10', label: 'Student Notes Slab (100+ sheets · 10% off)', minSheets: 100, discountPct: 10 },
  { id: 'coaching_slab_18', label: 'Coaching Batch Slab (300+ sheets · 18% off)', minSheets: 300, discountPct: 18 },
  { id: 'institution_slab_25', label: 'Institutional Bulk Slab (1000+ sheets · 25% off)', minSheets: 1000, discountPct: 25 },
] as const;

export function resolveBatchVolumeTier(totalPhysicalSheets: number): BatchVolumeTierSpec {
  const sheets = Math.max(0, Math.round(Number(totalPhysicalSheets) || 0));
  let matched: BatchVolumeTierSpec = BATCH_VOLUME_TIERS[0];
  for (const tier of BATCH_VOLUME_TIERS) {
    if (sheets >= tier.minSheets) matched = tier;
  }
  return matched;
}

function unitPrintRatePaise(paperSize: PaperSize, printMode: PrintMode, printSides: PrintSides): number {
  if (printMode === 'colour') {
    if (paperSize === 'A3') return printSides === 'duplex' ? 3600 : 2000;
    if (paperSize === 'Legal') return printSides === 'duplex' ? 2200 : 1200;
    return printSides === 'duplex' ? 1800 : 1000;
  }
  if (paperSize === 'A3') return printSides === 'duplex' ? 900 : 500;
  if (paperSize === 'Legal') return printSides === 'duplex' ? 400 : 250;
  return printSides === 'duplex' ? 300 : 200;
}

function paperSkuForSize(paperSize: PaperSize): string {
  return paperSize === 'Legal' ? 'paper-legal-80gsm' : 'paper-a4-75gsm';
}

export interface EvaluatedBatchLine {
  title: string;
  pageCount: number;
  paperSize: PaperSize;
  printMode: PrintMode;
  printSides: PrintSides;
  pagesPerSheet: PagesPerSheet;
  finishingService: FinishingServiceId;
  finishingLabel: string;
  impressionsPerSet: number;
  physicalSheetsPerSet: number;
  totalPhysicalSheets: number;
  basePrintPaise: number;
  finishingPaise: number;
}

export interface BulkBatchQuoteResult {
  batchRef: string;
  studentSets: number;
  lines: EvaluatedBatchLine[];
  totalPhysicalSheets: number;
  bwImpressions: number;
  colourImpressions: number;
  volumeTier: BatchVolumeTierSpec;
  rawPrintSubtotalPaise: number;
  discountPaise: number;
  discountedPrintPaise: number;
  finishingTotalPaise: number;
  grossTotalPaise: number;
  grossTotalInr: number;
  gstTaxableInr: number;
  cgstInr: number;
  sgstInr: number;
  estimatedPaperCostPaise: number;
  stockImpact: Array<{ itemId: string; deltaQty: number; reason: string }>;
  printerUsage: Array<{ stationId: string; deltaPages: number }>;
  jobCardLines: string[];
}

export function evaluateBulkBatchQuote(input: {
  batchTitle?: string;
  batchRef?: string;
  studentSets: number;
  items: BatchDocumentLineInput[];
}): BulkBatchQuoteResult {
  const safeSets = Math.max(1, Math.min(500, Math.round(Number(input.studentSets) || 1)));
  const rawItems = Array.isArray(input.items) ? input.items.slice(0, 15) : [];

  const stockMap = new Map<string, { deltaQty: number; reasons: Set<string> }>();
  const addStock = (itemId: string, qty: number, reason: string) => {
    if (qty <= 0) return;
    const prev = stockMap.get(itemId) ?? { deltaQty: 0, reasons: new Set<string>() };
    prev.deltaQty += qty;
    prev.reasons.add(reason);
    stockMap.set(itemId, prev);
  };

  let bwImpressions = 0;
  let colourImpressions = 0;
  let totalPhysicalSheets = 0;
  let rawPrintSubtotalPaise = 0;
  let finishingTotalPaise = 0;
  let estimatedPaperCostPaise = 0;
  const evaluatedLines: EvaluatedBatchLine[] = [];

  for (const item of rawItems) {
    const pageCount = Math.max(1, Math.min(2000, Math.round(Number(item.pageCount) || 1)));
    const paperSize: PaperSize =
      item.paperSize === 'A3' || item.paperSize === 'Legal' ? item.paperSize : 'A4';
    const printMode: PrintMode = item.printMode === 'colour' ? 'colour' : 'bw';
    const printSides: PrintSides = item.printSides === 'duplex' ? 'duplex' : 'single';
    const pagesPerSheet: PagesPerSheet =
      item.pagesPerSheet === 2 || item.pagesPerSheet === 4 ? item.pagesPerSheet : 1;
    const finishingSpec = getFinishingServiceSpec(item.finishingService);

    const impressionsPerSet = Math.ceil(pageCount / pagesPerSheet);
    const physicalSheetsPerSet =
      printSides === 'duplex' ? Math.ceil(impressionsPerSet / 2) : impressionsPerSet;
    const linePhysicalSheets = physicalSheetsPerSet * safeSets;
    const lineImpressions = impressionsPerSet * safeSets;

    const unitPaise = unitPrintRatePaise(paperSize, printMode, printSides);
    const linePrintUnits = printSides === 'duplex' ? linePhysicalSheets : lineImpressions;
    const basePrintPaise = linePrintUnits * unitPaise;
    const lineFinishingPaise = finishingSpec.ratePaise * safeSets;

    totalPhysicalSheets += linePhysicalSheets;
    rawPrintSubtotalPaise += basePrintPaise;
    finishingTotalPaise += lineFinishingPaise;

    if (printMode === 'colour') colourImpressions += lineImpressions;
    else bwImpressions += lineImpressions;

    const sheetMultiplier = paperSize === 'A3' ? 2 : 1;
    const sku = paperSkuForSize(paperSize);
    estimatedPaperCostPaise +=
      linePhysicalSheets * sheetMultiplier * unitCostPaiseForPaperItem(sku);
    addStock(sku, linePhysicalSheets * sheetMultiplier, `Batch ${paperSize}`);
    addStock(
      printMode === 'colour' ? 'ink-colour-tank-set' : 'toner-bw-laser',
      lineImpressions,
      `Batch ${printMode.toUpperCase()} impressions`
    );

    if (finishingSpec.id === 'spiral_binding' || finishingSpec.id === 'heavy_cover_bind') {
      addStock('supply-spiral-coil', safeSets, `Batch ${finishingSpec.label}`);
    } else if (finishingSpec.id === 'thermal_lamination') {
      addStock('supply-lamination-pouch', safeSets, 'Batch lamination');
    } else if (finishingSpec.id === 'staple_corner') {
      addStock('supply-staple-pins', safeSets, 'Batch stapling');
    }

    evaluatedLines.push({
      title: (item.title || 'Notes Document').trim().slice(0, 80),
      pageCount,
      paperSize,
      printMode,
      printSides,
      pagesPerSheet,
      finishingService: finishingSpec.id,
      finishingLabel: finishingSpec.label,
      impressionsPerSet,
      physicalSheetsPerSet,
      totalPhysicalSheets: linePhysicalSheets,
      basePrintPaise,
      finishingPaise: lineFinishingPaise,
    });
  }

  const volumeTier = resolveBatchVolumeTier(totalPhysicalSheets);
  const discountPaise = Math.round((rawPrintSubtotalPaise * volumeTier.discountPct) / 100);
  const discountedPrintPaise = Math.max(0, rawPrintSubtotalPaise - discountPaise);
  const grossTotalPaise = discountedPrintPaise + finishingTotalPaise;

  const gstTaxablePaise = Math.round((grossTotalPaise * 100) / 118);
  const totalGstPaise = grossTotalPaise - gstTaxablePaise;
  const cgstPaise = Math.floor(totalGstPaise / 2);
  const sgstPaise = totalGstPaise - cgstPaise;

  const printerUsage: Array<{ stationId: string; deltaPages: number }> = [];
  if (bwImpressions > 0) {
    printerUsage.push({ stationId: 'station-1-bw-fast', deltaPages: bwImpressions });
  }
  if (colourImpressions > 0) {
    printerUsage.push({ stationId: 'station-2-colour-photo', deltaPages: colourImpressions });
  }

  const batchRef = (input.batchRef || 'B-PREVIEW').trim();
  const jobCardLines = [
    '========================================',
    '  AMAN COMPUTER — BULK BATCH JOB CARD   ',
    '========================================',
    `BATCH REF     : ${batchRef}`,
    `TITLE         : ${(input.batchTitle || 'Student Notes Batch').slice(0, 26)}`,
    `STUDENT SETS  : ${safeSets} complete set(s)`,
    `TOTAL SHEETS  : ${totalPhysicalSheets} physical sheets`,
    `SLAB APPLIED  : ${volumeTier.discountPct}% (${volumeTier.id})`,
    '----------------------------------------',
    ...evaluatedLines.map(
      (l, i) =>
        `${i + 1}. ${l.title.slice(0, 24)} | ${l.pageCount}p ${l.printSides} ${l.pagesPerSheet}up | ${l.finishingLabel}`
    ),
    '----------------------------------------',
    `PRINT GROSS   : Rs. ${(rawPrintSubtotalPaise / 100).toFixed(2)}`,
    `SLAB DISCOUNT : -Rs. ${(discountPaise / 100).toFixed(2)}`,
    `BINDING/FIN.  : Rs. ${(finishingTotalPaise / 100).toFixed(2)}`,
    `BATCH TOTAL   : Rs. ${(grossTotalPaise / 100).toFixed(2)}`,
    '========================================',
  ];

  return {
    batchRef,
    studentSets: safeSets,
    lines: evaluatedLines,
    totalPhysicalSheets,
    bwImpressions,
    colourImpressions,
    volumeTier,
    rawPrintSubtotalPaise,
    discountPaise,
    discountedPrintPaise,
    finishingTotalPaise,
    grossTotalPaise,
    grossTotalInr: Number((grossTotalPaise / 100).toFixed(2)),
    gstTaxableInr: Number((gstTaxablePaise / 100).toFixed(2)),
    cgstInr: Number((cgstPaise / 100).toFixed(2)),
    sgstInr: Number((sgstPaise / 100).toFixed(2)),
    estimatedPaperCostPaise,
    stockImpact: Array.from(stockMap.entries()).map(([itemId, info]) => ({
      itemId,
      deltaQty: info.deltaQty,
      reason: Array.from(info.reasons).join('; '),
    })),
    printerUsage,
    jobCardLines,
  };
}

// --- Pre-Seeded Shop Job Templates ---

export interface ShopJobTemplateRecord {
  id: string;
  templateName: string;
  category: 'exam_packet' | 'coaching_notes' | 'office_combo' | 'custom';
  description: string;
  defaultSets: number;
  items: BatchDocumentLineInput[];
  isSystem: boolean;
  createdAt: string;
}

export const DEFAULT_SHOP_JOB_TEMPLATES: readonly Omit<ShopJobTemplateRecord, 'createdAt'>[] = [
  {
    id: 'tpl-coaching-notes-2up',
    templateName: 'Coaching Handwritten Notes (2-in-1 Spiral)',
    category: 'coaching_notes',
    description: 'B&W A4 duplex 2-in-1 layout with spiral binding — saves 75% paper cost on bulk booklets.',
    defaultSets: 20,
    isSystem: true,
    items: [
      {
        title: 'Main Chapter Booklet',
        pageCount: 80,
        paperSize: 'A4',
        printMode: 'bw',
        printSides: 'duplex',
        pagesPerSheet: 2,
        finishingService: 'spiral_binding',
      },
      {
        title: 'MCQ Practice Sheet',
        pageCount: 16,
        paperSize: 'A4',
        printMode: 'bw',
        printSides: 'duplex',
        pagesPerSheet: 2,
        finishingService: 'staple_corner',
      },
    ],
  },
  {
    id: 'tpl-aadhaar-pan-combo',
    templateName: 'Aadhaar + PAN + Voter ID Lamination Combo',
    category: 'exam_packet',
    description: 'Colour A4 single print + waterproof thermal lamination pouch for walk-in KYC counters.',
    defaultSets: 1,
    isSystem: true,
    items: [
      {
        title: 'ID Card Front & Back Colour Sheet',
        pageCount: 1,
        paperSize: 'A4',
        printMode: 'colour',
        printSides: 'single',
        pagesPerSheet: 1,
        finishingService: 'thermal_lamination',
      },
    ],
  },
  {
    id: 'tpl-exam-admit-packet',
    templateName: 'Govt Exam Admit Card + Undertaking Set',
    category: 'exam_packet',
    description: 'Crisp B&W admit card + declaration + corner staple ready for exam hall entry.',
    defaultSets: 2,
    isSystem: true,
    items: [
      {
        title: 'Admit Card & Guidelines',
        pageCount: 4,
        paperSize: 'A4',
        printMode: 'bw',
        printSides: 'single',
        pagesPerSheet: 1,
        finishingService: 'staple_corner',
      },
    ],
  },
  {
    id: 'tpl-project-report-bind',
    templateName: 'College Project / Practical Cover Bind',
    category: 'office_combo',
    description: 'Mixed colour cover pages + duplex body with heavy spine cover binding.',
    defaultSets: 3,
    isSystem: true,
    items: [
      {
        title: 'Colour Title & Certificate Pages',
        pageCount: 4,
        paperSize: 'A4',
        printMode: 'colour',
        printSides: 'single',
        pagesPerSheet: 1,
        finishingService: 'none',
      },
      {
        title: 'Project Report Body Chapters',
        pageCount: 44,
        paperSize: 'A4',
        printMode: 'bw',
        printSides: 'duplex',
        pagesPerSheet: 1,
        finishingService: 'heavy_cover_bind',
      },
    ],
  },
] as const;

// --- Unified Single-Shop Print History Search & CSV Export ---

export type ArchiveSourceType = 'walkin' | 'batch' | 'wastage';

export interface UnifiedPrintArchiveEntry {
  id: string;
  sourceType: ArchiveSourceType;
  refCode: string;
  titleOrCustomer: string;
  paymentMethod: string;
  physicalSheets: number;
  amountPaise: number;
  summaryNote: string;
  createdAt: string;
}

export function filterPrintArchiveEntries(
  entries: UnifiedPrintArchiveEntry[],
  filters: {
    q?: string;
    sourceType?: 'all' | ArchiveSourceType;
    paymentMethod?: 'all' | 'cash' | 'upi' | 'khata' | 'internal';
    dateFrom?: string;
    dateTo?: string;
  }
): UnifiedPrintArchiveEntry[] {
  const needle = (filters.q || '').trim().toLowerCase();
  const srcFilter = filters.sourceType && filters.sourceType !== 'all' ? filters.sourceType : null;
  const payFilter =
    filters.paymentMethod && filters.paymentMethod !== 'all' ? filters.paymentMethod : null;
  const fromDate = (filters.dateFrom || '').trim();
  const toDate = (filters.dateTo || '').trim();

  return entries.filter((entry) => {
    if (srcFilter && entry.sourceType !== srcFilter) return false;
    if (payFilter && entry.paymentMethod !== payFilter) return false;
    const entryDate = entry.createdAt.slice(0, 10);
    if (fromDate && entryDate < fromDate) return false;
    if (toDate && entryDate > toDate) return false;
    if (needle) {
      const hay = `${entry.refCode} ${entry.titleOrCustomer} ${entry.summaryNote} ${entry.paymentMethod}`.toLowerCase();
      if (!hay.includes(needle)) return false;
    }
    return true;
  });
}

export function buildUnifiedArchiveCsv(entries: UnifiedPrintArchiveEntry[]): string {
  const headers = [
    'Timestamp',
    'Record Type',
    'Reference / Token',
    'Customer / Batch Title',
    'Payment / Mode',
    'Physical Sheets',
    'Amount (INR)',
    'Details',
  ];
  const rows = entries.map((e) => [
    e.createdAt,
    e.sourceType.toUpperCase(),
    e.refCode,
    e.titleOrCustomer,
    e.paymentMethod.toUpperCase(),
    String(e.physicalSheets),
    (e.amountPaise / 100).toFixed(2),
    e.summaryNote,
  ]);
  return [
    headers.map(sanitizeCsvValue).join(','),
    ...rows.map((r) => r.map(sanitizeCsvValue).join(',')),
  ].join('\r\n');
}
