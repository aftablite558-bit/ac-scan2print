// AC Scan2Print — Phase 18: Finishing Add-Ons, N-Up Layout, Paper/Toner Stock & Shift Cash/Khata Engine
// Pure deterministic business logic in integer paise (₹1.00 = 100 paise) with OWASP CSV formula sanitization.

import { computeGstTaxBreakdown, sanitizeCsvValue } from './fleetKioskAndGstEngine.ts';

export type PagesPerSheet = 1 | 2 | 4;

export type FinishingServiceId =
  | 'none'
  | 'staple_corner'
  | 'spiral_binding'
  | 'thermal_lamination'
  | 'heavy_cover_bind';

export interface FinishingServiceSpec {
  id: FinishingServiceId;
  label: string;
  shortDesc: string;
  rateInr: number;
  ratePaise: number;
  supplyItemId: string | null;
  supplyUnitsPerCopy: number;
}

export const FINISHING_SERVICE_CATALOG: readonly FinishingServiceSpec[] = [
  {
    id: 'none',
    label: 'Standard Print Only',
    shortDesc: 'Loose printed sheets sorted cleanly',
    rateInr: 0,
    ratePaise: 0,
    supplyItemId: null,
    supplyUnitsPerCopy: 0,
  },
  {
    id: 'staple_corner',
    label: 'Corner / Set Stapling',
    shortDesc: 'Heavy-duty corner or booklet staple per copy',
    rateInr: 5,
    ratePaise: 500,
    supplyItemId: null,
    supplyUnitsPerCopy: 0,
  },
  {
    id: 'spiral_binding',
    label: 'Spiral Binding + Covers',
    shortDesc: 'Clear PVC front, textured back & spiral coil',
    rateInr: 30,
    ratePaise: 3000,
    supplyItemId: 'supply-spiral-coil',
    supplyUnitsPerCopy: 1,
  },
  {
    id: 'thermal_lamination',
    label: 'A4 Thermal Lamination',
    shortDesc: 'Waterproof 125-micron hot pouch seal',
    rateInr: 20,
    ratePaise: 2000,
    supplyItemId: 'supply-lam-pouch',
    supplyUnitsPerCopy: 1,
  },
  {
    id: 'heavy_cover_bind',
    label: 'Project Cover & Tape Bind',
    shortDesc: 'Cardstock cover sheet with spine tape bind',
    rateInr: 45,
    ratePaise: 4500,
    supplyItemId: 'supply-heavy-cover',
    supplyUnitsPerCopy: 1,
  },
] as const;

export const NUP_LAYOUT_OPTIONS: ReadonlyArray<{
  pagesPerSheet: PagesPerSheet;
  label: string;
  description: string;
}> = [
  { pagesPerSheet: 1, label: '1-in-1 Normal', description: 'Full-size 1 page per side' },
  { pagesPerSheet: 2, label: '2-in-1 Half Notes', description: 'Saves up to 50% paper' },
  { pagesPerSheet: 4, label: '4-in-1 Compact', description: 'Saves up to 75% paper' },
] as const;

export function getFinishingServiceSpec(id: string | undefined | null): FinishingServiceSpec {
  const found = FINISHING_SERVICE_CATALOG.find((item) => item.id === id);
  return found ?? FINISHING_SERVICE_CATALOG[0];
}

export interface Phase18OrderQuoteInput {
  selectedPagesCount: number;
  pagesPerSheet?: PagesPerSheet;
  printSides: 'single' | 'duplex';
  copies: number;
  paperSize: string;
  printMode: 'bw' | 'colour';
  ratePaise: number;
  pricingUnit: 'per_printed_page' | 'per_physical_sheet';
  minimumChargePaise?: number;
  finishingService?: FinishingServiceId;
}

export interface Phase18OrderQuoteResult {
  selectedPagesCount: number;
  pagesPerSheet: PagesPerSheet;
  impressionsPerCopy: number;
  impressionsTotal: number;
  physicalSheetsPerCopy: number;
  physicalSheetsTotal: number;
  sheetsSavedByNup: number;
  printChargePaise: number;
  finishingService: FinishingServiceSpec;
  finishingChargePaise: number;
  grossTotalPaise: number;
  printChargeInr: number;
  finishingChargeInr: number;
  grossTotalInr: number;
  gstTaxableInr: number;
  cgstInr: number;
  sgstInr: number;
}

