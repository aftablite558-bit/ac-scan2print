// AC Scan2Print — Phase 21: Bulk Coaching Batch Estimator, Templates & Unified Archive Audit CLI

import { DatabaseSync } from 'node:sqlite';
import { initCounterOpsSchema } from './lib/counterOpsStore.ts';
import { initWalkinPosSchema } from './lib/walkinPosStore.ts';
import { initShopFloorToolsSchema } from './lib/shopFloorToolsStore.ts';
import { getBatchArchiveState, initBatchArchiveSchema } from './lib/batchArchiveStore.ts';
import {
  BATCH_VOLUME_TIERS,
  DEFAULT_SHOP_JOB_TEMPLATES,
  buildUnifiedArchiveCsv,
  evaluateBulkBatchQuote,
  filterPrintArchiveEntries,
  resolveBatchVolumeTier,
} from './lib/batchArchiveEngine.ts';

function runCli(): void {
  console.log('=== AC Scan2Print Phase 21 Bulk Batch Estimator, Templates & Archive Audit ===');

  // 1. Volume Tier & Bulk Slab Engine
  console.log('--- 1. Bulk Volume Slab & Quote Evaluator ---');
  if (BATCH_VOLUME_TIERS.length !== 4) {
    console.error('ERROR: Expected 4 volume tiers, got', BATCH_VOLUME_TIERS.length);
    process.exit(1);
  }
  const tier0 = resolveBatchVolumeTier(50);
  const tier10 = resolveBatchVolumeTier(150);
  const tier18 = resolveBatchVolumeTier(450);
  const tier25 = resolveBatchVolumeTier(1200);

  if (
    tier0.discountPct !== 0 ||
    tier10.discountPct !== 10 ||
    tier18.discountPct !== 18 ||
    tier25.discountPct !== 25
  ) {
    console.error('ERROR: Volume tier discount resolution mismatch', { tier0, tier10, tier18, tier25 });
    process.exit(1);
  }

  // Sample quote: 20 sets of 64-page booklet (2-in-1 duplex = 16 physical sheets/set * 20 = 320 physical sheets -> 18% slab)
  const quote = evaluateBulkBatchQuote({
    batchTitle: 'Patel Classes Math Foundation',
    batchRef: 'B-2101',
    studentSets: 20,
    items: [
      {
        title: 'Math Vol 1',
        pageCount: 64,
        paperSize: 'A4',
        printMode: 'bw',
        printSides: 'duplex',
        pagesPerSheet: 2,
        finishingService: 'spiral_binding',
      },
    ],
  });

  if (quote.totalPhysicalSheets !== 320 || quote.volumeTier.discountPct !== 18) {
    console.error('ERROR: Bulk batch quote calculation failed', quote);
    process.exit(1);
  }
  console.log(
    `Batch Quote B-2101        : ${quote.studentSets} sets · ${quote.totalPhysicalSheets} sheets · Gross ₹${quote.grossTotalInr.toFixed(2)} (${quote.volumeTier.label})`
  );

  // 2. In-Memory SQLite Schema & Saved Templates
  console.log('--- 2. SQLite Schema & Saved Shop Packet Templates ---');
  const db = new DatabaseSync(':memory:');
  initCounterOpsSchema(db);
  initWalkinPosSchema(db);
  initShopFloorToolsSchema(db);
  initBatchArchiveSchema(db);

  const state = getBatchArchiveState(db);
  if (state.templates.length !== DEFAULT_SHOP_JOB_TEMPLATES.length) {
    console.error('ERROR: Seeded shop packet templates count mismatch', state.templates.length);
    process.exit(1);
  }
  console.log(
    `Shop Templates Seeded     : ${state.templates.length} presets (${state.templates.map((t) => t.templateName).join('; ')})`
  );

  // 3. Unified Archive Filtering & Formula Safety
  console.log('--- 3. Unified Archive Filtering & Spreadsheet Formula Safety ---');
  const filtered = filterPrintArchiveEntries(
    [
      {
        id: '1',
        sourceType: 'walkin',
        refCode: 'W-901',
        titleOrCustomer: 'Ankit Sharma',
        paymentMethod: 'upi',
        physicalSheets: 10,
        amountPaise: 3000,
        summaryNote: 'Photocopy',
        createdAt: '2026-11-26T10:00:00Z',
      },
      {
        id: '2',
        sourceType: 'batch',
        refCode: 'B-101',
        titleOrCustomer: 'Sharma Coaching Maths',
        paymentMethod: 'khata',
        physicalSheets: 300,
        amountPaise: 45000,
        summaryNote: '15 sets',
        createdAt: '2026-11-26T11:00:00Z',
      },
    ],
    { q: 'Maths' }
  );

  if (filtered.length !== 1 || filtered[0].refCode !== 'B-101') {
    console.error('ERROR: Archive filter by keyword failed', filtered);
    process.exit(1);
  }

  const csv = buildUnifiedArchiveCsv([
    {
      id: 'inj-1',
      sourceType: 'batch',
      refCode: '=1+1',
      titleOrCustomer: '@SUM(A1:A5)',
      paymentMethod: '-cmd',
      physicalSheets: 20,
      amountPaise: 5000,
      summaryNote: '+calc',
      createdAt: '2026-11-26T12:00:00Z',
    },
  ]);

  if (!csv.includes("'=1+1") || !csv.includes("'@SUM(A1:A5)") || !csv.includes("'-CMD") || !csv.includes("'+calc")) {
    console.error('ERROR: Archive CSV formula injection sanitization failed');
    process.exit(1);
  }
  console.log('Archive CSV Export        : Formula-safe and validated.');
  console.log('\nSTATUS: PHASE 21 BULK BATCH ESTIMATOR, TEMPLATES & ARCHIVE VERIFIED — 100% READY');
}

runCli();
