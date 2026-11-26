import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import express from 'express';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { initCounterOpsSchema, getCounterOpsState } from '../../scripts/lib/counterOpsStore.ts';
import { initWalkinPosSchema, getWalkinPosState } from '../../scripts/lib/walkinPosStore.ts';
import { initShopFloorToolsSchema } from '../../scripts/lib/shopFloorToolsStore.ts';
import {
  createBatchArchiveRouter,
  getBatchArchiveState,
  initBatchArchiveSchema,
} from '../../scripts/lib/batchArchiveStore.ts';
import {
  BATCH_VOLUME_TIERS,
  DEFAULT_SHOP_JOB_TEMPLATES,
  buildUnifiedArchiveCsv,
  evaluateBulkBatchQuote,
  filterPrintArchiveEntries,
  resolveBatchVolumeTier,
} from '../../scripts/lib/batchArchiveEngine.ts';
import { parseCustomerRoute } from '../../customer-portal/src/lib/pricing.ts';

const ROOT_DIR = process.cwd();

async function withBatchServer(
  run: (baseUrl: string, db: DatabaseSync, adminBearer: string) => Promise<void>
): Promise<void> {
  const db = new DatabaseSync(':memory:');
  initCounterOpsSchema(db);
  initWalkinPosSchema(db);
  initShopFloorToolsSchema(db);
  initBatchArchiveSchema(db);

  const { privateKey, publicKey } = await generateKeyPair('RS256');
  const publicJwk = await exportJWK(publicKey);
  publicJwk.kid = 'phase21-kid';
  publicJwk.use = 'sig';
  publicJwk.alg = 'RS256';

  const projectId = 'aman-computer-27b21';
  const superAdminUid = 'Yr0Wr7PuuAdOIMaqohmqaINNbNC2';

  const adminBearer = await new SignJWT({
    email: 'admin@amancomputer.local',
    user_id: superAdminUid,
  })
    .setProtectedHeader({ alg: 'RS256', kid: 'phase21-kid' })
    .setIssuer(`https://securetoken.google.com/${projectId}`)
    .setAudience(projectId)
    .setSubject(superAdminUid)
    .setIssuedAt()
    .setExpirationTime('10m')
    .sign(privateKey);

  const app = express();
  app.use(
    '/api/batch-archive',
    createBatchArchiveRouter({
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
  const baseUrl = `http://127.0.0.1:${addr.port}/api/batch-archive`;

  try {
    await run(baseUrl, db, adminBearer);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve()))
    );
    db.close();
  }
}

test('[P21-01] Bulk Volume Slab Engine & Job Card Evaluator Calculate Exact Discounts & Stock Impact', () => {
  assert.equal(BATCH_VOLUME_TIERS.length, 4);

  // 10 sets of 80-page booklet in 2-in-1 duplex = 20 physical sheets/set * 10 = 200 sheets -> 10% discount slab
  const quote10 = evaluateBulkBatchQuote({
    batchTitle: 'Coaching Booklets',
    batchRef: 'B-001',
    studentSets: 10,
    items: [
      {
        title: 'Physics Mechanics Booklet',
        pageCount: 80,
        paperSize: 'A4',
        printMode: 'bw',
        printSides: 'duplex',
        pagesPerSheet: 2,
        finishingService: 'spiral_binding',
      },
    ],
  });

  assert.equal(quote10.totalPhysicalSheets, 200);
  assert.equal(quote10.volumeTier.id, 'notes_slab_10');
  assert.equal(quote10.volumeTier.discountPct, 10);
  // Base print: 200 physical sheets @ ₹3.00 = ₹600.00 (60000 paise)
  assert.equal(quote10.rawPrintSubtotalPaise, 60000);
  // Discount: 10% of 60000 = 6000 paise (₹60.00)
  assert.equal(quote10.discountPaise, 6000);
  assert.equal(quote10.discountedPrintPaise, 54000);
  // Finishing: 10 sets * ₹30.00 spiral = ₹300.00 (30000 paise)
  assert.equal(quote10.finishingTotalPaise, 30000);
  assert.equal(quote10.grossTotalPaise, 84000);
  assert.equal(quote10.grossTotalInr, 840);
  assert.ok(quote10.jobCardLines.some((l) => l.includes('BATCH TOTAL   : Rs. 840.00')));

  // Check stock impact
  assert.equal(quote10.stockImpact.find((s) => s.itemId === 'paper-a4-75gsm')?.deltaQty, 200);
  assert.equal(quote10.stockImpact.find((s) => s.itemId === 'supply-spiral-coil')?.deltaQty, 10);
});

