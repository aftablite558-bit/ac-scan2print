# AC Scan2Print — Master Production Architecture Ledger (Phase 15)

> **Project:** AC Scan2Print (AMAN COMPUTER) — Full-Stack Smart QR Print Shop Platform  
> **Classification:** Production Master Ledger & Environmental Architecture Reference  
> **Authoritative Target Cloud Ref:** `tvtfgsijxlxpwgakpeag` (`https://tvtfgsijxlxpwgakpeag.supabase.co`)  
> **Firebase Project ID:** `aman-computer-27b21` · **Hosting Site:** `ac-scan2print`  
> **Super Admin Firebase UID:** `Yr0Wr7PuuAdOIMaqohmqaINNbNC2`  
> **Verified Date:** November 25, 2026 · **Version:** `1.0.4`

---

## 1. System Topology & Infrastructure Ledger

```text
[Walk-in Customer Smartphone] 
       │ (Camera / QR Scan — Zero App Install)
       ▼
[https://ac-scan2print.web.app/quick-print] ──(Firebase Hosting Rewrites: /quick-print/** -> /quick-print/index.html)
       │ (Uploads PDF/Image via 120s pre-signed URL directly to Supabase Storage)
       ▼
[Supabase Private Bucket: print-uploads] ◄─── (Private, RLS-enforced, public=false)
       ▲
       │ (Atomic Claim via rpc_claim_next_print_job with SKIP LOCKED)
[Windows 11 Counter PC (.NET 8 Worker)] ──(Session-0 LocalSystem Windows Service)
       │
       ├─► [%ProgramData%\ACScan2Print\Security] (DPAPI LocalMachine Credentials)
       ├─► [AC Scan2Print Tray Companion] (Interactive User Desktop Session)
       └─► [Windows Print Spooler -> Physical Counter Printers] (Auto-Duplex Long-Edge / Simplex)
       ▲
       │ (Super Admin Management: Review, Verify UPI, Queue Release, Daily Closeout)
[https://ac-scan2print.web.app/ (Admin Control Center)] ──(Firebase Hosting: ** -> /index.html)
       │ (Authenticated via Firebase Super Admin ID Token -> Yr0Wr7PuuAdOIMaqohmqaINNbNC2)
       ▼
[Supabase Edge Gateway: 21 Edge Functions] (Edge-proxy allowlist, verify_jwt=false, custom RS256 token verification)
```

---

## 2. All 7 PostgreSQL Database Migrations

All 7 migrations reside in `supabase/migrations/` and apply in strict chronological order:

| # | Migration File | Scope & Invariants |
| :-: | :--- | :--- |
| 1 | `202611200001_scan2print_core_schema.sql` | 12 core tables: `print_devices`, `print_printers`, `print_pricing_rules`, `print_jobs`, `print_files`, `print_payments`, `print_job_attempts`, `print_events`, `print_payment_settings`, `print_system_settings`, `print_cleanup_logs`, `print_api_rate_limits`. Forced RLS on all tables. |
| 2 | `202611200002_scan2print_rls_and_storage.sql` | Storage bucket provisioning (`print-uploads`, `payment-evidence`, `payment-assets`, all `public = false`). Direct public SELECT denied; 120s pre-signed URLs only. |
| 3 | `202611200003_scan2print_atomic_rpcs.sql` | Concurrency & race-condition defense: `rpc_release_print_job` (atomic approval & queueing), `rpc_claim_next_print_job` (`FOR UPDATE OF j SKIP LOCKED LIMIT 1`), `rpc_check_rate_limit` (atomic sliding window rate limit). |
| 4 | `202611200004_scan2print_firebase_auth_admin.sql` | Single Super Admin registry: `print_admin_accounts` with `singleton_guard = true` and `firebase_uid` foreign link (`Yr0Wr7PuuAdOIMaqohmqaINNbNC2`). |
| 5 | `202611210001_scan2print_phase0_printers.sql` | Real-world hardware audit schema: tri-state capabilities (`supports_colour`, `supports_duplex` NULL-safe), connection types (`usb`, `wifi`, `lan`, `other`, `unknown`), soft-archiving (`archived_at`). |
| 6 | `202611230001_scan2print_service_role_grants.sql` | Least-privilege PostgreSQL grants: explicit `GRANT USAGE ON SCHEMA public TO service_role` and selective DML grants on 12 tables (hard deletes forbidden on financial & audit tables). |
| 7 | `202611250001_scan2print_phase11_pilot_controls.sql` | Controlled pilot rollout controls: `pilot_stage`, `customer_portal_url`, `pilot_target_jobs`, `pilot_intake_paused`, `pilot_pause_reason`, `pilot_checklist`, `retention_policy_confirmed`, `draft_retention_hours`, `completed_retention_hours`, `failed_retention_hours`, `auto_cleanup_enabled`. |

---

## 3. All 21 Supabase Edge Functions (`verify_jwt = false`)

All 21 functions are declared in `supabase/config.toml` with `verify_jwt = false` because Firebase Auth JWTs, device credentials, customer tracking tokens, and cron secrets are validated cryptographically inside the shared handler layer (`supabase/functions/_shared/`):

