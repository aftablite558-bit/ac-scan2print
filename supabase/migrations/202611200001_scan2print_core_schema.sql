-- AC Scan2Print — Phase 2 Core PostgreSQL Schema
-- Authoritative schema for Aman Computer Smart QR Print System
-- Preserves zero-fabricated pricing, single MVP Admin identity, immutable audit events, and strict state integrity.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. Single MVP Admin Account Table (Enforces exactly ONE Admin identity for MVP)
CREATE TABLE IF NOT EXISTS public.print_admin_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE, -- Links to auth.users(id)
  email TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  singleton_guard BOOLEAN NOT NULL DEFAULT TRUE CHECK (singleton_guard = TRUE),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_print_admin_single_mvp_account UNIQUE (singleton_guard)
);

-- 2. Print Devices (Windows 11 Local Print Agent enrollment foundation)
CREATE TABLE IF NOT EXISTS public.print_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_name TEXT NOT NULL,
  device_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (device_status IN ('pending', 'active', 'paused', 'revoked')),
  credential_hash TEXT NOT NULL UNIQUE,
  agent_version TEXT,
  os_version TEXT,
  last_heartbeat_at TIMESTAMPTZ,
  approved_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Physical Printers (Capabilities unverified until hardware check / sync)
CREATE TABLE IF NOT EXISTS public.print_printers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  printer_name TEXT NOT NULL,
  system_printer_name TEXT,
  device_id UUID REFERENCES public.print_devices(id) ON DELETE SET NULL,
  connection_type TEXT NOT NULL DEFAULT 'unknown'
    CHECK (connection_type IN ('usb', 'wifi', 'lan', 'unknown')),
  supported_paper_sizes TEXT[] NOT NULL DEFAULT ARRAY['A4']::TEXT[],
  supports_colour BOOLEAN NOT NULL DEFAULT FALSE,
  supports_duplex BOOLEAN NOT NULL DEFAULT FALSE,
  capabilities_verified BOOLEAN NOT NULL DEFAULT FALSE,
  printer_status TEXT NOT NULL DEFAULT 'unknown'
    CHECK (printer_status IN ('online', 'offline', 'error', 'paused', 'disabled', 'unknown')),
  is_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  last_seen_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. Server-Side Pricing Rules (Zero hardcoded INR rates; duplex strictly per_physical_sheet)
CREATE TABLE IF NOT EXISTS public.print_pricing_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_name TEXT NOT NULL,
  paper_size TEXT NOT NULL CHECK (paper_size IN ('A4', 'A3', 'Legal')),
  print_mode TEXT NOT NULL CHECK (print_mode IN ('bw', 'colour')),
  print_sides TEXT NOT NULL CHECK (print_sides IN ('single', 'duplex')),
  pricing_unit TEXT NOT NULL CHECK (pricing_unit IN ('per_printed_page', 'per_physical_sheet')),
  rate NUMERIC(12, 2) NOT NULL CHECK (rate >= 0),
  minimum_charge NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (minimum_charge >= 0),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  valid_from TIMESTAMPTZ NOT NULL DEFAULT now(),
  valid_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_duplex_uses_per_physical_sheet
    CHECK (print_sides <> 'duplex' OR pricing_unit = 'per_physical_sheet'),
  CONSTRAINT chk_valid_window
    CHECK (valid_until IS NULL OR valid_until > valid_from)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_print_pricing_rules_active_unique
  ON public.print_pricing_rules (paper_size, print_mode, print_sides)
  WHERE is_active = TRUE;

