// AC Scan2Print — Phase 19: Walk-In Counter Direct POS, Passport/ID Photo Grid Geometry & Printer Maintenance Engine
// Pure deterministic integer-paise calculations & 300-DPI sheet geometry for single-shop counter operations.

import { computeGstTaxBreakdown, sanitizeCsvValue } from './fleetKioskAndGstEngine.ts';
import {
  calculatePhase18OrderQuote,
  getFinishingServiceSpec,
  type FinishingServiceId,
  type PagesPerSheet,
} from './shopCounterOpsEngine.ts';

export type PhotoSheetPresetId =
  | 'passport_4x6_8'
  | 'passport_a4_24'
  | 'passport_a4_35'
  | 'id_card_a4_duplex';

export interface PhotoSheetPresetSpec {
  id: PhotoSheetPresetId;
  label: string;
  paperSize: 'Photo_4x6' | 'A4';
  sheetWidthMm: number;
  sheetHeightMm: number;
  sheetWidthPx300Dpi: number;
  sheetHeightPx300Dpi: number;
  cols: number;
  rows: number;
  maxSlots: number;
  tileWidthMm: number;
  tileHeightMm: number;
  gapMm: number;
  suggestedPriceInr: number;
  suggestedPricePaise: number;
  inventoryPaperItemId: 'paper-photo-4x6' | 'paper-a4-75gsm';
  mode: 'passport_grid' | 'id_card_pair';
}

export const PHOTO_SHEET_PRESETS: readonly PhotoSheetPresetSpec[] = [
  {
    id: 'passport_4x6_8',
    label: '4×6 Glossy — 8 Passport Photos (35×45 mm)',
    paperSize: 'Photo_4x6',
    sheetWidthMm: 152.4,
    sheetHeightMm: 101.6,
    sheetWidthPx300Dpi: 1800,
    sheetHeightPx300Dpi: 1200,
    cols: 4,
    rows: 2,
    maxSlots: 8,
    tileWidthMm: 35,
    tileHeightMm: 45,
    gapMm: 3,
    suggestedPriceInr: 40,
    suggestedPricePaise: 4000,
    inventoryPaperItemId: 'paper-photo-4x6',
    mode: 'passport_grid',
  },
  {
    id: 'passport_a4_24',
    label: 'A4 Photo Sheet — 24 Passport Photos (35×45 mm)',
    paperSize: 'A4',
    sheetWidthMm: 210,
    sheetHeightMm: 297,
    sheetWidthPx300Dpi: 2480,
    sheetHeightPx300Dpi: 3508,
    cols: 4,
    rows: 6,
    maxSlots: 24,
    tileWidthMm: 35,
    tileHeightMm: 45,
    gapMm: 3.5,
    suggestedPriceInr: 90,
    suggestedPricePaise: 9000,
    inventoryPaperItemId: 'paper-a4-75gsm',
    mode: 'passport_grid',
  },
  {
    id: 'passport_a4_35',
    label: 'A4 Stamp Sheet — 35 Mini Photos (30×35 mm)',
    paperSize: 'A4',
    sheetWidthMm: 210,
    sheetHeightMm: 297,
    sheetWidthPx300Dpi: 2480,
    sheetHeightPx300Dpi: 3508,
    cols: 5,
    rows: 7,
    maxSlots: 35,
    tileWidthMm: 30,
    tileHeightMm: 35,
    gapMm: 4,
    suggestedPriceInr: 100,
    suggestedPricePaise: 10000,
    inventoryPaperItemId: 'paper-a4-75gsm',
    mode: 'passport_grid',
  },
  {
    id: 'id_card_a4_duplex',
    label: 'A4 Front + Back ID Card Layout (Aadhaar / PAN CR80)',
    paperSize: 'A4',
    sheetWidthMm: 210,
    sheetHeightMm: 297,
    sheetWidthPx300Dpi: 2480,
    sheetHeightPx300Dpi: 3508,
    cols: 1,
    rows: 2,
    maxSlots: 2,
    tileWidthMm: 85.6,
    tileHeightMm: 54,
    gapMm: 14,
    suggestedPriceInr: 20,
    suggestedPricePaise: 2000,
    inventoryPaperItemId: 'paper-a4-75gsm',
    mode: 'id_card_pair',
  },
] as const;

