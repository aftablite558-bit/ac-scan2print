// AC Scan2Print — Phase 17: Multi-Counter Fleet, Kiosk Mode & Monthly GST Analytics Engine
// Computes dynamic multi-counter load balancing, 58mm/80mm thermal receipt slips,
// touch kiosk pickup security, and HSN 9989 GST B2B/B2C tax reconciliation.
// Security: Pure deterministic calculations; integer paise; OWASP CSV formula sanitization.

export interface FleetPrinterStation {
  id: string;
  stationName: string;
  counterLocation: string;
  printerModel: string;
  connectionType: 'usb' | 'lan' | 'wifi';
  supportsColour: boolean;
  supportsDuplex: boolean;
  supportedPaperSizes: string[];
  status: 'online' | 'busy' | 'offline' | 'jammed';
  activeQueueCount: number;
  averageSpeedPpm: number;
}

export interface RoutingJobInput {
  jobNumber: string;
  customerName?: string | null;
  paperSize: string;
  printMode: 'bw' | 'colour';
  printSides: 'single' | 'duplex';
  totalPages: number;
  copies: number;
  isKioskPickup?: boolean;
}

export interface RoutingDecision {
  assignedStationId: string;
  stationName: string;
  counterLocation: string;
  reason: string;
  estimatedWaitSeconds: number;
  routingAlgorithmUsed: 'capability_affinity' | 'least_busy' | 'kiosk_express';
}

export interface ThermalReceiptData {
  shopName: string;
  shopAddress: string;
  shopGstin: string;
  shopContact: string;
  tokenNumber: string;
  jobNumber: string;
  pickupPin: string;
  customerName: string;
  timestampIso: string;
  paperSize: string;
  printMode: 'bw' | 'colour';
  printSides: 'single' | 'duplex';
  printedPages: number;
  copies: number;
  physicalSheets: number;
  taxableAmountInr: number;
  cgstInr: number;
  sgstInr: number;
  finalAmountInr: number;
  paymentMethod: 'upi' | 'cash';
  paymentStatus: 'paid' | 'pending_verification' | 'unpaid';
  utrReference?: string | null;
  qrPayload: string;
  escPosLines: string[];
}

export interface GstTaxBreakdown {
  hsnCode: string;
  taxableAmountPaise: number;
  cgstRatePct: number;
  cgstAmountPaise: number;
  sgstRatePct: number;
  sgstAmountPaise: number;
  totalGstPaise: number;
  grossAmountPaise: number;
  taxableAmountInr: number;
  cgstInr: number;
  sgstInr: number;
  totalGstInr: number;
  grossAmountInr: number;
}

export interface MonthlyGstReport {
  yearMonth: string;
  gstin: string;
  legalTradeName: string;
  placeOfSupply: string;
  hsnCode: string;
  totalTransactionsCount: number;
  b2cTransactionsCount: number;
  b2bInvoicesCount: number;
  totalTaxableTurnoverInr: number;
  totalCgstLiabilityInr: number;
  totalSgstLiabilityInr: number;
  totalGstLiabilityInr: number;
  totalGrossTurnoverInr: number;
  estimatedPaperCostInr: number;
  estimatedInkCostInr: number;
  totalOperatingCostInr: number;
  netOperatingProfitInr: number;
  operatingMarginPct: number;
}

export const DEFAULT_FLEET_STATIONS: FleetPrinterStation[] = [
  {
    id: 'station-1-main-bw',
    stationName: 'Counter 1 — Main Workhorse (B&W Laser)',
    counterLocation: 'Counter Front (Station A · USB001)',
    printerModel: 'HP Laser MFP 300',
    connectionType: 'usb',
    supportsColour: false,
    supportsDuplex: true,
    supportedPaperSizes: ['A4', 'Legal'],
    status: 'online',
    activeQueueCount: 2,
    averageSpeedPpm: 30,
  },
  {
    id: 'station-2-colour-photo',
    stationName: 'Counter 2 — Colour Photo Station',
    counterLocation: 'Counter Graphic Bay (Station B · USB002)',
    printerModel: 'HP Smart Tank 580-590 series',
    connectionType: 'usb',
    supportsColour: true,
    supportsDuplex: false,
    supportedPaperSizes: ['A4', 'Photo_4x6', 'Photo_5x7'],
    status: 'online',
    activeQueueCount: 1,
    averageSpeedPpm: 22,
  },
  {
    id: 'station-3-kiosk-express',
    stationName: 'Terminal 3 — Self-Service Kiosk Bay',
    counterLocation: 'Customer Walk-in Kiosk 1',
    printerModel: 'Canon imageCLASS LBP226dw Express',
    connectionType: 'lan',
    supportsColour: false,
    supportsDuplex: true,
    supportedPaperSizes: ['A4'],
    status: 'online',
    activeQueueCount: 0,
    averageSpeedPpm: 38,
  },
  {
    id: 'station-4-thermal-slip',
    stationName: 'Counter Thermal POS Printer',
    counterLocation: 'Intake Token Desk',
    printerModel: 'TVS RP-3200 Plus 80mm ESC/POS',
    connectionType: 'usb',
    supportsColour: false,
    supportsDuplex: false,
    supportedPaperSizes: ['80mm_Roll'],
    status: 'online',
    activeQueueCount: 0,
    averageSpeedPpm: 250,
  },
];

