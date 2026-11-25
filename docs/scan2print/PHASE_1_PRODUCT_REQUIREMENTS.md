# AC Scan2Print (AMAN COMPUTER) — Smart QR Print System
## Phase 1: Product Requirements Document (PRD)

**Document Version:** 2.0 (Reconciled with Phase 0 Baseline & Fixed Owner Decisions)  
**Phase:** Phase 1 — Product Specification & UX Design (Documentation Only)  
**Date:** November 24, 2026  
**Status:** Approved Specification  
**Authority:** Roadmap v1.1 & Phase 0 Production Baseline

---

## 1. Executive Product Scope & Architectural Boundary

### 1.1 Product Vision
**AC Scan2Print** is an on-demand, mobile-first Smart QR Print Management System built specifically for **Aman Computer**. Walk-in customers scan a counter QR code, upload documents directly from their mobile browser, choose print options, receive an upfront price estimate, submit payment via UPI or cash at counter, and monitor print status in real-time. The shop counter operator manages incoming jobs, verifies payments, inspects private file previews, overrides prices if necessary with mandatory audit reasons, and releases jobs to a local Windows 11 **Local Print Agent** that coordinates with physical shop printers.

### 1.2 Non-Negotiable Core Invariants
1. **Single Super Admin Account:** For the MVP, access is strictly restricted to one Super Admin account (`Yr0Wr7PuuAdOIMaqohmqaINNbNC2`) verified against `print_admin_accounts` and Firebase Auth RS256 token signatures. No Staff, Operator, or Viewer roles exist in MVP.
2. **Optional Customer Identity:** Customer Name and Mobile Number are optional. Jobs are anonymously tracked via a 256-bit cryptographic `tracking_token` (only `SHA-256(tracking_token)` is stored).
3. **UPI Payment Auto-Release:** Once a customer's UPI UTR / payment proof is verified by Admin, the job **automatically qualifies for queue release** without requiring a secondary manual approval click.
4. **Cash Payment Mandatory Approval:** Cash payment requires explicit Admin confirmation of cash in hand, followed by Admin job approval to release to the print queue.
5. **Physical Sheet Duplex Billing:** Duplex printing is strictly billed per physical paper sheet (`ceil(pages / 2)`), never per logical page.
6. **Zero Hardware or Price Guessing:** All printer hardware capabilities (duplex, colour, paper sizes) remain `NULL` (Unknown) until verified by on-site discovery. All INR prices remain `0.00` / unconfigured until set by the shop owner (`PENDING OWNER INPUT`).
7. **24-Hour File Lifecycle:** All customer files and payment screenshots in Supabase Storage (`print-uploads`, `payment-evidence`) are private and automatically deleted 24 hours after completion, cancellation, or rejection.

---

## 2. Customer Portal Functional Requirements (`/quick-print*`)

### 2.1 Route & View Breakdown
- **`/quick-print` (Print Home):**
  - Brand identity: AC Scan2Print cyan monogram on obsidian dark canvas (`#111318`).
  - Clear 4-step walk-in guide (Upload → Options → Pay → Collect).
  - File constraints display: PDF, JPG, PNG only; max 20 MiB per file; max 5 files.
  - Privacy notice: "Files are private and permanently deleted after 24 hours."
  - Primary CTA: **Start Print Upload**.
- **`/quick-print/upload` (File Upload):**
  - Multi-file dropzone / file picker.
  - Instant client-side validation for extension, file size, and file count.
  - Direct upload to private bucket `print-uploads` via 120-second signed URLs.
  - Server-side magic-byte verification (`%PDF-`, JPEG, PNG) and corruption checks.
  - Per-file progress bars, byte counts, and cancel/retry buttons.