export function calculatePhase18OrderQuote(
  input: Phase18OrderQuoteInput
): Phase18OrderQuoteResult {
  const safePages = Math.max(1, Math.min(2000, Math.round(input.selectedPagesCount)));
  const safeCopies = Math.max(1, Math.min(200, Math.round(input.copies)));
  const pagesPerSheet: PagesPerSheet =
    input.pagesPerSheet === 2 || input.pagesPerSheet === 4 ? input.pagesPerSheet : 1;
  const safeRatePaise = Math.max(0, Math.round(input.ratePaise));
  const safeMinPaise = Math.max(0, Math.round(input.minimumChargePaise ?? 0));

  // Step 1: N-Up packing collapses logical pages into fewer printed sides (impressions)
  const impressionsPerCopy = Math.ceil(safePages / pagesPerSheet);
  const impressionsTotal = impressionsPerCopy * safeCopies;

  // Step 2: Duplex halves physical paper sheets per copy
  const physicalSheetsPerCopy =
    input.printSides === 'duplex' ? Math.ceil(impressionsPerCopy / 2) : impressionsPerCopy;
  const physicalSheetsTotal = physicalSheetsPerCopy * safeCopies;

  const baselineSheetsPerCopy =
    input.printSides === 'duplex' ? Math.ceil(safePages / 2) : safePages;
  const sheetsSavedByNup = Math.max(
    0,
    (baselineSheetsPerCopy - physicalSheetsPerCopy) * safeCopies
  );

  // Step 3: Integer paise billing
  const billableUnits =
    input.pricingUnit === 'per_physical_sheet' ? physicalSheetsTotal : impressionsTotal;
  const rawPrintPaise = billableUnits * safeRatePaise;
  const printChargePaise = safeMinPaise > 0 ? Math.max(rawPrintPaise, safeMinPaise) : rawPrintPaise;

  const finishingSpec = getFinishingServiceSpec(input.finishingService);
  const finishingChargePaise = finishingSpec.ratePaise * safeCopies;
  const grossTotalPaise = printChargePaise + finishingChargePaise;

  const gst = computeGstTaxBreakdown(grossTotalPaise / 100);

  return {
    selectedPagesCount: safePages,
    pagesPerSheet,
    impressionsPerCopy,
    impressionsTotal,
    physicalSheetsPerCopy,
    physicalSheetsTotal,
    sheetsSavedByNup,
    printChargePaise,
    finishingService: finishingSpec,
    finishingChargePaise,
    grossTotalPaise,
    printChargeInr: Number((printChargePaise / 100).toFixed(2)),
    finishingChargeInr: Number((finishingChargePaise / 100).toFixed(2)),
    grossTotalInr: Number((grossTotalPaise / 100).toFixed(2)),
    gstTaxableInr: gst.taxableAmountInr,
    cgstInr: gst.cgstInr,
    sgstInr: gst.sgstInr,
  };
}

// --- Inventory & Consumables Stock Logic ---

export type InventoryCategory = 'paper' | 'toner_ink' | 'finishing_supply';

export interface ShopInventoryItem {
  id: string;
  itemName: string;
  category: InventoryCategory;
  unitLabel: string;
  packSize: number;
  currentQty: number;
  minThreshold: number;
  unitCostPaise: number;
  updatedAt: string;
}

export interface EvaluatedInventoryItem extends ShopInventoryItem {
  wholePacksRemaining: number;
  alertLevel: 'healthy' | 'low_stock' | 'critical_low';
  stockValueInr: number;
}

