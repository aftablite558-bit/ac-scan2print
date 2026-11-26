// AC Scan2Print — Phase 18 Counter Operations SQLite Store & Express Router
// Handles Paper/Toner Stock Inventory, Job Stock Auto-Deduction, Shift Cash Drawer Tally,
// and Regular-Customer Khata Credit Ledger with transactional SQLite integrity & Firebase/Session Auth.

import crypto from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import express, { type NextFunction, type Request, type Response } from 'express';
import {
  createLocalJWKSet,
  createRemoteJWKSet,
  decodeProtectedHeader,
  jwtVerify,
  type JSONWebKeySet,
} from 'jose';
import {
  DEFAULT_SHOP_INVENTORY,
  FINISHING_SERVICE_CATALOG,
  NUP_LAYOUT_OPTIONS,
  buildCashTallyCsv,
  buildKhataStatementCsv,
  calculatePhase18OrderQuote,
  computeCashDrawerTally,
  computeStockDeductionPlan,
  evaluateInventoryItem,
  getFinishingServiceSpec,
  type FinishingServiceId,
  type KhataAccountSummary,
  type KhataTransactionRecord,
  type PagesPerSheet,
  type ShopInventoryItem,
} from './shopCounterOpsEngine.ts';

const FIREBASE_SECURETOKEN_JWKS_URL =
  'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';

let remoteFirebaseJwks: ReturnType<typeof createRemoteJWKSet> | null = null;
function getRemoteFirebaseJwks() {
  if (!remoteFirebaseJwks) {
    remoteFirebaseJwks = createRemoteJWKSet(new URL(FIREBASE_SECURETOKEN_JWKS_URL));
  }
  return remoteFirebaseJwks;
}

export interface CounterAdminActor {
  uid: string;
  email: string;
  authSource: 'session' | 'firebase';
}

export async function verifyFirebaseSuperAdminBearer(
  authHeader: string | undefined,
  options: {
    projectId: string;
    expectedUid: string;
    localJwks?: JSONWebKeySet;
  }
): Promise<CounterAdminActor | null> {
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7).trim();
  if (!token || token.length > 8192) return null;

  const projectId = options.projectId.trim();
  const expectedUid = options.expectedUid.trim();
  if (!projectId || !expectedUid) return null;

  try {
    const header = decodeProtectedHeader(token);
    if (header.alg !== 'RS256' || !header.kid) return null;

    const resolver = options.localJwks
      ? createLocalJWKSet(options.localJwks)
      : getRemoteFirebaseJwks();

    const { payload } = await jwtVerify(token, resolver, {
      algorithms: ['RS256'],
      issuer: `https://securetoken.google.com/${projectId}`,
      audience: projectId,
      clockTolerance: 30,
    });

    if (typeof payload.sub !== 'string' || payload.sub !== expectedUid) {
      return null;
    }

    return {
      uid: payload.sub,
      email: typeof payload.email === 'string' ? payload.email : 'super-admin',
      authSource: 'firebase',
    };
  } catch {
    return null;
  }
}

