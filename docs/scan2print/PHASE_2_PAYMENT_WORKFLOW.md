# AC Scan2Print — Phase 2: Manual UPI & Cash Payment Workflow

AC Scan2Print intentionally excludes automated payment gateways (no Razorpay, no Cashfree, no webhooks) and enforces manual Admin verification for all print jobs.

---

## 1. Editable Shop Payment Settings (Zero Hardcoded UPI/QR)
- Table `public.print_payment_settings` (`id = 1`) initializes with `upi_enabled = FALSE`, `upi_id = NULL`, `upi_qr_storage_path = NULL`.
- Admin uploads a QR image into private bucket `payment-assets` and saves `upi_id`, `upi_enabled`, `display_name`, and `payment_instructions` via `admin-update-payment-settings`.
- Customer portal fetches safe display metadata + a short-lived (`300s`) signed QR URL via `get-public-payment-settings`.

## 2. UPI Payment Flow
1. Server calculates `final_amount` during `finalize-print-upload` using `print_pricing_rules` (`per_physical_sheet` for duplex).
2. Customer displays exact server `final_amount`, shop `upi_id`, and signed UPI QR image, completes transfer in any UPI app, and obtains a UTR / transaction reference (`6–40` alphanumeric chars) + optional screenshot (`<= 10 MB` JPG/PNG/WEBP).
3. Customer calls `submit-upi-payment`:
   - `payment_status` becomes **`pending_verification`** (customers are strictly blocked with `403` from sending `paymentStatus = 'paid'`).
   - Duplicate active payments per job and duplicate active UTRs across jobs are rejected (`409 DUPLICATE_UTR`) via PostgreSQL partial unique indexes.
4. Admin inspects payment & screenshot via `admin-verify-payment`:
   - **Approve:** sets `payment_status = 'paid'`, `verified_by = admin.id`, `verified_at = now()`, updates `print_jobs.payment_status = 'paid'`.
   - **Reject:** requires `reason`, sets `print_payments.payment_status = 'unpaid'` + `rejection_reason` and returns `print_jobs.payment_status = 'unpaid'` so the customer can resubmit a valid UTR or switch to cash.

## 3. Counter Cash Payment Flow
1. Customer calls `submit-upi-payment` with `{ paymentMethod: 'cash' }` -> sets `payment_method = 'cash'`, `payment_status = 'unpaid'`, transitions `submitted/under_review -> awaiting_payment`.
2. Customer pays cash at the Aman Computer counter.
3. Admin calls `admin-confirm-cash` -> inserts `print_payments` (`payment_method = 'cash'`, `payment_status = 'paid'`, `verified_by = admin.id`, `verified_at = now()`) and updates `print_jobs.payment_status = 'paid'`.

## 4. Queue Release Gate
- `admin-release-print-job` + PostgreSQL `rpc_release_print_job` enforce **ALL** of:
  1. `print_jobs.status = 'approved'`
  2. `print_jobs.payment_status = 'paid'`
  3. Enabled printer exists (`is_enabled = TRUE`)
  4. Zero active `print_job_attempts` exist
- Any attempt to release an unpaid job fails (`409 PAYMENT_NOT_VERIFIED`), and duplicate release fails (`409 JOB_ALREADY_QUEUED`).
