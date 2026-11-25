# AC Scan2Print — Migration Ledger & Migration 6 Security Inspection

**Document Type:** Supabase Migration Audit & Permissions Analysis  
**Inspection Date:** November 24, 2026  
**Auditor:** Senior Database Auditor, Principal Security Engineer & DevOps Auditor  
**Execution Mode:** Read-Only Audit · Zero SQL Executed · Verification Queries Only  

---

## 1. Migration Ledger Summary Table

| Migration File | File Exists | Production Applied | Objects Verified | Status | Missing Work / Advisory |
| :--- | :---: | :---: | :---: | :---: | :--- |
| `202611200001_scan2print_core_schema.sql` | ✅ Yes | APPLIED / VERIFIED | 12 tables, indexes, triggers | COMPLETE — VERIFIED | Baseline schema active. |
| `202611200002_scan2print_rls_and_storage.sql` | ✅ Yes | APPLIED / VERIFIED | Force RLS, 3 buckets, policies | COMPLETE — VERIFIED | Buckets: `print-uploads`, `payment-evidence`, `payment-assets`. |
| `202611200003_scan2print_atomic_rpcs.sql` | ✅ Yes | APPLIED / VERIFIED | 3 atomic RPCs | COMPLETE — VERIFIED | Baseline definitions in place. |
| `202611200004_scan2print_firebase_auth_admin.sql` | ✅ Yes | APPLIED / VERIFIED | `print_admin_accounts`, Firebase UID | COMPLETE — VERIFIED | Single-admin constraint active. |
| `202611210001_scan2print_phase0_printers.sql` | ✅ Yes | **APPLIED / VERIFIED** | 7 printer columns, updated RPCs | **COMPLETE — VERIFIED** | **DO NOT REAPPLY.** Verified applied in SQL Editor. |
| `202611230001_scan2print_service_role_grants.sql` | ✅ Yes | **INSPECTED / UNAPPLIED** | Least-privilege table grants | **PENDING REVIEW** | Reviewed below. Do NOT execute until authorized. |

---

## 2. In-Depth Security Inspection of Migration 6 (`202611230001`)

**Target File:** `supabase/migrations/202611230001_scan2print_service_role_grants.sql`  
**Purpose:** Remediate `service_role` table permissions to ensure Edge Functions can query and mutate tables under PostgreSQL's permission model.

### 2.1 Complete Inventory of GRANT & REVOKE Statements

```text
1. GRANT USAGE ON SCHEMA public TO service_role;
2. GRANT SELECT, INSERT ON TABLE public.print_admin_accounts TO service_role;
3. GRANT SELECT, INSERT, UPDATE ON TABLE public.print_devices TO service_role;
4. GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.print_printers TO service_role;
5. GRANT SELECT, INSERT, UPDATE ON TABLE public.print_pricing_rules TO service_role;
6. GRANT SELECT, INSERT, UPDATE ON TABLE public.print_jobs TO service_role;
7. GRANT SELECT, INSERT, UPDATE ON TABLE public.print_files TO service_role;
8. GRANT SELECT, INSERT, UPDATE ON TABLE public.print_payments TO service_role;
9. GRANT SELECT, UPDATE ON TABLE public.print_job_attempts TO service_role;
10. GRANT SELECT, INSERT ON TABLE public.print_events TO service_role;
11. GRANT SELECT, UPDATE ON TABLE public.print_payment_settings TO service_role;
12. GRANT SELECT ON TABLE public.print_system_settings TO service_role;
13. GRANT SELECT, INSERT ON TABLE public.print_cleanup_logs TO service_role;

REVOKE Statements in this file: ZERO (0)
```

### 2.2 Table-by-Table Privilege & Scope Analysis