export function initCounterOpsSchema(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS shop_inventory_items (
      id TEXT PRIMARY KEY,
      item_name TEXT NOT NULL,
      category TEXT NOT NULL,
      unit_label TEXT NOT NULL,
      pack_size INTEGER NOT NULL DEFAULT 500,
      current_qty INTEGER NOT NULL DEFAULT 0,
      min_threshold INTEGER NOT NULL DEFAULT 100,
      unit_cost_paise INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS inventory_movements (
      id TEXT PRIMARY KEY,
      item_id TEXT NOT NULL,
      movement_type TEXT NOT NULL,
      delta_qty INTEGER NOT NULL,
      resulting_qty INTEGER NOT NULL,
      job_number TEXT,
      reason TEXT NOT NULL,
      actor_uid TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (item_id) REFERENCES shop_inventory_items(id)
    );

    CREATE TABLE IF NOT EXISTS shift_cash_closes (
      id TEXT PRIMARY KEY,
      shift_label TEXT NOT NULL,
      operator_name TEXT NOT NULL,
      opening_float_paise INTEGER NOT NULL,
      cash_sales_paise INTEGER NOT NULL,
      upi_sales_paise INTEGER NOT NULL,
      expenses_paise INTEGER NOT NULL,
      expected_paise INTEGER NOT NULL,
      counted_paise INTEGER NOT NULL,
      variance_paise INTEGER NOT NULL,
      status TEXT NOT NULL,
      denominations_json TEXT NOT NULL,
      z_report_json TEXT NOT NULL,
      closed_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS khata_accounts (
      id TEXT PRIMARY KEY,
      client_name TEXT NOT NULL,
      client_type TEXT NOT NULL,
      contact_phone TEXT NOT NULL DEFAULT '',
      credit_limit_paise INTEGER NOT NULL DEFAULT 200000,
      balance_due_paise INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS khata_transactions (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL,
      entry_type TEXT NOT NULL,
      amount_paise INTEGER NOT NULL,
      payment_mode TEXT NOT NULL,
      reference_note TEXT NOT NULL,
      actor_uid TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (account_id) REFERENCES khata_accounts(id)
    );
  `);

  const now = new Date().toISOString();
  const seedItem = db.prepare(`
    INSERT OR IGNORE INTO shop_inventory_items (
      id, item_name, category, unit_label, pack_size, current_qty, min_threshold, unit_cost_paise, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const item of DEFAULT_SHOP_INVENTORY) {
    seedItem.run(
      item.id,
      item.itemName,
      item.category,
      item.unitLabel,
      item.packSize,
      item.currentQty,
      item.minThreshold,
      item.unitCostPaise,
      now
    );
  }

  const khataCount = db.prepare('SELECT COUNT(*) as c FROM khata_accounts').get() as { c: number };
  if (khataCount.c === 0) {
    const insKhata = db.prepare(`
      INSERT INTO khata_accounts (
        id, client_name, client_type, contact_phone, credit_limit_paise, balance_due_paise, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    insKhata.run(
      'khata-sharma-coaching',
      'Sharma Coaching Centre',
      'coaching',
      '9876543210',
      500000,
      64000,
      now
    );
    insKhata.run(
      'khata-patel-classes',
      'Patel Computer Classes',
      'coaching',
      '9123456780',
      300000,
      25000,
      now
    );

    const insTx = db.prepare(`
      INSERT INTO khata_transactions (
        id, account_id, entry_type, amount_paise, payment_mode, reference_note, actor_uid, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insTx.run(
      'tx-seed-1',
      'khata-sharma-coaching',
      'debit_print',
      64000,
      'khata',
      'Physics Test Series 160 sheets (2-in-1 Duplex + Spiral)',
      'system',
      now
    );
    insTx.run(
      'tx-seed-2',
      'khata-patel-classes',
      'debit_print',
      25000,
      'khata',
      'DCA Lab Manual Set (5 copies)',
      'system',
      now
    );
  }
}

export function getCounterOpsState(db: DatabaseSync) {
  const rawItems = db
    .prepare('SELECT * FROM shop_inventory_items ORDER BY category ASC, id ASC')
    .all() as Array<{
    id: string;
    item_name: string;
    category: ShopInventoryItem['category'];
    unit_label: string;
    pack_size: number;
    current_qty: number;
    min_threshold: number;
    unit_cost_paise: number;
    updated_at: string;
  }>;

  const inventory = rawItems.map((r) =>
    evaluateInventoryItem({
      id: r.id,
      itemName: r.item_name,
      category: r.category,
      unitLabel: r.unit_label,
      packSize: r.pack_size,
      currentQty: r.current_qty,
      minThreshold: r.min_threshold,
      unitCostPaise: r.unit_cost_paise,
      updatedAt: r.updated_at,
    })
  );

  const movements = db
    .prepare(
      `SELECT m.*, i.item_name, i.unit_label
       FROM inventory_movements m
       JOIN shop_inventory_items i ON i.id = m.item_id
       ORDER BY m.created_at DESC LIMIT 25`
    )
    .all() as Array<{
    id: string;
    item_id: string;
    item_name: string;
    unit_label: string;
    movement_type: string;
    delta_qty: number;
    resulting_qty: number;
    job_number: string | null;
    reason: string;
    created_at: string;
  }>;

  const rawTallies = db
    .prepare('SELECT * FROM shift_cash_closes ORDER BY closed_at DESC LIMIT 15')
    .all() as Array<{
    id: string;
    shift_label: string;
    operator_name: string;
    opening_float_paise: number;
    cash_sales_paise: number;
    upi_sales_paise: number;
    expenses_paise: number;
    expected_paise: number;
    counted_paise: number;
    variance_paise: number;
    status: string;
    denominations_json: string;
    z_report_json: string;
    closed_at: string;
  }>;

  const shiftTallies = rawTallies.map((t) => ({
    id: t.id,
    shiftLabel: t.shift_label,
    operatorName: t.operator_name,
    openingFloatPaise: t.opening_float_paise,
    cashSalesPaise: t.cash_sales_paise,
    upiSalesPaise: t.upi_sales_paise,
    expensesPaise: t.expenses_paise,
    expectedPaise: t.expected_paise,
    countedPaise: t.counted_paise,
    variancePaise: t.variance_paise,
    status: t.status,
    zReportLines: JSON.parse(t.z_report_json) as string[],
    closedAt: t.closed_at,
  }));

  const rawKhata = db
    .prepare('SELECT * FROM khata_accounts ORDER BY balance_due_paise DESC, client_name ASC')
    .all() as Array<{
    id: string;
    client_name: string;
    client_type: KhataAccountSummary['clientType'];
    contact_phone: string;
    credit_limit_paise: number;
    balance_due_paise: number;
    updated_at: string;
  }>;

  const khataAccounts: KhataAccountSummary[] = rawKhata.map((k) => ({
    id: k.id,
    clientName: k.client_name,
    clientType: k.client_type,
    contactPhone: k.contact_phone,
    creditLimitPaise: k.credit_limit_paise,
    balanceDuePaise: k.balance_due_paise,
    updatedAt: k.updated_at,
  }));

  const rawTx = db
    .prepare(
      `SELECT t.*, a.client_name
       FROM khata_transactions t
       JOIN khata_accounts a ON a.id = t.account_id
       ORDER BY t.created_at DESC LIMIT 40`
    )
    .all() as Array<{
    id: string;
    account_id: string;
    client_name: string;
    entry_type: KhataTransactionRecord['entryType'];
    amount_paise: number;
    payment_mode: KhataTransactionRecord['paymentMode'];
    reference_note: string;
    created_at: string;
  }>;

  const khataTransactions: KhataTransactionRecord[] = rawTx.map((tx) => ({
    id: tx.id,
    accountId: tx.account_id,
    clientName: tx.client_name,
    entryType: tx.entry_type,
    amountPaise: tx.amount_paise,
    paymentMode: tx.payment_mode,
    referenceNote: tx.reference_note,
    createdAt: tx.created_at,
  }));

  return {
    checkedAtIso: new Date().toISOString(),
    finishingCatalog: FINISHING_SERVICE_CATALOG,
    nupOptions: NUP_LAYOUT_OPTIONS,
    inventory,
    lowStockAlerts: inventory.filter((i) => i.alertLevel !== 'healthy'),
    movements,
    shiftTallies,
    khataAccounts,
    khataTransactions,
    totalKhataReceivableInr: Number(
      (khataAccounts.reduce((s, a) => s + a.balanceDuePaise, 0) / 100).toFixed(2)
    ),
  };
}

export function createCounterOpsRouter(config: {
  db: DatabaseSync;
  resolveSessionActor: (req: Request) => CounterAdminActor | null;
  firebaseProjectId: string;
  superAdminUid: string;
  localJwks?: JSONWebKeySet;
}): express.Router {
  const router = express.Router();
  const { db } = config;

  const requireCounterAdmin = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    const sessionActor = config.resolveSessionActor(req);
    if (sessionActor) {
      (req as Request & { counterActor: CounterAdminActor }).counterActor = sessionActor;
      next();
      return;
    }

    const firebaseActor = await verifyFirebaseSuperAdminBearer(req.headers.authorization, {
      projectId: config.firebaseProjectId,
      expectedUid: config.superAdminUid,
      localJwks: config.localJwks,
    });
    if (firebaseActor) {
      (req as Request & { counterActor: CounterAdminActor }).counterActor = firebaseActor;
      next();
      return;
    }

    res.status(401).json({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Admin sign-in required for counter inventory, cash drawer, and Khata operations.',
      },
    });
  };

  // Public read-only catalog for Customer Portal & POS calculators
  router.get('/catalog', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json({
      finishingServices: FINISHING_SERVICE_CATALOG,
      nupOptions: NUP_LAYOUT_OPTIONS,
    });
  });

  // Public validated print quote preview
  router.post('/quote', express.json({ limit: '16kb' }), (req, res) => {
    const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;
    const selectedPagesCount = Number.isFinite(Number(body.selectedPagesCount))
      ? Math.max(1, Math.min(2000, Math.round(Number(body.selectedPagesCount))))
      : 1;
    const rawNup = Number(body.pagesPerSheet);
    const pagesPerSheet: PagesPerSheet = rawNup === 2 || rawNup === 4 ? rawNup : 1;
    const printSides = body.printSides === 'duplex' ? 'duplex' : 'single';
    const copies = Number.isFinite(Number(body.copies))
      ? Math.max(1, Math.min(200, Math.round(Number(body.copies))))
      : 1;
    const paperSize = typeof body.paperSize === 'string' && body.paperSize.trim()
      ? body.paperSize.trim().slice(0, 20)
      : 'A4';
    const printMode = body.printMode === 'colour' ? 'colour' : 'bw';
    const ratePaise = Number.isFinite(Number(body.ratePaise))
      ? Math.max(0, Math.min(50000, Math.round(Number(body.ratePaise))))
      : printMode === 'colour'
        ? 1000
        : printSides === 'duplex'
          ? 300
          : 200;
    const pricingUnit =
      body.pricingUnit === 'per_physical_sheet' || printSides === 'duplex'
        ? 'per_physical_sheet'
        : 'per_printed_page';
    const finishingSpec = getFinishingServiceSpec(
      typeof body.finishingService === 'string' ? body.finishingService : 'none'
    );

    const quote = calculatePhase18OrderQuote({
      selectedPagesCount,
      pagesPerSheet,
      printSides,
      copies,
      paperSize,
      printMode,
      ratePaise,
      pricingUnit,
      finishingService: finishingSpec.id,
    });
    res.setHeader('Cache-Control', 'no-store');
    res.json({ quote });
  });

  // Protected Admin state read
  router.get('/state', requireCounterAdmin, (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json(getCounterOpsState(db));
  });

  // Protected Restock / Adjust inventory item
  router.post(
    '/inventory/restock',
    requireCounterAdmin,
    express.json({ limit: '16kb' }),
    (req, res) => {
      const actor = (req as Request & { counterActor: CounterAdminActor }).counterActor;
      const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;
      const itemId = typeof body.itemId === 'string' ? body.itemId.trim() : '';
      const addQty = Math.round(Number(body.addQty));
      const reason =
        typeof body.reason === 'string' && body.reason.trim()
          ? body.reason.trim().slice(0, 140)
          : 'Counter stock refill';

      if (!itemId || !Number.isFinite(addQty) || addQty < 1 || addQty > 50000) {
        res.status(400).json({
          error: { code: 'INVALID_RESTOCK', message: 'Valid itemId and addQty (1–50000) required.' },
        });
        return;
      }

      const existing = db
        .prepare('SELECT id, current_qty FROM shop_inventory_items WHERE id = ?')
        .get(itemId) as { id: string; current_qty: number } | undefined;
      if (!existing) {
        res.status(404).json({ error: { code: 'ITEM_NOT_FOUND', message: 'Stock item not found.' } });
        return;
      }

      const now = new Date().toISOString();
      const nextQty = existing.current_qty + addQty;

      db.exec('BEGIN');
      try {
        db.prepare('UPDATE shop_inventory_items SET current_qty = ?, updated_at = ? WHERE id = ?').run(
          nextQty,
          now,
          itemId
        );
        db.prepare(
          `INSERT INTO inventory_movements (
            id, item_id, movement_type, delta_qty, resulting_qty, job_number, reason, actor_uid, created_at
          ) VALUES (?, ?, 'restock', ?, ?, NULL, ?, ?, ?)`
        ).run(crypto.randomUUID(), itemId, addQty, nextQty, reason, actor.uid, now);
        db.exec('COMMIT');
      } catch (err) {
        db.exec('ROLLBACK');
        res.status(500).json({
          error: { code: 'RESTOCK_FAILED', message: err instanceof Error ? err.message : 'Stock update failed.' },
        });
        return;
      }

      res.json({ ok: true, itemId, resultingQty: nextQty, state: getCounterOpsState(db) });
    }
  );

  // Protected Job Stock Auto-Deduction
  router.post(
    '/inventory/deduct-job',
    requireCounterAdmin,
    express.json({ limit: '16kb' }),
    (req, res) => {
      const actor = (req as Request & { counterActor: CounterAdminActor }).counterActor;
      const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;
      const jobNumber =
        typeof body.jobNumber === 'string' && body.jobNumber.trim()
          ? body.jobNumber.trim().slice(0, 40)
          : `POS-${Date.now().toString().slice(-6)}`;
      const paperSize =
        typeof body.paperSize === 'string' && body.paperSize.trim()
          ? body.paperSize.trim().slice(0, 20)
          : 'A4';
      const printMode = body.printMode === 'colour' ? 'colour' : 'bw';
      const physicalSheetsTotal = Math.max(1, Math.min(5000, Math.round(Number(body.physicalSheetsTotal) || 1)));
      const impressionsTotal = Math.max(1, Math.min(10000, Math.round(Number(body.impressionsTotal) || physicalSheetsTotal)));
      const copies = Math.max(1, Math.min(200, Math.round(Number(body.copies) || 1)));
      const finishingService = getFinishingServiceSpec(
        typeof body.finishingService === 'string' ? body.finishingService : 'none'
      ).id as FinishingServiceId;

      const plan = computeStockDeductionPlan({
        jobNumber,
        paperSize,
        printMode,
        physicalSheetsTotal,
        impressionsTotal,
        copies,
        finishingService,
      });

      const now = new Date().toISOString();
      const applied: Array<{ itemId: string; deducted: number; resultingQty: number }> = [];

      db.exec('BEGIN');
      try {
        for (const line of plan) {
          const row = db
            .prepare('SELECT current_qty FROM shop_inventory_items WHERE id = ?')
            .get(line.itemId) as { current_qty: number } | undefined;
          if (!row) continue;
          const nextQty = Math.max(0, row.current_qty - line.deltaQty);
          db.prepare('UPDATE shop_inventory_items SET current_qty = ?, updated_at = ? WHERE id = ?').run(
            nextQty,
            now,
            line.itemId
          );
          db.prepare(
            `INSERT INTO inventory_movements (
              id, item_id, movement_type, delta_qty, resulting_qty, job_number, reason, actor_uid, created_at
            ) VALUES (?, ?, 'deduct_job', ?, ?, ?, ?, ?, ?)`
          ).run(
            crypto.randomUUID(),
            line.itemId,
            -line.deltaQty,
            nextQty,
            jobNumber,
            line.reason,
            actor.uid,
            now
          );
          applied.push({ itemId: line.itemId, deducted: line.deltaQty, resultingQty: nextQty });
        }
        db.exec('COMMIT');
      } catch (err) {
        db.exec('ROLLBACK');
        res.status(500).json({
          error: { code: 'DEDUCT_FAILED', message: err instanceof Error ? err.message : 'Stock deduction failed.' },
        });
        return;
      }

      res.json({ ok: true, jobNumber, applied, state: getCounterOpsState(db) });
    }
  );

  // Protected Shift Cash Drawer Tally save
  router.post(
    '/cash-tally',
    requireCounterAdmin,
    express.json({ limit: '16kb' }),
    (req, res) => {
      const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;
      const denoms = (body.denominations && typeof body.denominations === 'object'
        ? body.denominations
        : {}) as Record<string, unknown>;

      const tally = computeCashDrawerTally({
        shiftLabel: typeof body.shiftLabel === 'string' ? body.shiftLabel : 'Evening Shift Close',
        operatorName: typeof body.operatorName === 'string' ? body.operatorName : 'Aman Kumar',
        openingFloatInr: Number(body.openingFloatInr) || 0,
        cashSalesInr: Number(body.cashSalesInr) || 0,
        upiSalesInr: Number(body.upiSalesInr) || 0,
        counterExpensesInr: Number(body.counterExpensesInr) || 0,
        denominations: {
          n500: Number(denoms.n500) || 0,
          n200: Number(denoms.n200) || 0,
          n100: Number(denoms.n100) || 0,
          n50: Number(denoms.n50) || 0,
          n20: Number(denoms.n20) || 0,
          n10: Number(denoms.n10) || 0,
          coinsInr: Number(denoms.coinsInr) || 0,
        },
      });

      const id = crypto.randomUUID();
      db.prepare(
        `INSERT INTO shift_cash_closes (
          id, shift_label, operator_name, opening_float_paise, cash_sales_paise, upi_sales_paise,
          expenses_paise, expected_paise, counted_paise, variance_paise, status,
          denominations_json, z_report_json, closed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        id,
        tally.shiftLabel,
        tally.operatorName,
        Math.round(tally.openingFloatInr * 100),
        Math.round(tally.cashSalesInr * 100),
        Math.round(tally.upiSalesInr * 100),
        Math.round(tally.counterExpensesInr * 100),
        Math.round(tally.expectedDrawerCashInr * 100),
        Math.round(tally.countedCashInr * 100),
        Math.round(tally.varianceInr * 100),
        tally.status,
        JSON.stringify(tally.denominations),
        JSON.stringify(tally.zReportLines),
        tally.timestampIso
      );

      res.status(201).json({ ok: true, id, tally, state: getCounterOpsState(db) });
    }
  );

  // Protected Shift Cash CSV export
  router.get('/cash-tally/export', requireCounterAdmin, (_req, res) => {
    const state = getCounterOpsState(db);
    const csv = buildCashTallyCsv(state.shiftTallies);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="aman-computer-cash-drawer-tallies.csv"');
    res.setHeader('Cache-Control', 'no-store');
    res.send(csv);
  });

  // Protected Create Regular Client Khata Account
  router.post(
    '/khata/accounts',
    requireCounterAdmin,
    express.json({ limit: '16kb' }),
    (req, res) => {
      const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;
      const clientName = typeof body.clientName === 'string' ? body.clientName.trim().slice(0, 80) : '';
      const clientType =
        body.clientType === 'coaching' ||
        body.clientType === 'student' ||
        body.clientType === 'office'
          ? body.clientType
          : 'walkin_regular';
      const contactPhone =
        typeof body.contactPhone === 'string' ? body.contactPhone.trim().slice(0, 20) : '';
      const creditLimitInr = Number.isFinite(Number(body.creditLimitInr))
        ? Math.max(0, Math.min(50000, Number(body.creditLimitInr)))
        : 2000;

      if (!clientName || clientName.length < 2) {
        res.status(400).json({
          error: { code: 'INVALID_CLIENT_NAME', message: 'Client name (at least 2 chars) required.' },
        });
        return;
      }

      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      db.prepare(
        `INSERT INTO khata_accounts (
          id, client_name, client_type, contact_phone, credit_limit_paise, balance_due_paise, updated_at
        ) VALUES (?, ?, ?, ?, ?, 0, ?)`
      ).run(id, clientName, clientType, contactPhone, Math.round(creditLimitInr * 100), now);

      res.status(201).json({ ok: true, id, state: getCounterOpsState(db) });
    }
  );

  // Protected Record Khata Debit (Print Charge) or Credit (Payment Received)
  router.post(
    '/khata/transactions',
    requireCounterAdmin,
    express.json({ limit: '16kb' }),
    (req, res) => {
      const actor = (req as Request & { counterActor: CounterAdminActor }).counterActor;
      const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;
      const accountId = typeof body.accountId === 'string' ? body.accountId.trim() : '';
      const entryType = body.entryType === 'credit_payment' ? 'credit_payment' : 'debit_print';
      const paymentMode =
        entryType === 'debit_print'
          ? 'khata'
          : body.paymentMode === 'upi'
            ? 'upi'
            : 'cash';
      const amountInr = Number(body.amountInr);
      const referenceNote =
        typeof body.referenceNote === 'string' && body.referenceNote.trim()
          ? body.referenceNote.trim().slice(0, 140)
          : entryType === 'debit_print'
            ? 'Counter print job on Khata'
            : `Khata settlement (${paymentMode.toUpperCase()})`;

      if (!accountId || !Number.isFinite(amountInr) || amountInr <= 0 || amountInr > 100000) {
        res.status(400).json({
          error: { code: 'INVALID_KHATA_ENTRY', message: 'Valid accountId and positive amountInr required.' },
        });
        return;
      }

      const amountPaise = Math.round(amountInr * 100);
      const account = db
        .prepare('SELECT id, credit_limit_paise, balance_due_paise FROM khata_accounts WHERE id = ?')
        .get(accountId) as
        | { id: string; credit_limit_paise: number; balance_due_paise: number }
        | undefined;

      if (!account) {
        res.status(404).json({ error: { code: 'KHATA_ACCOUNT_NOT_FOUND', message: 'Khata client not found.' } });
        return;
      }

      const nextBalancePaise =
        entryType === 'debit_print'
          ? account.balance_due_paise + amountPaise
          : account.balance_due_paise - amountPaise;

      if (entryType === 'debit_print' && nextBalancePaise > account.credit_limit_paise) {
        res.status(422).json({
          error: {
            code: 'CREDIT_LIMIT_EXCEEDED',
            message: `Debit exceeds client Khata limit of ₹${(account.credit_limit_paise / 100).toFixed(2)}. Collect partial payment first.`,
          },
        });
        return;
      }
      if (nextBalancePaise < 0) {
        res.status(422).json({
          error: {
            code: 'OVERPAYMENT_REJECTED',
            message: `Payment exceeds current due balance of ₹${(account.balance_due_paise / 100).toFixed(2)}.`,
          },
        });
        return;
      }

      const now = new Date().toISOString();
      const txId = crypto.randomUUID();
      db.exec('BEGIN');
      try {
        db.prepare('UPDATE khata_accounts SET balance_due_paise = ?, updated_at = ? WHERE id = ?').run(
          nextBalancePaise,
          now,
          accountId
        );
        db.prepare(
          `INSERT INTO khata_transactions (
            id, account_id, entry_type, amount_paise, payment_mode, reference_note, actor_uid, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(txId, accountId, entryType, amountPaise, paymentMode, referenceNote, actor.uid, now);
        db.exec('COMMIT');
      } catch (err) {
        db.exec('ROLLBACK');
        res.status(500).json({
          error: { code: 'KHATA_TX_FAILED', message: err instanceof Error ? err.message : 'Khata transaction failed.' },
        });
        return;
      }

      res.status(201).json({
        ok: true,
        txId,
        resultingBalanceInr: Number((nextBalancePaise / 100).toFixed(2)),
        state: getCounterOpsState(db),
      });
    }
  );

  // Protected Khata Statement CSV export
  router.get('/khata/export', requireCounterAdmin, (_req, res) => {
    const state = getCounterOpsState(db);
    const csv = buildKhataStatementCsv(state.khataAccounts, state.khataTransactions);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="aman-computer-khata-ledger.csv"');
    res.setHeader('Cache-Control', 'no-store');
    res.send(csv);
  });

  return router;
}
