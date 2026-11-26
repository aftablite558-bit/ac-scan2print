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
import {
  createShopFloorToolsRouter,
  initShopFloorToolsSchema,
} from '../../scripts/lib/shopFloorToolsStore.ts';
import {
  DEFAULT_SHIFT_CHECKLIST_TEMPLATES,
  EXAM_FORM_PRESETS,
  WASTAGE_REASONS,
  buildWastageLogCsv,
  evaluateExamAssetCompliance,
  evaluateShiftReadiness,
  evaluateWastageCostPaise,
  summarizeWastageLogs,
} from '../../scripts/lib/shopFloorToolsEngine.ts';
import { parseCustomerRoute } from '../../customer-portal/src/lib/pricing.ts';

const ROOT_DIR = process.cwd();

async function withShopToolsServer(
  run: (baseUrl: string, db: DatabaseSync, adminBearer: string) => Promise<void>
): Promise<void> {
  const db = new DatabaseSync(':memory:');
  initCounterOpsSchema(db);
  initWalkinPosSchema(db);
  initShopFloorToolsSchema(db);

  const { privateKey, publicKey } = await generateKeyPair('RS256');
  const publicJwk = await exportJWK(publicKey);
  publicJwk.kid = 'phase20-kid';
  publicJwk.use = 'sig';
  publicJwk.alg = 'RS256';

  const projectId = 'aman-computer-27b21';
  const superAdminUid = 'Yr0Wr7PuuAdOIMaqohmqaINNbNC2';

  const adminBearer = await new SignJWT({
    email: 'admin@amancomputer.local',
    user_id: superAdminUid,
  })
    .setProtectedHeader({ alg: 'RS256', kid: 'phase20-kid' })
    .setIssuer(`https://securetoken.google.com/${projectId}`)
    .setAudience(projectId)
    .setSubject(superAdminUid)
    .setIssuedAt()
    .setExpirationTime('10m')
    .sign(privateKey);

  const app = express();
  app.use(
    '/api/shop-tools',
    createShopFloorToolsRouter({
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
  const baseUrl = `http://127.0.0.1:${addr.port}/api/shop-tools`;

  try {
    await run(baseUrl, db, adminBearer);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve()))
    );
    db.close();
  }
}

test('[P20-01] Exam Form Document Compliance Validates Dimensions & Exact KB Bounds', () => {
  assert.equal(EXAM_FORM_PRESETS.length, 5);

  const sscPass = evaluateExamAssetCompliance({
    presetId: 'ssc_photo',
    widthPx: 413,
    heightPx: 531,
    sizeBytes: 36 * 1024,
  });
  assert.equal(sscPass.status, 'within_spec');
  assert.equal(sscPass.dimensionsMatch, true);
  assert.equal(sscPass.kbInRange, true);

  const sscOver = evaluateExamAssetCompliance({
    presetId: 'ssc_signature',
    widthPx: 472,
    heightPx: 236,
    sizeBytes: 25 * 1024,
  });
  assert.equal(sscOver.status, 'too_large_kb');

  const wrongSize = evaluateExamAssetCompliance({
    presetId: 'rrb_bpsc_photo',
    widthPx: 600,
    heightPx: 600,
    sizeBytes: 30 * 1024,
  });
  assert.equal(wrongSize.status, 'wrong_dimensions');
});

test('[P20-02] Wastage Cost Engine & Root-Cause Summary Compute Integer Paise & Ranking', () => {
  assert.equal(WASTAGE_REASONS.length, 5);
  assert.equal(evaluateWastageCostPaise('paper-a4-75gsm', 10), 850);
  assert.equal(evaluateWastageCostPaise('paper-legal-80gsm', 5), 600);
  assert.equal(evaluateWastageCostPaise('paper-photo-4x6', 2), 900);

  const summary = summarizeWastageLogs([
    {
      id: 'w-a',
      stationId: 'station-1-bw-fast',
      paperItemId: 'paper-a4-75gsm',
      sheetsWasted: 10,
      reasonCode: 'paper_jam',
      estimatedLossPaise: 850,
      jobNumber: 'JOB-101',
      note: 'Roller slip',
      actorUid: 'admin',
      createdAt: '2026-11-26T09:00:00Z',
    },
    {
      id: 'w-b',
      stationId: 'station-2-colour-photo',
      paperItemId: 'paper-photo-4x6',
      sheetsWasted: 2,
      reasonCode: 'ink_streak',
      estimatedLossPaise: 900,
      jobNumber: 'W-102',
      note: 'Streak',
      actorUid: 'admin',
      createdAt: '2026-11-26T09:10:00Z',
    },
  ]);

  assert.equal(summary.totalSpoiledSheets, 12);
  assert.equal(summary.totalEstimatedLossPaise, 1750);
  assert.equal(summary.totalEstimatedLossInr, 17.5);
  assert.equal(summary.topReasonCode, 'paper_jam');
});