| Target Table | Granted Privileges | Omitted Privileges | Security & Architectural Rationale |
| :--- | :--- | :--- | :--- |
| `public.print_admin_accounts` | `SELECT, INSERT` | `UPDATE, DELETE` | Allows admin profile lookup and initial bootstrap insertion. Updates/deletes are strictly forbidden. |
| `public.print_devices` | `SELECT, INSERT, UPDATE` | `DELETE` | Allows device enrollment (`INSERT`), heartbeat/status updates (`UPDATE`), and listing (`SELECT`). Hard deletes prohibited. |
| `public.print_printers` | `SELECT, INSERT, UPDATE, DELETE` | *None* | `DELETE` is allowed solely for unreferenced test printers. Soft-archived printers are preserved by foreign keys. |
| `public.print_pricing_rules` | `SELECT, INSERT, UPDATE` | `DELETE` | Allows price rules CRUD and toggling active status. Historical rules are deactivated, not deleted. |
| `public.print_jobs` | `SELECT, INSERT, UPDATE` | `DELETE` | Customer draft creation and admin status progression. Jobs must NEVER be hard-deleted (audit integrity). |
| `public.print_files` | `SELECT, INSERT, UPDATE` | `DELETE` | Upload record creation and soft-delete timestamp updates (`deleted_at`). Table rows remain permanent. |
| `public.print_payments` | `SELECT, INSERT, UPDATE` | `DELETE` | Payment submission and verification. Financial records cannot be deleted. |
| `public.print_job_attempts` | `SELECT, UPDATE` | `INSERT, DELETE` | Status updates by agent. Note: Inserts run exclusively inside `SECURITY DEFINER rpc_claim_next_print_job`. |
| `public.print_events` | `SELECT, INSERT` | `UPDATE, DELETE` | Append-only event store. `UPDATE` and `DELETE` are omitted and blocked by trigger `trg_prevent_print_events_mutation`. |
| `public.print_payment_settings`| `SELECT, UPDATE` | `INSERT, DELETE` | Singleton `id = 1` read and updates (UPI ID, instructions, QR path). Rows cannot be created or deleted. |
| `public.print_system_settings` | `SELECT` | `INSERT, UPDATE, DELETE` | Strictly read-only system limits across all Edge Functions. |
| `public.print_cleanup_logs` | `SELECT, INSERT` | `UPDATE, DELETE` | Appends log entries upon storage cleanup execution. |
| `public.print_api_rate_limits` | *Zero Grants* | `ALL` | Intentionally granted NO direct table access; accessed solely via `SECURITY DEFINER rpc_check_rate_limit`. |

### 2.3 Privilege Analysis: Excessive vs. Missing Privileges

1. **Potential Excessive Privileges:**
   - **`DELETE` on `print_printers`:** Evaluated carefully. In Phase 0/4, administrators can remove test printers that have never processed a job. Foreign key constraints (`ON DELETE RESTRICT` on `print_jobs.assigned_printer_id`) protect referenced production printers from deletion. This is acceptable, but soft-archiving (`archived_at`) remains the preferred production path.
   - **No other excessive privileges:** `DELETE` is withheld from 11 of the 12 granted tables. `UPDATE` is withheld from `print_events`, `print_admin_accounts`, and `print_cleanup_logs`.
2. **Potential Missing Privileges:**
   - **Sequence Privileges:** The migration does not contain `GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO service_role;`. Currently, all tables use `UUID` (`gen_random_uuid()`) or singleton integer `1`, so no `BIGSERIAL` sequences exist. However, adding this defensively ensures future sequence additions never fail.
   - **RPC Privileges:** Not needed in this file; `GRANT EXECUTE` on RPCs was already established in migrations 3 and 5.

### 2.4 Safety & Execution Assessment

* **Is Migration 6 Safe to Execute?**  
  **YES.** The migration is strictly additive. It issues `GRANT` statements only; it executes zero `REVOKE`, zero `DROP`, zero `ALTER`, and zero data mutations.
* **Is Execution Necessary?**  
  **CONDITIONAL.** If live testing indicates that Edge Functions using the `service_role` key receive `42501 permission denied for table print_*` errors, executing Migration 6 is necessary. If Supabase default project role settings already bypass table grants for `service_role`, it remains an idempotent hardening measure.
* **Risk of Breaking Existing Functions:**  
  **ZERO.** Granting permissions does not invalidate or break existing queries.
* **Rule Enforcement:**  
  In accordance with Phase 0 instructions, **do not execute Migration 6 at this time**. Only run the verification queries below to inspect current live privileges.

---

## 3. Read-Only Privilege Verification Queries

Execute these queries in the Supabase Dashboard SQL Editor (`tvtfgsijxlxpwgakpeag`) to verify the live privilege state:

```sql
-- Query 1: Check existing table-level privileges for service_role
SELECT 
    table_name,
    privilege_type
FROM information_schema.role_table_grants
WHERE grantee = 'service_role'
  AND table_schema = 'public'
  AND table_name LIKE 'print_%'
ORDER BY table_name, privilege_type;

-- Query 2: Check schema usage privilege
SELECT 
    schema_name,
    grantee,
    privilege_type
FROM information_schema.usage_privileges
WHERE grantee = 'service_role'
  AND object_schema = 'public';

-- Query 3: Check sequence privileges (if any exist)
SELECT 
    sequence_name,
    grantee,
    privilege_type
FROM information_schema.role_usage_grants
WHERE grantee = 'service_role'
  AND sequence_schema = 'public';
```

---

## 4. Risks & Recommendations
1. **Preserve Immutability:** Never grant `UPDATE` or `DELETE` on `print_events`.
2. **Maintain Deny-by-Default:** Never grant table privileges to `anon` or `authenticated`. All client operations must traverse Edge Functions.
3. **Execution Decision:** Only apply Migration 6 if Query 1 shows that `service_role` lacks necessary table-level `SELECT`, `INSERT`, or `UPDATE` privileges.