export const DEFAULT_SHOP_INVENTORY: ReadonlyArray<Omit<ShopInventoryItem, 'updatedAt'>> = [
  {
    id: 'paper-a4-75gsm',
    itemName: 'JK Copier A4 Paper (75 GSM)',
    category: 'paper',
    unitLabel: 'sheets',
    packSize: 500,
    currentQty: 2500,
    minThreshold: 500,
    unitCostPaise: 45,
  },
  {
    id: 'paper-legal-80gsm',
    itemName: 'Legal Size Paper (80 GSM)',
    category: 'paper',
    unitLabel: 'sheets',
    packSize: 500,
    currentQty: 500,
    minThreshold: 150,
    unitCostPaise: 65,
  },
  {
    id: 'paper-photo-4x6',
    itemName: 'Glossy 4x6 Photo Paper (230 GSM)',
    category: 'paper',
    unitLabel: 'sheets',
    packSize: 100,
    currentQty: 180,
    minThreshold: 50,
    unitCostPaise: 350,
  },
  {
    id: 'toner-hp-m507',
    itemName: 'HP 89A Black Laser Toner Yield',
    category: 'toner_ink',
    unitLabel: 'impressions',
    packSize: 5000,
    currentQty: 4200,
    minThreshold: 600,
    unitCostPaise: 35,
  },
  {
    id: 'ink-epson-l8050',
    itemName: 'Epson 057 Colour Ink Tank Yield',
    category: 'toner_ink',
    unitLabel: 'impressions',
    packSize: 3600,
    currentQty: 1450,
    minThreshold: 300,
    unitCostPaise: 120,
  },
  {
    id: 'supply-spiral-coil',
    itemName: 'Plastic Spiral Binding Coils (12mm)',
    category: 'finishing_supply',
    unitLabel: 'coils',
    packSize: 50,
    currentQty: 45,
    minThreshold: 12,
    unitCostPaise: 700,
  },
  {
    id: 'supply-lam-pouch',
    itemName: 'A4 Thermal Lamination Pouches (125m)',
    category: 'finishing_supply',
    unitLabel: 'pouches',
    packSize: 100,
    currentQty: 38,
    minThreshold: 15,
    unitCostPaise: 500,
  },
  {
    id: 'supply-heavy-cover',
    itemName: 'Heavy Cardstock Covers & Spine Tape',
    category: 'finishing_supply',
    unitLabel: 'sets',
    packSize: 50,
    currentQty: 32,
    minThreshold: 10,
    unitCostPaise: 1100,
  },
] as const;

export function evaluateInventoryItem(item: ShopInventoryItem): EvaluatedInventoryItem {
  const safeQty = Math.max(0, item.currentQty);
  const alertLevel: EvaluatedInventoryItem['alertLevel'] =
    safeQty <= Math.floor(item.minThreshold * 0.5)
      ? 'critical_low'
      : safeQty <= item.minThreshold
        ? 'low_stock'
        : 'healthy';

  return {
    ...item,
    wholePacksRemaining: item.packSize > 0 ? Number((safeQty / item.packSize).toFixed(1)) : safeQty,
    alertLevel,
    stockValueInr: Number(((safeQty * item.unitCostPaise) / 100).toFixed(2)),
  };
}

export interface StockDeductionLine {
  itemId: string;
  deltaQty: number;
  reason: string;
}

export function computeStockDeductionPlan(input: {
  jobNumber: string;
  paperSize: string;
  printMode: 'bw' | 'colour';
  physicalSheetsTotal: number;
  impressionsTotal: number;
  copies: number;
  finishingService?: FinishingServiceId;
}): StockDeductionLine[] {
  const plan: StockDeductionLine[] = [];
  const safeSheets = Math.max(1, Math.round(input.physicalSheetsTotal));
  const safeImpressions = Math.max(1, Math.round(input.impressionsTotal));
  const safeCopies = Math.max(1, Math.round(input.copies));

  const paperItemId =
    input.paperSize === 'Photo_4x6' || input.paperSize === 'Photo_5x7'
      ? 'paper-photo-4x6'
      : input.paperSize === 'Legal'
        ? 'paper-legal-80gsm'
        : 'paper-a4-75gsm';

  plan.push({
    itemId: paperItemId,
    deltaQty: safeSheets,
    reason: `Print job ${input.jobNumber}: ${safeSheets} physical ${input.paperSize} sheets`,
  });

  const tonerItemId = input.printMode === 'colour' ? 'ink-epson-l8050' : 'toner-hp-m507';
  plan.push({
    itemId: tonerItemId,
    deltaQty: safeImpressions,
    reason: `Print job ${input.jobNumber}: ${safeImpressions} ${input.printMode.toUpperCase()} impressions`,
  });

  const finishing = getFinishingServiceSpec(input.finishingService);
  if (finishing.supplyItemId && finishing.supplyUnitsPerCopy > 0) {
    const qty = finishing.supplyUnitsPerCopy * safeCopies;
    plan.push({
      itemId: finishing.supplyItemId,
      deltaQty: qty,
      reason: `Print job ${input.jobNumber}: ${finishing.label} x${safeCopies}`,
    });
  }

  return plan;
}

