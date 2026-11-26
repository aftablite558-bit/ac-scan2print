// AC Scan2Print — Phase 20: Shop Floor Tools SQLite Store & Express Router
// Handles Paper Wastage & Reprint Root-Cause Logs (atomic inventory + printer counter sync),
// Formula-safe CSV Export, and Daily Opening/Closing Shift Handoff Checklists.

import crypto from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import express, { type NextFunction, type Request, type Response } from 'express';
import type { JSONWebKeySet } from 'jose';
import {
  verifyFirebaseSuperAdminBearer,
  type CounterAdminActor,
} from './counterOpsStore.ts';
import {
  DEFAULT_SHIFT_CHECKLIST_TEMPLATES,
  EXAM_FORM_PRESETS,
  WASTAGE_REASONS,
  buildWastageLogCsv,
  evaluateExamAssetCompliance,
  evaluateShiftReadiness,
  evaluateWastageCostPaise,
  getWastageReasonSpec,
  summarizeWastageLogs,
  type ShiftChecklistItemState,
  type ShiftType,
  type WastageLogEntry,
  type WastageReasonId,
} from './shopFloorToolsEngine.ts';

const VALID_PAPER_SKUS = new Set(['paper-a4-75gsm', 'paper-legal-80gsm', 'paper-photo-4x6']);
const VALID_STATIONS = new Set([
  'station-1-bw-fast',
  'station-2-colour-photo',
  'station-3-kiosk-express',
  'station-4-thermal-pos',
]);