test('[P20-03] Formula-Safe Wastage CSV Export Defends Against Spreadsheet Injection', () => {
  const csv = buildWastageLogCsv([
    {
      id: 'w-csv',
      stationId: 'station-1-bw-fast',
      paperItemId: 'paper-a4-75gsm',
      sheetsWasted: 4,
      reasonCode: 'customer_reprint',
      estimatedLossPaise: 340,
      jobNumber: '=CMD()',
      note: '@SUM(A1)',
      actorUid: 'admin',
      createdAt: '2026-11-26T10:00:00Z',
    },
  ]);

  assert.ok(csv.includes("'=CMD()"));
  assert.ok(csv.includes("'@SUM(A1)"));
  assert.ok(csv.includes('3.40'));
});

test('[P20-04] Shift Readiness Gate Requires All Mandatory Counter Checks Before Sign-Off', () => {
  const seeded = DEFAULT_SHIFT_CHECKLIST_TEMPLATES.map((t) => ({
    ...t,
    checked: false,
    checkedAt: null,
  }));
  const openingPending = evaluateShiftReadiness(seeded, 'opening');
  assert.equal(openingPending.readyForSignoff, false);
  assert.equal(openingPending.requiredRemaining, 4);

  const closingOnlyRequired = seeded.map((t) =>
    t.shiftType === 'closing' && t.required ? { ...t, checked: true, checkedAt: '2026-11-26T20:30:00Z' } : t
  );
  const closingReady = evaluateShiftReadiness(closingOnlyRequired, 'closing');
  assert.equal(closingReady.readyForSignoff, true);
  assert.equal(closingReady.requiredRemaining, 0);
});