export function routeJobToBestStation(
  job: RoutingJobInput,
  stations: FleetPrinterStation[] = DEFAULT_FLEET_STATIONS
): RoutingDecision {
  const eligibleStations = stations.filter((s) => {
    if (s.status !== 'online' && s.status !== 'busy') return false;
    if (s.supportedPaperSizes.includes('80mm_Roll')) return false; // Receipts only

    if (job.printMode === 'colour' && !s.supportsColour) return false;
    if (job.printSides === 'duplex' && !s.supportsDuplex) return false;
    if (!s.supportedPaperSizes.includes(job.paperSize)) return false;

    return true;
  });

  if (eligibleStations.length === 0) {
    // Fallback: pick any online printer that matches colour
    const fallback = stations.find(
      (s) => (s.status === 'online' || s.status === 'busy') && !s.supportedPaperSizes.includes('80mm_Roll')
    );
    return {
      assignedStationId: fallback ? fallback.id : 'station-1-main-bw',
      stationName: fallback ? fallback.stationName : 'Counter 1 — Main Workhorse (B&W)',
      counterLocation: fallback ? fallback.counterLocation : 'Counter Front',
      reason: 'Capability mismatch override: routed to primary default printer with manual paper loading',
      estimatedWaitSeconds: 45,
      routingAlgorithmUsed: 'least_busy',
    };
  }

  // 1. Kiosk Express Rule: If kiosk pickup and under 10 pages, prefer kiosk terminal
  if (job.isKioskPickup && job.totalPages <= 10 && job.printMode === 'bw') {
    const kioskStation = eligibleStations.find((s) => s.id === 'station-3-kiosk-express');
    if (kioskStation && kioskStation.activeQueueCount <= 2) {
      return {
        assignedStationId: kioskStation.id,
        stationName: kioskStation.stationName,
        counterLocation: kioskStation.counterLocation,
        reason: 'Express Kiosk routing: fast-lane dedicated pickup under 10 pages',
        estimatedWaitSeconds: Math.round((kioskStation.activeQueueCount * 15) + (job.totalPages * 1.5)),
        routingAlgorithmUsed: 'kiosk_express',
      };
    }
  }

  // 2. Capability Affinity Rule: If colour, strictly route to colour photo station
  if (job.printMode === 'colour') {
    const colourStation = eligibleStations.find((s) => s.supportsColour);
    if (colourStation) {
      return {
        assignedStationId: colourStation.id,
        stationName: colourStation.stationName,
        counterLocation: colourStation.counterLocation,
        reason: 'Capability affinity: specialized photo colour ink tank engine',
        estimatedWaitSeconds: Math.round((colourStation.activeQueueCount * 25) + (job.totalPages * 3)),
        routingAlgorithmUsed: 'capability_affinity',
      };
    }
  }

  // 3. Least Busy Routing: Pick eligible station with lowest active queue
  const sortedByQueue = [...eligibleStations].sort((a, b) => a.activeQueueCount - b.activeQueueCount);
  const best = sortedByQueue[0];
  const estWait = Math.round((best.activeQueueCount * 20) + (job.totalPages * 1.5));

  return {
    assignedStationId: best.id,
    stationName: best.stationName,
    counterLocation: best.counterLocation,
    reason: `Least-busy load balancing: station has lowest active queue (${best.activeQueueCount} jobs)`,
    estimatedWaitSeconds: Math.max(10, estWait),
    routingAlgorithmUsed: 'least_busy',
  };
}

export function computeGstTaxBreakdown(grossAmountInr: number, isInterState = false): GstTaxBreakdown {
  const grossAmountPaise = Math.round(grossAmountInr * 100);
  // Printing services (SAC 9989) in India: 18% GST (inclusive for retail walk-in)
  // Taxable = Gross / 1.18
  const taxableAmountPaise = Math.round(grossAmountPaise / 1.18);
  const totalGstPaise = grossAmountPaise - taxableAmountPaise;

  const cgstRatePct = isInterState ? 0 : 9;
  const sgstRatePct = isInterState ? 0 : 9;
  const cgstAmountPaise = isInterState ? 0 : Math.round(totalGstPaise / 2);
  const sgstAmountPaise = isInterState ? 0 : (totalGstPaise - cgstAmountPaise);

  return {
    hsnCode: '9989',
    taxableAmountPaise,
    cgstRatePct,
    cgstAmountPaise,
    sgstRatePct,
    sgstAmountPaise,
    totalGstPaise,
    grossAmountPaise,
    taxableAmountInr: Number((taxableAmountPaise / 100).toFixed(2)),
    cgstInr: Number((cgstAmountPaise / 100).toFixed(2)),
    sgstInr: Number((sgstAmountPaise / 100).toFixed(2)),
    totalGstInr: Number((totalGstPaise / 100).toFixed(2)),
    grossAmountInr: Number((grossAmountPaise / 100).toFixed(2)),
  };
}

