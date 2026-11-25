# AC Scan2Print (AMAN COMPUTER) — Smart QR Print System
## Phase 1: End-to-End User Flows & Operational Workflows

**Document Version:** 2.0 (Reconciled with Phase 0 Baseline & Fixed Owner Decisions)  
**Phase:** Phase 1 — Product Specification & UX Design (Documentation Only)  
**Date:** November 24, 2026  
**Status:** Approved Specification

---

## 1. End-to-End Customer Journey (`/quick-print*`)

The Customer Portal is an isolated, lightweight, mobile-first web experience designed for walk-in customers scanning the counter QR code with their mobile device.

```text
[Counter QR Scan]
       │
       ▼
[1. Print Home] ──► [2. Document Upload] ──► [3. Print Options & Estimate]
                                                        │
                                                        ▼
[6. Live Status Tracking] ◄── [5. Confirmation] ◄── [4. Payment Selection]
```

### Step 1: QR Scan & Landing (`/quick-print`)
1. **Physical Scan:** Customer arrives at Aman Computer shop counter and scans the permanent counter QR poster using their native smartphone camera or Google Lens.
2. **Landing Screen:** The mobile browser opens `https://ac-scan2print.web.app/quick-print`.
3. **Display Content:**
   - Brand Header: AC Scan2Print monogram with Obsidian Dark `#111318` background and Electric Cyan `#25C7D9` accents.
   - Title: **Smart QR Print — Aman Computer**.
   - 4-Step Visual Guide: Scan → Upload & Options → Pay → Collect at Counter.
   - Constraints Summary: Supported formats (`PDF`, `JPG`, `PNG`), max `20 MB` per file, max `5` files.
   - Privacy Notice: "Files are stored in private encrypted storage and permanently deleted after 24 hours."
   - Primary CTA: **Start Print Upload** (`#25C7D9` high-contrast button).
   - Secondary Link: **Track Existing Job** (for returning customers).

### Step 2: Document Upload (`/quick-print/upload`)
1. **File Selection:** Customer taps file picker or drops files.
2. **Client-Side Pre-Validation:**
   - Rejects files exceeding 20 MB (20,971,520 bytes).
   - Rejects files beyond the 5-file limit.
   - Verifies extensions (`.pdf`, `.jpg`, `.jpeg`, `.png`).
3. **Storage Allocation:**
   - Client calls `create-print-job` to initiate a session and receive a temporary `job_id`.
   - Client calls `create-print-upload-url` to receive a 120-second signed upload URL for private bucket `print-uploads`.
4. **Direct Secure Upload:**
   - Files are uploaded directly from the browser to Supabase Storage at `jobs/{job_id}/{file_id}.{ext}`.
   - Per-file progress bars show real-time percentage, byte count, and cancel/retry buttons.
5. **Server Magic-Byte Inspection:**
   - Backend verifies binary magic bytes (`%PDF-` for PDF, `FF D8 FF` for JPEG, `89 50 4E 47` for PNG).
   - Corrupt files or zero-byte payloads are rejected immediately with user-friendly error messages.

### Step 3: Print Options & Pricing Estimate (`/quick-print/options`)
1. **Dynamic Capability Filtering:**
   - Only options supported by active shop printers are enabled.
   - Hardware-dependent options (such as automatic duplex or A3 paper) default to safe fallback (Single-sided, A4) until hardware test verification is confirmed.
2. **Configuration Form:**
   - **Color Mode:** Black & White (default) or Colour.
   - **Paper Size:** A4 (default). `A3` and `Legal` disabled unless printer profile confirms capability.
   - **Print Sides:** Single-sided (default) or Double-sided (Duplex).
   - **Copies:** Numeric stepper (1 to 20, default 1).
   - **Page Range:** "All Pages" or Custom (e.g., `1-3, 5`).
   - **Orientation:** Auto (default), Portrait, or Landscape.
   - **Customer Identity (Optional):** Customer Name and Mobile Number inputs, explicitly labeled *(Optional — for counter pickup identification)*.
3. **Duplex Pricing Disclosure & Formula:**
   - Pricing follows the strict owner decision: **Duplex billing is calculated per physical paper sheet (`ceil(pages / 2)`)**, never per logical page.
   - Clear banner: *"Double-sided printing is billed per sheet. For example, a 3-page document uses 2 sheets."*
   - Price preview calls server-side pricing engine: displays calculated amount clearly labeled as **"₹X.XX (Estimated Total) — Final amount confirmed at counter"**.