test('[P20-05] Express /api/shop-tools Enforces Fail-Closed 401, Atomic Wastage Deduction & 422 Shift Gate', async () => {
  await withShopToolsServer(async (baseUrl, db, adminBearer) => {
    // Public routes
    const presetsRes = await fetch(`${baseUrl}/exam-presets`);
    assert.equal(presetsRes.status, 200);
    const presetsJson = (await presetsRes.json()) as { examPresets: unknown[]; wastageReasons: unknown[] };
    assert.equal(presetsJson.examPresets.length, 5);
    assert.equal(presetsJson.wastageReasons.length, 5);

    const compRes = await fetch(`${baseUrl}/exam-compliance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        presetId: 'pan_form_scan',
        widthPx: 1240,
        heightPx: 1754,
        sizeBytes: 120 * 1024,
      }),
    });
    assert.equal(compRes.status, 200);
    const compJson = (await compRes.json()) as { report: { status: string } };
    assert.equal(compJson.report.status, 'within_spec');

    // Unauthenticated admin calls fail closed with 401
    const unauthState = await fetch(`${baseUrl}/state`);
    assert.equal(unauthState.status, 401);
    const unauthWastage = await fetch(`${baseUrl}/wastage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paperItemId: 'paper-a4-75gsm', sheetsWasted: 5 }),
    });
    assert.equal(unauthWastage.status, 401);
    const unauthSignoff = await fetch(`${baseUrl}/checklist/signoff`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shiftType: 'opening' }),
    });
    assert.equal(unauthSignoff.status, 401);

    const authHeaders = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminBearer}`,
    };

    const initialCounter = getCounterOpsState(db);
    const initialA4 = initialCounter.inventory.find((i) => i.id === 'paper-a4-75gsm')?.currentQty ?? 0;
    const initialMaint = getWalkinPosState(db).maintenanceCounters.find(
      (m) => m.stationId === 'station-1-bw-fast'
    );
    const initialPages = initialMaint?.lifetimePages ?? 0;

    // Log 6 wasted A4 sheets -> atomically deducts inventory & adds 6 pages to station-1 counter
    const wasteRes = await fetch(`${baseUrl}/wastage`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        stationId: 'station-1-bw-fast',
        paperItemId: 'paper-a4-75gsm',
        sheetsWasted: 6,
        reasonCode: 'paper_jam',
        jobNumber: 'JOB-2099',
        note: 'Tray 1 feed crinkle',
        deductInventory: true,
      }),
    });
    assert.equal(wasteRes.status, 201);
    const wasteJson = (await wasteRes.json()) as {
      estimatedLossPaise: number;
      state: { wastageSummary: { totalSpoiledSheets: number } };
    };
    assert.equal(wasteJson.estimatedLossPaise, 510);
    assert.equal(wasteJson.state.wastageSummary.totalSpoiledSheets, 6);

    const updatedCounter = getCounterOpsState(db);
    assert.equal(
      updatedCounter.inventory.find((i) => i.id === 'paper-a4-75gsm')?.currentQty,
      initialA4 - 6
    );
    const updatedMaint = getWalkinPosState(db).maintenanceCounters.find(
      (m) => m.stationId === 'station-1-bw-fast'
    );
    assert.equal(updatedMaint?.lifetimePages, initialPages + 6);

    // Export CSV contains logged entry
    const csvRes = await fetch(`${baseUrl}/wastage/export`, {
      headers: { Authorization: `Bearer ${adminBearer}` },
    });
    assert.equal(csvRes.status, 200);
    const csvText = await csvRes.text();
    assert.ok(csvText.includes('JOB-2099'));

    // Incomplete opening checklist rejects signoff with 422
    const blockedSignoff = await fetch(`${baseUrl}/checklist/signoff`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ shiftType: 'opening', operatorName: 'Aman' }),
    });
    assert.equal(blockedSignoff.status, 422);

    // Check all 4 required opening tasks
    const openingKeys = [
      'open_paper_trays',
      'open_nozzle_check',
      'open_thermal_roll',
      'open_petty_float',
    ];
    for (const itemKey of openingKeys) {
      const toggleRes = await fetch(`${baseUrl}/checklist/toggle`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ itemKey, checked: true }),
      });
      assert.equal(toggleRes.status, 200);
    }

    // Now signoff passes & resets opening checkboxes when resetAfterSignoff: true
    const okSignoff = await fetch(`${baseUrl}/checklist/signoff`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        shiftType: 'opening',
        operatorName: 'Aman Verma',
        pettyCashInr: 750,
        notes: 'All printers primed',
        resetAfterSignoff: true,
      }),
    });
    assert.equal(okSignoff.status, 201);
    const signoffJson = (await okSignoff.json()) as {
      state: {
        openingReadiness: { checkedCount: number; readyForSignoff: boolean };
        signoffs: Array<{ operatorName: string; pettyCashInr: number }>;
      };
    };
    assert.equal(signoffJson.state.signoffs[0]?.operatorName, 'Aman Verma');
    assert.equal(signoffJson.state.signoffs[0]?.pettyCashInr, 750);
    assert.equal(signoffJson.state.openingReadiness.checkedCount, 0);
  });
});

test('[P20-06] Customer ExamPrep Route, Admin ShopToolsPanel & Docs Integrate Cleanly Without process.env', () => {
  assert.equal(parseCustomerRoute('/quick-print/exam-prep'), '/quick-print/exam-prep');

  const examPage = path.join(ROOT_DIR, 'customer-portal', 'src', 'pages', 'ExamPrepPage.tsx');
  const adminPanel = path.join(ROOT_DIR, 'src', 'components', 'print-management', 'ShopToolsPanel.tsx');
  const printMgmt = path.join(ROOT_DIR, 'src', 'pages', 'PrintManagementPage.tsx');
  const migration = path.join(
    ROOT_DIR,
    'supabase',
    'migrations',
    '202611260003_scan2print_phase20_exam_wastage_shift.sql'
  );
  const doc = path.join(
    ROOT_DIR,
    'docs',
    'scan2print',
    'production',
    'PHASE_20_EXAM_PREP_WASTAGE_AND_SHIFT.md'
  );

  assert.ok(fs.existsSync(examPage), 'ExamPrepPage.tsx missing');
  assert.ok(fs.existsSync(adminPanel), 'ShopToolsPanel.tsx missing');
  assert.ok(fs.existsSync(migration), 'Phase 20 SQL migration missing');
  assert.ok(fs.existsSync(doc), 'Phase 20 doc missing');

  const examSrc = fs.readFileSync(examPage, 'utf8');
  const panelSrc = fs.readFileSync(adminPanel, 'utf8');
  const mgmtSrc = fs.readFileSync(printMgmt, 'utf8');

  assert.ok(!examSrc.includes('process.env.'), 'ExamPrepPage must not access process.env');
  assert.ok(!panelSrc.includes('process.env.'), 'ShopToolsPanel must not access process.env');
  assert.ok(mgmtSrc.includes("activeTab === 'shop-tools'"), 'PrintManagementPage missing shop-tools tab');
});