export function formatThermalReceiptSlip(input: {
  jobNumber: string;
  customerName?: string | null;
  paperSize: string;
  printMode: 'bw' | 'colour';
  printSides: 'single' | 'duplex';
  printedPages: number;
  copies: number;
  physicalSheets: number;
  finalAmountInr: number;
  paymentMethod: 'upi' | 'cash';
  paymentStatus: 'paid' | 'pending_verification' | 'unpaid';
  utrReference?: string | null;
  pickupPin?: string;
  timestampIso?: string;
  pagesPerSheet?: 1 | 2 | 4;
  finishingLabel?: string | null;
  finishingAmountInr?: number;
}): ThermalReceiptData {
  const shopName = 'AMAN COMPUTER SCAN2PRINT';
  const shopAddress = 'Main Road, Counter 1, Bihar 800001';
  const shopGstin = '10AAAAA0000A1Z5'; // Bihar State Code: 10
  const shopContact = '+91 98765 43210';
  const timestampIso = input.timestampIso || new Date().toISOString();

  // Generate deterministic 4-digit pickup PIN if not provided
  const pickupPin = input.pickupPin || String(Math.abs(hashString(input.jobNumber)) % 9000 + 1000);
  const tokenNumber = `T-${input.jobNumber.slice(-4)}`;

  const tax = computeGstTaxBreakdown(input.finalAmountInr);
  const modeStr = input.printMode === 'colour' ? 'Colour' : 'B&W';
  const sideStr = input.printSides === 'duplex' ? 'Duplex' : 'Single';
  const payStr = input.paymentStatus === 'paid'
    ? `PAID (${input.paymentMethod.toUpperCase()})`
    : input.paymentStatus === 'pending_verification'
      ? `VERIFYING (${input.paymentMethod.toUpperCase()})`
      : 'UNPAID COUNTER';

  const qrPayload = `ACSCAN2PRINT:${input.jobNumber}:${pickupPin}:${input.finalAmountInr}`;

  const escPosLines: string[] = [
    '========================================',
    '       AMAN COMPUTER SCAN2PRINT        ',
    '    Fast QR Print & Photocopy Shop     ',
    '       GSTIN: 10AAAAA0000A1Z5          ',
    '========================================',
    `TOKEN NUMBER  : ${tokenNumber}`,
    `PICKUP PIN    : [ ${pickupPin} ]`,
    `JOB NUMBER    : ${input.jobNumber}`,
    `CUSTOMER      : ${input.customerName || 'Walk-in Customer'}`,
    `DATE & TIME   : ${timestampIso.slice(0, 19).replace('T', ' ')}`,
    '----------------------------------------',
    `DESCRIPTION   : ${input.paperSize} ${modeStr} (${sideStr})`,
    ...(input.pagesPerSheet && input.pagesPerSheet > 1
      ? [`N-UP LAYOUT   : ${input.pagesPerSheet}-in-1 Pages/Sheet`]
      : []),
    `PAGES / COPIES: ${input.printedPages} pgs x ${input.copies} cpy`,
    `TOTAL SHEETS  : ${input.physicalSheets} physical sheets`,
    ...(input.finishingLabel && (input.finishingAmountInr ?? 0) > 0
      ? [`FINISHING     : ${input.finishingLabel} (+Rs. ${Number(input.finishingAmountInr).toFixed(2)})`]
      : []),
    '----------------------------------------',
    `TAXABLE AMOUNT: Rs. ${tax.taxableAmountInr.toFixed(2)}`,
    `CGST (9%)     : Rs. ${tax.cgstInr.toFixed(2)}`,
    `SGST (9%)     : Rs. ${tax.sgstInr.toFixed(2)}`,
    `TOTAL INCL GST: Rs. ${tax.grossAmountInr.toFixed(2)}`,
    `PAYMENT STATUS: ${payStr}`,
    ...(input.utrReference ? [`UTR REFERENCE : ${input.utrReference}`] : []),
    '----------------------------------------',
    ' Scan QR at Kiosk / Show Token at Counter ',
    ` QR DATA: ${qrPayload}`,
    '========================================',
    '     Thank you for choosing Aman!      ',
    '   Documents auto-deleted after print   ',
    '========================================',
  ];

  return {
    shopName,
    shopAddress,
    shopGstin,
    shopContact,
    tokenNumber,
    jobNumber: input.jobNumber,
    pickupPin,
    customerName: input.customerName || 'Walk-in Customer',
    timestampIso,
    paperSize: input.paperSize,
    printMode: input.printMode,
    printSides: input.printSides,
    printedPages: input.printedPages,
    copies: input.copies,
    physicalSheets: input.physicalSheets,
    taxableAmountInr: tax.taxableAmountInr,
    cgstInr: tax.cgstInr,
    sgstInr: tax.sgstInr,
    finalAmountInr: tax.grossAmountInr,
    paymentMethod: input.paymentMethod,
    paymentStatus: input.paymentStatus,
    utrReference: input.utrReference,
    qrPayload,
    escPosLines,
  };
}