1. `admin-bootstrap`: One-time Super Admin provisioning (requires `ADMIN_BOOTSTRAP_SECRET` + Firebase Token).
2. `admin-confirm-cash`: Validates and confirms walk-in counter cash payments.
3. `admin-print-jobs`: Master list, detail, and daily shift financial closeout engine.
4. `admin-printers`: Hardware printer CRUD, capabilities override, and soft-archive.
5. `admin-release-print-job`: Releases paid/approved jobs into the active queue via `rpc_release_print_job`.
6. `admin-retry-print-job`: Retries faulted or spooler-jammed print jobs.
7. `admin-review-print-job`: Places suspicious or flagged jobs into needs-review status.
8. `admin-update-payment-settings`: Updates UPI VPA and counter payment QR image.
9. `admin-verify-payment`: Verifies customer 12-digit UPI UTR and auto-qualifies for queue.
10. `agent-claim-job`: Leases next queued job for shop PC agent via `rpc_claim_next_print_job` (`SKIP LOCKED`).
11. `agent-enroll`: Admin-authorized Windows counter PC enrollment.
12. `agent-heartbeat`: 30-second keepalive, agent version telemetry, and printer status sync.
13. `agent-report-job-event`: Reports Win32 spooler job status, paper jams, and completion.
14. `agent-sync-printers`: Discovers and syncs installed Windows printers with capability detection.
15. `cleanup-expired-print-files`: Automated document retention cleaner (protected via `x-cron-secret` or Admin token).
16. `create-print-job`: Initiates customer print draft with anti-tampering guards and file validation.
17. `create-print-upload-url`: Issues short-lived pre-signed PUT URLs for customer documents.
18. `finalize-print-upload`: Validates file size, MIME type, and cryptographic checksum.
19. `get-print-job-status`: Customer anonymous tracking poller (authenticated via `x-tracking-token`).
20. `get-public-payment-settings`: Public gateway exposing active UPI settings and `portalConfig`.
21. `submit-upi-payment`: Submits customer UPI reference (12-digit UTR) for counter verification.

---

## 4. Private Storage Architecture

| Bucket | Access | Limit | MIME Types | TTL | Security Enforcement |
| :--- | :---: | :---: | :--- | :---: | :--- |
| `print-uploads` | Private | 20 MiB | `application/pdf`, `image/jpeg`, `image/png` | 120s | Direct public SELECT blocked; short-lived pre-signed URLs only. |
| `payment-evidence` | Private | 10 MiB | `image/jpeg`, `image/png`, `image/webp` | 120s | Restricted to customer upload and Super Admin verification review. |
| `payment-assets` | Private | 5 MiB | `image/png`, `image/jpeg`, `image/webp` | Public Read | Shop counter UPI QR code image only; mutated exclusively by Super Admin. |

---

## 5. Dual Frontend & Unified Firebase Hosting

- **Admin Control Center (`dist/index.html`):** Built via Vite into `dist/`. Handles complete shop management, payment auditing, pricing rules, device pairing, and system settings.
- **Customer QR Portal (`dist-customer/index.html` mounted at `dist/quick-print/index.html`):** Built with `--base=/quick-print/` and mounted cleanly into `dist/quick-print/`. Allows walk-in customers to upload documents, choose duplex/simplex/colour options, and pay via UPI or cash.
- **Unified Routing Invariant (`firebase.json`):**
  - `/quick-print` and `/quick-print/**` rewrite to `/quick-print/index.html` BEFORE the root Admin `** -> /index.html` catch-all.
  - Security headers enforced: `no-cache` on `/quick-print/index.html`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy: no-referrer`.

---

## 6. Windows 11 Print Agent & Session-0 DPAPI Bridge

- **Windows Service (`LocalSystem`, Session 0):** `ACScan2Print.Agent.Worker.exe` runs unattended, polling `agent-claim-job` every 10 seconds, downloading documents via signed URLs, and rendering via headless PDFium / GDI+ to the Win32 Print Spooler.
- **Desktop Companion (`CurrentUser`, Session 1+):** `ACScan2Print.Agent.Tray.exe` provides a system tray monogram in Electric Cyan (`#25C7D9`), quick diagnostics, and device pairing.
- **Session-0 DPAPI Bridge:** Credentials (`ACScan2Print_DeviceId` and `ACScan2Print_DeviceCredential`) are encrypted using **`DataProtectionScope.LocalMachine`** in `%ProgramData%\ACScan2Print\Security`. Folder permissions are hardened via `icacls` to `SYSTEM` and `Administrators` only, allowing seamless credential sharing between the service and tray application.

---

## 7. Financial Accounting & Billing Integrity

- **Integer Paise Accounting:** All calculations (subtotals, tax, gross amount, and daily shift summaries) are computed in integer paise (`₹1.00 = 100 paise`), preventing floating-point precision drift.
- **Duplex Paper Sheet Rule:** Duplex billing is strictly calculated per physical paper sheet (`ceil(pages / 2)`), matching real-world paper inventory consumption.
- **CSV Formula-Injection Protection:** All ledger and audit exports (`buildJobsLedgerCsv` and `buildAuditEventsCsv`) enforce OWASP formula-injection prefixing (`= + - @ \t \r`).

---

## 8. Operational Resilience & Disaster Recovery

- **Emergency Intake Rollback:** Super Admin can pause customer uploads instantly via Admin UI or `admin-update-pilot-settings` (`pilot_intake_paused = true`). The portal returns `HTTP 503 PORTAL_INTAKE_PAUSED` with a customizable shop counter message while existing order tracking remains fully functional.
- **Document Retention Policy:** Expired draft documents (>1h) and completed print files (>24h) are purged automatically via `cleanup-expired-print-files` only after the owner confirms the retention schedule (`retention_policy_confirmed = true`). In-flight, unpaid, or disputed jobs are never deleted.
- **Automated Verification Tooling:**
  - `npm run cloud:preflight`: Verifies database migrations, Edge config, and live Supabase schema.
  - `npm run cloud:smoke`: Verifies live hosting routes, CORS, and 401 auth boundaries.
  - `npm run cloud:cleanup`: Runs dry-run or live retention purges.
  - `npm run master:audit`: Executes the comprehensive 8-layer architecture verification audit.