export function initShopFloorToolsSchema(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS print_wastage_logs (
      id TEXT PRIMARY KEY,
      station_id TEXT NOT NULL,
      paper_item_id TEXT NOT NULL,
      sheets_wasted INTEGER NOT NULL,
      reason_code TEXT NOT NULL,
      estimated_loss_paise INTEGER NOT NULL DEFAULT 0,
      job_number TEXT NOT NULL DEFAULT '',
      note TEXT NOT NULL DEFAULT '',
      actor_uid TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS shift_checklist_tasks (
      item_key TEXT PRIMARY KEY,
      shift_type TEXT NOT NULL,
      label TEXT NOT NULL,
      required INTEGER NOT NULL DEFAULT 1,
      checked INTEGER NOT NULL DEFAULT 0,
      checked_at TEXT
    );

    CREATE TABLE IF NOT EXISTS shift_handoff_signoffs (
      id TEXT PRIMARY KEY,
      shift_date TEXT NOT NULL,
      shift_type TEXT NOT NULL,
      operator_name TEXT NOT NULL,
      petty_cash_paise INTEGER NOT NULL DEFAULT 0,
      checked_count INTEGER NOT NULL DEFAULT 0,
      total_count INTEGER NOT NULL DEFAULT 0,
      notes TEXT NOT NULL DEFAULT '',
      actor_uid TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);

  const insertTask = db.prepare(`
    INSERT OR IGNORE INTO shift_checklist_tasks (
      item_key, shift_type, label, required, checked, checked_at
    ) VALUES (?, ?, ?, ?, 0, NULL)
  `);
  for (const t of DEFAULT_SHIFT_CHECKLIST_TEMPLATES) {
    insertTask.run(t.itemKey, t.shiftType, t.label, t.required ? 1 : 0);
  }
}

export function getShopFloorToolsState(db: DatabaseSync) {
  const rawWastage = db
    .prepare('SELECT * FROM print_wastage_logs ORDER BY created_at DESC LIMIT 50')
    .all() as Array<{
    id: string;
    station_id: string;
    paper_item_id: string;
    sheets_wasted: number;
    reason_code: WastageReasonId;
    estimated_loss_paise: number;
    job_number: string;
    note: string;
    actor_uid: string;
    created_at: string;
  }>;

  const wastageLogs: WastageLogEntry[] = rawWastage.map((r) => ({
    id: r.id,
    stationId: r.station_id,
    paperItemId: r.paper_item_id,
    sheetsWasted: r.sheets_wasted,
    reasonCode: r.reason_code,
    estimatedLossPaise: r.estimated_loss_paise,
    jobNumber: r.job_number,
    note: r.note,
    actorUid: r.actor_uid,
    createdAt: r.created_at,
  }));

  const wastageSummary = summarizeWastageLogs(wastageLogs);

  const rawTasks = db
    .prepare('SELECT * FROM shift_checklist_tasks ORDER BY shift_type ASC, rowid ASC')
    .all() as Array<{
    item_key: string;
    shift_type: ShiftType;
    label: string;
    required: number;
    checked: number;
    checked_at: string | null;
  }>;

  const checklistItems: ShiftChecklistItemState[] = rawTasks.map((t) => ({
    itemKey: t.item_key,
    shiftType: t.shift_type,
    label: t.label,
    required: Boolean(t.required),
    checked: Boolean(t.checked),
    checkedAt: t.checked_at,
  }));

  const rawSignoffs = db
    .prepare('SELECT * FROM shift_handoff_signoffs ORDER BY created_at DESC LIMIT 15')
    .all() as Array<{
    id: string;
    shift_date: string;
    shift_type: ShiftType;
    operator_name: string;
    petty_cash_paise: number;
    checked_count: number;
    total_count: number;
    notes: string;
    actor_uid: string;
    created_at: string;
  }>;

  const signoffs = rawSignoffs.map((s) => ({
    id: s.id,
    shiftDate: s.shift_date,
    shiftType: s.shift_type,
    operatorName: s.operator_name,
    pettyCashInr: Number((s.petty_cash_paise / 100).toFixed(2)),
    checkedCount: s.checked_count,
    totalCount: s.total_count,
    notes: s.notes,
    createdAt: s.created_at,
  }));

  return {
    checkedAtIso: new Date().toISOString(),
    examPresets: EXAM_FORM_PRESETS,
    wastageReasons: WASTAGE_REASONS,
    wastageLogs,
    wastageSummary,
    checklistItems,
    openingReadiness: evaluateShiftReadiness(checklistItems, 'opening'),
    closingReadiness: evaluateShiftReadiness(checklistItems, 'closing'),
    signoffs,
  };
}

export function createShopFloorToolsRouter(config: {
  db: DatabaseSync;
  resolveSessionActor: (req: Request) => CounterAdminActor | null;
  firebaseProjectId: string;
  superAdminUid: string;
  localJwks?: JSONWebKeySet;
}): express.Router {
  const router = express.Router();
  const { db } = config;

  const requireAdmin = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const sessionActor = config.resolveSessionActor(req);
    if (sessionActor) {
      (req as Request & { shopToolsActor: CounterAdminActor }).shopToolsActor = sessionActor;
      next();
      return;
    }

    const firebaseActor = await verifyFirebaseSuperAdminBearer(req.headers.authorization, {
      projectId: config.firebaseProjectId,
      expectedUid: config.superAdminUid,
      localJwks: config.localJwks,
    });
    if (firebaseActor) {
      (req as Request & { shopToolsActor: CounterAdminActor }).shopToolsActor = firebaseActor;
      next();
      return;
    }

    res.status(401).json({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Admin authentication required for Wastage Logs and Shift Handoff Checklist.',
      },
    });
  };

  // Public exam form preset specifications & compliance checker
  router.get('/exam-presets', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json({
      examPresets: EXAM_FORM_PRESETS,
      wastageReasons: WASTAGE_REASONS,
    });
  });

  router.post('/exam-compliance', express.json({ limit: '16kb' }), (req, res) => {
    const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;
    const report = evaluateExamAssetCompliance({
      presetId: typeof body.presetId === 'string' ? body.presetId : 'ssc_photo',
      widthPx: Number(body.widthPx) || 0,
      heightPx: Number(body.heightPx) || 0,
      sizeBytes: Number(body.sizeBytes) || 0,
    });
    res.setHeader('Cache-Control', 'no-store');
    res.json({ report });
  });

  // Protected Admin state
  router.get('/state', requireAdmin, (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json(getShopFloorToolsState(db));
  });

  // Protected: Log spoiled/reprint sheets & atomically deduct stock + increment station page counter
  router.post('/wastage', requireAdmin, express.json({ limit: '16kb' }), (req, res) => {
    const actor = (req as Request & { shopToolsActor: CounterAdminActor }).shopToolsActor;
    const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;

    const sheetsWasted = Math.round(Number(body.sheetsWasted) || 0);
    if (!Number.isFinite(sheetsWasted) || sheetsWasted < 1 || sheetsWasted > 500) {
      res.status(400).json({
        error: { code: 'INVALID_SHEETS', message: 'sheetsWasted must be between 1 and 500.' },
      });
      return;
    }

    const paperItemId =
      typeof body.paperItemId === 'string' && VALID_PAPER_SKUS.has(body.paperItemId.trim())
        ? body.paperItemId.trim()
        : 'paper-a4-75gsm';
    const stationId =
      typeof body.stationId === 'string' && VALID_STATIONS.has(body.stationId.trim())
        ? body.stationId.trim()
        : 'station-1-bw-fast';
    const reasonSpec = getWastageReasonSpec(
      typeof body.reasonCode === 'string' ? body.reasonCode : 'paper_jam'
    );
    const jobNumber =
      typeof body.jobNumber === 'string' ? body.jobNumber.trim().slice(0, 40) : '';
    const note = typeof body.note === 'string' ? body.note.trim().slice(0, 160) : '';
    const deductInventory = body.deductInventory !== false;

    const estimatedLossPaise = evaluateWastageCostPaise(paperItemId, sheetsWasted);
    const ts = new Date().toISOString();
    const id = crypto.randomUUID();

    try {
      db.exec('BEGIN');
      db.prepare(
        `INSERT INTO print_wastage_logs (
          id, station_id, paper_item_id, sheets_wasted, reason_code,
          estimated_loss_paise, job_number, note, actor_uid, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        id,
        stationId,
        paperItemId,
        sheetsWasted,
        reasonSpec.id,
        estimatedLossPaise,
        jobNumber,
        note,
        actor.uid,
        ts
      );

      if (deductInventory) {
        const invRow = db
          .prepare('SELECT id, current_qty FROM shop_inventory_items WHERE id = ?')
          .get(paperItemId) as { id: string; current_qty: number } | undefined;
        if (invRow) {
          const nextQty = Math.max(0, invRow.current_qty - sheetsWasted);
          db.prepare('UPDATE shop_inventory_items SET current_qty = ?, updated_at = ? WHERE id = ?').run(
            nextQty,
            ts,
            paperItemId
          );
          db.prepare(
            `INSERT INTO inventory_movements (
              id, item_id, movement_type, delta_qty, resulting_qty, job_number, reason, actor_uid, created_at
            ) VALUES (?, ?, 'deduct_wastage', ?, ?, ?, ?, ?, ?)`
          ).run(
            crypto.randomUUID(),
            paperItemId,
            -sheetsWasted,
            nextQty,
            jobNumber || null,
            `Wastage (${reasonSpec.label}): ${sheetsWasted} sheet(s)`,
            actor.uid,
            ts
          );
        }
      }

      const maintRow = db
        .prepare('SELECT station_id FROM printer_maintenance_counters WHERE station_id = ?')
        .get(stationId) as { station_id: string } | undefined;
      if (maintRow) {
        db.prepare(
          `UPDATE printer_maintenance_counters
           SET lifetime_pages = lifetime_pages + ?, pages_since_service = pages_since_service + ?
           WHERE station_id = ?`
        ).run(sheetsWasted, sheetsWasted, stationId);
      }

      db.exec('COMMIT');
    } catch (err) {
      try {
        db.exec('ROLLBACK');
      } catch {
        // ignore rollback failure
      }
      res.status(500).json({
        error: {
          code: 'WASTAGE_LOG_FAILED',
          message: err instanceof Error ? err.message : 'Unable to save wastage entry.',
        },
      });
      return;
    }

    res.status(201).json({
      entryId: id,
      estimatedLossPaise,
      state: getShopFloorToolsState(db),
    });
  });

  // Protected: Formula-safe Wastage CSV export
  router.get('/wastage/export', requireAdmin, (_req, res) => {
    const state = getShopFloorToolsState(db);
    const csv = buildWastageLogCsv(state.wastageLogs);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="aman-computer-wastage-log-${new Date().toISOString().slice(0, 10)}.csv"`
    );
    res.setHeader('Cache-Control', 'no-store');
    res.send(csv);
  });

  // Protected: Toggle individual Shift Checklist Task
  router.post('/checklist/toggle', requireAdmin, express.json({ limit: '8kb' }), (req, res) => {
    const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;
    const itemKey = typeof body.itemKey === 'string' ? body.itemKey.trim() : '';
    if (!itemKey) {
      res.status(400).json({ error: { code: 'MISSING_ITEM_KEY', message: 'itemKey is required.' } });
      return;
    }
    const existing = db
      .prepare('SELECT item_key, checked FROM shift_checklist_tasks WHERE item_key = ?')
      .get(itemKey) as { item_key: string; checked: number } | undefined;
    if (!existing) {
      res.status(404).json({ error: { code: 'TASK_NOT_FOUND', message: 'Checklist item not found.' } });
      return;
    }

    const nextChecked = body.checked === undefined ? (existing.checked ? 0 : 1) : body.checked ? 1 : 0;
    const ts = nextChecked ? new Date().toISOString() : null;
    db.prepare('UPDATE shift_checklist_tasks SET checked = ?, checked_at = ? WHERE item_key = ?').run(
      nextChecked,
      ts,
      itemKey
    );

    res.json({ state: getShopFloorToolsState(db) });
  });

  // Protected: Formal Shift Handoff Sign-Off
  router.post('/checklist/signoff', requireAdmin, express.json({ limit: '16kb' }), (req, res) => {
    const actor = (req as Request & { shopToolsActor: CounterAdminActor }).shopToolsActor;
    const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;

    const shiftType: ShiftType = body.shiftType === 'closing' ? 'closing' : 'opening';
    const operatorName =
      typeof body.operatorName === 'string' && body.operatorName.trim()
        ? body.operatorName.trim().slice(0, 60)
        : 'Counter Operator';
    const pettyCashInr = Math.max(0, Math.min(200000, Number(body.pettyCashInr) || 0));
    const pettyCashPaise = Math.round(pettyCashInr * 100);
    const notes = typeof body.notes === 'string' ? body.notes.trim().slice(0, 200) : '';
    const resetAfterSignoff = Boolean(body.resetAfterSignoff);

    const stateBefore = getShopFloorToolsState(db);
    const readiness = shiftType === 'opening' ? stateBefore.openingReadiness : stateBefore.closingReadiness;
    if (!readiness.readyForSignoff) {
      res.status(422).json({
        error: {
          code: 'CHECKLIST_INCOMPLETE',
          message: `Complete all required ${shiftType} checks (${readiness.requiredRemaining} remaining) before signing off.`,
        },
      });
      return;
    }

    const ts = new Date().toISOString();
    const id = crypto.randomUUID();

    try {
      db.exec('BEGIN');
      db.prepare(
        `INSERT INTO shift_handoff_signoffs (
          id, shift_date, shift_type, operator_name, petty_cash_paise,
          checked_count, total_count, notes, actor_uid, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        id,
        ts.slice(0, 10),
        shiftType,
        operatorName,
        pettyCashPaise,
        readiness.checkedCount,
        readiness.totalCount,
        notes,
        actor.uid,
        ts
      );

      if (resetAfterSignoff) {
        db.prepare('UPDATE shift_checklist_tasks SET checked = 0, checked_at = NULL WHERE shift_type = ?').run(
          shiftType
        );
      }
      db.exec('COMMIT');
    } catch (err) {
      try {
        db.exec('ROLLBACK');
      } catch {
        // ignore
      }
      res.status(500).json({
        error: {
          code: 'SIGNOFF_FAILED',
          message: err instanceof Error ? err.message : 'Unable to save shift sign-off.',
        },
      });
      return;
    }

    res.status(201).json({
      signoffId: id,
      state: getShopFloorToolsState(db),
    });
  });

  return router;
}
