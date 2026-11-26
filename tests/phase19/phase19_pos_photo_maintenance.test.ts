import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import express from 'express';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { initCounterOpsSchema, getCounterOpsState } from '../../scripts/lib/counterOpsStore.ts';
import { createWalkinPosRouter, initWalkinPosSchema } from '../../scripts/lib/walkinPosStore.ts';
import {
  PHOTO_SHEET_PRESETS,
  buildWalkinPosLedgerCsv,
  computePhotoSheetLayout,
  evaluatePrinterMaintenance,
  evaluateWalkinPosCart,
  formatWalkinThermalSlip,
} from '../../scripts/lib/walkinPosAndPhotoEngine.ts';
import { parseCustomerRoute } from '../../customer-portal/src/lib/pricing.ts';

const ROOT_DIR = process.cwd();

async function withPosServer(
  run: (baseUrl: string, db: DatabaseSync, adminBearer: string) => Promise<void>
): Promise<void> {
  const db = new DatabaseSync(':memory:');
  initCounterOpsSchema(db);
  initWalkinPosSchema(db);

  const { privateKey, publicKey } = await generateKeyPair('RS256');
  const publicJwk = await exportJWK(publicKey);
  publicJwk.kid = 'phase19-kid';
  publicJwk.use = 'sig';
  publicJwk.alg = 'RS256';

  const projectId = 'aman-computer-27b21';
  const superAdminUid = 'Yr0Wr7PuuAdOIMaqohmqaINNbNC2';

  const adminBearer = await new SignJWT({
    email: 'admin@amancomputer.local',
    user_id: superAdminUid,
  })
    .setProtectedHeader({ alg: 'RS256', kid: 'phase19-kid' })
    .setIssuer(`https://securetoken.google.com/${projectId}`)
    .setAudience(projectId)
    .setSubject(superAdminUid)
    .setIssuedAt()
    .setExpirationTime('10m')
    .sign(privateKey);

  const app = express();
  app.use(
    '/api/pos',
    createWalkinPosRouter({
      db,
      resolveSessionActor: () => null,
      firebaseProjectId: projectId,
      superAdminUid,
      localJwks: { keys: [publicJwk] },
    })
  );

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address();
  assert.ok(addr && typeof addr !== 'string');
  const baseUrl = `http://127.0.0.1:${addr.port}/api/pos`;

  try {
    await run(baseUrl, db, adminBearer);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve()))
    );
    db.close();
  }
}

test('[P19-01] 300-DPI Photo Sheet Geometry Computes Exact Tile Bounds & Sheet Totals', () => {
  assert.equal(PHOTO_SHEET_PRESETS.length, 4);

  const grid8 = computePhotoSheetLayout({ presetId: 'passport_4x6_8', sheetCopies: 2 });
  assert.equal(grid8.preset.sheetWidthPx300Dpi, 1800);
  assert.equal(grid8.preset.sheetHeightPx300Dpi, 1200);
  assert.equal(grid8.tiles.length, 8);
  assert.equal(grid8.totalPhotosCount, 16);
  assert.equal(grid8.totalPricePaise, 8000);
  for (const preset of PHOTO_SHEET_PRESETS) {
    const plan = computePhotoSheetLayout({ presetId: preset.id, sheetCopies: 1 });
    assert.ok(
      plan.tiles.every(
        (t) =>
          t.xPx >= 0 &&
          t.yPx >= 0 &&
          t.xPx + t.widthPx <= preset.sheetWidthPx300Dpi &&
          t.yPx + t.heightPx <= preset.sheetHeightPx300Dpi
      ),
      `${preset.id} tiles exceeded 300-DPI sheet boundary`
    );
  }

  const idCard = computePhotoSheetLayout({ presetId: 'id_card_a4_duplex', sheetCopies: 1 });
  assert.equal(idCard.tiles.length, 2);
  assert.equal(idCard.tiles[0].role, 'id_front');
  assert.equal(idCard.tiles[1].role, 'id_back');
});

