# AC Scan2Print (AMAN COMPUTER) — Smart QR Print System
## Phase 1: End-to-End User Flows & Critical Business Workflows

**Document Version:** 1.0  
**Phase:** Phase 1 — Product Specification & UX Design (Documentation Only)  
**Date:** 20 November 2026  

---

## 1. End-to-End Customer Journey (`/quick-print*`)

### Flow 1: QR Scan to Document Upload & Job Submission
1. **QR Scan:** Customer scans shop permanent QR poster (`https://<domain>/quick-print`) using Android/iPhone camera.
2. **Portal Landing (`/quick-print`):** Mobile-first screen loads quickly with Aman Computer / AC Scan2Print branding, 4-step summary, allowed types (`PDF`, `JPG/JPEG`, `PNG`), file size/count limits, privacy retention notice, and **Start Print Upload** CTA.
3. **File Selection & Client Pre-Check (`/quick-print/upload`):**
   - Customer picks 1–5 files (`<= 20 MB` each, configurable).
   - Client checks extension, non-zero byte size, and count immediately for fast UX feedback.
4. **Server-Side Session & Private Upload:**
   - Frontend calls `create-print-job` with an idempotency key to create a `draft` job.
   - Frontend requests short-lived signed upload URLs (`create-print-upload-url`) for randomized UUID object keys inside private bucket `print-uploads`.
   - Files upload directly to Storage with per-file progress bar, cancel, and retry controls.
5. **Server Validation & Options (`/quick-print/options`):**
   - `finalize-print-upload` verifies object existence, file size, magic bytes (`%PDF-`, JPEG `FF D8 FF`, PNG `89 50 4E 47`), non-corrupt structure, and extracts verified page count.
   - Portal presents **only** options supported by active shop printer profiles (`B&W` / `Colour`, `A4` / supported sizes, `Single-sided` / supported `Duplex`, `Copies`, `Page range`, `Orientation`, `Scaling`).
   - Calls shared server-side pricing preview function to show **Estimated Amount** with clear label: *"Final price will be confirmed by counter operator."*
6. **Idempotent Submission & Confirmation (`/quick-print/success`):**
   - Customer taps **Submit Print Request**.
   - Backend generates cryptographic `tracking_token` (stores only `tracking_token_hash`), moves job to `submitted`, emits `print_events` + admin notification, and returns `job_number` + `tracking_token`.
   - Confirmation page shows `job_number`, copyable tracking link, summary, and next instruction. Browser refresh uses stored submission key and shows the same confirmation without creating a duplicate job.
7. **Status Tracking (`/quick-print/track?token=...`):**
   - Customer monitors live state (`Submitted` → `Under Review` → `Awaiting Payment` → `Approved` → `Queued` → `Printing` → `Ready for Collection / Completed`). Never exposes downloadable document URLs or internal admin notes.

---

## 2. Critical Shop Counter & Print Workflows (Steps 1–11)

### Workflow Steps 2–6: Review, Pricing, Payment Verification & Mandatory Approval
1. **Incoming Job Alert:** Admin Dashboard (`/admin/print-management` & topbar notification bell) receives new `submitted` job.
2. **Operator Review (`/admin/print-jobs/:jobId`):**
   - Operator opens Job Detail (`submitted` → `under_review`).
   - Views uploaded files via short-lived authorized signed preview URL.
   - Verifies extracted page count, orientation, legibility, and customer print settings (adjusts settings if customer chose suboptimal orientation/scaling).
3. **Price Calculation & Confirmation:**
   - Shared server pricing function computes exact `calculated_amount` from verified page count + active `print_pricing_rules`.
   - Operator confirms `final_amount` (or applies an authorized manual override with mandatory `override_reason`).
   - Job moves to `awaiting_payment` (or directly `approved` if shop policy allows post-print counter payment — configurable/pending owner confirmation, default: confirm payment before release).
4. **Customer Payment (Cash or Manual UPI):**
   - Customer pays Cash at the counter OR scans Aman Computer's shop UPI QR at the counter.
   - **Strict Guard:** Customer never clicks "I Paid" to unlock printing.
5. **Manual Payment Verification:**
   - Operator verifies cash in hand or confirms incoming UPI credit on shop device.
   - Operator clicks **Confirm Cash Received** or **Verify UPI Payment** (entering optional UPI reference ID) in `/admin/print-jobs/:jobId` or `/admin/payments`.
   - Backend creates immutable `print_payment_records` entry (`status = 'paid'`, `confirmed_by = staff_id`, `confirmed_at`) and writes `print_events`.
