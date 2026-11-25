-- AC Scan2Print — Phase 11: Controlled Pilot Launch & Rollback Controls
-- Additive migration extending print_system_settings with pilot stage, emergency portal intake pause,
-- configurable 50-100 job pilot target, go-live approval timestamp, and operator readiness checklist.

ALTER TABLE public.print_system_settings
  ADD COLUMN IF NOT EXISTS pilot_stage TEXT NOT NULL DEFAULT 'dry_run',
  ADD COLUMN IF NOT EXISTS pilot_intake_paused BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS pilot_pause_reason TEXT,
  ADD COLUMN IF NOT EXISTS pilot_target_jobs INTEGER NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS pilot_go_live_approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS pilot_checklist JSONB NOT NULL DEFAULT '{"shopPcInstalled":false,"printerTested":false,"qrPosterDisplayed":false,"staffTrained":false,"backupTested":false}'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_print_system_pilot_stage'
      AND conrelid = 'public.print_system_settings'::regclass
  ) THEN
    ALTER TABLE public.print_system_settings
      ADD CONSTRAINT chk_print_system_pilot_stage
      CHECK (pilot_stage IN ('dry_run', 'supervised_pilot', 'live_pilot', 'production'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_print_system_pilot_target_jobs'
      AND conrelid = 'public.print_system_settings'::regclass
  ) THEN
    ALTER TABLE public.print_system_settings
      ADD CONSTRAINT chk_print_system_pilot_target_jobs
      CHECK (pilot_target_jobs >= 10 AND pilot_target_jobs <= 500);
  END IF;
END;
$$;
