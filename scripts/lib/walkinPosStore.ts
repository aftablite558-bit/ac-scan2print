// AC Scan2Print — Phase 19 Walk-In POS, Photo Sheet & Printer Maintenance SQLite Store & Express Router
// Enforces fail-closed Super Admin Bearer/Session auth, atomic inventory + Khata + page-life transactions,
// and formula-safe Walk-In CSV export.

import crypto from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import express, { type NextFunction, type Request, type Response } from 'express';
import type { JSONWebKeySet } from 'jose';
import { FINISHING_SERVICE_CATALOG, NUP_LAYOUT_OPTIONS } from './shopCounterOpsEngine.ts';
import {
  verifyFirebaseSuperAdminBearer,
  type CounterAdminActor,
} from './counterOpsStore.ts';
import {
  DEFAULT_PRINTER_MAINTENANCE,
  PHOTO_SHEET_PRESETS,
  buildWalkinPosLedgerCsv,
  computePhotoSheetLayout,
  evaluatePrinterMaintenance,
  evaluateWalkinPosCart,
  formatWalkinThermalSlip,
  type MaintenanceActionType,
  type WalkinCartLineInput,
  type WalkinPaymentMethod,
} from './walkinPosAndPhotoEngine.ts';

export function initWalkinPosSchema(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS walkin_pos_orders (
      id TEXT PRIMARY KEY,
      token_number TEXT NOT NULL UNIQUE,
      customer_name TEXT NOT NULL,
      customer_phone TEXT NOT NULL DEFAULT '',
      payment_method TEXT NOT NULL,
      khata_account_id TEXT,
      items_json TEXT NOT NULL,
      total_physical_sheets INTEGER NOT NULL DEFAULT 0,
      total_impressions INTEGER NOT NULL DEFAULT 0,
      gross_total_paise INTEGER NOT NULL,
      gst_taxable_paise INTEGER NOT NULL,
      cgst_paise INTEGER NOT NULL,
      sgst_paise INTEGER NOT NULL,
      slip_lines_json TEXT NOT NULL,
      actor_uid TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS printer_maintenance_counters (
      station_id TEXT PRIMARY KEY,
      printer_name TEXT NOT NULL,
      component_name TEXT NOT NULL,
      lifetime_pages INTEGER NOT NULL DEFAULT 0,
      pages_since_service INTEGER NOT NULL DEFAULT 0,
      service_interval_pages INTEGER NOT NULL DEFAULT 5000,
      last_serviced_at TEXT NOT NULL,
      last_service_note TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS printer_maintenance_logs (
      id TEXT PRIMARY KEY,
      station_id TEXT NOT NULL,
      action_type TEXT NOT NULL,
      reset_counter INTEGER NOT NULL DEFAULT 0,
      note TEXT NOT NULL,
      actor_uid TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (station_id) REFERENCES printer_maintenance_counters(station_id)
    );
  `);

  const now = new Date().toISOString();
  const seedMaint = db.prepare(`
    INSERT OR IGNORE INTO printer_maintenance_counters (
      station_id, printer_name, component_name, lifetime_pages,
      pages_since_service, service_interval_pages, last_serviced_at, last_service_note
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const row of DEFAULT_PRINTER_MAINTENANCE) {
    seedMaint.run(
      row.stationId,
      row.printerName,
      row.componentName,
      row.lifetimePages,
      row.pagesSinceService,
      row.serviceIntervalPages,
      now,
      row.lastServiceNote
    );
  }
}

export function getWalkinPosState(db: DatabaseSync) {
  const rawOrders = db
    .prepare('SELECT * FROM walkin_pos_orders ORDER BY created_at DESC LIMIT 30')
    .all() as Array<{
    id: string;
    token_number: string;
    customer_name: string;
    customer_phone: string;
    payment_method: WalkinPaymentMethod;
    khata_account_id: string | null;
    items_json: string;
    total_physical_sheets: number;
    total_impressions: number;
    gross_total_paise: number;
    gst_taxable_paise: number;
    cgst_paise: number;
    sgst_paise: number;
    slip_lines_json: string;
    created_at: string;
  }>;

  const orders = rawOrders.map((o) => ({
    id: o.id,
    tokenNumber: o.token_number,
    customerName: o.customer_name,
    customerPhone: o.customer_phone,
    paymentMethod: o.payment_method,
    khataAccountId: o.khata_account_id,
    items: JSON.parse(o.items_json) as unknown[],
    totalPhysicalSheets: o.total_physical_sheets,
    totalImpressions: o.total_impressions,
    grossTotalPaise: o.gross_total_paise,
    grossTotalInr: Number((o.gross_total_paise / 100).toFixed(2)),
    slipLines: JSON.parse(o.slip_lines_json) as string[],
    createdAt: o.created_at,
  }));

  const rawMaint = db
    .prepare('SELECT * FROM printer_maintenance_counters ORDER BY station_id ASC')
    .all() as Array<{
    station_id: string;
    printer_name: string;
    component_name: string;
    lifetime_pages: number;
    pages_since_service: number;
    service_interval_pages: number;
    last_serviced_at: string;
    last_service_note: string;
  }>;

  const maintenanceCounters = rawMaint.map((m) =>
    evaluatePrinterMaintenance({
      stationId: m.station_id,
      printerName: m.printer_name,
      componentName: m.component_name,
      lifetimePages: m.lifetime_pages,
      pagesSinceService: m.pages_since_service,
      serviceIntervalPages: m.service_interval_pages,
      lastServicedAt: m.last_serviced_at,
      lastServiceNote: m.last_service_note,
    })
  );

  const maintenanceLogs = db
    .prepare(
      `SELECT l.*, c.printer_name
       FROM printer_maintenance_logs l
       JOIN printer_maintenance_counters c ON c.station_id = l.station_id
       ORDER BY l.created_at DESC LIMIT 20`
    )
    .all() as Array<{
    id: string;
    station_id: string;
    printer_name: string;
    action_type: MaintenanceActionType;
    reset_counter: number;
    note: string;
    created_at: string;
  }>;

  const khataAccounts = db
    .prepare('SELECT id, client_name, client_type, credit_limit_paise, balance_due_paise FROM khata_accounts ORDER BY client_name ASC')
    .all() as Array<{
    id: string;
    client_name: string;
    client_type: string;
    credit_limit_paise: number;
    balance_due_paise: number;
  }>;

  const cashWalkinPaise = orders
    .filter((o) => o.paymentMethod === 'cash')
    .reduce((s, o) => s + o.grossTotalPaise, 0);
  const upiWalkinPaise = orders
    .filter((o) => o.paymentMethod === 'upi')
    .reduce((s, o) => s + o.grossTotalPaise, 0);
  const khataWalkinPaise = orders
    .filter((o) => o.paymentMethod === 'khata')
    .reduce((s, o) => s + o.grossTotalPaise, 0);

  return {
    checkedAtIso: new Date().toISOString(),
    orders,
    summary: {
      totalWalkinBills: orders.length,
      totalWalkinRevenueInr: Number(((cashWalkinPaise + upiWalkinPaise + khataWalkinPaise) / 100).toFixed(2)),
      cashWalkinInr: Number((cashWalkinPaise / 100).toFixed(2)),
      upiWalkinInr: Number((upiWalkinPaise / 100).toFixed(2)),
      khataWalkinInr: Number((khataWalkinPaise / 100).toFixed(2)),
      dueMaintenanceCount: maintenanceCounters.filter((m) => m.healthStatus !== 'healthy').length,
    },
    maintenanceCounters,
    maintenanceLogs,
    khataAccounts: khataAccounts.map((k) => ({
      id: k.id,
      clientName: k.client_name,
      clientType: k.client_type,
      creditLimitPaise: k.credit_limit_paise,
      balanceDuePaise: k.balance_due_paise,
    })),
  };
}

export function createWalkinPosRouter(config: {
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
      (req as Request & { posActor: CounterAdminActor }).posActor = sessionActor;
      next();
      return;
    }

    const firebaseActor = await verifyFirebaseSuperAdminBearer(req.headers.authorization, {
      projectId: config.firebaseProjectId,
      expectedUid: config.superAdminUid,
      localJwks: config.localJwks,
    });
    if (firebaseActor) {
      (req as Request & { posActor: CounterAdminActor }).posActor = firebaseActor;
      next();
      return;
    }

    res.status(401).json({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Admin authentication required for Walk-In POS and Printer Maintenance logs.',
      },
    });
  };

  // Public presets for Customer Photo Sheet Maker & Counter Rate Preview
  router.get('/presets', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json({
      photoPresets: PHOTO_SHEET_PRESETS,
      finishingServices: FINISHING_SERVICE_CATALOG,
      nupOptions: NUP_LAYOUT_OPTIONS,
    });
  });

  // Public 300-DPI Photo Sheet layout & quote calculator
  router.post('/photo-layout', express.json({ limit: '16kb' }), (req, res) => {
    const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;
    const layout = computePhotoSheetLayout({
      presetId: typeof body.presetId === 'string' ? body.presetId : 'passport_4x6_8',
      sheetCopies: Number(body.sheetCopies) || 1,
      activeSlotCount: body.activeSlotCount !== undefined ? Number(body.activeSlotCount) : undefined,
    });
    res.setHeader('Cache-Control', 'no-store');
    res.json({ layout });
  });

  // Protected Admin POS & Maintenance state
  router.get('/state', requireAdmin, (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json(getWalkinPosState(db));
  });

  // Protected Atomic Walk-In Order Settlement (POS Cart -> Stock Deduction -> Khata Debit -> Printer Life)
  router.post('/orders', requireAdmin, express.json({ limit: '32kb' }), (req, res) => {
    const actor = (req as Request & { posActor: CounterAdminActor }).posActor;
    const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;
    const rawItems = Array.isArray(body.items) ? (body.items as WalkinCartLineInput[]) : [];

    if (rawItems.length === 0) {
      res.status(400).json({
        error: { code: 'EMPTY_POS_CART', message: 'Add at least one print, photo sheet, or service item.' },
      });
      return;
    }

    const customerName =
      typeof body.customerName === 'string' && body.customerName.trim()
        ? body.customerName.trim().slice(0, 80)
        : 'Walk-in Counter Customer';
    const customerPhone =
      typeof body.customerPhone === 'string' ? body.customerPhone.trim().slice(0, 20) : '';
    const paymentMethod: WalkinPaymentMethod =
      body.paymentMethod === 'upi' || body.paymentMethod === 'khata' ? body.paymentMethod : 'cash';
    const khataAccountId =
      typeof body.khataAccountId === 'string' ? body.khataAccountId.trim() : '';
    const deductInventory = body.deductInventory !== false;

    const tokenNumber = `W-${Math.floor(1000 + Math.random() * 8999)}-${Date.now().toString().slice(-3)}`;
    const quote = evaluateWalkinPosCart(rawItems, tokenNumber);

    if (quote.grossTotalPaise <= 0) {
      res.status(400).json({
        error: { code: 'INVALID_TOTAL', message: 'Walk-in bill total must exceed ₹0.00.' },
      });
      return;
    }

    if (paymentMethod === 'khata' && !khataAccountId) {
      res.status(400).json({
        error: { code: 'KHATA_ACCOUNT_REQUIRED', message: 'Select a regular Khata client account for credit billing.' },
      });
      return;
    }

    const now = new Date().toISOString();
    const orderId = crypto.randomUUID();
    let khataAccountName: string | undefined;

    db.exec('BEGIN');
    try {
      // 1. Khata settlement check & debit if paymentMethod === 'khata'
      if (paymentMethod === 'khata') {
        const account = db
          .prepare('SELECT id, client_name, credit_limit_paise, balance_due_paise FROM khata_accounts WHERE id = ?')
          .get(khataAccountId) as
          | { id: string; client_name: string; credit_limit_paise: number; balance_due_paise: number }
          | undefined;

        if (!account) {
          db.exec('ROLLBACK');
          res.status(404).json({
            error: { code: 'KHATA_ACCOUNT_NOT_FOUND', message: 'Selected Khata client account does not exist.' },
          });
          return;
        }

        const nextDuePaise = account.balance_due_paise + quote.grossTotalPaise;
        if (nextDuePaise > account.credit_limit_paise) {
          db.exec('ROLLBACK');
          res.status(422).json({
            error: {
              code: 'CREDIT_LIMIT_EXCEEDED',
              message: `${account.client_name} credit limit (₹${(account.credit_limit_paise / 100).toFixed(2)}) exceeded by this bill.`,
            },
          });
          return;
        }

        khataAccountName = account.client_name;
        db.prepare('UPDATE khata_accounts SET balance_due_paise = ?, updated_at = ? WHERE id = ?').run(
          nextDuePaise,
          now,
          account.id
        );
        db.prepare(
          `INSERT INTO khata_transactions (
            id, account_id, entry_type, amount_paise, payment_mode, reference_note, actor_uid, created_at
          ) VALUES (?, ?, 'debit_print', ?, 'khata', ?, ?, ?)`
        ).run(
          crypto.randomUUID(),
          account.id,
          quote.grossTotalPaise,
          `Walk-In POS ${tokenNumber}: ${quote.lines.map((l) => l.label).join('; ').slice(0, 100)}`,
          actor.uid,
          now
        );
      }

      // 2. Auto-deduct paper, toner/ink & finishing stock from Phase 18 inventory
      if (deductInventory) {
        for (const stockLine of quote.stockImpact) {
          const item = db
            .prepare('SELECT current_qty FROM shop_inventory_items WHERE id = ?')
            .get(stockLine.itemId) as { current_qty: number } | undefined;
          if (!item) continue;
          const nextQty = Math.max(0, item.current_qty - stockLine.deltaQty);
          db.prepare('UPDATE shop_inventory_items SET current_qty = ?, updated_at = ? WHERE id = ?').run(
            nextQty,
            now,
            stockLine.itemId
          );
          db.prepare(
            `INSERT INTO inventory_movements (
              id, item_id, movement_type, delta_qty, resulting_qty, job_number, reason, actor_uid, created_at
            ) VALUES (?, ?, 'deduct_job', ?, ?, ?, ?, ?, ?)`
          ).run(
            crypto.randomUUID(),
            stockLine.itemId,
            -stockLine.deltaQty,
            nextQty,
            tokenNumber,
            stockLine.reason,
            actor.uid,
            now
          );
        }
      }

      // 3. Increment printer drum/head page-life counters + 1 slip on thermal printer
      for (const usage of quote.printerUsage) {
        db.prepare(
          `UPDATE printer_maintenance_counters
           SET lifetime_pages = lifetime_pages + ?, pages_since_service = pages_since_service + ?
           WHERE station_id = ?`
        ).run(usage.deltaPages, usage.deltaPages, usage.stationId);
      }
      db.prepare(
        `UPDATE printer_maintenance_counters
         SET lifetime_pages = lifetime_pages + 1, pages_since_service = pages_since_service + 1
         WHERE station_id = 'station-4-thermal-pos'`
      ).run();

      // 4. Generate 80mm thermal slip & persist order
      const slipLines = formatWalkinThermalSlip({
        tokenNumber,
        customerName: khataAccountName || customerName,
        paymentMethod,
        khataAccountName,
        quote,
        createdAtIso: now,
      });

      db.prepare(
        `INSERT INTO walkin_pos_orders (
          id, token_number, customer_name, customer_phone, payment_method, khata_account_id,
          items_json, total_physical_sheets, total_impressions, gross_total_paise,
          gst_taxable_paise, cgst_paise, sgst_paise, slip_lines_json, actor_uid, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        orderId,
        tokenNumber,
        khataAccountName || customerName,
        customerPhone,
        paymentMethod,
        paymentMethod === 'khata' ? khataAccountId : null,
        JSON.stringify(quote.lines),
        quote.totalPhysicalSheets,
        quote.totalImpressions,
        quote.grossTotalPaise,
        Math.round(quote.gstTaxableInr * 100),
        Math.round(quote.cgstInr * 100),
        Math.round(quote.sgstInr * 100),
        JSON.stringify(slipLines),
        actor.uid,
        now
      );

      db.exec('COMMIT');

      res.status(201).json({
        ok: true,
        orderId,
        tokenNumber,
        quote,
        slipLines,
        state: getWalkinPosState(db),
      });
    } catch (err) {
      db.exec('ROLLBACK');
      res.status(500).json({
        error: {
          code: 'WALKIN_POS_FAILED',
          message: err instanceof Error ? err.message : 'Unable to complete walk-in POS bill.',
        },
      });
    }
  });

  // Protected CSV Export of Walk-In POS Bills
  router.get('/orders/export', requireAdmin, (_req, res) => {
    const state = getWalkinPosState(db);
    const csv = buildWalkinPosLedgerCsv(state.orders);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="aman-computer-walkin-pos-ledger.csv"');
    res.setHeader('Cache-Control', 'no-store');
    res.send(csv);
  });

  // Protected Printer Maintenance Action / Service Reset Log
  router.post('/maintenance/log', requireAdmin, express.json({ limit: '16kb' }), (req, res) => {
    const actor = (req as Request & { posActor: CounterAdminActor }).posActor;
    const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;
    const stationId = typeof body.stationId === 'string' ? body.stationId.trim() : '';
    const actionType: MaintenanceActionType =
      body.actionType === 'nozzle_check_clean' ||
      body.actionType === 'drum_wipe' ||
      body.actionType === 'roller_clean' ||
      body.actionType === 'jam_cleared' ||
      body.actionType === 'consumable_part_replaced'
        ? body.actionType
        : 'nozzle_check_clean';
    const resetCounter = Boolean(body.resetCounter);
    const note =
      typeof body.note === 'string' && body.note.trim()
        ? body.note.trim().slice(0, 160)
        : `Completed ${actionType.replace(/_/g, ' ')}`;

    const counter = db
      .prepare('SELECT station_id FROM printer_maintenance_counters WHERE station_id = ?')
      .get(stationId) as { station_id: string } | undefined;
    if (!counter) {
      res.status(404).json({
        error: { code: 'STATION_NOT_FOUND', message: 'Printer station not found.' },
      });
      return;
    }

    const now = new Date().toISOString();
    db.exec('BEGIN');
    try {
      db.prepare(
        `INSERT INTO printer_maintenance_logs (
          id, station_id, action_type, reset_counter, note, actor_uid, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run(crypto.randomUUID(), stationId, actionType, resetCounter ? 1 : 0, note, actor.uid, now);

      if (resetCounter) {
        db.prepare(
          `UPDATE printer_maintenance_counters
           SET pages_since_service = 0, last_serviced_at = ?, last_service_note = ?
           WHERE station_id = ?`
        ).run(now, note, stationId);
      } else {
        db.prepare(
          `UPDATE printer_maintenance_counters
           SET last_serviced_at = ?, last_service_note = ?
           WHERE station_id = ?`
        ).run(now, note, stationId);
      }
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      res.status(500).json({
        error: { code: 'MAINTENANCE_LOG_FAILED', message: err instanceof Error ? err.message : 'Unable to save log.' },
      });
      return;
    }

    res.status(201).json({ ok: true, state: getWalkinPosState(db) });
  });

  return router;
}