test('[P19-02] Walk-In Multi-Line POS Cart Computes Exact Integer Paise, Stock Impact & 80mm Receipt', () => {
  const quote = evaluateWalkinPosCart(
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
    'W-9001'
  );

  // Line 1: 10 physical sheets @ ₹3 = ₹30 + 2 * ₹30 spiral = ₹90
  // Line 2: 1 * 4x6 passport sheet = ₹40
  assert.equal(quote.grossTotalPaise, 13000);
  assert.equal(quote.totalPhysicalSheets, 11);
  assert.equal(quote.bwImpressions, 20);
  assert.equal(quote.colourImpressions, 1);
  assert.equal(quote.stockImpact.find((s) => s.itemId === 'paper-a4-75gsm')?.deltaQty, 10);
  assert.equal(quote.stockImpact.find((s) => s.itemId === 'paper-photo-4x6')?.deltaQty, 1);
  assert.equal(quote.stockImpact.find((s) => s.itemId === 'supply-spiral-coil')?.deltaQty, 2);

  const slip = formatWalkinThermalSlip({
    tokenNumber: 'W-9001',
    customerName: 'Ankit Tiwari',
    paymentMethod: 'upi',
    quote,
    createdAtIso: '2026-11-26T10:00:00Z',
  });
  const text = slip.join('\n');
  assert.ok(text.includes('WALK-IN POS'));
  assert.ok(text.includes('TOKEN         : W-9001'));
  assert.ok(text.includes('TOTAL PAID    : Rs. 130.00'));
});

test('[P19-03] Printer Drum & Nozzle Maintenance Evaluator Flags Healthy, Service Due & Overdue', () => {
  const healthy = evaluatePrinterMaintenance({
    stationId: 's1',
    printerName: 'HP',
    componentName: 'Drum',
    lifetimePages: 1000,
    pagesSinceService: 200,
    serviceIntervalPages: 1000,
    lastServicedAt: '2026-11-26T00:00:00Z',
    lastServiceNote: 'OK',
  });
  assert.equal(healthy.healthStatus, 'healthy');

  const due = evaluatePrinterMaintenance({
    stationId: 's2',
    printerName: 'Epson',
    componentName: 'Nozzle',
    lifetimePages: 1000,
    pagesSinceService: 850,
    serviceIntervalPages: 1000,
    lastServicedAt: '2026-11-26T00:00:00Z',
    lastServiceNote: 'OK',
  });
  assert.equal(due.healthStatus, 'service_due');

  const overdue = evaluatePrinterMaintenance({
    stationId: 's3',
    printerName: 'Canon',
    componentName: 'Roller',
    lifetimePages: 2000,
    pagesSinceService: 1100,
    serviceIntervalPages: 1000,
    lastServicedAt: '2026-11-26T00:00:00Z',
    lastServiceNote: 'OK',
  });
  assert.equal(overdue.healthStatus, 'overdue');
});

test('[P19-04] Formula-Safe Walk-In POS CSV Defends Against Spreadsheet Injection', () => {
  const csv = buildWalkinPosLedgerCsv([
    {
      tokenNumber: 'W-111',
      customerName: '=CMD()',
      paymentMethod: 'cash',
      totalPhysicalSheets: 5,
      grossTotalPaise: 4500,
      createdAt: '2026-11-26T10:00:00Z',
    },
  ]);
  assert.ok(csv.includes("'=CMD()"));
  assert.ok(csv.includes('45.00'));
});