export function getPhotoSheetPreset(id: string | undefined | null): PhotoSheetPresetSpec {
  return PHOTO_SHEET_PRESETS.find((p) => p.id === id) ?? PHOTO_SHEET_PRESETS[0];
}

export interface PhotoTileBox {
  slotIndex: number;
  row: number;
  col: number;
  xMm: number;
  yMm: number;
  widthMm: number;
  heightMm: number;
  xPx: number;
  yPx: number;
  widthPx: number;
  heightPx: number;
  role: 'passport' | 'id_front' | 'id_back';
}

export interface PhotoSheetLayoutPlan {
  preset: PhotoSheetPresetSpec;
  sheetCopies: number;
  totalPhotosCount: number;
  tiles: PhotoTileBox[];
  unitPricePaise: number;
  totalPricePaise: number;
  totalPriceInr: number;
}

const PX_PER_MM_300DPI = 300 / 25.4;

export function computePhotoSheetLayout(input: {
  presetId?: PhotoSheetPresetId | string;
  sheetCopies?: number;
  activeSlotCount?: number;
}): PhotoSheetLayoutPlan {
  const preset = getPhotoSheetPreset(input.presetId);
  const sheetCopies = Math.max(1, Math.min(50, Math.round(Number(input.sheetCopies) || 1)));
  const activeCount = Math.max(
    1,
    Math.min(preset.maxSlots, Math.round(Number(input.activeSlotCount) || preset.maxSlots))
  );

  const totalGridW = preset.cols * preset.tileWidthMm + (preset.cols - 1) * preset.gapMm;
  const totalGridH = preset.rows * preset.tileHeightMm + (preset.rows - 1) * preset.gapMm;
  const marginX = Math.max(0, Number(((preset.sheetWidthMm - totalGridW) / 2).toFixed(2)));
  const marginY =
    preset.mode === 'id_card_pair'
      ? 24
      : Math.max(0, Number(((preset.sheetHeightMm - totalGridH) / 2).toFixed(2)));

  const tiles: PhotoTileBox[] = [];
  for (let i = 0; i < activeCount; i++) {
    const row = Math.floor(i / preset.cols);
    const col = i % preset.cols;
    const xMm = Number((marginX + col * (preset.tileWidthMm + preset.gapMm)).toFixed(2));
    const yMm = Number((marginY + row * (preset.tileHeightMm + preset.gapMm)).toFixed(2));
    tiles.push({
      slotIndex: i,
      row,
      col,
      xMm,
      yMm,
      widthMm: preset.tileWidthMm,
      heightMm: preset.tileHeightMm,
      xPx: Math.round(xMm * PX_PER_MM_300DPI),
      yPx: Math.round(yMm * PX_PER_MM_300DPI),
      widthPx: Math.round(preset.tileWidthMm * PX_PER_MM_300DPI),
      heightPx: Math.round(preset.tileHeightMm * PX_PER_MM_300DPI),
      role: preset.mode === 'id_card_pair' ? (i === 0 ? 'id_front' : 'id_back') : 'passport',
    });
  }

  const totalPricePaise = preset.suggestedPricePaise * sheetCopies;
  return {
    preset,
    sheetCopies,
    totalPhotosCount: activeCount * sheetCopies,
    tiles,
    unitPricePaise: preset.suggestedPricePaise,
    totalPricePaise,
    totalPriceInr: Number((totalPricePaise / 100).toFixed(2)),
  };
}

// --- Walk-In Direct Counter POS Engine ---

export type WalkinItemKind = 'document_print' | 'photo_sheet' | 'service_addon';
export type WalkinPaymentMethod = 'cash' | 'upi' | 'khata';

export interface WalkinCartLineInput {
  kind: WalkinItemKind;
  title?: string;
  paperSize?: 'A4' | 'A3' | 'Legal' | 'Photo_4x6';
  printMode?: 'bw' | 'colour';
  printSides?: 'single' | 'duplex';
  selectedPagesCount?: number;
  pagesPerSheet?: PagesPerSheet;
  copies?: number;
  finishingService?: FinishingServiceId;
  photoPresetId?: PhotoSheetPresetId;
  customUnitPriceInr?: number;
}