// --- Shift Cash Drawer Denomination Tally ---

export interface CashDenominationsInput {
  n500: number;
  n200: number;
  n100: number;
  n50: number;
  n20: number;
  n10: number;
  coinsInr: number;
}

export interface CashDrawerTallyInput {
  shiftLabel: string;
  operatorName: string;
  openingFloatInr: number;
  cashSalesInr: number;
  upiSalesInr: number;
  counterExpensesInr: number;
  denominations: CashDenominationsInput;
  notes?: string;
  timestampIso?: string;
}

export interface CashDrawerTallyResult {
  shiftLabel: string;
  operatorName: string;
  timestampIso: string;
  openingFloatInr: number;
  cashSalesInr: number;
  upiSalesInr: number;
  counterExpensesInr: number;
  expectedDrawerCashInr: number;
  countedCashInr: number;
  varianceInr: number;
  status: 'balanced' | 'excess' | 'shortage';
  denominations: CashDenominationsInput;
  zReportLines: string[];
}

function clampCount(val: unknown): number {
  const n = Number(val);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(10000, Math.round(n));
}

export function computeCashDrawerTally(input: CashDrawerTallyInput): CashDrawerTallyResult {
  const denoms: CashDenominationsInput = {
    n500: clampCount(input.denominations.n500),
    n200: clampCount(input.denominations.n200),
    n100: clampCount(input.denominations.n100),
    n50: clampCount(input.denominations.n50),
    n20: clampCount(input.denominations.n20),
    n10: clampCount(input.denominations.n10),
    coinsInr: Math.max(0, Math.min(50000, Number((Number(input.denominations.coinsInr) || 0).toFixed(2)))),
  };

  const countedNotesPaise =
    denoms.n500 * 50000 +
    denoms.n200 * 20000 +
    denoms.n100 * 10000 +
    denoms.n50 * 5000 +
    denoms.n20 * 2000 +
    denoms.n10 * 1000;
  const countedCoinsPaise = Math.round(denoms.coinsInr * 100);
  const countedCashPaise = countedNotesPaise + countedCoinsPaise;

  const openingPaise = Math.max(0, Math.round((Number(input.openingFloatInr) || 0) * 100));
  const cashSalesPaise = Math.max(0, Math.round((Number(input.cashSalesInr) || 0) * 100));
  const upiSalesPaise = Math.max(0, Math.round((Number(input.upiSalesInr) || 0) * 100));
  const expensesPaise = Math.max(0, Math.round((Number(input.counterExpensesInr) || 0) * 100));

  const expectedPaise = openingPaise + cashSalesPaise - expensesPaise;
  const variancePaise = countedCashPaise - expectedPaise;

  const status: CashDrawerTallyResult['status'] =
    variancePaise === 0 ? 'balanced' : variancePaise > 0 ? 'excess' : 'shortage';

  const timestampIso = input.timestampIso || new Date().toISOString();
  const shiftLabel = (input.shiftLabel || 'Evening Shift Close').trim().slice(0, 60);
  const operatorName = (input.operatorName || 'Aman Kumar').trim().slice(0, 60);

  const countedCashInr = Number((countedCashPaise / 100).toFixed(2));
  const expectedDrawerCashInr = Number((expectedPaise / 100).toFixed(2));
  const varianceInr = Number((variancePaise / 100).toFixed(2));
  const openingFloatInr = Number((openingPaise / 100).toFixed(2));
  const cashSalesInr = Number((cashSalesPaise / 100).toFixed(2));
  const upiSalesInr = Number((upiSalesPaise / 100).toFixed(2));
  const counterExpensesInr = Number((expensesPaise / 100).toFixed(2));

  const zReportLines: string[] = [
    '========================================',
    '     AMAN COMPUTER — SHIFT Z-REPORT     ',
    '        Counter Cash Drawer Tally       ',
    '========================================',
    `SHIFT      : ${shiftLabel}`,
    `OPERATOR   : ${operatorName}`,
    `CLOSED AT  : ${timestampIso.slice(0, 19).replace('T', ' ')}`,
    '----------------------------------------',
    `OPEN FLOAT : Rs. ${openingFloatInr.toFixed(2)}`,
    `CASH SALES : Rs. ${cashSalesInr.toFixed(2)}`,
    `PAID OUT   : Rs. ${counterExpensesInr.toFixed(2)}`,
    `EXP DRAWER : Rs. ${expectedDrawerCashInr.toFixed(2)}`,
    '----------------------------------------',
    `500 x ${String(denoms.n500).padEnd(3)}  | 200 x ${String(denoms.n200).padEnd(3)} | 100 x ${denoms.n100}`,
    `50  x ${String(denoms.n50).padEnd(3)}  | 20  x ${String(denoms.n20).padEnd(3)} | 10  x ${denoms.n10}`,
    `COINS TOTAL: Rs. ${denoms.coinsInr.toFixed(2)}`,
    '----------------------------------------',
    `COUNTED    : Rs. ${countedCashInr.toFixed(2)}`,
    `VARIANCE   : Rs. ${varianceInr >= 0 ? '+' : ''}${varianceInr.toFixed(2)} (${status.toUpperCase()})`,
    `UPI SETTLED: Rs. ${upiSalesInr.toFixed(2)}`,
    '========================================',
  ];

  return {
    shiftLabel,
    operatorName,
    timestampIso,
    openingFloatInr,
    cashSalesInr,
    upiSalesInr,
    counterExpensesInr,
    expectedDrawerCashInr,
    countedCashInr,
    varianceInr,
    status,
    denominations: denoms,
    zReportLines,
  };
}

