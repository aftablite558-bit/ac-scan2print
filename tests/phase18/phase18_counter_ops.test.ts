import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import express from 'express';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import {
  FINISHING_SERVICE_CATALOG,
  buildCashTallyCsv,
  buildKhataStatementCsv,
  calculatePhase18OrderQuote,
  computeCashDrawerTally,
  computeStockDeductionPlan,
  evaluateInventoryItem,
} from '../../scripts/lib/shopCounterOpsEngine.ts';
import { createCounterOpsRouter, initCounterOpsSchema } from '../../scripts/lib/counterOpsStore.ts';
import { formatThermalReceiptSlip } from '../../scripts/lib/fleetKioskAndGstEngine.ts';
import { calculateEstimateBreakdown } from '../../customer-portal/src/lib/pricing.ts';

const ROOT_DIR = process.cwd();

async function withCounterServer(
  run: (baseUrl: string, db: DatabaseSync, adminBearer: string) => Promise<void>
): Promise<void> {
  const db = new DatabaseSync(':memory:');
  initCounterOpsSchema(db);

  const { privateKey, publicKey } = await generateKeyPair('RS256');
  const publicJwk = await exportJWK(publicKey);
  publicJwk.kid = 'test-firebase-kid';
  publicJwk.use = 'sig';
  publicJwk.alg = 'RS256';

  const projectId = 'aman-computer-27b21';
  const superAdminUid = 'Yr0Wr7PuuAdOIMaqohmqaINNbNC2';

  const adminBearer = await new SignJWT({
    email: 'admin@amancomputer.local',
    user_id: superAdminUid,
  })
    .setProtectedHeader({ alg: 'RS256', kid: 'test-firebase-kid' })
    .setIssuer(`https://securetoken.google.com/${projectId}`)
    .setAudience(projectId)
    .setSubject(superAdminUid)
    .setIssuedAt()
    .setExpirationTime('10m')
    .sign(privateKey);

  const app = express();
  app.use(
    '/api/counter',
    createCounterOpsRouter({
      db,
      resolveSessionActor: () => null,
      firebaseProjectId: projectId,
      superAdminUid,
      localJwks: { keys: [publicJwk] },
    })
  );

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const baseUrl = `http://127.0.0.1:${address.port}/api/counter`;

  try {
    await run(baseUrl, db, adminBearer);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve()))
    );
    db.close();
  }
}

test('[P18-01] Integer-Paise N-Up & Finishing Pricing Engine Calculates Exact Sheets, Savings & Total', () => {
  assert.equal(FINISHING_SERVICE_CATALOG.length, 5);

  const quote = calculatePhase18OrderQuote({
    selectedPagesCount: 20,
    pagesPerSheet: 2,
    printSides: 'duplex',
    copies: 2,
    paperSize: 'A4',
    printMode: 'bw',
    ratePaise: 300,
    pricingUnit: 'per_physical_sheet',
    finishingService: 'spiral_binding',
  });

  // 20 pages -> 10 impressions per copy -> 5 duplex sheets per copy -> 10 sheets total
  assert.equal(quote.impressionsPerCopy, 10);
  assert.equal(quote.physicalSheetsPerCopy, 5);
  assert.equal(quote.physicalSheetsTotal, 10);
  assert.equal(quote.sheetsSavedByNup, 10);
  assert.equal(quote.printChargePaise, 3000);
  assert.equal(quote.finishingChargePaise, 6000);
  assert.equal(quote.grossTotalPaise, 9000);

  // Mirror verification with customer-portal pricing helper
  const portalBreakdown = calculateEstimateBreakdown({
    pagesPerCopy: 20,
    copies: 2,
    paperSize: 'A4',
    printMode: 'bw',
    printSides: 'duplex',
    pagesPerSheet: 2,
    finishingService: 'spiral_binding',
    rules: [
      {
        id: 'r1',
        ruleName: 'A4 BW Duplex',
        paperSize: 'A4',
        printMode: 'bw',
        printSides: 'duplex',
        pricingUnit: 'per_physical_sheet',
        rate: 3,
        minimumCharge: 0,
        isMockSample: false,
      },
    ],
  });
  assert.equal(portalBreakdown.physicalSheetsTotal, 10);
  assert.equal(portalBreakdown.sheetsSavedByNup, 10);
  assert.equal(portalBreakdown.finishingAmount, 60);
  assert.equal(portalBreakdown.finalEstimatedAmount, 90);
});