- **`/quick-print/options` (Print Options & Pricing):**
  - Mode: Black & White (default) or Colour (filtered by active printer profile).
  - Paper Size: A4 (default). A3/Legal disabled until hardware test confirms availability.
  - Sides: Single-sided or Double-sided. Duplex formula explicitly noted (`ceil(pages / 2)`).
  - Copies: Integer selector (1 to 20).
  - Page Range: "All Pages" or Custom range (e.g., `1-3, 5`).
  - Orientation: Auto, Portrait, or Landscape.
  - Optional Customer Inputs: Name and 10-digit Mobile Number.
  - Estimated Price Box: Displays server-calculated price labeled *"Estimated total — final price confirmed at counter"*.
- **`/quick-print/payment` (Payment Submission):**
  - UPI Option: Displays shop UPI QR code (from `payment-assets`), VPA copy button, exact amount, required 12-digit UTR input, and optional screenshot proof upload (to `payment-evidence`).
  - Cash Option: Toggles "Pay Cash at Counter" mode.
- **`/quick-print/success` (Submission Confirmation):**
  - Monospace prominent `job_number` (e.g., `AC-261124-001`).
  - Secret tracking link with `tracking_token`.
  - Next step instructions based on payment method.
  - Idempotent: Refreshing page never creates duplicate jobs.
- **`/quick-print/track?token=...` (Live Job Tracking):**
  - Live status badge and vertical step timeline.
  - Counter collection alert when status reaches `completed`.
  - Customer cancel button (enabled only before printing starts).
  - Zero exposure of private file download links or internal staff notes.

---

## 3. Admin Print Management Functional Requirements (15 Modules)

All modules operate under the warm orange (`#f07a2e`) glassmorphic dashboard frame (`Shell.tsx`) accessible only to the Super Admin:

### Module 1: Dashboard Overview (`/admin/print-management`)
- Real-time operational overview with clickable KPI tiles for all 16 states.
- Confirmed Today's Revenue (Cash vs UPI breakdown).
- Discovered printer status pills with `last_seen_at`.
- Windows Print Agent connection heartbeat indicator.

### Module 2: Print Jobs Ledger (`/admin/print-jobs`)
- Searchable, filterable table of all submitted print requests.
- Filters: Date range, status, payment status, print mode, assigned printer.
- Quick actions: Review, Approve, Reject (with modal reason), Hold, Release.

### Module 3: Print Job Workspace (`/admin/print-jobs/:jobId`)
- Integrated PDF/Image preview using 120-second signed URLs from `print-uploads`.
- Page count verification and settings adjustment editor.
- Server-side price calculator preview + manual override input (mandatory reason >= 5 characters).
- Payment verification: UTR verification + screenshot proof preview vs Cash confirmation.
- Safe action toolbar: Approve, Release to Queue, Cancel, Reject, Authorize Reprint (with reason).
- Immutable audit timeline (`print_events`).

### Module 4: Live Print Queue (`/admin/print-queue`)
- Live monitor of released jobs waiting for or claimed by the Windows Agent.
- Active lease timer display (`lease_expires_at`).
- Ambiguous outcome warning: Highlighted card for any job in `needs_review` requiring physical counter tray check.
- **Strict Guard:** Auto-reprint is blocked for `needs_review` jobs.

### Module 5: Printer Fleet Management (`/admin/printers`)
- List of USB, Wi-Fi, and LAN printers discovered by the Windows Agent.
- Tri-state hardware capability display: `Colour`, `Duplex`, `A4`, `A3`, `Legal` (values: `true`, `false`, or `NULL` / Unknown).
- Manual capability override controls with audit logging.
- Remote Test Print trigger.

### Module 6: Windows Agent Management (`/admin/print-agents`)
- Device enrollment approval workflow for shop PCs.
- Real-time heartbeat tracker (marks offline if heartbeat age > 90s).
- Remote Pause / Resume and one-click Revoke Device credential button.

### Module 7: Payment Ledger (`/admin/payments`)
- Authoritative accounting ledger of all Cash and UPI payments.
- Filter by payment method, date range, confirming admin, and status (`unpaid`, `pending_verification`, `paid`).
- Total revenue reconciliations.

