-- AC Scan2Print — Phase 21: Bulk Coaching Batch Estimator, Saved Shop Job Templates & Unified History Archive
-- Additive single-shop tables guarded by forced RLS and service_role least-privilege grants.

CREATE TABLE IF NOT EXISTS public.print_job_templates (
  id text PRIMARY KEY,
  template_name text NOT NULL,
  category text NOT NULL DEFAULT 'custom' CHECK (category IN ('exam_packet', 'coaching_notes', 'office_combo', 'custom')),
  description text NOT NULL DEFAULT '',
  default_sets integer NOT NULL DEFAULT 1 CHECK (default_sets BETWEEN 1 AND 500),
  items_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_system boolean NOT NULL DEFAULT false,
  created_by_uid text NOT NULL DEFAULT 'system',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.print_bulk_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_ref text NOT NULL UNIQUE,
  batch_title text NOT NULL,
  customer_name text NOT NULL DEFAULT 'Walk-in Batch',
  payment_method text NOT NULL CHECK (payment_method IN ('cash', 'upi', 'khata')),
  khata_account_id text,
  student_sets integer NOT NULL DEFAULT 1 CHECK (student_sets BETWEEN 1 AND 500),
  total_physical_sheets integer NOT NULL DEFAULT 0 CHECK (total_physical_sheets >= 0),
  volume_tier_id text NOT NULL,
  discount_pct integer NOT NULL DEFAULT 0 CHECK (discount_pct BETWEEN 0 AND 50),
  gross_total_paise integer NOT NULL CHECK (gross_total_paise >= 0),
  items_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  actor_uid text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_print_bulk_batches_created_at
  ON public.print_bulk_batches (created_at DESC);

ALTER TABLE public.print_job_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.print_job_templates FORCE ROW LEVEL SECURITY;

ALTER TABLE public.print_bulk_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.print_bulk_batches FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.print_job_templates FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.print_bulk_batches FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.print_job_templates TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.print_bulk_batches TO service_role;