test('[P19-05] Express /api/pos Fails Closed Unauthenticated & Executes Atomic POS + Inventory + Khata + Maintenance Counter', async () => {
  await withPosServer(async (baseUrl, db, adminBearer) => {
    // Public presets & layout endpoints work
    const presetsRes = await fetch(`${baseUrl}/presets`);
    assert.equal(presetsRes.status, 200);
    const presetsJson = (await presetsRes.json()) as { photoPresets: unknown[] };
    assert.equal(presetsJson.photoPresets.length, 4);

    const layoutRes = await fetch(`${baseUrl}/photo-layout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ presetId: 'passport_a4_24', sheetCopies: 1 }),
    });
    assert.equal(layoutRes.status, 200);

    // Protected endpoints reject anonymous calls with 401
    const unauthState = await fetch(`${baseUrl}/state`);
    assert.equal(unauthState.status, 401);
    const unauthOrder = await fetch(`${baseUrl}/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: [{ kind: 'photo_sheet', photoPresetId: 'passport_4x6_8', copies: 1 }] }),
    });
    assert.equal(unauthOrder.status, 401);

    const authHeaders = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminBearer}`,
    };

    // Atomic Walk-In POS settled to Khata client -> deducts stock + posts Khata debit + increments printer page counter
    const orderRes = await fetch(`${baseUrl}/orders`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        customerName: 'Sharma Coaching Centre',
        paymentMethod: 'khata',
        khataAccountId: 'khata-sharma-coaching',
        deductInventory: true,
        items: [
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
      }),
    });
    assert.equal(orderRes.status, 201);
    const orderJson = (await orderRes.json()) as {
      tokenNumber: string;
      quote: { grossTotalPaise: number };
      state: {
        summary: { totalWalkinBills: number; khataWalkinInr: number };
        maintenanceCounters: Array<{ stationId: string; lifetimePages: number }>;
      };
    };
    assert.ok(orderJson.tokenNumber.startsWith('W-'));
    assert.equal(orderJson.quote.grossTotalPaise, 13000);
    assert.equal(orderJson.state.summary.totalWalkinBills, 1);
    assert.equal(orderJson.state.summary.khataWalkinInr, 130);

    // Verify Phase 18 inventory & Khata balance updated inside same transaction
    const counterState = getCounterOpsState(db);
    assert.equal(counterState.inventory.find((i) => i.id === 'paper-a4-75gsm')?.currentQty, 2490);
    assert.equal(counterState.inventory.find((i) => i.id === 'paper-photo-4x6')?.currentQty, 179);
    assert.equal(counterState.inventory.find((i) => i.id === 'supply-spiral-coil')?.currentQty, 43);
    assert.equal(
      counterState.khataAccounts.find((k) => k.id === 'khata-sharma-coaching')?.balanceDuePaise,
      64000 + 13000
    );

    // Verify credit-limit exceeded rolls back atomically (Patel limit ₹3000, current due ₹250)
    const overLimit = await fetch(`${baseUrl}/orders`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        paymentMethod: 'khata',
        khataAccountId: 'khata-patel-classes',
        items: [{ kind: 'photo_sheet', photoPresetId: 'passport_a4_35', copies: 40 }],
      }),
    });
    assert.equal(overLimit.status, 422);

    // Maintenance log with counter reset
    const maintRes = await fetch(`${baseUrl}/maintenance/log`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        stationId: 'station-2-colour-photo',
        actionType: 'nozzle_check_clean',
        resetCounter: true,
        note: 'Clean printhead & reset check',
      }),
    });
    assert.equal(maintRes.status, 201);
    const maintJson = (await maintRes.json()) as {
      state: { maintenanceCounters: Array<{ stationId: string; pagesSinceService: number }> };
    };
    assert.equal(
      maintJson.state.maintenanceCounters.find((m) => m.stationId === 'station-2-colour-photo')?.pagesSinceService,
      0
    );

    const csvRes = await fetch(`${baseUrl}/orders/export`, {
      headers: { Authorization: `Bearer ${adminBearer}` },
    });
    assert.equal(csvRes.status, 200);
    const csvText = await csvRes.text();
    assert.ok(csvText.includes(orderJson.tokenNumber));
  });
});

test('[P19-06] Customer Portal Photo Sheet Route, Admin WalkinPosPanel & Docs Integrate Cleanly Without process.env', () => {
  assert.equal(parseCustomerRoute('/quick-print/photo-sheet'), '/quick-print/photo-sheet');

  const photoPage = path.join(ROOT_DIR, 'customer-portal', 'src', 'pages', 'PhotoSheetPage.tsx');
  const adminPanel = path.join(ROOT_DIR, 'src', 'components', 'print-management', 'WalkinPosPanel.tsx');
  const printMgmt = path.join(ROOT_DIR, 'src', 'pages', 'PrintManagementPage.tsx');
  const migration = path.join(ROOT_DIR, 'supabase', 'migrations', '202611260002_scan2print_phase19_pos_photo_maintenance.sql');
  const doc = path.join(ROOT_DIR, 'docs', 'scan2print', 'production', 'PHASE_19_WALKIN_POS_PHOTO_AND_MAINTENANCE.md');

  assert.ok(fs.existsSync(photoPage), 'PhotoSheetPage.tsx missing');
  assert.ok(fs.existsSync(adminPanel), 'WalkinPosPanel.tsx missing');
  assert.ok(fs.existsSync(migration), 'Phase 19 SQL migration missing');
  assert.ok(fs.existsSync(doc), 'Phase 19 doc missing');

  const photoSrc = fs.readFileSync(photoPage, 'utf8');
  const panelSrc = fs.readFileSync(adminPanel, 'utf8');
  const mgmtSrc = fs.readFileSync(printMgmt, 'utf8');

  assert.ok(!photoSrc.includes('process.env.'), 'PhotoSheetPage must not access process.env');
  assert.ok(!panelSrc.includes('process.env.'), 'WalkinPosPanel must not access process.env');
  assert.ok(mgmtSrc.includes("activeTab === 'walkin-pos'"), 'PrintManagementPage missing walkin-pos tab');
});