test('[P21-02] Pre-Seeded Shop Job Packet Templates Seed Invariants & Custom CRUD', () => {
  assert.ok(DEFAULT_SHOP_JOB_TEMPLATES.length >= 4);

  const db = new DatabaseSync(':memory:');
  initCounterOpsSchema(db);
  initWalkinPosSchema(db);
  initShopFloorToolsSchema(db);
  initBatchArchiveSchema(db);

  const state = getBatchArchiveState(db);
  assert.equal(state.templates.length, DEFAULT_SHOP_JOB_TEMPLATES.length);
  assert.ok(state.templates.every((t) => t.isSystem));

  db.close();
});

test('[P21-03] Unified Archive Multi-Source Filter & Formula-Safe CSV Export', () => {
  const entries = [
    {
      id: 'w-1',
      sourceType: 'walkin' as const,
      refCode: 'W-9001',
      titleOrCustomer: 'Rohan Verma',
      paymentMethod: 'cash',
      physicalSheets: 5,
      amountPaise: 1500,
      summaryNote: 'Loose print',
      createdAt: '2026-11-26T09:00:00Z',
    },
    {
      id: 'b-1',
      sourceType: 'batch' as const,
      refCode: 'B-1001',
      titleOrCustomer: 'Apex Coaching Biology',
      paymentMethod: 'khata',
      physicalSheets: 500,
      amountPaise: 75000,
      summaryNote: '25 sets',
      createdAt: '2026-11-26T10:00:00Z',
    },
    {
      id: 'ws-1',
      sourceType: 'wastage' as const,
      refCode: 'WS-01',
      titleOrCustomer: 'paper-a4-75gsm (paper jam)',
      paymentMethod: 'internal',
      physicalSheets: 4,
      amountPaise: -340,
      summaryNote: 'Jam feed',
      createdAt: '2026-11-26T11:00:00Z',
    },
  ];

  const searchRes = filterPrintArchiveEntries(entries, { q: 'Biology' });
  assert.equal(searchRes.length, 1);
  assert.equal(searchRes[0].refCode, 'B-1001');

  const sourceRes = filterPrintArchiveEntries(entries, { sourceType: 'wastage' });
  assert.equal(sourceRes.length, 1);
  assert.equal(sourceRes[0].refCode, 'WS-01');

  const csv = buildUnifiedArchiveCsv([
    {
      id: 'c-1',
      sourceType: 'batch' as const,
      refCode: '=SUM(1,2)',
      titleOrCustomer: '+cmd|calc',
      paymentMethod: '-upi',
      physicalSheets: 10,
      amountPaise: 5000,
      summaryNote: '@attack',
      createdAt: '2026-11-26T12:00:00Z',
    },
  ]);

  assert.ok(csv.includes("'=SUM(1,2)"));
  assert.ok(csv.includes("'+cmd|calc"));
  assert.ok(csv.includes("'-UPI"));
  assert.ok(csv.includes("'@attack"));
  assert.ok(csv.includes('50.00'));
});

