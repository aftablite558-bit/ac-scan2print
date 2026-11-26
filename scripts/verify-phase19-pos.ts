// AC Scan2Print — Phase 19: Walk-In POS, 300-DPI Photo Sheet Studio & Printer Maintenance Audit CLI

import { DatabaseSync } from 'node:sqlite';
import { initCounterOpsSchema } from './lib/counterOpsStore.ts';
import { getWalkinPosState, initWalkinPosSchema } from './lib/walkinPosStore.ts';
import {
  PHOTO_SHEET_PRESETS,
  buildWalkinPosLedgerCsv,
  computePhotoSheetLayout,
  evaluatePrinterMaintenance,
  evaluateWalkinPosCart,
  formatWalkinThermalSlip,
} from './lib/walkinPosAndPhotoEngine.ts';

function runCli(): void {
  console.log('=== AC Scan2Print Phase 19 Walk-In POS, Photo Studio & Printer Maintenance Audit ===');

  // 1. 300-DPI Photo Sheet Geometry Verification
  console.log('--- 1. 300-DPI Photo Sheet Presets & Layout ---');
  console.log(`Photo Sheet Presets       : ${PHOTO_SHEET_PRESETS.length} presets configured`);
  const layout8 = computePhotoSheetLayout({ presetId: 'passport_4x6_8', sheetCopies: 2 });
  if (layout8.tiles.length !== 8 || layout8.totalPhotosCount !== 16 || layout8.totalPriceInr !== 80) {
    console.error('ERROR: Photo sheet layout calculation mismatch', layout8);
    process.exit(1);
  }
  console.log(
    `Sample 4x6 Grid (2 sheets): ${layout8.tiles.length} slots/sheet (${layout8.preset.sheetWidthPx300Dpi}x${layout8.preset.sheetHeightPx300Dpi}px) -> ${layout8.totalPhotosCount} photos · ₹${layout8.totalPriceInr.toFixed(2)}`
  );

  // 2. Walk-In Multi-Line POS Cart & Thermal Slip
  console.log('--- 2. Walk-In Direct Counter POS Cart & Thermal Slip ---');
  const cartQuote = evaluateWalkinPosCart(
    [
      {
        kind: 'document_print',
        paperSize: 'A4',
        printMode: 'bw',
        printSides: 'duplex',
        selectedPagesCount: 20,
        pagesPerSheet: 2,
        copies: 2,
        finishingService: 'spiral_binding',
      },
      {
        kind: 'photo_sheet',
        photoPresetId: 'passport_4x6_8',
        copies: 1,
      },
    ],
    'W-1901'
  );
  if (cartQuote.grossTotalPaise !== 13000 || cartQuote.totalPhysicalSheets !== 11) {
    console.error('ERROR: Walk-in cart total mismatch', cartQuote);
    process.exit(1);
  }
  const slip = formatWalkinThermalSlip({
    tokenNumber: 'W-1901',
    customerName: 'Sharma Coaching Centre',
    paymentMethod: 'khata',
    khataAccountName: 'Sharma Coaching Centre',
    quote: cartQuote,
    createdAtIso: '2026-11-26T09:45:00Z',
  });
  if (!slip.join('\n').includes('W-1901') || !slip.join('\n').includes('Rs. 130.00')) {
    console.error('ERROR: Walk-in thermal slip formatting failed');
    process.exit(1);
  }
  console.log(
    `Sample Walk-In Bill W-1901: ${cartQuote.lines.length} items · ${cartQuote.totalPhysicalSheets} sheets · ₹${cartQuote.grossTotalInr.toFixed(2)} (Taxable ₹${cartQuote.gstTaxableInr.toFixed(2)})`
  );

  // 3. In-Memory SQLite Walk-In & Printer Maintenance Store
  const db = new DatabaseSync(':memory:');
  initCounterOpsSchema(db);
  initWalkinPosSchema(db);
  const state = getWalkinPosState(db);
  const sampleEval = evaluatePrinterMaintenance({
    stationId: 'station-2-colour-photo',
    printerName: 'Epson L8050',
    componentName: 'Nozzle & Pad',
    lifetimePages: 5000,
    pagesSinceService: 700,
    serviceIntervalPages: 800,
    lastServicedAt: '2026-11-26T00:00:00Z',
    lastServiceNote: 'Clean',
  });
  if (sampleEval.healthStatus !== 'service_due' || state.maintenanceCounters.length !== 4) {
    console.error('ERROR: Printer maintenance evaluator failed');
    process.exit(1);
  }
  console.log(
    `SQLite POS & Maint Store  : ${state.maintenanceCounters.length} stations · ${state.khataAccounts.length} Khata clients ready`
  );

  // 4. CSV Formula Safety
  const csv = buildWalkinPosLedgerCsv([
    {
      tokenNumber: 'W-1901',
      customerName: '=CMD()',
      paymentMethod: 'cash',
      totalPhysicalSheets: 11,
      grossTotalPaise: 13000,
      createdAt: '2026-11-26T09:45:00Z',
    },
  ]);
  if (!csv.includes("'=CMD()")) {
    console.error('ERROR: Walk-in CSV failed formula injection defense');
    process.exit(1);
  }
  console.log('Walk-In CSV Export        : Formula-safe and validated.');
  console.log('\nSTATUS: PHASE 19 WALK-IN POS, 300-DPI PHOTO STUDIO & PRINTER CARE VERIFIED — 100% READY');
}

runCli();
