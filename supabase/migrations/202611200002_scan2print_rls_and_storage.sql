-- AC Scan2Print — Phase 2 Row Level Security & Private Storage Policies
-- Enforces deny-by-default for anon/non-admin callers and strictly private Storage buckets.

-- Helper function checking whether the current Supabase Auth user is the active MVP Admin
CREATE OR REPLACE FUNCTION public.is_scan2print_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.print_admin_accounts a
    WHERE a.user_id = auth.uid()
      AND a.is_active = TRUE
  );
$$;

REVOKE ALL ON FUNCTION public.is_scan2print_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_scan2print_admin() TO authenticated, service_role;

-- Enable & Force RLS across ALL Scan2Print tables
ALTER TABLE public.print_admin_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.print_admin_accounts FORCE ROW LEVEL SECURITY;

ALTER TABLE public.print_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.print_devices FORCE ROW LEVEL SECURITY;

ALTER TABLE public.print_printers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.print_printers FORCE ROW LEVEL SECURITY;

ALTER TABLE public.print_pricing_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.print_pricing_rules FORCE ROW LEVEL SECURITY;

ALTER TABLE public.print_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.print_jobs FORCE ROW LEVEL SECURITY;

ALTER TABLE public.print_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.print_files FORCE ROW LEVEL SECURITY;

ALTER TABLE public.print_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.print_payments FORCE ROW LEVEL SECURITY;

ALTER TABLE public.print_job_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.print_job_attempts FORCE ROW LEVEL SECURITY;

ALTER TABLE public.print_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.print_events FORCE ROW LEVEL SECURITY;

ALTER TABLE public.print_payment_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.print_payment_settings FORCE ROW LEVEL SECURITY;

ALTER TABLE public.print_system_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.print_system_settings FORCE ROW LEVEL SECURITY;

ALTER TABLE public.print_cleanup_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.print_cleanup_logs FORCE ROW LEVEL SECURITY;

ALTER TABLE public.print_api_rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.print_api_rate_limits FORCE ROW LEVEL SECURITY;

-- Table Policies (Mutations run exclusively inside Edge Functions using service_role + auth checks;
-- authenticated Admin receives read visibility where needed and zero privilege escalation routes.)

CREATE POLICY admin_select_own_account ON public.print_admin_accounts
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() AND is_active = TRUE);

CREATE POLICY admin_select_devices ON public.print_devices
  FOR SELECT TO authenticated
  USING (public.is_scan2print_admin());

CREATE POLICY admin_select_printers ON public.print_printers
  FOR SELECT TO authenticated
  USING (public.is_scan2print_admin());

CREATE POLICY admin_manage_pricing_rules ON public.print_pricing_rules
  FOR ALL TO authenticated
  USING (public.is_scan2print_admin())
  WITH CHECK (public.is_scan2print_admin());

CREATE POLICY admin_select_jobs ON public.print_jobs
  FOR SELECT TO authenticated
  USING (public.is_scan2print_admin());

CREATE POLICY admin_select_files ON public.print_files
  FOR SELECT TO authenticated
  USING (public.is_scan2print_admin());

CREATE POLICY admin_select_payments ON public.print_payments
  FOR SELECT TO authenticated
  USING (public.is_scan2print_admin());

CREATE POLICY admin_select_attempts ON public.print_job_attempts
  FOR SELECT TO authenticated
  USING (public.is_scan2print_admin());

CREATE POLICY admin_select_events ON public.print_events
  FOR SELECT TO authenticated
  USING (public.is_scan2print_admin());

CREATE POLICY admin_select_payment_settings ON public.print_payment_settings
  FOR SELECT TO authenticated
  USING (public.is_scan2print_admin());

CREATE POLICY admin_select_system_settings ON public.print_system_settings
  FOR SELECT TO authenticated
  USING (public.is_scan2print_admin());

CREATE POLICY admin_select_cleanup_logs ON public.print_cleanup_logs
  FOR SELECT TO authenticated
  USING (public.is_scan2print_admin());

-- Explicit Public-Safe View for Customer Payment Settings (exposes zero admin metadata)
CREATE OR REPLACE VIEW public.public_payment_settings_view AS
SELECT
  upi_enabled,
  CASE WHEN upi_enabled THEN upi_id ELSE NULL END AS upi_id,
  display_name,
  payment_instructions,
  (upi_enabled AND upi_id IS NOT NULL AND upi_qr_storage_path IS NOT NULL) AS qr_configured
FROM public.print_payment_settings
WHERE id = 1;

REVOKE ALL ON public.public_payment_settings_view FROM PUBLIC;
GRANT SELECT ON public.public_payment_settings_view TO anon, authenticated, service_role;

-- Strictly Private Storage Buckets
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('print-uploads', 'print-uploads', FALSE, 20971520, ARRAY['application/pdf', 'image/jpeg', 'image/png']),
  ('payment-evidence', 'payment-evidence', FALSE, 10485760, ARRAY['image/jpeg', 'image/png', 'image/webp']),
  ('payment-assets', 'payment-assets', FALSE, 5242880, ARRAY['image/png', 'image/jpeg', 'image/webp'])
ON CONFLICT (id) DO UPDATE SET
  public = FALSE,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Zero direct anon/client object listing or reads on private buckets;
-- all uploads and downloads occur solely via short-lived signed URLs issued by validated Edge Functions.
DROP POLICY IF EXISTS scan2print_no_direct_storage_select ON storage.objects;
CREATE POLICY scan2print_no_direct_storage_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id IN ('print-uploads', 'payment-evidence', 'payment-assets')
    AND public.is_scan2print_admin()
  );