test('[P21-04] Express /api/batch-archive Enforces Fail-Closed 401 on Mutations & Public Access to Presets', async () => {
  await withBatchServer(async (baseUrl, _db, _adminBearer) => {
    // Public endpoints
    const presetsRes = await fetch(`${baseUrl}/public-presets`);
    assert.equal(presetsRes.status, 200);
    const presetsJson = (await presetsRes.json()) as { volumeTiers: unknown[]; templates: unknown[] };
    assert.equal(presetsJson.volumeTiers.length, 4);
    assert.ok(presetsJson.templates.length >= 4);

    const quoteRes = await fetch(`${baseUrl}/quote`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        studentSets: 10,
        items: [
          {
            title: 'Sample Booklet',
            pageCount: 40,
            paperSize: 'A4',
            printMode: 'bw',
            printSides: 'duplex',
            pagesPerSheet: 2,
            finishingService: 'staple_corner',
          },
        ],
      }),
    });
    assert.equal(quoteRes.status, 200);
    const quoteJson = (await quoteRes.json()) as { quote: { grossTotalInr: number } };
    assert.ok(quoteJson.quote.grossTotalInr > 0);

    // Protected endpoints fail closed with 401
    const unauthState = await fetch(`${baseUrl}/state`);
    assert.equal(unauthState.status, 401);

    const unauthBatch = await fetch(`${baseUrl}/batches`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentSets: 1, items: [] }),
    });
    assert.equal(unauthBatch.status, 401);

    const unauthTemplate = await fetch(`${baseUrl}/templates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ templateName: 'Test' }),
    });
    assert.equal(unauthTemplate.status, 401);
  });
});

test('[P21-05] Express /api/batch-archive/batches Atomically Deducts Stock, Posts to Khata & Increments Printer Counters', async () => {
  await withBatchServer(async (baseUrl, db, adminBearer) => {
    const authHeaders = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminBearer}`,
    };

    const initialCounter = getCounterOpsState(db);
    const initialA4 = initialCounter.inventory.find((i) => i.id === 'paper-a4-75gsm')?.currentQty ?? 0;
    const initialSpiral = initialCounter.inventory.find((i) => i.id === 'supply-spiral-coil')?.currentQty ?? 0;
    const initialKhata = initialCounter.khataAccounts.find((k) => k.id === 'khata-sharma-coaching');
    const initialBalance = initialKhata?.balanceDuePaise ?? 0;

    const maintBefore = getWalkinPosState(db).maintenanceCounters.find(
      (m) => m.stationId === 'station-1-bw-fast'
    );
    const initialPages = maintBefore?.lifetimePages ?? 0;

    // Commit 15 sets of 40-page duplex 2-in-1 booklet (10 physical sheets/set * 15 = 150 sheets -> 10% slab)
    const commitRes = await fetch(`${baseUrl}/batches`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        batchTitle: 'Chemistry Question Bank 2026',
        customerName: 'Sharma Coaching Centre',
        studentSets: 15,
        paymentMethod: 'khata',
        khataAccountId: 'khata-sharma-coaching',
        deductInventory: true,
        items: [
          {
            title: 'Inorganic Chemistry Unit 1-4',
            pageCount: 40,
            paperSize: 'A4',
            printMode: 'bw',
            printSides: 'duplex',
            pagesPerSheet: 2,
            finishingService: 'spiral_binding',
          },
        ],
      }),
    });

    assert.equal(commitRes.status, 201);
    const commitJson = (await commitRes.json()) as {
      batchRef: string;
      quote: { grossTotalPaise: number; totalPhysicalSheets: number };
      state: { recentBatches: Array<{ batchRef: string }> };
    };

    assert.ok(commitJson.batchRef.startsWith('B-'));
    assert.equal(commitJson.quote.totalPhysicalSheets, 150);
    assert.equal(commitJson.state.recentBatches[0].batchRef, commitJson.batchRef);

    // Verify stock auto-deducted
    const updatedCounter = getCounterOpsState(db);
    assert.equal(
      updatedCounter.inventory.find((i) => i.id === 'paper-a4-75gsm')?.currentQty,
      initialA4 - 150
    );
    assert.equal(
      updatedCounter.inventory.find((i) => i.id === 'supply-spiral-coil')?.currentQty,
      initialSpiral - 15
    );

    // Verify Khata balance updated inside same transaction
    assert.equal(
      updatedCounter.khataAccounts.find((k) => k.id === 'khata-sharma-coaching')?.balanceDuePaise,
      initialBalance + commitJson.quote.grossTotalPaise
    );

    // Verify printer page counter updated
    const maintAfter = getWalkinPosState(db).maintenanceCounters.find(
      (m) => m.stationId === 'station-1-bw-fast'
    );
    // 20 impressions/set * 15 sets = 300 impressions
    assert.equal(maintAfter?.lifetimePages, initialPages + 300);

    // Test creating a custom template and deleting it
    const createTplRes = await fetch(`${baseUrl}/templates`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        templateName: 'Custom Botany Pack',
        category: 'coaching_notes',
        description: 'Botany diagrams + spiral bind',
        defaultSets: 10,
        items: [
          {
            title: 'Botany Diagrams',
            pageCount: 30,
            paperSize: 'A4',
            printMode: 'colour',
            printSides: 'single',
            pagesPerSheet: 1,
            finishingService: 'spiral_binding',
          },
        ],
      }),
    });
    assert.equal(createTplRes.status, 201);
    const createTplJson = (await createTplRes.json()) as { templateId: string };

    // Delete custom template succeeds
    const deleteTplRes = await fetch(`${baseUrl}/templates/${createTplJson.templateId}`, {
      method: 'DELETE',
      headers: authHeaders,
    });
    assert.equal(deleteTplRes.status, 200);

    // Deleting system template is rejected with 403
    const deleteSysRes = await fetch(`${baseUrl}/templates/tpl-coaching-notes-2up`, {
      method: 'DELETE',
      headers: authHeaders,
    });
    assert.equal(deleteSysRes.status, 403);

    // Verify archive export CSV contains committed batch
    const exportRes = await fetch(`${baseUrl}/archive/export`, {
      headers: { Authorization: `Bearer ${adminBearer}` },
    });
    assert.equal(exportRes.status, 200);
    const csvText = await exportRes.text();
    assert.ok(csvText.includes(commitJson.batchRef));
  });
});