6. **Mandatory Job Approval & Queue Release:**
   - Authorized Operator/Admin verifies assigned printer (`assigned_printer_id`) and clicks **Approve & Release to Print Queue** (transitions `approved` → `queued`).
   - **Rule:** If payment is unpaid/pending, release is blocked unless an authorized pay-at-handover override rule exists (owner decision).

### Workflow Steps 7–11: Agent Claim, Printer Selection, Execution & Outcomes
7. **Print Agent Job Claim:**
   - Windows 11 Local Print Agent (active, non-paused, valid DPAPI device token, healthy heartbeat) polls `agent-claim-job`.
   - Backend atomically checks: `job.status = 'queued'`, target printer belongs to this active device and is enabled/online, `claimed_by_device_id IS NULL`.
   - Backend sets `status = 'claimed'`, `claimed_by_device_id`, `lease_expires_at` (e.g., 120s), creates `print_job_attempts` row with unique `idempotency_key`, and issues short-lived download URLs (`60–120s`).
8. **Printer Selection & File Verification:**
   - Agent downloads files to restricted temp folder (`downloading`), verifies `sha256_checksum` and byte size.
   - Agent confirms target `system_printer_name` exists in Windows Print Spooler and checks `!IsOffline && !WorkOffline && !OutOfPaper`.
   - If printer went offline at the last millisecond, Agent reports `failed` (with safe code `PRINTER_OFFLINE`) without submitting to spooler, keeping attempt unambiguous.
9. **Printing Begins (Windows Print Spooler Submission):**
   - Agent renders PDF pages or image layout silently with validated settings (`paper_size`, `colour/B&W`, `duplex`, `copies`, `page_range`, `orientation`, `scaling`).
   - Submits job to Windows Print Spooler (`printing`), records `windows_spooler_job_id` in `print_job_attempts`, and reports `submitted_to_spooler`.
10. **Completion, Failure, Needs Review & Reprint:**
    - **Confirmed Success:** Spooler clears without error (plus operator handover confirmation where physical telemetry is limited) → `completed`, customer tracking updates to `Ready for Collection`, temp files purged locally, Storage retention timer starts (`24h`).
    - **Confirmed Failure (Pre-Spooler / Explicit Driver Rejection):** Agent reports `failed` with safe reason (`CORRUPT_FILE`, `PRINTER_OFFLINE`, `OUT_OF_PAPER`). Admin receives alert and can safely click **Retry** after fixing printer.
    - **Ambiguous Outcome (`needs_review`):** PC crashes, internet drops, or lease expires *after* spooler submission (`submitted_to_spooler_at IS NOT NULL`). System transitions job to **`needs_review`** and **never auto-reprints**. Operator visually checks physical paper tray at counter and either clicks **Mark Completed** or **Authorize Reprint** (recording reason + new `attempt_number`).
11. **Customer Status Updates:**
    - `/quick-print/track` reflects current state in near real-time (polling / safe subscription), showing *"Printing in progress"* vs *"Ready at counter"* without exposing spooler internals or files.

---

## 3. Operational & Security Support Flows

### Flow 12: Device Enrollment & Revocation
1. Technician installs Windows 11 Print Agent → Agent generates hardware fingerprint & posts `agent-enroll` → receives temporary pending enrollment ID.
2. Owner/Manager sees pending device in `/admin/print-agents`, verifies shop PC name, clicks **Approve Enrollment**.
3. Agent exchanges approval for unique revocable device token stored encrypted via Windows DPAPI.
4. If PC is stolen/replaced, Owner clicks **Revoke Device** → token immediately rejected across all Agent APIs + active claims released safely.

### Flow 13: Printer Sync & Capability Override
1. Agent calls `agent-sync-printers` on startup and device change, sending Windows-discovered printers and driver capability flags.
2. Owner/Manager views `/admin/printers`, enables desired printers, sets friendly Display Names (`Counter 1 Laser B&W`, `Photo Inkjet Colour`), corrects any inaccurate driver flags (e.g., disables unreliable duplex), and runs a **Test Print**.

### Flow 14: Permanent QR Code Verification & Poster Export
1. Owner sets production domain in Settings / `/admin/qr-management` (`https://<domain>/quick-print`).
2. System validates URL is public HTTPS `/quick-print` (rejects `/admin/*` or signed URLs).
3. Admin downloads SVG/PNG QR or printable poster and physically verifies scan with Android + iOS cameras before counter placement.
