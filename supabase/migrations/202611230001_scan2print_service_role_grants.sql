-- AC Scan2Print — Additive Least-Privilege service_role Permission Remediation
-- NOTE: Do NOT execute automatically. Review and apply explicitly when authorized.
--
-- Scope & Security Guarantees:
--   1. Grants ONLY the minimum SQL table privileges actually executed by Scan2Print Edge Functions
--      via supabase/functions/_shared/supabaseAdapter.ts.
--   2. Preserves FORCE ROW LEVEL SECURITY on all 13 tables.
--   3. Grants ZERO privileges to anon, authenticated, or PUBLIC.
--   4. Grants ZERO direct table privileges on public.print_api_rate_limits (accessed exclusively
--      inside SECURITY DEFINER public.rpc_check_rate_limit).
--   5. Preserves append-only immutability on public.print_events (SELECT, INSERT only; no UPDATE/DELETE).

BEGIN;

GRANT USAGE ON SCHEMA public TO service_role;

-- 1. Admin Identity Registry (select active/count, insert singleton bootstrap row)
GRANT SELECT, INSERT ON TABLE public.print_admin_accounts TO service_role;

-- 2. Print Devices (list/lookup, agent-enroll insert, heartbeat & admin pause/revoke updates)
GRANT SELECT, INSERT, UPDATE ON TABLE public.print_devices TO service_role;

-- 3. Physical Printers (reads across portal/admin, agent-sync/admin-printers insert/update, unreferenced delete)
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.print_printers TO service_role;

-- 4. Server-Side Pricing Rules (reads, pricing_save insert/update, pricing_toggle update)
GRANT SELECT, INSERT, UPDATE ON TABLE public.print_pricing_rules TO service_role;

-- 5. Print Jobs (reads, customer draft insert, server/admin status & pricing updates; never deleted)
GRANT SELECT, INSERT, UPDATE ON TABLE public.print_jobs TO service_role;

-- 6. Print Files (reads, upload URL insert, validation & soft-delete deleted_at updates; never hard-deleted)
GRANT SELECT, INSERT, UPDATE ON TABLE public.print_files TO service_role;

-- 7. Print Payments (reads, UPI/cash insert, admin verification updates; never deleted)
GRANT SELECT, INSERT, UPDATE ON TABLE public.print_payments TO service_role;

-- 8. Print Job Attempts (reads & agent-report-job-event updates; inserts run via SECURITY DEFINER rpc_claim_next_print_job)
GRANT SELECT, UPDATE ON TABLE public.print_job_attempts TO service_role;

-- 9. Immutable Audit Events (append-only SELECT + INSERT; UPDATE/DELETE blocked by trigger & omitted from grants)
GRANT SELECT, INSERT ON TABLE public.print_events TO service_role;

-- 10. Payment Settings Singleton (reads & admin-update-payment-settings updates; never inserted/deleted)
GRANT SELECT, UPDATE ON TABLE public.print_payment_settings TO service_role;

-- 11. System Settings Singleton (strictly read-only SELECT across Edge Functions)
GRANT SELECT ON TABLE public.print_system_settings TO service_role;

-- 12. Retention Cleanup Execution Logs (insert with returning row in cleanup-expired-print-files)
GRANT SELECT, INSERT ON TABLE public.print_cleanup_logs TO service_role;

-- 13. public.print_api_rate_limits intentionally receives NO direct table GRANTs:
--     It is accessed solely via SECURITY DEFINER function public.rpc_check_rate_limit(TEXT, INTEGER, INTEGER).

COMMIT;
