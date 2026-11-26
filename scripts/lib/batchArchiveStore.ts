// AC Scan2Print — Phase 21: Bulk Coaching Batches, Saved Shop Templates & Print Archive Store & Router
// Enforces fail-closed Super Admin auth on mutations/archive, atomic Phase 18 inventory + Khata
// + Phase 19 printer counter updates, and OWASP formula-safe archive CSV exports.

import crypto from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import express, { type NextFunction, type Request, type Response } from 'express';
import type { JSONWebKeySet } from 'jose';
import { verifyFirebaseSuperAdminBearer, type CounterAdminActor } from './counterOpsStore.ts';
import {
  BATCH_VOLUME_TIERS,
  DEFAULT_SHOP_JOB_TEMPLATES,
  buildUnifiedArchiveCsv,
  evaluateBulkBatchQuote,
  filterPrintArchiveEntries,
  type ArchiveSourceType,
  type BatchDocumentLineInput,
  type ShopJobTemplateRecord,
  type UnifiedPrintArchiveEntry,
} from './batchArchiveEngine.ts';
import type { WalkinPaymentMethod } from './walkinPosAndPhotoEngine.ts';

export function initBatchArchiveSchema(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS print_job_templates (
      id TEXT PRIMARY KEY,
      template_name TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'custom',
      description TEXT NOT NULL DEFAULT '',
      default_sets INTEGER NOT NULL DEFAULT 1,
      items_json TEXT NOT NULL,
      is_system INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS print_bulk_batches (
      id TEXT PRIMARY KEY,
      batch_ref TEXT NOT NULL UNIQUE,
      batch_title TEXT NOT NULL,
      customer_name TEXT NOT NULL,
      payment_method TEXT NOT NULL,
      khata_account_id TEXT,
      student_sets INTEGER NOT NULL DEFAULT 1,
      total_physical_sheets INTEGER NOT NULL DEFAULT 0,
      volume_tier_id TEXT NOT NULL,
      discount_pct INTEGER NOT NULL DEFAULT 0,
      gross_total_paise INTEGER NOT NULL,
      items_json TEXT NOT NULL,
      job_card_json TEXT NOT NULL,
      actor_uid TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);

  const now = new Date().toISOString();
  const seedTpl = db.prepare(`
    INSERT OR IGNORE INTO print_job_templates (
      id, template_name, category, description, default_sets, items_json, is_system, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const tpl of DEFAULT_SHOP_JOB_TEMPLATES) {
    seedTpl.run(
      tpl.id,
      tpl.templateName,
      tpl.category,
      tpl.description,
      tpl.defaultSets,
      JSON.stringify(tpl.items),
      tpl.isSystem ? 1 : 0,
      now
    );
  }
}

function listTemplates(db: DatabaseSync): ShopJobTemplateRecord[] {
  const rows = db
    .prepare('SELECT * FROM print_job_templates ORDER BY is_system DESC, created_at DESC')
    .all() as Array<{
    id: string;
    template_name: string;
    category: ShopJobTemplateRecord['category'];
    description: string;
    default_sets: number;
    items_json: string;
    is_system: number;
    created_at: string;
  }>;

  return rows.map((r) => {
    let items: BatchDocumentLineInput[] = [];
    try {
      items = JSON.parse(r.items_json) as BatchDocumentLineInput[];
    } catch {
      items = [];
    }
    return {
      id: r.id,
      templateName: r.template_name,
      category: r.category,
      description: r.description,
      defaultSets: r.default_sets,
      items,
      isSystem: Boolean(r.is_system),
      createdAt: r.created_at,
    };
  });
}

function queryUnifiedArchiveEntries(db: DatabaseSync): UnifiedPrintArchiveEntry[] {
  const entries: UnifiedPrintArchiveEntry[] = [];

  try {
    const posRows = db
      .prepare('SELECT id, token_number, customer_name, payment_method, total_physical_sheets, gross_total_paise, items_json, created_at FROM walkin_pos_orders ORDER BY created_at DESC LIMIT 100')
      .all() as Array<{
      id: string;
      token_number: string;
      customer_name: string;
      payment_method: string;
      total_physical_sheets: number;
      gross_total_paise: number;
      items_json: string;
      created_at: string;
    }>;
    for (const r of posRows) {
      entries.push({
        id: `walkin-${r.id}`,
        sourceType: 'walkin',
        refCode: r.token_number,
        titleOrCustomer: r.customer_name,
        paymentMethod: r.payment_method,
        physicalSheets: r.total_physical_sheets,
        amountPaise: r.gross_total_paise,
        summaryNote: 'Direct Walk-In POS receipt',
        createdAt: r.created_at,
      });
    }
  } catch {
    // walkin table optional
  }

  const batchRows = db
    .prepare('SELECT id, batch_ref, batch_title, customer_name, payment_method, student_sets, total_physical_sheets, discount_pct, gross_total_paise, created_at FROM print_bulk_batches ORDER BY created_at DESC LIMIT 100')
    .all() as Array<{
    id: string;
    batch_ref: string;
    batch_title: string;
    customer_name: string;
    payment_method: string;
    student_sets: number;
    total_physical_sheets: number;
    discount_pct: number;
    gross_total_paise: number;
    created_at: string;
  }>;
  for (const b of batchRows) {
    entries.push({
      id: `batch-${b.id}`,
      sourceType: 'batch',
      refCode: b.batch_ref,
      titleOrCustomer: `${b.batch_title} (${b.customer_name})`,
      paymentMethod: b.payment_method,
      physicalSheets: b.total_physical_sheets,
      amountPaise: b.gross_total_paise,
      summaryNote: `${b.student_sets} sets · ${b.discount_pct}% bulk slab`,
      createdAt: b.created_at,
    });
  }

  try {
    const wasteRows = db
      .prepare('SELECT id, station_id, paper_item_id, sheets_wasted, reason_code, estimated_loss_paise, job_number, note, created_at FROM print_wastage_logs ORDER BY created_at DESC LIMIT 100')
      .all() as Array<{
      id: string;
      station_id: string;
      paper_item_id: string;
      sheets_wasted: number;
      reason_code: string;
      estimated_loss_paise: number;
      job_number: string;
      note: string;
      created_at: string;
    }>;
    for (const w of wasteRows) {
      entries.push({
        id: `wastage-${w.id}`,
        sourceType: 'wastage',
        refCode: w.job_number || w.id.slice(0, 8).toUpperCase(),
        titleOrCustomer: `${w.paper_item_id} (${w.reason_code.replace('_', ' ')})`,
        paymentMethod: 'internal',
        physicalSheets: w.sheets_wasted,
        amountPaise: -Math.abs(w.estimated_loss_paise),
        summaryNote: `${w.station_id}${w.note ? ` · ${w.note}` : ''}`,
        createdAt: w.created_at,
      });
    }
  } catch {
    // wastage table optional
  }

  return entries.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export function getBatchArchiveState(
  db: DatabaseSync,
  filters: {
    q?: string;
    sourceType?: 'all' | ArchiveSourceType;
    paymentMethod?: 'all' | 'cash' | 'upi' | 'khata' | 'internal';
    dateFrom?: string;
    dateTo?: string;
  } = {}
) {
  const templates = listTemplates(db);
  const batches = db
    .prepare('SELECT * FROM print_bulk_batches ORDER BY created_at DESC LIMIT 25')
    .all() as Array<{
    id: string;
    batch_ref: string;
    batch_title: string;
    customer_name: string;
    payment_method: WalkinPaymentMethod;
    student_sets: number;
    total_physical_sheets: number;
    volume_tier_id: string;
    discount_pct: number;
    gross_total_paise: number;
    job_card_json: string;
    created_at: string;
  }>;

  const recentBatches = batches.map((b) => {
    let jobCardLines: string[] = [];
    try {
      jobCardLines = JSON.parse(b.job_card_json) as string[];
    } catch {
      jobCardLines = [];
    }
    return {
      id: b.id,
      batchRef: b.batch_ref,
      batchTitle: b.batch_title,
      customerName: b.customer_name,
      paymentMethod: b.payment_method,
      studentSets: b.student_sets,
      totalPhysicalSheets: b.total_physical_sheets,
      volumeTierId: b.volume_tier_id,
      discountPct: b.discount_pct,
      grossTotalPaise: b.gross_total_paise,
      grossTotalInr: Number((b.gross_total_paise / 100).toFixed(2)),
      jobCardLines,
      createdAt: b.created_at,
    };
  });

  const allArchive = queryUnifiedArchiveEntries(db);
  const filteredArchive = filterPrintArchiveEntries(allArchive, filters);

  const archiveSummary = {
    matchedCount: filteredArchive.length,
    totalSheets: filteredArchive.reduce((acc, row) => acc + row.physicalSheets, 0),
    netSalesPaise: filteredArchive
      .filter((row) => row.sourceType !== 'wastage')
      .reduce((acc, row) => acc + row.amountPaise, 0),
    wastageLossPaise: filteredArchive
      .filter((row) => row.sourceType === 'wastage')
      .reduce((acc, row) => acc + Math.abs(row.amountPaise), 0),
  };

  return {
    checkedAtIso: new Date().toISOString(),
    volumeTiers: BATCH_VOLUME_TIERS,
    templates,
    recentBatches,
    archiveEntries: filteredArchive,
    archiveSummary,
  };
}

export function createBatchArchiveRouter(config: {
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
      (req as Request & { batchActor: CounterAdminActor }).batchActor = sessionActor;
      next();
      return;
    }

    const firebaseActor = await verifyFirebaseSuperAdminBearer(req.headers.authorization, {
      projectId: config.firebaseProjectId,
      expectedUid: config.superAdminUid,
      localJwks: config.localJwks,
    });
    if (firebaseActor) {
      (req as Request & { batchActor: CounterAdminActor }).batchActor = firebaseActor;
      next();
      return;
    }

    res.status(401).json({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Admin authentication required for Bulk Batches, Templates & Archive.',
      },
    });
  };

  // Public: Preset shop packets + Volume discount tiers
  router.get('/public-presets', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json({
      volumeTiers: BATCH_VOLUME_TIERS,
      templates: listTemplates(db),
    });
  });

  // Public: Real-time bulk coaching batch slab calculator
  router.post('/quote', express.json({ limit: '32kb' }), (req, res) => {
    const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;
    const items = Array.isArray(body.items) ? (body.items as BatchDocumentLineInput[]) : [];
    if (items.length === 0) {
      res.status(400).json({ error: { code: 'EMPTY_BATCH', message: 'Add at least 1 document row.' } });
      return;
    }
    const quote = evaluateBulkBatchQuote({
      batchTitle: typeof body.batchTitle === 'string' ? body.batchTitle : 'Student Notes Batch',
      studentSets: Number(body.studentSets) || 1,
      items,
    });
    res.setHeader('Cache-Control', 'no-store');
    res.json({ quote });
  });

  // Protected: Admin workspace state + archive search filters
  router.get('/state', requireAdmin, (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const sourceType =
      req.query.sourceType === 'walkin' ||
      req.query.sourceType === 'batch' ||
      req.query.sourceType === 'wastage'
        ? req.query.sourceType
        : 'all';
    const paymentMethod =
      req.query.paymentMethod === 'cash' ||
      req.query.paymentMethod === 'upi' ||
      req.query.paymentMethod === 'khata' ||
      req.query.paymentMethod === 'internal'
        ? req.query.paymentMethod
        : 'all';

    res.json(
      getBatchArchiveState(db, {
        q: typeof req.query.q === 'string' ? req.query.q : undefined,
        sourceType,
        paymentMethod,
        dateFrom: typeof req.query.dateFrom === 'string' ? req.query.dateFrom : undefined,
        dateTo: typeof req.query.dateTo === 'string' ? req.query.dateTo : undefined,
      })
    );
  });

  // Protected: Commit a Bulk Batch Job Card atomically with inventory + Khata + printer counters
  router.post('/batches', requireAdmin, express.json({ limit: '64kb' }), (req, res) => {
    const actor = (req as Request & { batchActor: CounterAdminActor }).batchActor;
    const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;

    const items = Array.isArray(body.items) ? (body.items as BatchDocumentLineInput[]) : [];
    if (items.length === 0) {
      res.status(400).json({ error: { code: 'EMPTY_BATCH', message: 'At least 1 document item is required.' } });
      return;
    }

    const batchTitle =
      typeof body.batchTitle === 'string' && body.batchTitle.trim()
        ? body.batchTitle.trim().slice(0, 80)
        : 'Coaching Notes Batch';
    const customerName =
      typeof body.customerName === 'string' && body.customerName.trim()
        ? body.customerName.trim().slice(0, 80)
        : 'Walk-in Student Batch';
    const paymentMethod: WalkinPaymentMethod =
      body.paymentMethod === 'upi' || body.paymentMethod === 'khata' ? body.paymentMethod : 'cash';
    const khataAccountId =
      typeof body.khataAccountId === 'string' && body.khataAccountId.trim()
        ? body.khataAccountId.trim()
        : null;
    const deductInventory = body.deductInventory !== false;

    const existingCountRow = db.prepare('SELECT COUNT(*) AS cnt FROM print_bulk_batches').get() as {
      cnt: number;
    };
    const batchRef = `B-${1001 + existingCountRow.cnt}`;
    const quote = evaluateBulkBatchQuote({
      batchTitle,
      batchRef,
      studentSets: Number(body.studentSets) || 1,
      items,
    });

    const now = new Date().toISOString();
    const id = crypto.randomUUID();

    try {
      db.exec('BEGIN');

      if (paymentMethod === 'khata') {
        if (!khataAccountId) {
          db.exec('ROLLBACK');
          res.status(400).json({
            error: { code: 'KHATA_REQUIRED', message: 'Select a Regular Client Khata account.' },
          });
          return;
        }
        const acct = db
          .prepare('SELECT id, client_name, balance_due_paise, credit_limit_paise FROM khata_accounts WHERE id = ?')
          .get(khataAccountId) as
          | {
              id: string;
              client_name: string;
              balance_due_paise: number;
              credit_limit_paise: number;
            }
          | undefined;
        if (!acct) {
          db.exec('ROLLBACK');
          res.status(404).json({ error: { code: 'KHATA_NOT_FOUND', message: 'Active Khata account not found.' } });
          return;
        }
        const nextDue = acct.balance_due_paise + quote.grossTotalPaise;
        if (nextDue > acct.credit_limit_paise) {
          db.exec('ROLLBACK');
          res.status(422).json({
            error: {
              code: 'KHATA_LIMIT_EXCEEDED',
              message: `Batch ₹${quote.grossTotalInr.toFixed(2)} exceeds Khata limit for ${acct.client_name}.`,
            },
          });
          return;
        }
        db.prepare('UPDATE khata_accounts SET balance_due_paise = ?, updated_at = ? WHERE id = ?').run(
          nextDue,
          now,
          acct.id
        );
        db.prepare(
          `INSERT INTO khata_transactions (
            id, account_id, entry_type, amount_paise, payment_mode, reference_note, actor_uid, created_at
          ) VALUES (?, ?, 'debit_print', ?, 'khata', ?, ?, ?)`
        ).run(
          crypto.randomUUID(),
          acct.id,
          quote.grossTotalPaise,
          `Bulk Batch ${batchRef}: ${batchTitle} (${quote.studentSets} sets)`,
          actor.uid,
          now
        );
      }

      if (deductInventory) {
        for (const stock of quote.stockImpact) {
          const item = db
            .prepare('SELECT current_qty FROM shop_inventory_items WHERE id = ?')
            .get(stock.itemId) as { current_qty: number } | undefined;
          if (!item) continue;
          const nextQty = Math.max(0, item.current_qty - stock.deltaQty);
          db.prepare('UPDATE shop_inventory_items SET current_qty = ?, updated_at = ? WHERE id = ?').run(
            nextQty,
            now,
            stock.itemId
          );
          db.prepare(
            `INSERT INTO inventory_movements (
              id, item_id, movement_type, delta_qty, resulting_qty, job_number, reason, actor_uid, created_at
            ) VALUES (?, ?, 'deduct_job', ?, ?, ?, ?, ?, ?)`
          ).run(
            crypto.randomUUID(),
            stock.itemId,
            -stock.deltaQty,
            nextQty,
            batchRef,
            stock.reason,
            actor.uid,
            now
          );
        }
      }

      for (const usage of quote.printerUsage) {
        db.prepare(
          `UPDATE printer_maintenance_counters
           SET lifetime_pages = lifetime_pages + ?, pages_since_service = pages_since_service + ?
           WHERE station_id = ?`
        ).run(usage.deltaPages, usage.deltaPages, usage.stationId);
      }

      db.prepare(
        `INSERT INTO print_bulk_batches (
          id, batch_ref, batch_title, customer_name, payment_method, khata_account_id,
          student_sets, total_physical_sheets, volume_tier_id, discount_pct, gross_total_paise,
          items_json, job_card_json, actor_uid, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        id,
        batchRef,
        batchTitle,
        customerName,
        paymentMethod,
        khataAccountId,
        quote.studentSets,
        quote.totalPhysicalSheets,
        quote.volumeTier.id,
        quote.volumeTier.discountPct,
        quote.grossTotalPaise,
        JSON.stringify(quote.lines),
        JSON.stringify(quote.jobCardLines),
        actor.uid,
        now
      );

      db.exec('COMMIT');
    } catch (err) {
      try {
        db.exec('ROLLBACK');
      } catch {
        // ignore rollback error
      }
      res.status(500).json({
        error: {
          code: 'BATCH_COMMIT_FAILED',
          message: err instanceof Error ? err.message : 'Unable to commit batch.',
        },
      });
      return;
    }

    res.status(201).json({
      batchId: id,
      batchRef,
      quote,
      state: getBatchArchiveState(db),
    });
  });

  // Protected: Save custom counter job template
  router.post('/templates', requireAdmin, express.json({ limit: '32kb' }), (req, res) => {
    const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;
    const templateName = typeof body.templateName === 'string' ? body.templateName.trim().slice(0, 80) : '';
    const items = Array.isArray(body.items) ? (body.items as BatchDocumentLineInput[]) : [];
    if (!templateName || items.length === 0) {
      res.status(400).json({
        error: { code: 'INVALID_TEMPLATE', message: 'templateName and at least 1 document item are required.' },
      });
      return;
    }
    const category: ShopJobTemplateRecord['category'] =
      body.category === 'exam_packet' ||
      body.category === 'coaching_notes' ||
      body.category === 'office_combo'
        ? body.category
        : 'custom';
    const description = typeof body.description === 'string' ? body.description.trim().slice(0, 180) : '';
    const defaultSets = Math.max(1, Math.min(500, Math.round(Number(body.defaultSets) || 1)));
    const id = `tpl-custom-${crypto.randomUUID().slice(0, 8)}`;

    db.prepare(
      `INSERT INTO print_job_templates (
        id, template_name, category, description, default_sets, items_json, is_system, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, 0, ?)`
    ).run(id, templateName, category, description, defaultSets, JSON.stringify(items), new Date().toISOString());

    res.status(201).json({
      templateId: id,
      state: getBatchArchiveState(db),
    });
  });

  // Protected: Delete custom template (system presets protected)
  router.delete('/templates/:id', requireAdmin, (req, res) => {
    const id = String(req.params.id || '').trim();
    const row = db.prepare('SELECT id, is_system FROM print_job_templates WHERE id = ?').get(id) as
      | { id: string; is_system: number }
      | undefined;
    if (!row) {
      res.status(404).json({ error: { code: 'TEMPLATE_NOT_FOUND', message: 'Template not found.' } });
      return;
    }
    if (row.is_system) {
      res.status(403).json({
        error: { code: 'SYSTEM_TEMPLATE_LOCKED', message: 'Default shop templates cannot be deleted.' },
      });
      return;
    }
    db.prepare('DELETE FROM print_job_templates WHERE id = ?').run(id);
    res.json({ state: getBatchArchiveState(db) });
  });

  // Protected: Formula-safe Unified Archive CSV Export
  router.get('/archive/export', requireAdmin, (req, res) => {
    const sourceType =
      req.query.sourceType === 'walkin' ||
      req.query.sourceType === 'batch' ||
      req.query.sourceType === 'wastage'
        ? req.query.sourceType
        : 'all';
    const paymentMethod =
      req.query.paymentMethod === 'cash' ||
      req.query.paymentMethod === 'upi' ||
      req.query.paymentMethod === 'khata' ||
      req.query.paymentMethod === 'internal'
        ? req.query.paymentMethod
        : 'all';

    const state = getBatchArchiveState(db, {
      q: typeof req.query.q === 'string' ? req.query.q : undefined,
      sourceType,
      paymentMethod,
      dateFrom: typeof req.query.dateFrom === 'string' ? req.query.dateFrom : undefined,
      dateTo: typeof req.query.dateTo === 'string' ? req.query.dateTo : undefined,
    });
    const csv = buildUnifiedArchiveCsv(state.archiveEntries);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="aman-computer-print-archive-${new Date().toISOString().slice(0, 10)}.csv"`
    );
    res.setHeader('Cache-Control', 'no-store');
    res.send(csv);
  });

  return router;
}