test('[P21-06] Customer BatchPack Route, Admin BatchArchivePanel & Docs Integrate Cleanly Without process.env', () => {
  assert.equal(parseCustomerRoute('/quick-print/batch-pack'), '/quick-print/batch-pack');

  const customerPage = path.join(ROOT_DIR, 'customer-portal', 'src', 'pages', 'BatchPackPage.tsx');
  const adminPanel = path.join(
    ROOT_DIR,
    'src',
    'components',
    'print-management',
    'BatchArchivePanel.tsx'
  );
  const printMgmt = path.join(ROOT_DIR, 'src', 'pages', 'PrintManagementPage.tsx');
  const migration = path.join(
    ROOT_DIR,
    'supabase',
    'migrations',
    '202611260004_scan2print_phase21_batch_templates_archive.sql'
  );
  const doc = path.join(
    ROOT_DIR,
    'docs',
    'scan2print',
    'production',
    'PHASE_21_BATCH_ESTIMATOR_TEMPLATES_ARCHIVE.md'
  );

  assert.ok(fs.existsSync(customerPage), 'BatchPackPage.tsx missing');
  assert.ok(fs.existsSync(adminPanel), 'BatchArchivePanel.tsx missing');
  assert.ok(fs.existsSync(migration), 'Phase 21 SQL migration missing');
  assert.ok(fs.existsSync(doc), 'Phase 21 doc missing');

  const custSrc = fs.readFileSync(customerPage, 'utf8');
  const panelSrc = fs.readFileSync(adminPanel, 'utf8');
  const mgmtSrc = fs.readFileSync(printMgmt, 'utf8');

  assert.ok(!custSrc.includes('process.env.'), 'BatchPackPage must not access process.env');
  assert.ok(!panelSrc.includes('process.env.'), 'BatchArchivePanel must not access process.env');
  assert.ok(mgmtSrc.includes("activeTab === 'batch-archive'"), 'PrintManagementPage missing batch-archive tab');
});