test('[P18-02] Thermal 80mm Receipt Slip Includes N-Up Layout & Finishing Add-On Line', () => {
  const slip = formatThermalReceiptSlip({
    jobNumber: 'JOB-20261126-0918',
    customerName: 'Rohit Verma',
    paperSize: 'A4',
    printMode: 'bw',
    printSides: 'duplex',
    pagesPerSheet: 4,
    finishingLabel: 'Spiral Binding + Covers',
    finishingAmountInr: 30,
    printedPages: 4,
    copies: 1,
    physicalSheets: 2,
    finalAmountInr: 36,
    paymentMethod: 'upi',
    paymentStatus: 'paid',
  });

  const text = slip.escPosLines.join('\n');
  assert.ok(text.includes('4-in-1'), 'Receipt must print N-Up layout');
  assert.ok(text.includes('FINISHING     : Spiral Binding + Covers (+Rs. 30.00)'));
});

test('[P18-03] Stock Deduction Plan & Alert Evaluator Compute Accurate Usage & Reorder States', () => {
  const plan = computeStockDeductionPlan({
    jobNumber: 'JOB-302',
    paperSize: 'Legal',
    printMode: 'colour',
    physicalSheetsTotal: 15,
    impressionsTotal: 30,
    copies: 3,
    finishingService: 'thermal_lamination',
  });
  assert.equal(plan.length, 3);
  assert.deepEqual(
    plan.map((p) => [p.itemId, p.deltaQty]),
    [
      ['paper-legal-80gsm', 15],
      ['ink-epson-l8050', 30],
      ['supply-lam-pouch', 3],
    ]
  );

  const critical = evaluateInventoryItem({
    id: 'paper-a4-75gsm',
    itemName: 'A4',
    category: 'paper',
    unitLabel: 'sheets',
    packSize: 500,
    currentQty: 200,
    minThreshold: 500,
    unitCostPaise: 45,
    updatedAt: '2026-11-26T00:00:00Z',
  });
  assert.equal(critical.alertLevel, 'critical_low');
});

test('[P18-04] Shift Cash Drawer Note Tally Reconciles Balanced, Excess & Shortage States', () => {
  const balanced = computeCashDrawerTally({
    shiftLabel: 'Evening Close',
    operatorName: 'Aman Kumar',
    openingFloatInr: 500,
    cashSalesInr: 860,
    upiSalesInr: 1200,
    counterExpensesInr: 60,
    denominations: { n500: 1, n200: 2, n100: 3, n50: 2, n20: 0, n10: 0, coinsInr: 0 },
  });
  assert.equal(balanced.expectedDrawerCashInr, 1300);
  assert.equal(balanced.countedCashInr, 1300);
  assert.equal(balanced.varianceInr, 0);
  assert.equal(balanced.status, 'balanced');
  assert.ok(balanced.zReportLines.join('\n').includes('SHIFT Z-REPORT'));

  const shortage = computeCashDrawerTally({
    shiftLabel: 'Morning Close',
    operatorName: 'Aman Kumar',
    openingFloatInr: 500,
    cashSalesInr: 500,
    upiSalesInr: 0,
    counterExpensesInr: 0,
    denominations: { n500: 1, n200: 2, n100: 0, n50: 1, n20: 0, n10: 0, coinsInr: 0 },
  });
  assert.equal(shortage.varianceInr, -50);
  assert.equal(shortage.status, 'shortage');
});

