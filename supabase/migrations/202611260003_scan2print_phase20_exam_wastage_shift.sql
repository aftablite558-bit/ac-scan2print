-- AC Scan2Print — Phase 20: Paper Wastage Root-Cause Log & Opening/Closing Shift Checklists
-- Strictly Single-Shop AMAN COMPUTER Operations

CREATE TABLE IF NOT EXISTS public.print_wastage_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  station_id TEXT NOT NULL,
  paper_item_id TEXT NOT NULL,
  sheets_wasted INTEGER NOT NULL CHECK (sheets_wasted > 0),
  reason_code TEXT NOT NULL CHECK (
    reason_code IN ('paper_jam', 'ink_streak', 'wrong_settings', 'toner_faint', 'customer_reprint')
  ),
  estimated_loss_paise INTEGER NOT NULL DEFAULT 0,
  job_number TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  actor_uid TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.print_shift_checklists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shift_date DATE NOT NULL DEFAULT CURRENT_DATE,
  shift_type TEXT NOT NULL CHECK (shift_type IN ('opening', 'closing')),
  operator_name TEXT NOT NULL,
  petty_cash_inr NUMERIC(10, 2) NOT NULL DEFAULT 0,
  checklist_items_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  notes TEXT NOT NULL DEFAULT '',
  signed_off_by_uid TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wastage_created_at
  ON public.print_wastage_logs (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_shift_checklists_date
  ON public.print_shift_checklists (shift_date DESC, created_at DESC);

ALTER TABLE public.print_wastage_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.print_wastage_logs FORCE ROW LEVEL SECURITY;

ALTER TABLE public.print_shift_checklists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.print_shift_checklists FORCE ROW LEVEL SECURITY;

REVOKE ALL ON public.print_wastage_logs FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.print_shift_checklists FROM PUBLIC, anon, authenticated;

GRANT ALL ON public.print_wastage_logs TO service_role;
GRANT ALL ON public.print_shift_checklists TO service_role;