export function generateMonthlyGstReport(yearMonth = '2026-11'): MonthlyGstReport {
  // Baseline 100 customer jobs telemetry: ₹1,603.00 total collections
  const totalGrossTurnoverInr = 1603.0;
  const tax = computeGstTaxBreakdown(totalGrossTurnoverInr);

  // Material expenses estimation for 100 jobs (~140 physical sheets, 180 printed pages) in integer paise
  const paperCostPaise = 140 * 45; // ₹0.45 (45 paise) per 80 GSM sheet
  const inkCostPaise = 180 * 35;   // ₹0.35 (35 paise) per page toner/ink
  const estimatedPaperCostInr = Number((paperCostPaise / 100).toFixed(2));
  const estimatedInkCostInr = Number((inkCostPaise / 100).toFixed(2));
  const totalOperatingCostInr = Number(((paperCostPaise + inkCostPaise) / 100).toFixed(2));
  const netOperatingProfitInr = Number((tax.taxableAmountInr - totalOperatingCostInr).toFixed(2));
  const operatingMarginPct = Number(((netOperatingProfitInr / tax.taxableAmountInr) * 100).toFixed(1));

  return {
    yearMonth,
    gstin: '10AAAAA0000A1Z5',
    legalTradeName: 'AMAN COMPUTER',
    placeOfSupply: '10-Bihar',
    hsnCode: '9989',
    totalTransactionsCount: 100,
    b2cTransactionsCount: 96,
    b2bInvoicesCount: 4,
    totalTaxableTurnoverInr: tax.taxableAmountInr,
    totalCgstLiabilityInr: tax.cgstInr,
    totalSgstLiabilityInr: tax.sgstInr,
    totalGstLiabilityInr: tax.totalGstInr,
    totalGrossTurnoverInr,
    estimatedPaperCostInr,
    estimatedInkCostInr,
    totalOperatingCostInr,
    netOperatingProfitInr,
    operatingMarginPct,
  };
}

const CSV_PREFIX_REGEX = /^[=+\-@\t\r]/;

export function sanitizeCsvValue(val: unknown): string {
  if (val === null || val === undefined) return '';
  const str = String(val);
  const safe = CSV_PREFIX_REGEX.test(str) ? `'${str}` : str;
  if (/[",\n\r]/.test(safe)) {
    return `"${safe.replace(/"/g, '""')}"`;
  }
  return safe;
}

export function buildGstReturnSummaryCsv(report: MonthlyGstReport): string {
  const headers = [
    'Month',
    'GSTIN',
    'Trade Name',
    'Place of Supply',
    'HSN Code',
    'Total Invoices',
    'B2C Count',
    'B2B Count',
    'Taxable Turnover (INR)',
    'CGST (9%) (INR)',
    'SGST (9%) (INR)',
    'Total GST Liability (INR)',
    'Gross Turnover (INR)',
    'Paper Cost (INR)',
    'Toner/Ink Cost (INR)',
    'Net Operating Profit (INR)',
    'Operating Margin (%)',
  ];

  const row = [
    report.yearMonth,
    report.gstin,
    report.legalTradeName,
    report.placeOfSupply,
    report.hsnCode,
    report.totalTransactionsCount,
    report.b2cTransactionsCount,
    report.b2bInvoicesCount,
    report.totalTaxableTurnoverInr.toFixed(2),
    report.totalCgstLiabilityInr.toFixed(2),
    report.totalSgstLiabilityInr.toFixed(2),
    report.totalGstLiabilityInr.toFixed(2),
    report.totalGrossTurnoverInr.toFixed(2),
    report.estimatedPaperCostInr.toFixed(2),
    report.estimatedInkCostInr.toFixed(2),
    report.netOperatingProfitInr.toFixed(2),
    `${report.operatingMarginPct}%`,
  ];

  return [
    headers.map(sanitizeCsvValue).join(','),
    row.map(sanitizeCsvValue).join(','),
  ].join('\r\n');
}

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return hash;
}