// --- Regular Client Khata & CSV Exports ---

export interface KhataAccountSummary {
  id: string;
  clientName: string;
  clientType: 'coaching' | 'student' | 'office' | 'walkin_regular';
  contactPhone: string;
  creditLimitPaise: number;
  balanceDuePaise: number;
  updatedAt: string;
}

export interface KhataTransactionRecord {
  id: string;
  accountId: string;
  clientName?: string;
  entryType: 'debit_print' | 'credit_payment';
  amountPaise: number;
  paymentMode: 'khata' | 'cash' | 'upi';
  referenceNote: string;
  createdAt: string;
}

export function buildKhataStatementCsv(
  accounts: KhataAccountSummary[],
  transactions: KhataTransactionRecord[]
): string {
  const accountMap = new Map(accounts.map((a) => [a.id, a.clientName]));
  const headers = [
    'Timestamp',
    'Client Name',
    'Entry Type',
    'Mode',
    'Amount (INR)',
    'Reference Note',
  ];
  const rows = transactions.map((tx) => [
    tx.createdAt,
    tx.clientName || accountMap.get(tx.accountId) || tx.accountId,
    tx.entryType === 'debit_print' ? 'Print Charge (Due)' : 'Payment Received',
    tx.paymentMode.toUpperCase(),
    (tx.amountPaise / 100).toFixed(2),
    tx.referenceNote,
  ]);
  return [
    headers.map(sanitizeCsvValue).join(','),
    ...rows.map((r) => r.map(sanitizeCsvValue).join(',')),
  ].join('\r\n');
}

export function buildCashTallyCsv(tallies: Array<{
  id: string;
  shiftLabel: string;
  operatorName: string;
  openingFloatPaise: number;
  cashSalesPaise: number;
  upiSalesPaise: number;
  expensesPaise: number;
  expectedPaise: number;
  countedPaise: number;
  variancePaise: number;
  status: string;
  closedAt: string;
}>): string {
  const headers = [
    'Closed At',
    'Shift',
    'Operator',
    'Opening Float (INR)',
    'Cash Sales (INR)',
    'UPI Sales (INR)',
    'Paid Out (INR)',
    'Expected Drawer (INR)',
    'Counted Cash (INR)',
    'Variance (INR)',
    'Status',
  ];
  const rows = tallies.map((t) => [
    t.closedAt,
    t.shiftLabel,
    t.operatorName,
    (t.openingFloatPaise / 100).toFixed(2),
    (t.cashSalesPaise / 100).toFixed(2),
    (t.upiSalesPaise / 100).toFixed(2),
    (t.expensesPaise / 100).toFixed(2),
    (t.expectedPaise / 100).toFixed(2),
    (t.countedPaise / 100).toFixed(2),
    (t.variancePaise / 100).toFixed(2),
    t.status.toUpperCase(),
  ]);
  return [
    headers.map(sanitizeCsvValue).join(','),
    ...rows.map((r) => r.map(sanitizeCsvValue).join(',')),
  ].join('\r\n');
}
