# AC Scan2Print — Phase 2: Edge Function API Contract

All 18 Supabase Edge Functions live under `/supabase/functions/<name>/index.ts` and delegate to validated handlers in `/supabase/functions/_shared/handlers.ts`.

---

## 1. Customer-Facing Endpoints (No Auth Account Required)

| Endpoint | Method | `verify_jwt` | Caller Auth | Core Behavior |
| :--- | :--- | :---: | :--- | :--- |
| `/functions/v1/create-print-job` | `POST` | `false` | Rate-limited IP | Creates `draft` job; rejects client `subtotal`/`finalAmount`/`status`; returns `jobId`, `jobNumber`, and one-time `draftUploadSecret`. |
| `/functions/v1/create-print-upload-url` | `POST` | `false` | `x-draft-secret` | Validates file count (`<= max_files_per_job`), size (`<= 20 MB`), extension/MIME match; generates opaque UUID path; returns `120s` signed upload URL on `print-uploads`. |
| `/functions/v1/finalize-print-upload` | `POST` | `false` | `x-draft-secret` | Inspects uploaded bytes (magic bytes + MIME spoof check + PDF page count), purges invalid objects, computes server price (`PRICING_NOT_CONFIGURED` if unconfigured), transitions `draft -> submitted`, clears draft secret, returns `trackingToken` **once**. |
| `/functions/v1/get-print-job-status` | `GET`/`POST` | `false` | `x-tracking-token` or POST `trackingToken` | Rejects URL query tokens (`?token=`); verifies SHA-256 hash in constant time; rate-limited; returns customer-safe status & payment metadata. |
| `/functions/v1/get-public-payment-settings` | `GET` | `false` | Public rate-limited | Returns `upiEnabled`, `upiId` (only if enabled), `displayName`, `paymentInstructions`, `cashEnabled`, and `300s` signed QR image URL (never raw bucket path). |
| `/functions/v1/submit-upi-payment` | `POST` | `false` | `x-tracking-token` or POST `trackingToken` | `action: 'prepare_evidence_upload'` returns `120s` signed upload URL on `payment-evidence`; `action: 'submit'` records Cash intent (`unpaid`) OR UPI UTR + validated screenshot (`pending_verification`). Never allows client to set `paid`. |

---

## 2. Admin-Facing Endpoints (Single MVP Admin Only)

| Endpoint | Method | `verify_jwt` | Caller Auth | Core Behavior |
| :--- | :--- | :---: | :--- | :--- |
| `/functions/v1/admin-bootstrap` | `POST` | `false` | `x-admin-bootstrap-secret` | One-time MVP Admin creation/binding; fails `409 SINGLE_ADMIN_ALREADY_EXISTS` if any Admin already exists. |
| `/functions/v1/admin-review-print-job` | `POST` | `true` | Admin JWT + DB check | `start_review`, `request_payment`, `approve`, `reject` (reason required), `cancel`, `override_price` (reason >= 5 chars, blocked if paid/terminal). |
| `/functions/v1/admin-verify-payment` | `POST` | `true` | Admin JWT + DB check | Approves (`pending_verification -> paid`, stamps `verified_by`/`verified_at`) or rejects (`pending_verification -> unpaid` with reason). |
| `/functions/v1/admin-confirm-cash` | `POST` | `true` | Admin JWT + DB check | Marks counter cash payment as `paid` (`payment_method = 'cash'`, `verified_by`, `verified_at`); rejects if already paid or UPI verification pending. |
| `/functions/v1/admin-update-payment-settings` | `POST` | `true` | Admin JWT + DB check | Prepares `120s` signed upload URL for `payment-assets` UPI QR or updates `upi_enabled`, `upi_id`, `upi_qr_storage_path` (magic-byte checked), `display_name`, `payment_instructions`. |
| `/functions/v1/admin-release-print-job` | `POST` | `true` | Admin JWT + DB check | Calls `rpc_release_print_job`; enforces `status === 'approved'`, `payment_status === 'paid'`, enabled printer, no active attempts; prevents duplicate release. |
| `/functions/v1/admin-retry-print-job` | `POST` | `true` | Admin JWT + DB check | Explicit manual reconciliation on `failed` or `needs_review` jobs (`retry` -> `queued`, `mark_completed` -> `completed`, `cancel` -> `cancelled`) with mandatory `reason`. |
| `/functions/v1/cleanup-expired-print-files` | `POST` | `false` | `x-cron-secret` OR Admin JWT | Purges expired drafts & terminal files after TTL; skips active jobs and jobs with `pending_verification` payments; defaults to `dry_run` for cron until retention policy confirmed. |

---

## 3. Future Device Foundation Endpoints (Phase 5 Ready)

| Endpoint | Method | `verify_jwt` | Caller Auth | Core Behavior |
| :--- | :--- | :---: | :--- | :--- |
| `/functions/v1/agent-enroll` | `POST` | `true` | Admin JWT + DB check | Enrolls a shop Windows 11 PC; returns high-entropy `deviceCredential` once and stores SHA-256 `credential_hash`. |
| `/functions/v1/agent-heartbeat` | `POST` | `false` | `x-device-credential` | Rejects paused/revoked devices (`403`); updates `last_heartbeat_at` and printer connectivity status without altering `capabilities_verified`. |
| `/functions/v1/agent-claim-job` | `POST` | `false` | `x-device-credential` | Calls `rpc_claim_next_print_job` (`SKIP LOCKED`); returns claimed job metadata + `120s` signed download URLs for private documents. |
| `/functions/v1/agent-report-job-event` | `POST` | `false` | `x-device-credential` | Advances attempt & job state (`downloading`, `printing`, `submitted_to_spooler`, `completed`, `failed`, `needs_review`); enforces strict transitions and manual reconciliation on `needs_review`. |