-- 5. Print Jobs (Authoritative job & pricing state)
CREATE TABLE IF NOT EXISTS public.print_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_number TEXT NOT NULL UNIQUE,
  tracking_token_hash TEXT UNIQUE,
  draft_upload_secret_hash TEXT,
  customer_name TEXT,
  customer_phone TEXT,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN (
      'draft',
      'submitted',
      'under_review',
      'awaiting_payment',
      'approved',
      'queued',
      'claimed',
      'downloading',
      'printing',
      'submitted_to_spooler',
      'completed',
      'failed',
      'needs_review',
      'rejected',
      'cancelled',
      'expired'
    )),
  payment_status TEXT NOT NULL DEFAULT 'unpaid'
    CHECK (payment_status IN ('unpaid', 'pending_verification', 'paid', 'refunded')),
  payment_method TEXT
    CHECK (payment_method IS NULL OR payment_method IN ('upi', 'cash')),
  subtotal NUMERIC(12, 2) CHECK (subtotal IS NULL OR subtotal >= 0),
  final_amount NUMERIC(12, 2) CHECK (final_amount IS NULL OR final_amount >= 0),
  currency TEXT NOT NULL DEFAULT 'INR' CHECK (char_length(currency) = 3),
  paper_size TEXT NOT NULL DEFAULT 'A4' CHECK (paper_size IN ('A4', 'A3', 'Legal')),
  print_mode TEXT NOT NULL DEFAULT 'bw' CHECK (print_mode IN ('bw', 'colour')),
  print_sides TEXT NOT NULL DEFAULT 'single' CHECK (print_sides IN ('single', 'duplex')),
  copies INTEGER NOT NULL DEFAULT 1 CHECK (copies >= 1 AND copies <= 50),
  orientation TEXT NOT NULL DEFAULT 'auto' CHECK (orientation IN ('auto', 'portrait', 'landscape')),
  scaling TEXT NOT NULL DEFAULT 'fit' CHECK (scaling IN ('fit', 'actual')),
  requested_page_range TEXT NOT NULL DEFAULT 'all',
  verified_page_count INTEGER CHECK (verified_page_count IS NULL OR verified_page_count >= 0),
  physical_sheet_count INTEGER CHECK (physical_sheet_count IS NULL OR physical_sheet_count >= 0),
  pricing_rule_id UUID REFERENCES public.print_pricing_rules(id) ON DELETE SET NULL,
  price_override_reason TEXT,
  assigned_printer_id UUID REFERENCES public.print_printers(id) ON DELETE SET NULL,
  rejection_reason TEXT,
  cancellation_reason TEXT,
  submission_idempotency_key TEXT UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  submitted_at TIMESTAMPTZ,
  approved_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  CONSTRAINT chk_submitted_requires_tracking_hash
    CHECK (status = 'draft' OR status = 'expired' OR tracking_token_hash IS NOT NULL),
  CONSTRAINT chk_queued_requires_paid_and_printer
    CHECK (status <> 'queued' OR (payment_status = 'paid' AND assigned_printer_id IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS idx_print_jobs_status ON public.print_jobs (status);
CREATE INDEX IF NOT EXISTS idx_print_jobs_payment_status ON public.print_jobs (payment_status);
CREATE INDEX IF NOT EXISTS idx_print_jobs_created_at ON public.print_jobs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_print_jobs_expires_at ON public.print_jobs (expires_at) WHERE expires_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_print_jobs_assigned_printer ON public.print_jobs (assigned_printer_id) WHERE assigned_printer_id IS NOT NULL;

-- 6. Print Files (Private uploaded documents — opaque UUID storage paths only)
CREATE TABLE IF NOT EXISTS public.print_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES public.print_jobs(id) ON DELETE CASCADE,
  storage_bucket TEXT NOT NULL DEFAULT 'print-uploads',
  storage_path TEXT NOT NULL UNIQUE,
  original_filename TEXT NOT NULL,
  detected_mime_type TEXT,
  file_size_bytes BIGINT NOT NULL CHECK (file_size_bytes > 0 AND file_size_bytes <= 20971520),
  sha256_checksum TEXT,
  detected_page_count INTEGER CHECK (detected_page_count IS NULL OR detected_page_count >= 1),
  validation_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (validation_status IN ('pending', 'valid', 'invalid')),
  validation_error TEXT,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_print_files_job_id ON public.print_files (job_id);
CREATE INDEX IF NOT EXISTS idx_print_files_unremoved ON public.print_files (job_id) WHERE deleted_at IS NULL;

-- 7. Print Payments (Manual UPI & Cash verification records)
CREATE TABLE IF NOT EXISTS public.print_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES public.print_jobs(id) ON DELETE CASCADE,
  payment_method TEXT NOT NULL CHECK (payment_method IN ('upi', 'cash')),
  payment_status TEXT NOT NULL DEFAULT 'unpaid'
    CHECK (payment_status IN ('unpaid', 'pending_verification', 'paid', 'refunded')),
  amount NUMERIC(12, 2) NOT NULL CHECK (amount >= 0),
  currency TEXT NOT NULL DEFAULT 'INR' CHECK (char_length(currency) = 3),
  transaction_reference TEXT,
  screenshot_storage_bucket TEXT DEFAULT 'payment-evidence',
  screenshot_storage_path TEXT,
  submitted_at TIMESTAMPTZ,
  verified_at TIMESTAMPTZ,
  verified_by UUID REFERENCES public.print_admin_accounts(id) ON DELETE SET NULL,
  rejection_reason TEXT,
  idempotency_key TEXT UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_paid_requires_verifier
    CHECK (payment_status <> 'paid' OR (verified_by IS NOT NULL AND verified_at IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS idx_print_payments_job_id ON public.print_payments (job_id);
CREATE INDEX IF NOT EXISTS idx_print_payments_status ON public.print_payments (payment_status);

-- Prevent duplicate simultaneous active UPI UTR references or double active payment verifications per job
CREATE UNIQUE INDEX IF NOT EXISTS idx_print_payments_active_job_unique
  ON public.print_payments (job_id)
  WHERE payment_status IN ('pending_verification', 'paid');

CREATE UNIQUE INDEX IF NOT EXISTS idx_print_payments_utr_unique
  ON public.print_payments (upper(transaction_reference))
  WHERE transaction_reference IS NOT NULL AND payment_status IN ('pending_verification', 'paid');

-- 8. Print Job Attempts (Atomic execution & Windows Spooler tracking)
CREATE TABLE IF NOT EXISTS public.print_job_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES public.print_jobs(id) ON DELETE CASCADE,
  attempt_number INTEGER NOT NULL CHECK (attempt_number >= 1),
  idempotency_key UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  device_id UUID NOT NULL REFERENCES public.print_devices(id),
  printer_id UUID NOT NULL REFERENCES public.print_printers(id),
  attempt_status TEXT NOT NULL DEFAULT 'claimed'
    CHECK (attempt_status IN (
      'claimed',
      'downloading',
      'printing',
      'submitted_to_spooler',
      'completed',
      'failed',
      'needs_review',
      'aborted'
    )),
  lease_expires_at TIMESTAMPTZ NOT NULL,
  windows_spooler_job_id TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  submitted_to_spooler_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  error_code TEXT,
  error_message TEXT,
  CONSTRAINT uq_print_job_attempts_number UNIQUE (job_id, attempt_number)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_print_job_attempts_one_active
  ON public.print_job_attempts (job_id)
  WHERE finished_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_print_job_attempts_lease
  ON public.print_job_attempts (lease_expires_at)
  WHERE finished_at IS NULL;

-- 9. Immutable Audit Events Table
CREATE TABLE IF NOT EXISTS public.print_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID REFERENCES public.print_jobs(id) ON DELETE SET NULL,
  actor_type TEXT NOT NULL CHECK (actor_type IN ('customer', 'admin', 'agent', 'system')),
  actor_id UUID,
  event_type TEXT NOT NULL,
  previous_status TEXT,
  new_status TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_print_events_job_id ON public.print_events (job_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_print_events_type ON public.print_events (event_type, created_at DESC);

-- Immutability guard: prevent UPDATE or DELETE on print_events
CREATE OR REPLACE FUNCTION public.prevent_print_event_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'print_events is append-only and immutable';
END;
$$;

DROP TRIGGER IF EXISTS trg_print_events_immutable ON public.print_events;
CREATE TRIGGER trg_print_events_immutable
  BEFORE UPDATE OR DELETE ON public.print_events
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_print_event_mutation();

-- 10. Editable UPI & Payment Settings (Zero hardcoded UPI IDs or QR images)
CREATE TABLE IF NOT EXISTS public.print_payment_settings (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  upi_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  upi_id TEXT,
  upi_qr_storage_bucket TEXT NOT NULL DEFAULT 'payment-assets',
  upi_qr_storage_path TEXT,
  display_name TEXT NOT NULL DEFAULT 'Aman Computer',
  payment_instructions TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES public.print_admin_accounts(id) ON DELETE SET NULL
);

INSERT INTO public.print_payment_settings (id, upi_enabled, upi_id, upi_qr_storage_path, display_name, payment_instructions)
VALUES (1, FALSE, NULL, NULL, 'Aman Computer', '')
ON CONFLICT (id) DO NOTHING;

-- 11. System & Retention Configuration Foundation
CREATE TABLE IF NOT EXISTS public.print_system_settings (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  customer_portal_url TEXT,
  max_file_size_bytes BIGINT NOT NULL DEFAULT 20971520 CHECK (max_file_size_bytes > 0),
  max_files_per_job INTEGER NOT NULL DEFAULT 5 CHECK (max_files_per_job >= 1 AND max_files_per_job <= 20),
  max_copies INTEGER NOT NULL DEFAULT 20 CHECK (max_copies >= 1 AND max_copies <= 100),
  draft_retention_hours INTEGER NOT NULL DEFAULT 1 CHECK (draft_retention_hours >= 1),
  completed_retention_hours INTEGER NOT NULL DEFAULT 24 CHECK (completed_retention_hours >= 1),
  failed_retention_hours INTEGER NOT NULL DEFAULT 72 CHECK (failed_retention_hours >= 1),
  retention_policy_confirmed BOOLEAN NOT NULL DEFAULT FALSE,
  auto_cleanup_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES public.print_admin_accounts(id) ON DELETE SET NULL
);

INSERT INTO public.print_system_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- 12. Retention Cleanup Execution Logs
CREATE TABLE IF NOT EXISTS public.print_cleanup_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_mode TEXT NOT NULL CHECK (run_mode IN ('dry_run', 'execute')),
  jobs_expired INTEGER NOT NULL DEFAULT 0,
  files_marked_deleted INTEGER NOT NULL DEFAULT 0,
  storage_objects_removed INTEGER NOT NULL DEFAULT 0,
  skipped_active_or_disputed INTEGER NOT NULL DEFAULT 0,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  executed_by TEXT NOT NULL,
  executed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 13. Distributed Edge Function Rate Limiting Store
CREATE TABLE IF NOT EXISTS public.print_api_rate_limits (
  bucket_key TEXT PRIMARY KEY,
  hit_count INTEGER NOT NULL DEFAULT 1,
  window_started_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Updated-at timestamp maintenance trigger
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_print_admin_accounts_updated ON public.print_admin_accounts;
CREATE TRIGGER trg_print_admin_accounts_updated
  BEFORE UPDATE ON public.print_admin_accounts FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS trg_print_printers_updated ON public.print_printers;
CREATE TRIGGER trg_print_printers_updated
  BEFORE UPDATE ON public.print_printers FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS trg_print_pricing_rules_updated ON public.print_pricing_rules;
CREATE TRIGGER trg_print_pricing_rules_updated
  BEFORE UPDATE ON public.print_pricing_rules FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS trg_print_jobs_updated ON public.print_jobs;
CREATE TRIGGER trg_print_jobs_updated
  BEFORE UPDATE ON public.print_jobs FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS trg_print_payments_updated ON public.print_payments;
CREATE TRIGGER trg_print_payments_updated
  BEFORE UPDATE ON public.print_payments FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