### Step 4: Payment Selection (`/quick-print/payment`)
Customer selects their preferred payment method before submitting:
- **Path A: Online UPI (Recommended for fast release)**
  1. Displays Aman Computer official Shop UPI QR code (loaded from private bucket `payment-assets` via signed URL).
  2. Displays Shop VPA / UPI ID with one-tap copy button.
  3. Displays required exact amount.
  4. Input: **12-digit UPI Reference / UTR Number** (required validation: exactly 12 alphanumeric characters).
  5. Upload: **Payment Screenshot Proof** (optional but recommended; uploads to private bucket `payment-evidence` with 120s signed URL).
  6. Notice: *"Once your UPI payment is verified, your job moves automatically to the print queue!"*
- **Path B: Cash at Counter**
  1. Customer toggles **Pay Cash at Counter**.
  2. Notice: *"Please pay cash directly to the counter operator. The operator will confirm your payment and release your print job."*

### Step 5: Submission & Idempotent Confirmation (`/quick-print/success`)
1. Customer taps **Submit Print Job**.
2. Frontend calls `finalize-print-upload` with an `idempotency_key`.
3. Backend:
   - Sets job status to `submitted`.
   - If payment method is UPI and UTR provided, sets `payment_status = 'pending_verification'`.
   - If payment method is Cash, sets `payment_status = 'unpaid'`.
   - Generates high-entropy cryptographic `tracking_token` (256-bit random string).
   - Stores `SHA-256(tracking_token)` in `print_jobs.tracking_token_hash`.
   - Assigns human-friendly `job_number` (format: `AC-YYMMDD-XXXX`).
   - Appends immutable `print_events` record.
4. Confirmation Screen:
   - Shows `job_number` in large high-contrast monospace typography.
   - Stores `tracking_token` in browser `sessionStorage` so refreshing or bookmarking never creates a duplicate job.
   - Copyable Tracking Link: `https://ac-scan2print.web.app/quick-print/track?token=...`.
   - Immediate Counter Action: "Show this Job Number at the counter: **AC-261124-001**".

### Step 6: Live Status Tracking (`/quick-print/track?token=...`)
1. Customer monitors job progress in real-time or upon scanning the tracking link.
2. Status Badges & Safe Progress Timeline:
   - `Submitted` → "Received by Aman Computer"
   - `Under Review` → "Operator reviewing file and print settings"
   - `Awaiting Payment` → "Awaiting payment verification at counter"
   - `Queued` → "Approved — In print queue"
   - `Printing` → "Printing on shop printer..."
   - `Completed` → "Ready for Collection! Collect your document at counter."
   - `Needs Review` → "Checking print output at counter..."
   - `Failed` / `Rejected` → Safe explanation without internal system error dumps.
3. Security Guard:
   - Document files, signed URLs, and internal staff notes are **never** returned or exposed in the tracking response.

---

## 2. Single-Admin Operational Workflow (Counter Operator)

The single Super Admin (`Yr0Wr7PuuAdOIMaqohmqaINNbNC2`) manages the entire counter workflow via the orange-themed Admin Dashboard (`/admin/*`).

```text
[Incoming Job Alert]
       │
       ▼
[Job Review & Settings Check]
       │
       ▼
[Payment Verification] ───────────────┬────────────────────────┐
  (UPI Verified)                      │                        │ (Cash Confirmed)
       │                              ▼                        ▼
       │                    [Price Override]          [Admin Job Approval]
       │                    (Mandatory Reason)                 │
       │                                                       ▼
       └───────────────────────────────────────────────► [Release to Queue]
                                                               │
                                                               ▼
                                                      [Local Agent Claims]
                                                               │
                                                               ▼
                                                      [Windows Spooler]
                                                               │
                                                               ▼
                                                      [Counter Handover]
```

### 1. Queue Intake & Job Review (`/admin/print-jobs/:jobId`)
1. Topbar notification bell and live job table alert the Admin to a new `submitted` job.
2. Admin opens the Job Detail view (`status` moves to `under_review`).
3. Document Inspection:
   - Admin views the uploaded document in the integrated private viewer using a 120-second signed URL.
   - Verifies page count, legibility, orientation, and color distribution.
4. Setting Adjustment:
   - Admin can adjust orientation, paper size, or print mode if customer selected incorrect parameters.

### 2. Pricing Calculation & Manual Override
1. System displays **Calculated Amount** computed from verified page count, duplex rule (`ceil(pages / 2)`), active `print_pricing_rules`, and copies.
2. If paper is damaged, special paper is requested, or customer requires a custom adjustment:
   - Admin enters new `final_amount`.
   - Admin MUST provide a non-empty `price_override_reason` (minimum 5 characters).
   - System records `calculated_amount`, `final_amount`, `override_reason`, admin UID, and timestamp in `print_events`.

