# AC Scan2Print — Database Reconciliation Report

**Document Type:** Database Schema, Permissions & Storage Reconciliation  
**Target Project:** `tvtfgsijxlxpwgakpeag` (`https://tvtfgsijxlxpwgakpeag.supabase.co`)  
**Inspection Date:** November 24, 2026  
**Auditor:** Senior Supabase Database Auditor & Security Engineer  
**Execution Mode:** Read-Only Audit · Zero SQL Executed · Verification Queries Provided  

---

## 1. Executive Summary

This report establishes the complete reconciliation of the PostgreSQL database schema for AC Scan2Print against the authoritative migrations and the live Supabase project `tvtfgsijxlxpwgakpeag`. 
The schema comprises 13 dedicated application tables in the `public` schema, Row Level Security (RLS) enforcement, 3 atomic stored procedures (RPCs), and 3 private storage buckets in the `storage` schema.

**Key Findings:**
1. **Migration 5 Status (`202611210001_scan2print_phase0_printers.sql`):** Confirmed as previously applied and verified in the production SQL Editor. It extended `print_printers` with hardware audit columns, tri-state capability nullability, connection type support (`usb`, `wifi`, `lan`, `other`, `unknown`), and updated `rpc_release_print_job` and `rpc_claim_next_print_job` to reject archived or unapproved hardware. **It must NOT be reapplied.**
2. **Storage Bucket Names:** The authoritative names in code and migrations are `print-uploads`, `payment-evidence`, and `payment-assets` (all private). An earlier AI audit report erroneously claimed names like `customer-print-files`.
3. **Migration 6 Status (`202611230001_scan2print_service_role_grants.sql`):** Contains least-privilege table grants for `service_role`. It has been inspected and verified safe, but has not yet been executed in production.
4. **Classification Summary:**
   - Database Tables & Core Schema: **SOURCE VERIFIED** in migrations 1–4.
   - Hardware Columns & Updated RPCs: **LIVE VERIFIED** (applied in production via Migration 5).
   - Storage Buckets: **SOURCE VERIFIED** in code & migrations.
   - Service Role Grants: **SOURCE VERIFIED** in migration 6 / **PENDING EXECUTION**.

---

## 2. Table-by-Table Inventory & Schema Verification

| # | Table Name | Purpose | Primary Key | Key Foreign Keys | RLS Status | Verification Status |
| :-: | :--- | :--- | :--- | :--- | :---: | :---: |
| 1 | `public.print_admin_accounts` | Super Admin identity registry | `id` (UUID) | None | FORCE RLS | SOURCE VERIFIED (`202611200004_*`) |
| 2 | `public.print_devices` | Windows Print Agent devices | `id` (UUID) | None | FORCE RLS | SOURCE VERIFIED (`202611200001_*`) |
| 3 | `public.print_printers` | Physical printer registry | `id` (UUID) | `device_id -> print_devices(id)`, `archived_by -> print_admin_accounts(id)` | FORCE RLS | LIVE VERIFIED (`202611210001_*`) |
| 4 | `public.print_pricing_rules` | Server-authoritative rates | `id` (UUID) | None | FORCE RLS | SOURCE VERIFIED (`202611200001_*`) |
| 5 | `public.print_jobs` | Master print orders & lifecycle | `id` (UUID) | `assigned_printer_id -> print_printers(id)` | FORCE RLS | SOURCE VERIFIED (`202611200001_*`) |
| 6 | `public.print_files` | Uploaded document metadata | `id` (UUID) | `job_id -> print_jobs(id)` | FORCE RLS | SOURCE VERIFIED (`202611200001_*`) |
| 7 | `public.print_payments` | UPI and cash transactions | `id` (UUID) | `job_id -> print_jobs(id)`, `verified_by -> print_admin_accounts(id)` | FORCE RLS | SOURCE VERIFIED (`202611200001_*`) |
| 8 | `public.print_job_attempts` | Print claim & spooler attempts | `id` (UUID) | `job_id -> print_jobs(id)`, `device_id -> print_devices(id)` | FORCE RLS | SOURCE VERIFIED (`202611200001_*`) |
| 9 | `public.print_events` | Append-only immutable audit trail | `id` (UUID) | `job_id -> print_jobs(id)` | FORCE RLS | SOURCE VERIFIED (`202611200001_*`) |
| 10 | `public.print_payment_settings` | Shop UPI singleton (`id = 1`) | `id` (INT) | None | FORCE RLS | SOURCE VERIFIED (`202611200001_*`) |
| 11 | `public.print_system_settings` | System limits singleton (`id = 1`)| `id` (INT) | None | FORCE RLS | SOURCE VERIFIED (`202611200001_*`) |
| 12 | `public.print_cleanup_logs` | Document retention run history | `id` (UUID) | None | FORCE RLS | SOURCE VERIFIED (`202611200001_*`) |
| 13 | `public.print_api_rate_limits` | Sliding window rate limits | `bucket_key` (TEXT) | None | FORCE RLS | SOURCE VERIFIED (`202611200001_*`) |