export interface EvaluatedWalkinLine {
  lineNumber: number;
  kind: WalkinItemKind;
  label: string;
  paperSize: 'A4' | 'A3' | 'Legal' | 'Photo_4x6';
  printMode: 'bw' | 'colour';
  physicalSheets: number;
  impressions: number;
  copies: number;
  finishingService: FinishingServiceId;
  lineTotalPaise: number;
  lineTotalInr: number;
}

export interface WalkinPosQuoteResult {
  lines: EvaluatedWalkinLine[];
  totalPhysicalSheets: number;
  totalImpressions: number;
  bwImpressions: number;
  colourImpressions: number;
  grossTotalPaise: number;
  grossTotalInr: number;
  gstTaxableInr: number;
  cgstInr: number;
  sgstInr: number;
  stockImpact: Array<{ itemId: string; deltaQty: number; reason: string }>;
  printerUsage: Array<{ stationId: string; deltaPages: number }>;
}

function defaultRatePaiseForSpec(
  paperSize: 'A4' | 'A3' | 'Legal' | 'Photo_4x6',
  printMode: 'bw' | 'colour',
  printSides: 'single' | 'duplex'
): { ratePaise: number; pricingUnit: 'per_printed_page' | 'per_physical_sheet' } {
  if (paperSize === 'Photo_4x6') {
    return { ratePaise: 3000, pricingUnit: 'per_physical_sheet' };
  }
  if (paperSize === 'A3') {
    return printMode === 'colour'
      ? { ratePaise: 2500, pricingUnit: 'per_printed_page' }
      : { ratePaise: 600, pricingUnit: 'per_printed_page' };
  }
  if (printMode === 'colour') {
    return printSides === 'duplex'
      ? { ratePaise: 1800, pricingUnit: 'per_physical_sheet' }
      : { ratePaise: 1000, pricingUnit: 'per_printed_page' };
  }
  return printSides === 'duplex'
    ? { ratePaise: 300, pricingUnit: 'per_physical_sheet' }
    : { ratePaise: 200, pricingUnit: 'per_printed_page' };
}