### Module 8: Pricing Rules Configuration (`/admin/pricing`)
- Centralized server-side pricing engine rules.
- Paper size, mode (B&W/Colour), sides (Single/Duplex), and explicit billing unit (`per_physical_sheet`).
- Interactive Live Price Calculator Preview tool.
- Zero invented INR values (`PENDING OWNER INPUT`).

### Module 9: Customer Directory (`/admin/customers`)
- Displays records of customers who opted to provide name/phone during submission.
- Masked phone numbers for privacy.

### Module 10: Single Admin Account (`/admin/staff`)
- Displays registered Super Admin singleton profile (`Yr0Wr7PuuAdOIMaqohmqaINNbNC2`).
- Shows active status, last login, and security session details. Multi-staff creation is disabled in MVP.

### Module 11: Permanent QR Management (`/admin/qr-management`)
- Production URL verification (`https://ac-scan2print.web.app/quick-print`).
- High-contrast SVG and PNG QR code generation with quiet zones.
- Printable A4 shop counter poster generator.

### Module 12: Reports & Analytics (`/admin/reports`)
- Verified volume, page count, and financial reports using `Charts.tsx`.
- Daily and monthly B&W vs Colour page split.
- Failure rate and turnaround analytics.

### Module 13: Operational Notifications (`/admin/notifications`)
- Centralized real-time notification feed backed by `print_notifications`.
- Categories: New Job, Payment Pending, Agent Offline, Printer Jam, Needs Review.

### Module 14: Immutable Activity Logs (`/admin/activity-logs`)
- Read-only audit log viewer backed strictly by `print_events`.
- Tracks actor UID, event type, old status, new status, timestamp, and mandatory override/rejection reasons.
- Zero edit or delete capabilities.

### Module 15: System & Retention Settings (`/admin/settings`)
- Business details (shop name, phone, hours).
- Upload limits (max file size, max files).
- Storage retention TTLs (1h drafts, 24h completed/rejected, 72h failed).
- Manual file cleanup execution status.

---

## 4. Windows 11 Local Print Agent Architecture

- **Runtime:** .NET 8 / C# background worker + System Tray application.
- **Platform:** Windows 11 64-bit on Aman Computer counter PC.
- **Local Security:** DPAPI-encrypted device token storage in `%LocalAppData%\ACScan2Print\credentials.dat`. Zero Supabase `service_role` keys.
- **Printer Discovery:** Win32 Print Spooler API / WMI enumeration for USB, Wi-Fi, and LAN printers.
- **Silent PDF Rendering:** Vetted rendering engine rendering to Win32 GDI / Spooler directly with validated margins and orientation.
- **Idempotency Guarantee:** Captures `windows_spooler_job_id` and reports `submitted_to_spooler` before physical completion.
- **Ambiguity Guard:** If the agent restarts mid-job, the server sweeper marks the job `needs_review` without auto-reprinting.
- **Immediate Local Purge:** Temporary files downloaded to `%LocalAppData%\ACScan2Print\Temp` are deleted immediately upon spooler handoff.

---

## 5. System States Specification

1. **Loading State:**
   - Customer Portal: Skeleton containers with Electric Cyan shimmer matching card dimensions.
   - Admin Dashboard: Layout-matched tabular skeleton rows preserving navigation.
2. **Empty State:**
   - Customer: "No documents uploaded yet. Tap above to select files."
   - Admin Queue: "Print queue is clear. No jobs waiting."
3. **Error State:**
   - Network failure: "Reconnecting to server... [ Retry ]".
   - Validation failure: Clear inline messages (e.g., "File exceeds 20 MB limit", "Enter 12-digit UTR").
   - System error: Safe error codes (`ERR_STORAGE_TIMEOUT`) without internal SQL/PostgreSQL dumps.
4. **Offline State:**
   - Windows Agent offline: Admin banner alerts "Print Agent Disconnected — Check counter PC". Customer queue shows normal waiting status to avoid panic.
   - Printer offline: Agent flags printer offline and halts claims for that printer.
5. **Success State:**
   - Customer: High-contrast confirmation card with prominent `job_number`.
   - Admin: Green toast confirmation and smooth queue transition.
