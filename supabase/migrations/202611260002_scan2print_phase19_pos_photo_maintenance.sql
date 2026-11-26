-- AC Scan2Print — Phase 19: Walk-In Counter POS, Photo Sheet Presets & Printer Maintenance Logbook
-- Single-shop database migration with forced RLS and least-privilege service_role grants.

CREATE TABLE IF NOT EXISTS public.print_walkin_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_number TEXT NOT NULL UNIQUE,
  customer_name TEXT NOT NULL DEFAULT 'Walk-in Customer',
  customer_phone TEXT,
  payment_method TEXT NOT NULL CHECK (payment_method IN ('cash', 'upi', 'khata')),
  khata_account_id UUID REFERENCES public.print_khata_accounts(id) ON DELETE SET NULL,
  items_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  total_physical_sheets INTEGER NOT NULL DEFAULT 0 CHECK (total_physical_sheets >= 0),
  total_impressions INTEGER NOT NULL DEFAULT 0 CHECK (total_impressions >= 0),
  gross_total_paise INTEGER NOT NULL CHECK (gross_total_paise > 0),
  gst_taxable_paise INTEGER NOT NULL DEFAULT 0,
  cgst_paise INTEGER NOT NULL DEFAULT 0,
  sgst_paise INTEGER NOT NULL DEFAULT 0,
  created_by_uid TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.print_printer_maintenance (
  station_id TEXT PRIMARY KEY,
  printer_name TEXT NOT NULL,
  component_name TEXT NOT NULL,
  lifetime_pages INTEGER NOT NULL DEFAULT 0 CHECK (lifetime_pages >= 0),
  pages_since_service INTEGER NOT NULL DEFAULT 0 CHECK (pages_since_service >= 0),
  service_interval_pages INTEGER NOT NULL DEFAULT 5000 CHECK (service_interval_pages >= 100),
  last_serviced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_service_note TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS public.print_maintenance_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  station_id TEXT NOT NULL REFERENCES public.print_printer_maintenance(station_id) ON DELETE CASCADE,
  action_type TEXT NOT NULL CHECK (
    action_type IN ('nozzle_check_clean', 'drum_wipe', 'roller_clean', 'jam_cleared', 'consumable_part_replaced')
  ),
  reset_service_counter BOOLEAN NOT NULL DEFAULT false,
  note TEXT NOT NULL,
  actor_uid TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.print_walkin_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.print_walkin_orders FORCE ROW LEVEL SECURITY;

ALTER TABLE public.print_printer_maintenance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.print_printer_maintenance FORCE ROW LEVEL SECURITY;

ALTER TABLE public.print_maintenance_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.print_maintenance_logs FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.print_walkin_orders FROM anon, authenticated, PUBLIC;
REVOKE ALL ON TABLE public.print_printer_maintenance FROM anon, authenticated, PUBLIC;
REVOKE ALL ON TABLE public.print_maintenance_logs FROM anon, authenticated, PUBLIC;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.print_walkin_orders TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.print_printer_maintenance TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.print_maintenance_logs TO service_role;