export function evaluateWalkinPosCart(
  rawLines: WalkinCartLineInput[],
  tokenNumber = 'W-POS'
): WalkinPosQuoteResult {
  const safeInput = rawLines.slice(0, 20);
  const lines: EvaluatedWalkinLine[] = [];
  const stockAgg = new Map<string, number>();
  const stationAgg = new Map<string, number>();

  const addStock = (itemId: string, qty: number) => {
    if (qty <= 0) return;
    stockAgg.set(itemId, (stockAgg.get(itemId) ?? 0) + qty);
  };
  const addStation = (stationId: string, pages: number) => {
    if (pages <= 0) return;
    stationAgg.set(stationId, (stationAgg.get(stationId) ?? 0) + pages);
  };

  let totalPhysicalSheets = 0;
  let totalImpressions = 0;
  let bwImpressions = 0;
  let colourImpressions = 0;
  let grossTotalPaise = 0;

  safeInput.forEach((item, idx) => {
    const copies = Math.max(1, Math.min(200, Math.round(Number(item.copies) || 1)));

    if (item.kind === 'photo_sheet') {
      const preset = getPhotoSheetPreset(item.photoPresetId);
      const unitPaise =
        Number.isFinite(Number(item.customUnitPriceInr)) && Number(item.customUnitPriceInr) > 0
          ? Math.round(Number(item.customUnitPriceInr) * 100)
          : preset.suggestedPricePaise;
      const lineTotalPaise = unitPaise * copies;
      const sheets = copies;
      const impressions = copies;
      const finishing = getFinishingServiceSpec(item.finishingService);
      const finishTotalPaise = finishing.ratePaise * copies;
      const combinedPaise = lineTotalPaise + finishTotalPaise;

      lines.push({
        lineNumber: idx + 1,
        kind: 'photo_sheet',
        label: item.title?.trim() || `${preset.label} × ${copies}`,
        paperSize: preset.paperSize,
        printMode: 'colour',
        physicalSheets: sheets,
        impressions,
        copies,
        finishingService: finishing.id,
        lineTotalPaise: combinedPaise,
        lineTotalInr: Number((combinedPaise / 100).toFixed(2)),
      });

      totalPhysicalSheets += sheets;
      totalImpressions += impressions;
      colourImpressions += impressions;
      grossTotalPaise += combinedPaise;

      addStock(preset.inventoryPaperItemId, sheets);
      addStock('ink-epson-l8050', impressions);
      if (finishing.supplyItemId && finishing.supplyUnitsPerCopy > 0) {
        addStock(finishing.supplyItemId, finishing.supplyUnitsPerCopy * copies);
      }
      addStation('station-2-colour-photo', sheets);
      return;
    }

    if (item.kind === 'service_addon') {
      const finishing = getFinishingServiceSpec(item.finishingService || 'thermal_lamination');
      const unitPaise =
        Number.isFinite(Number(item.customUnitPriceInr)) && Number(item.customUnitPriceInr) > 0
          ? Math.round(Number(item.customUnitPriceInr) * 100)
          : Math.max(500, finishing.ratePaise);
      const lineTotalPaise = unitPaise * copies;

      lines.push({
        lineNumber: idx + 1,
        kind: 'service_addon',
        label: item.title?.trim() || `${finishing.label} (Walk-in Service × ${copies})`,
        paperSize: 'A4',
        printMode: 'bw',
        physicalSheets: 0,
        impressions: 0,
        copies,
        finishingService: finishing.id,
        lineTotalPaise,
        lineTotalInr: Number((lineTotalPaise / 100).toFixed(2)),
      });
      grossTotalPaise += lineTotalPaise;
      if (finishing.supplyItemId && finishing.supplyUnitsPerCopy > 0) {
        addStock(finishing.supplyItemId, finishing.supplyUnitsPerCopy * copies);
      }
      return;
    }

    // Standard Walk-In Document Print
    const paperSize: 'A4' | 'A3' | 'Legal' | 'Photo_4x6' =
      item.paperSize === 'A3' || item.paperSize === 'Legal' || item.paperSize === 'Photo_4x6'
        ? item.paperSize
        : 'A4';
    const printMode: 'bw' | 'colour' = item.printMode === 'colour' ? 'colour' : 'bw';
    const printSides: 'single' | 'duplex' = item.printSides === 'duplex' ? 'duplex' : 'single';
    const selectedPagesCount = Math.max(1, Math.min(2000, Math.round(Number(item.selectedPagesCount) || 1)));
    const pagesPerSheet: PagesPerSheet =
      item.pagesPerSheet === 2 || item.pagesPerSheet === 4 ? item.pagesPerSheet : 1;
    const finishing = getFinishingServiceSpec(item.finishingService);

    const defaultRate = defaultRatePaiseForSpec(paperSize, printMode, printSides);
    const ratePaise =
      Number.isFinite(Number(item.customUnitPriceInr)) && Number(item.customUnitPriceInr) > 0
        ? Math.round(Number(item.customUnitPriceInr) * 100)
        : defaultRate.ratePaise;

    const quote = calculatePhase18OrderQuote({
      selectedPagesCount,
      pagesPerSheet,
      printSides,
      copies,
      paperSize,
      printMode,
      ratePaise,
      pricingUnit: defaultRate.pricingUnit,
      finishingService: finishing.id,
    });

    const nupTag = pagesPerSheet > 1 ? ` · ${pagesPerSheet}-in-1` : '';
    const finTag = finishing.id !== 'none' ? ` + ${finishing.label}` : '';
    lines.push({
      lineNumber: idx + 1,
      kind: 'document_print',
      label:
        item.title?.trim() ||
        `${selectedPagesCount}p ${paperSize} ${printMode === 'colour' ? 'Colour' : 'B&W'} ${printSides}${nupTag} × ${copies}${finTag}`,
      paperSize,
      printMode,
      physicalSheets: quote.physicalSheetsTotal,
      impressions: quote.impressionsTotal,
      copies,
      finishingService: finishing.id,
      lineTotalPaise: quote.grossTotalPaise,
      lineTotalInr: quote.grossTotalInr,
    });

    totalPhysicalSheets += quote.physicalSheetsTotal;
    totalImpressions += quote.impressionsTotal;
    if (printMode === 'colour') {
      colourImpressions += quote.impressionsTotal;
      addStock('ink-epson-l8050', quote.impressionsTotal);
      addStation('station-2-colour-photo', quote.physicalSheetsTotal);
    } else {
      bwImpressions += quote.impressionsTotal;
      addStock('toner-hp-m507', quote.impressionsTotal);
      addStation(printSides === 'duplex' ? 'station-1-bw-fast' : 'station-3-kiosk-express', quote.physicalSheetsTotal);
    }

    const paperStockId =
      paperSize === 'Photo_4x6'
        ? 'paper-photo-4x6'
        : paperSize === 'Legal'
          ? 'paper-legal-80gsm'
          : 'paper-a4-75gsm';
    addStock(paperStockId, quote.physicalSheetsTotal);

    if (finishing.supplyItemId && finishing.supplyUnitsPerCopy > 0) {
      addStock(finishing.supplyItemId, finishing.supplyUnitsPerCopy * copies);
    }
    grossTotalPaise += quote.grossTotalPaise;
  });

  const gst = computeGstTaxBreakdown(grossTotalPaise / 100);
  const stockImpact = Array.from(stockAgg.entries()).map(([itemId, deltaQty]) => ({
    itemId,
    deltaQty,
    reason: `Walk-In POS ${tokenNumber}: consumed ${deltaQty}`,
  }));
  const printerUsage = Array.from(stationAgg.entries()).map(([stationId, deltaPages]) => ({
    stationId,
    deltaPages,
  }));

  return {
    lines,
    totalPhysicalSheets,
    totalImpressions,
    bwImpressions,
    colourImpressions,
    grossTotalPaise,
    grossTotalInr: Number((grossTotalPaise / 100).toFixed(2)),
    gstTaxableInr: gst.taxableAmountInr,
    cgstInr: gst.cgstInr,
    sgstInr: gst.sgstInr,
    stockImpact,
    printerUsage,
  };
}