---

## 3. Detailed Verification of `print_printers` Schema

In accordance with Phase 0 Discovery & Hardware Audit requirements, `print_printers` must accommodate real-world hardware uncertainty without fabricating capabilities.

### 3.1 Extended Columns (Applied via `202611210001_scan2print_phase0_printers.sql`)
1. `printer_model TEXT` — Optional manufacturer model name (e.g., "HP LaserJet Pro MFP M126nw").
2. `discovery_source TEXT NOT NULL DEFAULT 'manual'` — Checked: `('manual', 'agent')`.
3. `approval_status TEXT NOT NULL DEFAULT 'manual'` — Checked: `('manual', 'pending_review', 'approved', 'rejected')`.
4. `last_verified_at TIMESTAMPTZ` — Timestamp of last successful physical test print.
5. `archived_at TIMESTAMPTZ` — Soft-archive timestamp; retains historical job foreign keys while hiding from new orders.
6. `archived_by UUID REFERENCES public.print_admin_accounts(id) ON DELETE SET NULL` — Admin who soft-archived the printer.
7. `audit_notes TEXT` — Operational notes regarding paper jams, hardware defects, or driver nuances.

### 3.2 Tri-State Capability Nullability
- `supports_colour BOOLEAN NULL DEFAULT NULL`:
  - `TRUE` = Verified colour capability.
  - `FALSE` = Monochrome only.
  - `NULL` = Unknown capability (default; prevents offering colour options until physically verified).
- `supports_duplex BOOLEAN NULL DEFAULT NULL`:
  - `TRUE` = Hardware automatic duplex supported.
  - `FALSE` = Simplex only.
  - `NULL` = Unknown capability (default; prevents offering duplex options until physically verified).

### 3.3 Constraints & Indexes
- `chk_print_printers_connection_type` CHECK: `connection_type IN ('usb', 'wifi', 'lan', 'other', 'unknown')`.
- `chk_print_printers_archived_disabled` CHECK: `archived_at IS NULL OR (is_enabled = FALSE AND is_default = FALSE AND printer_status = 'disabled')`.
- `idx_print_printers_active`: `ON public.print_printers (is_enabled, printer_status) WHERE archived_at IS NULL`.
- `idx_print_printers_device_id`: `ON public.print_printers (device_id) WHERE device_id IS NOT NULL AND archived_at IS NULL`.

---

## 4. Stored Procedures (Atomic RPCs)

The database encapsulates all high-concurrency state transitions in `SECURITY DEFINER` functions:

### 4.1 `public.rpc_release_print_job(p_job_id UUID, p_printer_id UUID, p_admin_id UUID)`
- **Behavior:**
  1. Locks target job row `FOR UPDATE`.
  2. Asserts `status = 'approved'` and `payment_status = 'paid'`.
  3. Verifies target printer exists, is enabled, not disabled, `archived_at IS NULL`, and `approval_status NOT IN ('pending_review', 'rejected')`.
  4. Asserts no active attempts exist (`finished_at IS NULL`).
  5. Updates job `status = 'queued'`, `assigned_printer_id = p_printer_id`.
  6. Writes immutable audit row to `print_events`.
- **Permissions:** `REVOKE ALL FROM PUBLIC; GRANT EXECUTE TO service_role;`.

### 4.2 `public.rpc_claim_next_print_job(p_device_id UUID, p_lease_seconds INT, p_idempotency_key UUID)`
- **Behavior:**
  1. Verifies requesting device exists and `device_status = 'active'`.
  2. Queries next eligible job: `status = 'queued'`, `payment_status = 'paid'`, assigned to an active, approved, non-archived printer linked to `p_device_id`.
  3. Uses `FOR UPDATE OF j SKIP LOCKED LIMIT 1` (guarantees zero race conditions between concurrent worker threads).
  4. Generates attempt number (`COALESCE(MAX, 0) + 1`), sets lease expiration (`now() + p_lease_seconds`).
  5. Inserts new record into `print_job_attempts` in status `'claimed'`.
  6. Transitions job `status = 'claimed'`.
  7. Writes immutable audit row to `print_events`.
