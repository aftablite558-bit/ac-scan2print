-- AC Scan2Print — Phase 18 Schema Migration
-- Single-Shop Finishing Add-Ons, N-Up Layouts, Paper/Toner Inventory Stock,
-- Shift Cash Drawer Tallies, and Regular Client Khata Credit Ledger.
-- Enforces forced RLS and least-privilege service_role grants matching Migration 6.

ALTER TABLE public.print_jobs
  ADD COLUMN IF NOT EXISTS pages_per_sheet SMALLINT NOT NULL DEFAULT 1
    CHECK (pages_per_sheet IN (1, 2, 4)),
  ADD COLUMN IF NOT EXISTS finishing_service TEXT NOT NULL DEFAULT 'none'
    CHECK (finishing_service IN ('none', 'staple_corner', 'spiral_binding', 'thermal_lamination', 'heavy_cover_bind')),
  ADD COLUMN IF NOT EXISTS finishing_charge_paise INTEGER NOT NULL DEFAULT 0
    CHECK (finishing_charge_paise >= 0);

CREATE TABLE IF NOT EXISTS public.print_inventory_items (
  id TEXT PRIMARY KEY,
  item_name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('paper', 'toner_ink', 'finishing_supply')),
  unit_label TEXT NOT NULL,
  pack_size INTEGER NOT NULL DEFAULT 500 CHECK (pack_size > 0),
  current_qty INTEGER NOT NULL DEFAULT 0 CHECK (current_qty >= 0),
  min_threshold INTEGER NOT NULL DEFAULT 100 CHECK (min_threshold >= 0),
  unit_cost_paise INTEGER NOT NULL DEFAULT 0 CHECK (unit_cost_paise >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.print_inventory_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id TEXT NOT NULL REFERENCES public.print_inventory_items(id) ON DELETE RESTRICT,
  movement_type TEXT NOT NULL CHECK (movement_type IN ('deduct_job', 'restock', 'manual_adjust')),
  delta_qty INTEGER NOT NULL,
  resulting_qty INTEGER NOT NULL CHECK (resulting_qty >= 0),
  job_number TEXT,
  reason TEXT NOT NULL,
  actor_uid TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.print_shift_cash_closes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shift_label TEXT NOT NULL,
  operator_name TEXT NOT NULL,
  opening_float_paise INTEGER NOT NULL CHECK (opening_float_paise >= 0),
  cash_sales_paise INTEGER NOT NULL CHECK (cash_sales_paise >= 0),
  upi_sales_paise INTEGER NOT NULL CHECK (upi_sales_paise >= 0),
  expenses_paise INTEGER NOT NULL CHECK (expenses_paise >= 0),
  expected_drawer_paise INTEGER NOT NULL,
  counted_cash_paise INTEGER NOT NULL CHECK (counted_cash_paise >= 0),
  variance_paise INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('balanced', 'excess', 'shortage')),
  denominations_json JSONB NOT NULL,
  closed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.print_khata_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_name TEXT NOT NULL,
  client_type TEXT NOT NULL CHECK (client_type IN ('coaching', 'student', 'office', 'walkin_regular')),
  contact_phone TEXT NOT NULL DEFAULT '',
  credit_limit_paise INTEGER NOT NULL DEFAULT 200000 CHECK (credit_limit_paise >= 0),
  balance_due_paise INTEGER NOT NULL DEFAULT 0 CHECK (balance_due_paise >= 0),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.print_khata_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES public.print_khata_accounts(id) ON DELETE RESTRICT,
  entry_type TEXT NOT NULL CHECK (entry_type IN ('debit_print', 'credit_payment')),
  amount_paise INTEGER NOT NULL CHECK (amount_paise > 0),
  payment_mode TEXT NOT NULL CHECK (payment_mode IN ('khata', 'cash', 'upi')),
  reference_note TEXT NOT NULL,
  actor_uid TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.print_inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.print_inventory_items FORCE ROW LEVEL SECURITY;

ALTER TABLE public.print_inventory_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.print_inventory_movements FORCE ROW LEVEL SECURITY;

ALTER TABLE public.print_shift_cash_closes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.print_shift_cash_closes FORCE ROW LEVEL SECURITY;

ALTER TABLE public.print_khata_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.print_khata_accounts FORCE ROW LEVEL SECURITY;

ALTER TABLE public.print_khata_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.print_khata_transactions FORCE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON TABLE
  public.print_inventory_items,
  public.print_khata_accounts
TO service_role;

GRANT SELECT, INSERT ON TABLE
  public.print_inventory_movements,
  public.print_shift_cash_closes,
  public.print_khata_transactions
TO service_role;