export function formatWalkinThermalSlip(input: {
  tokenNumber: string;
  customerName: string;
  paymentMethod: WalkinPaymentMethod;
  khataAccountName?: string;
  quote: WalkinPosQuoteResult;
  createdAtIso: string;
}): string[] {
  const slipLines: string[] = [
    '========================================',
    '     AMAN COMPUTER — WALK-IN POS       ',
    '      Counter Cash/UPI/Khata Bill       ',
    '========================================',
    `TOKEN         : ${input.tokenNumber}`,
    `CUSTOMER      : ${input.customerName.slice(0, 24)}`,
    `DATE          : ${input.createdAtIso.slice(0, 19).replace('T', ' ')}`,
    '----------------------------------------',
  ];

  for (const line of input.quote.lines) {
    slipLines.push(`${line.lineNumber}. ${line.label.slice(0, 36)}`);
    slipLines.push(`   Sheets: ${String(line.physicalSheets).padEnd(4)}          Rs. ${line.lineTotalInr.toFixed(2)}`);
  }

  slipLines.push('----------------------------------------');
  slipLines.push(`TAXABLE (9989): Rs. ${input.quote.gstTaxableInr.toFixed(2)}`);
  slipLines.push(`CGST (9%)     : Rs. ${input.quote.cgstInr.toFixed(2)}`);
  slipLines.push(`SGST (9%)     : Rs. ${input.quote.sgstInr.toFixed(2)}`);
  slipLines.push(`TOTAL PAID    : Rs. ${input.quote.grossTotalInr.toFixed(2)}`);
  slipLines.push(
    `MODE          : ${
      input.paymentMethod === 'khata'
        ? `KHATA (${input.khataAccountName || 'Regular'})`
        : input.paymentMethod.toUpperCase()
    }`
  );
  slipLines.push('========================================');
  return slipLines;
}