test('[P18-05] Formula-Safe Cash Tally & Khata Ledger CSV Exports Defend Against Injection', () => {
  const csv = buildKhataStatementCsv(
    [],
    [
      {
        id: 't1',
        accountId: 'a1',
        clientName: '=CMD()',
        entryType: 'debit_print',
        amountPaise: 12500,
        paymentMode: 'khata',
        referenceNote: '+SUM(A1)',
        createdAt: '2026-11-26T09:00:00Z',
      },
    ]
  );
  assert.ok(csv.includes("'=CMD()"));
  assert.ok(csv.includes("'+SUM(A1)"));

  const cashCsv = buildCashTallyCsv([
    {
      id: 'c1',
      shiftLabel: '@HYPERLINK',
      operatorName: 'Aman',
      openingFloatPaise: 50000,
      cashSalesPaise: 50000,
      upiSalesPaise: 0,
      expensesPaise: 0,
      expectedPaise: 100000,
      countedPaise: 100000,
      variancePaise: 0,
      status: 'balanced',
      closedAt: '2026-11-26T18:00:00Z',
    },
  ]);
  assert.ok(cashCsv.includes("'@HYPERLINK"));
});

test('[P18-06] Express /api/counter Auth Fails Closed Unauthenticated & Executes Atomic Stock, Cash & Khata With Super Admin Bearer', async () => {
  await withCounterServer(async (baseUrl, _db, adminBearer) => {
    // Public read & quote work without auth
    const pubCatalogRes = await fetch(`${baseUrl}/catalog`);
    assert.equal(pubCatalogRes.status, 200);
    const pubCatalog = (await pubCatalogRes.json()) as { finishingServices: unknown[] };
    assert.equal(pubCatalog.finishingServices.length, 5);

    const quoteRes = await fetch(`${baseUrl}/quote`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        selectedPagesCount: 16,
        pagesPerSheet: 2,
        printSides: 'duplex',
        copies: 1,
        ratePaise: 300,
        finishingService: 'staple_corner',
      }),
    });
    assert.equal(quoteRes.status, 200);
    const quoteBody = (await quoteRes.json()) as { quote: { physicalSheetsTotal: number; grossTotalPaise: number } };
    assert.equal(quoteBody.quote.physicalSheetsTotal, 4);
    assert.equal(quoteBody.quote.grossTotalPaise, 1700); // 4 * 300 + 500

    // Protected admin endpoints MUST reject anonymous callers with 401
    const unauthStateRes = await fetch(`${baseUrl}/state`);
    assert.equal(unauthStateRes.status, 401);

    const unauthTallyRes = await fetch(`${baseUrl}/cash-tally`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shiftLabel: 'Rogue', denominations: {} }),
    });
    assert.equal(unauthTallyRes.status, 401);

    // Authorized Admin requests succeed atomically
    const authHeaders = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminBearer}`,
    };

    const deductRes = await fetch(`${baseUrl}/inventory/deduct-job`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        jobNumber: 'JOB-HTTP-1',
        paperSize: 'A4',
        printMode: 'bw',
        physicalSheetsTotal: 50,
        impressionsTotal: 100,
        copies: 2,
        finishingService: 'spiral_binding',
      }),
    });
    assert.equal(deductRes.status, 200);
    const deductJson = (await deductRes.json()) as {
      applied: Array<{ itemId: string; resultingQty: number }>;
    };
    assert.equal(deductJson.applied.find((a) => a.itemId === 'paper-a4-75gsm')?.resultingQty, 2450);
    assert.equal(deductJson.applied.find((a) => a.itemId === 'supply-spiral-coil')?.resultingQty, 43);

    // Cash tally creation + CSV export
    const tallyRes = await fetch(`${baseUrl}/cash-tally`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        shiftLabel: 'Phase 18 Evening Close',
        operatorName: 'Aman Kumar',
        openingFloatInr: 500,
        cashSalesInr: 700,
        upiSalesInr: 950,
        counterExpensesInr: 50,
        denominations: { n500: 2, n100: 1, n50: 1, n20: 0, n10: 0, n200: 0, coinsInr: 0 },
      }),
    });
    assert.equal(tallyRes.status, 201);

    // Khata debit + credit limit guard + payment settlement
    const overLimitRes = await fetch(`${baseUrl}/khata/transactions`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        accountId: 'khata-patel-classes',
        entryType: 'debit_print',
        amountInr: 9000,
      }),
    });
    assert.equal(overLimitRes.status, 422);

    const creditRes = await fetch(`${baseUrl}/khata/transactions`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        accountId: 'khata-sharma-coaching',
        entryType: 'credit_payment',
        paymentMode: 'upi',
        amountInr: 240,
        referenceNote: 'Part UPI settlement',
      }),
    });
    assert.equal(creditRes.status, 201);
    const creditJson = (await creditRes.json()) as { resultingBalanceInr: number };
    assert.equal(creditJson.resultingBalanceInr, 400);

    const khataCsvRes = await fetch(`${baseUrl}/khata/export`, {
      headers: { Authorization: `Bearer ${adminBearer}` },
    });
    assert.equal(khataCsvRes.status, 200);
    const khataCsvText = await khataCsvRes.text();
    assert.ok(khataCsvText.includes('Part UPI settlement'));
  });
});

test('[P18-07] Migration SQL, Customer Portal, Admin UI & Docs Wire Phase 18 Cleanly Without Single-Shop Violations or process.env', () => {
  const migrationPath = path.join(
    ROOT_DIR,
    'supabase',
    'migrations',
    '202611260001_scan2print_phase18_counter_ops.sql'
  );
  const counterPanelPath = path.join(
    ROOT_DIR,
    'src',
    'components',
    'print-management',
    'CounterOpsPanel.tsx'
  );
  const printMgmtPath = path.join(ROOT_DIR, 'src', 'pages', 'PrintManagementPage.tsx');
  const optionsPath = path.join(ROOT_DIR, 'customer-portal', 'src', 'pages', 'OptionsAndPaymentPage.tsx');
  const docPath = path.join(
    ROOT_DIR,
    'docs',
    'scan2print',
    'production',
    'PHASE_18_FINISHING_INVENTORY_AND_CASH_LEDGER.md'
  );

  assert.ok(fs.existsSync(migrationPath), 'Phase 18 SQL migration missing');
  assert.ok(fs.existsSync(counterPanelPath), 'CounterOpsPanel.tsx missing');
  assert.ok(fs.existsSync(docPath), 'Phase 18 documentation missing');

  const panelContent = fs.readFileSync(counterPanelPath, 'utf8');
  const printMgmtContent = fs.readFileSync(printMgmtPath, 'utf8');
  const optionsContent = fs.readFileSync(optionsPath, 'utf8');
  const migrationContent = fs.readFileSync(migrationPath, 'utf8');

  assert.ok(!panelContent.includes('process.env.'), 'CounterOpsPanel must never access process.env');
  assert.ok(!optionsContent.includes('process.env.'), 'OptionsAndPaymentPage must never access process.env');
  assert.ok(printMgmtContent.includes("activeTab === 'counter-ops'"), 'PrintManagementPage missing counter-ops tab');
  assert.ok(optionsContent.includes('NUP_LAYOUT_OPTIONS'), 'Customer Options page missing N-Up layout selector');
  assert.ok(optionsContent.includes('FINISHING_ADDONS'), 'Customer Options page missing Finishing Add-Ons selector');
  assert.ok(migrationContent.includes('print_inventory_items'), 'Migration missing print_inventory_items');
  assert.ok(migrationContent.includes('print_shift_cash_closes'), 'Migration missing print_shift_cash_closes');
  assert.ok(migrationContent.includes('print_khata_accounts'), 'Migration missing print_khata_accounts');
});