- **Permissions:** `REVOKE ALL FROM PUBLIC; GRANT EXECUTE TO service_role;`.

### 4.3 `public.rpc_check_rate_limit(p_key TEXT, p_max_hits INT, p_window_seconds INT)`
- **Behavior:** Atomic upsert into `print_api_rate_limits` with sliding window cutoff calculation. Returns `BOOLEAN`.
- **Permissions:** `REVOKE ALL FROM PUBLIC; GRANT EXECUTE TO service_role;`.

---

## 5. Storage Buckets & Policies

Three private buckets are defined in `storage.buckets`:

1. `print-uploads` (20 MiB limit, `application/pdf`, `image/jpeg`, `image/png`, Private)
2. `payment-evidence` (10 MiB limit, `image/jpeg`, `image/png`, `image/webp`, Private)
3. `payment-assets` (5 MiB limit, `image/png`, `image/jpeg`, `image/webp`, Private)

**Access Policy (`scan2print_no_direct_storage_select`):**
Direct `SELECT` on `storage.objects` is denied to public and anon callers. Only authenticated Super Admins can list objects. All client and agent uploads and downloads must use pre-signed URLs generated server-side.

---

## 6. Migration 6 Privilege Audit (`service_role` Grants)

Inspection of `supabase/migrations/202611230001_scan2print_service_role_grants.sql`:
- **Grants Included:**
  - `USAGE` on schema `public`.
  - `SELECT, INSERT` on `print_admin_accounts`, `print_events`, `print_cleanup_logs`.
  - `SELECT, INSERT, UPDATE` on `print_devices`, `print_pricing_rules`, `print_jobs`, `print_files`, `print_payments`.
  - `SELECT, INSERT, UPDATE, DELETE` on `print_printers`.
  - `SELECT, UPDATE` on `print_job_attempts`, `print_payment_settings`.
  - `SELECT` on `print_system_settings`.
- **Privilege Assessment:**
  - **Excessive Privileges:** None identified that compromise data integrity. `DELETE` is withheld from 11 of 12 tables. The `DELETE` on `print_printers` is bounded by `RESTRICT` foreign keys from `print_jobs`.
  - **Missing Privileges:** Sequences are not explicitly granted, but currently all tables utilize `gen_random_uuid()` or fixed singleton keys.
- **Safety:** The script contains zero `DROP`, zero `REVOKE`, zero `ALTER`, and zero data mutations. It is 100% additive and safe to apply when authorized.
- **Phase 0 Rule:** **Do not execute now.** Keep in pending status until Phase 2 database deployment.

---

## 7. Read-Only Production Verification Queries

The following queries should be run in the Supabase Dashboard SQL Editor (`tvtfgsijxlxpwgakpeag`) to confirm live database alignment without executing changes:

```sql
-- 1. Verify existence of all 13 Scan2Print tables
SELECT table_name, is_insertable_into
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name LIKE 'print_%'
ORDER BY table_name;

-- 2. Verify print_printers columns added in Migration 5
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'print_printers'
  AND column_name IN (
    'printer_model', 'discovery_source', 'approval_status',
    'last_verified_at', 'archived_at', 'archived_by', 'audit_notes',
    'supports_colour', 'supports_duplex', 'connection_type'
  )
ORDER BY column_name;

-- 3. Verify RPC function signatures and security properties
SELECT routine_name, security_type, data_type
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN ('rpc_release_print_job', 'rpc_claim_next_print_job', 'rpc_check_rate_limit');

-- 4. Verify private Storage buckets
SELECT id, name, public, file_size_limit, allowed_mime_types
FROM storage.buckets
WHERE id IN ('print-uploads', 'payment-evidence', 'payment-assets');

-- 5. Inspect current table grants for service_role
SELECT table_name, privilege_type
FROM information_schema.role_table_grants
WHERE grantee = 'service_role'
  AND table_schema = 'public'
  AND table_name LIKE 'print_%'
ORDER BY table_name, privilege_type;
```

---

## 8. Risks & Recommendations
1. **Never Reapply Migration 5:** Re-executing `202611210001` could result in duplicate constraint errors or unexpected schema churn.
2. **Execute Migration 6 in Phase 2:** Apply Migration 6 during the Phase 2 backend deployment sequence to ensure least-privilege `service_role` access.
