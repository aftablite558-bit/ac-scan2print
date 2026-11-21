# AC Scan2Print — Phase 2: Database Schema & Migration Architecture

**Migration Files:**
- `supabase/migrations/202611200001_scan2print_core_schema.sql`
- `supabase/migrations/202611200002_scan2print_rls_and_storage.sql`
- `supabase/migrations/202611200003_scan2print_atomic_rpcs.sql`

---

## 1. Entity Inventory & Invariants

| Table | Purpose | Key Database Constraints & Indexes |
| :--- | :--- | :--- |
| `public.print_admin_accounts` | Single MVP Admin identity mapped 1:1 to `auth.users(id)` | `singleton_guard BOOLEAN NOT NULL DEFAULT TRUE CHECK (singleton_guard = TRUE)`, `CONSTRAINT uq_print_admin_single_mvp_account UNIQUE (singleton_guard)` enforces literally ONE Admin row in MVP. |
| `public.print_devices` | Windows 11 Local Print Agent foundation | `device_status IN ('pending','active','paused','revoked')`, `credential_hash TEXT UNIQUE`. Raw credentials never stored. |
| `public.print_printers` | Printer fleet registry | `capabilities_verified BOOLEAN NOT NULL DEFAULT FALSE`, `is_enabled BOOLEAN NOT NULL DEFAULT FALSE`. No pre-invented hardware capabilities or models. |
| `public.print_pricing_rules` | Server-authoritative pricing rules | `CHECK (print_sides <> 'duplex' OR pricing_unit = 'per_physical_sheet')`, `CHECK (rate >= 0)`, partial unique index `idx_print_pricing_rules_active_unique` on `(paper_size, print_mode, print_sides) WHERE is_active = TRUE`. Zero seeded/hardcoded INR prices. |
| `public.print_jobs` | Core job lifecycle, pricing & printer assignment | 16 canonical statuses in `CHECK`; `chk_submitted_requires_tracking_hash`; `chk_queued_requires_paid_and_printer` (`status <> 'queued' OR (payment_status = 'paid' AND assigned_printer_id IS NOT NULL)`). |
| `public.print_files` | Uploaded documents linked to jobs | Opaque UUID `storage_path UNIQUE`, `file_size_bytes > 0 AND <= 20971520`, `validation_status IN ('pending','valid','invalid')`, `deleted_at`. |
| `public.print_payments` | Manual UPI & Cash verification records | `chk_paid_requires_verifier` (`payment_status <> 'paid' OR (verified_by IS NOT NULL AND verified_at IS NOT NULL)`), `idx_print_payments_active_job_unique` (one active pending/paid payment per job), `idx_print_payments_utr_unique` (prevents duplicate UTR submission). |
| `public.print_job_attempts` | Atomic execution & Windows Spooler lease tracking | `uq_print_job_attempts_number (job_id, attempt_number)`, `idx_print_job_attempts_one_active ON (job_id) WHERE finished_at IS NULL`. |
| `public.print_events` | Append-only immutable audit log | `trg_print_events_immutable` (`BEFORE UPDATE OR DELETE`) raises exception blocking any tampering or deletion. |
| `public.print_payment_settings` | Singleton (`id = 1`) editable UPI configuration | `upi_enabled = FALSE`, `upi_id = NULL`, `upi_qr_storage_path = NULL` by default (zero hardcoded UPI IDs or QR images). |
| `public.print_system_settings` | Singleton (`id = 1`) limits, portal URL & retention TTLs | `retention_policy_confirmed = FALSE`, `auto_cleanup_enabled = FALSE` until confirmed; default ceiling `20 MB`, `5` files, `20` copies, `1h`/`24h`/`72h`. |
| `public.print_cleanup_logs` | Retention run audit history | Tracks `run_mode` (`dry_run` \| `execute`), expired jobs, deleted objects, and `skipped_active_or_disputed`. |
| `public.print_api_rate_limits` | Distributed Edge Function rate limit buckets | Atomic upsert/reset via `rpc_check_rate_limit`. |

---

## 2. Atomic PostgreSQL RPCs

1. **`public.rpc_release_print_job(p_job_id UUID, p_printer_id UUID, p_admin_id UUID)`**
   - Locks `print_jobs` row `FOR UPDATE`.
   - Rejects `JOB_ALREADY_QUEUED`, non-`approved` state, non-`paid` payment, disabled/missing printer, or any open attempt (`finished_at IS NULL`).
   - Transitions `approved -> queued`, binds `assigned_printer_id`, appends `job_released_to_queue` event atomically.
2. **`public.rpc_claim_next_print_job(p_device_id UUID, p_lease_seconds INTEGER, p_idempotency_key UUID)`**
   - Requires `print_devices.device_status = 'active'`.
   - Selects oldest `queued` + `paid` job assigned to an enabled printer owned by `p_device_id` with zero active attempts using `FOR UPDATE OF j SKIP LOCKED LIMIT 1`.
   - Atomically creates `print_job_attempts` row, updates `print_jobs.status = 'claimed'`, and appends `job_claimed` event.
3. **`public.rpc_check_rate_limit(p_key TEXT, p_max_hits INTEGER, p_window_seconds INTEGER)`**
   - Atomically increments or resets sliding window counters per IP/route bucket.

---

## 3. Private Storage Buckets

All three Storage buckets are strictly **`public = FALSE`**:
- `print-uploads` (`20 MiB`, `application/pdf`, `image/jpeg`, `image/png`)
- `payment-evidence` (`10 MiB`, `image/jpeg`, `image/png`, `image/webp`)
- `payment-assets` (`5 MiB`, `image/png`, `image/jpeg`, `image/webp`)