### 3. Payment Verification & Queue Release (Fixed Invariants)
Following the non-negotiable owner decisions:

#### Scenario A: UPI Payment Verification (Auto-Release Rule)
1. Customer submitted UPI payment with 12-digit UTR and/or payment screenshot.
2. Admin opens Payment Verification panel:
   - Views submitted 12-digit UTR number.
   - Previews customer screenshot proof loaded from `payment-evidence` private bucket.
   - Matches UTR with shop UPI soundbox / banking app credit notification.
3. Admin clicks **Verify UPI Payment**.
4. System sets `payment_status = 'paid'`, records `confirmed_by`, and generates audit event.
5. **Auto-Release Trigger:** Because UPI payment is verified, the job **automatically qualifies for release to the print queue** (`queued`) without requiring a secondary manual approval button.

#### Scenario B: Cash Payment Workflow (Explicit Admin Approval Required)
1. Customer chose Cash at counter (`payment_status = 'unpaid'`).
2. Customer hands physical cash to Admin at counter.
3. Admin clicks **Confirm Cash Received**:
   - System records cash receipt in `print_payment_records`.
   - Sets `payment_status = 'paid'`.
4. **Mandatory Approval Step:** Cash payment **requires explicit Admin approval**. Admin reviews assigned printer and clicks **Approve & Release to Print Queue** (`status` transitions from `approved` to `queued`).

### 4. Job Rejection Workflow
1. If the uploaded document is corrupt, illegal, unprintable, or customer abandons:
2. Admin clicks **Reject Job**.
3. A modal forces entry of a mandatory `rejection_reason` (e.g., "Blurry unreadable scan", "Customer requested cancellation").
4. Job transitions to `rejected`.
5. Customer tracking page reflects the rejection reason safely.
6. Associated storage files are marked for 24-hour cleanup.

### 5. Windows Agent Claim, Spooler Submission & Physical Verification
1. The active Windows 11 Local Print Agent polls `agent-claim-job`.
2. Agent locks the job with a 120-second lease (`claimed`), creates a `print_job_attempts` record, and downloads files over short-lived signed URLs (`downloading`).
3. Agent checks printer status: confirms printer is online, ready, and has paper.
4. Agent renders PDF/images and submits to Windows Print Spooler (`printing`), capturing `windows_spooler_job_id`.
5. Status updates to `submitted_to_spooler`.
6. Once the spooler completes and paper feeds through:
   - Agent reports `completed`.
   - Customer tracking updates to: "Ready for Collection!".
   - Admin marks job handed over to customer.

### 6. Ambiguous Outcome Handling (`needs_review`) & Reprint Guard
1. **Ambiguous Condition:** If the shop PC crashes, power fluctuates, or the agent disconnects *after* the job was submitted to the Windows Spooler (`submitted_to_spooler_at IS NOT NULL`):
   - The lease recovery sweeper moves the job to **`needs_review`**.
   - **CRITICAL SAFEGUARD:** The system **NEVER auto-reprints** a job in `needs_review` to prevent wasted paper and duplicate charges.
2. **Admin Physical Inspection:**
   - Admin inspects the physical counter printer paper tray.
   - **Case 1 (Printed Cleanly):** Admin clicks **Mark Completed**. Job transitions to `completed`.
   - **Case 2 (Paper Jam / Incomplete):** Admin clears the jam, clicks **Authorize Reprint**, inputs mandatory `reprint_reason` (e.g., "Paper jam on page 2"), and releases a new attempt (`attempt_number + 1`) to `queued`.

---

## 3. Support & Maintenance Flows

### 1. Job Cancellation
- Customer may cancel a job from `/quick-print/track` only while in `submitted` or `under_review` (before payment verification or spooler submission).
- Admin may cancel an unprinted job from `/admin/print-jobs/:jobId` with a mandatory reason.
- Once a job reaches `printing` or `submitted_to_spooler`, cancellation is disabled.

### 2. File Retention & Automated Purge Flow
- Files in `print-uploads` and `payment-evidence` are private and temporary.
- Retention rules:
  - Unsubmitted drafts: 1 hour TTL.
  - Completed / Rejected / Cancelled jobs: 24 hours TTL.
  - Failed / Needs Review jobs: 72 hours TTL (allowing manual troubleshooting).
- Background scheduled function (`cleanup-expired-print-files`) queries expired files, removes Storage objects via Supabase Storage API, updates `retention_deleted_at`, and appends an audit event.
