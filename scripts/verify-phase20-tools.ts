// AC Scan2Print — Phase 20: Exam Form KB Optimizer, Paper Wastage Analytics & Shift Checklist Audit CLI

import { DatabaseSync } from 'node:sqlite';
import { initCounterOpsSchema } from './lib/counterOpsStore.ts';
import { initWalkinPosSchema } from './lib/walkinPosStore.ts';
import { getShopFloorToolsState, initShopFloorToolsSchema } from './lib/shopFloorToolsStore.ts';
import {
  DEFAULT_SHIFT_CHECKLIST_TEMPLATES,
  EXAM_FORM_PRESETS,
  WASTAGE_REASONS,
  buildWastageLogCsv,
  evaluateExamAssetCompliance,
  evaluateShiftReadiness,
  evaluateWastageCostPaise,
  summarizeWastageLogs,
} from './lib/shopFloorToolsEngine.ts';

function runCli(): void {
  console.log('=== AC Scan2Print Phase 20 Exam Form KB Prep, Wastage Analytics & Shift Checklist Audit ===');

  // 1. Exam Form Presets & Compliance Evaluator
  console.log('--- 1. Exam Form Document Spec Presets & Compliance ---');
  if (EXAM_FORM_PRESETS.length !== 5) {
    console.error('ERROR: Expected 5 exam form presets, got', EXAM_FORM_PRESETS.length);
    process.exit(1);
  }
  const okReport = evaluateExamAssetCompliance({
    presetId: 'ssc_photo',
    widthPx: 413,
    heightPx: 531,
    sizeBytes: 34 * 1024,
  });
  const bigReport = evaluateExamAssetCompliance({
    presetId: 'ssc_signature',
    widthPx: 472,
    heightPx: 236,
    sizeBytes: 28 * 1024,
  });
  if (okReport.status !== 'within_spec' || bigReport.status !== 'too_large_kb') {
    console.error('ERROR: Exam asset compliance evaluation failed', { okReport, bigReport });
    process.exit(1);
  }
  console.log(
    `Exam Form Presets (${EXAM_FORM_PRESETS.length}): SSC photo (${okReport.actualKb} KB -> ${okReport.status}), signature check (${bigReport.status})`
  );

  // 2. Wastage Cost & Root-Cause Analytics
  console.log('--- 2. Paper Wastage Cost & Root-Cause Summary ---');
  const lossPaise = evaluateWastageCostPaise('paper-photo-4x6', 3);
  if (lossPaise !== 1350 || WASTAGE_REASONS.length !== 5) {
    console.error('ERROR: Wastage cost or reason table mismatch', { lossPaise });
    process.exit(1);
  }
  const summary = summarizeWastageLogs([
    {
      id: 'w1',
      stationId: 'station-1-bw-fast',
      paperItemId: 'paper-a4-75gsm',
      sheetsWasted: 6,
      reasonCode: 'paper_jam',
      estimatedLossPaise: evaluateWastageCostPaise('paper-a4-75gsm', 6),
      jobNumber: 'JOB-2001',
      note: 'Tray 1 double feed',
      actorUid: 'admin',
      createdAt: '2026-11-26T09:00:00Z',
    },
    {
      id: 'w2',
      stationId: 'station-2-colour-photo',
      paperItemId: 'paper-photo-4x6',
      sheetsWasted: 2,
      reasonCode: 'ink_streak',
      estimatedLossPaise: evaluateWastageCostPaise('paper-photo-4x6', 2),
      jobNumber: 'W-2002',
      note: 'Cyan banding',
      actorUid: 'admin',
      createdAt: '2026-11-26T09:15:00Z',
    },
  ]);
  if (summary.totalSpoiledSheets !== 8 || summary.topReasonCode !== 'paper_jam') {
    console.error('ERROR: Wastage root-cause summary mismatch', summary);
    process.exit(1);
  }
  console.log(
    `Sample Wastage Summary    : ${summary.totalSpoiledSheets} sheets · ₹${summary.totalEstimatedLossInr.toFixed(2)} · Top: ${summary.topReasonLabel}`
  );

  // 3. In-Memory SQLite Schema & Shift Checklist Readiness
  console.log('--- 3. SQLite Schema & Opening/Closing Shift Readiness ---');
  const db = new DatabaseSync(':memory:');
  initCounterOpsSchema(db);
  initWalkinPosSchema(db);
  initShopFloorToolsSchema(db);
  const state = getShopFloorToolsState(db);
  if (
    state.checklistItems.length !== DEFAULT_SHIFT_CHECKLIST_TEMPLATES.length ||
    state.openingReadiness.readyForSignoff !== false
  ) {
    console.error('ERROR: Shift checklist initialization mismatch', state.openingReadiness);
    process.exit(1);
  }

  const allOpeningChecked = state.checklistItems.map((i) =>
    i.shiftType === 'opening' ? { ...i, checked: true, checkedAt: '2026-11-26T08:00:00Z' } : i
  );
  const ready = evaluateShiftReadiness(allOpeningChecked, 'opening');
  if (!ready.readyForSignoff || ready.requiredRemaining !== 0) {
    console.error('ERROR: Shift readiness check failed after checking required items', ready);
    process.exit(1);
  }
  console.log(
    `Shift Checklist Seeded    : ${state.checklistItems.length} tasks (Opening & Closing), sign-off gate active`
  );

  // 4. Formula-Safe Wastage CSV
  const csv = buildWastageLogCsv([
    {
      id: 'w3',
      stationId: 'station-1-bw-fast',
      paperItemId: 'paper-a4-75gsm',
      sheetsWasted: 4,
      reasonCode: 'wrong_settings',
      estimatedLossPaise: 340,
      jobNumber: '=SUM(1+1)',
      note: '+cmd|calc',
      actorUid: 'admin',
      createdAt: '2026-11-26T09:30:00Z',
    },
  ]);
  if (!csv.includes("'=SUM(1+1)") || !csv.includes("'+cmd|calc")) {
    console.error('ERROR: Wastage CSV failed formula injection defense');
    process.exit(1);
  }
  console.log('Wastage CSV Export        : Formula-safe and validated.');
  console.log('\nSTATUS: PHASE 20 EXAM PREP, WASTAGE LOGBOOK & SHIFT HANDOFF VERIFIED — 100% READY');
}

runCli();