// --- Printer Drum / Fuser / Nozzle Maintenance Counters ---

export type MaintenanceActionType =
  | 'nozzle_check_clean'
  | 'drum_wipe'
  | 'roller_clean'
  | 'jam_cleared'
  | 'consumable_part_replaced';

export interface PrinterMaintenanceCounter {
  stationId: string;
  printerName: string;
  componentName: string;
  lifetimePages: number;
  pagesSinceService: number;
  serviceIntervalPages: number;
  lastServicedAt: string;
  lastServiceNote: string;
}

export interface EvaluatedPrinterMaintenance extends PrinterMaintenanceCounter {
  remainingPages: number;
  wearPct: number;
  healthStatus: 'healthy' | 'service_due' | 'overdue';
}

export const DEFAULT_PRINTER_MAINTENANCE: ReadonlyArray<Omit<PrinterMaintenanceCounter, 'lastServicedAt'>> = [
  {
    stationId: 'station-1-bw-fast',
    printerName: 'HP Laser MFP 300 (Counter 1 · USB001)',
    componentName: 'Imaging Drum & Pickup Rollers',
    lifetimePages: 18420,
    pagesSinceService: 3420,
    serviceIntervalPages: 5000,
    lastServiceNote: 'Pickup roller wiped & fuser sleeve checked',
  },
  {
    stationId: 'station-2-colour-photo',
    printerName: 'HP Smart Tank 580-590 series (Colour/Photo · USB002)',
    componentName: 'Printhead Nozzle & Waste Ink Pad',
    lifetimePages: 4180,
    pagesSinceService: 680,
    serviceIntervalPages: 800,
    lastServiceNote: 'Head nozzle test pattern 100% clean',
  },
  {
    stationId: 'station-3-kiosk-express',
    printerName: 'Canon imageCLASS LBP226dw (Kiosk)',
    componentName: 'Drum Unit & Separation Pad',
    lifetimePages: 9650,
    pagesSinceService: 2150,
    serviceIntervalPages: 4000,
    lastServiceNote: 'Tray-1 separation pad dusted',
  },
  {
    stationId: 'station-4-thermal-pos',
    printerName: 'Epson TM-T82III 80mm POS',
    componentName: 'Thermal Head & Auto-Cutter Blade',
    lifetimePages: 6320,
    pagesSinceService: 820,
    serviceIntervalPages: 3000,
    lastServiceNote: 'Isopropyl printhead swab & roll replaced',
  },
] as const;

export function evaluatePrinterMaintenance(
  row: PrinterMaintenanceCounter
): EvaluatedPrinterMaintenance {
  const interval = Math.max(100, row.serviceIntervalPages);
  const since = Math.max(0, row.pagesSinceService);
  const wearPct = Math.min(100, Math.round((since / interval) * 100));
  const remainingPages = Math.max(0, interval - since);
  const healthStatus: EvaluatedPrinterMaintenance['healthStatus'] =
    since >= interval
      ? 'overdue'
      : since >= Math.floor(interval * 0.8)
        ? 'service_due'
        : 'healthy';

  return {
    ...row,
    remainingPages,
    wearPct,
    healthStatus,
  };
}

export function buildWalkinPosLedgerCsv(
  orders: Array<{
    tokenNumber: string;
    customerName: string;
    paymentMethod: string;
    totalPhysicalSheets: number;
    grossTotalPaise: number;
    createdAt: string;
  }>
): string {
  const headers = [
    'Timestamp',
    'Walk-In Token',
    'Customer Name',
    'Payment Mode',
    'Physical Sheets',
    'Gross Amount (INR)',
  ];
  const rows = orders.map((o) => [
    o.createdAt,
    o.tokenNumber,
    o.customerName,
    o.paymentMethod.toUpperCase(),
    String(o.totalPhysicalSheets),
    (o.grossTotalPaise / 100).toFixed(2),
  ]);
  return [
    headers.map(sanitizeCsvValue).join(','),
    ...rows.map((r) => r.map(sanitizeCsvValue).join(',')),
  ].join('\r\n');
}
