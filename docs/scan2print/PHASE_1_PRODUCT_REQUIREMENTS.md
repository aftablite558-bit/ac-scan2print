# AC Scan2Print (AMAN COMPUTER) — Smart QR Print System
## Phase 1: Product Requirements Document (PRD)

**Document Version:** 1.0  
**Phase:** Phase 1 — Product Specification & UX Design (Documentation Only)  
**Date:** 20 November 2026  
**Sources of Truth:**
- `public/assets/aistudio/Aman_Computer_Smart_QR_Print_System_Roadmap_v1.1_8e7ca2d6.md`
- `public/assets/aistudio/Aman_Computer_Smart_QR_Print_UI_UX_Specification_v1.0_61c997a6.md`
- `docs/scan2print/PHASE_0_AUDIT_REPORT.md`

---

## 1. Product Scope & Boundary

### 1.1 System Overview
**AC Scan2Print** is an integrated QR-based Smart Printing Management Platform for **Aman Computer**. Customers at the shop scan a permanent printed QR poster to open a mobile-first web portal, upload documents, choose supported print preferences, see an estimated charge, and track job progress. Shop staff review files, confirm page counts and final pricing, verify Cash/UPI payment manually, and release approved jobs to a Windows 11 **Local Print Agent**, which prints via connected USB, Wi-Fi, or Ethernet/LAN printers.

### 1.2 Architectural Boundary (Current Repo vs External Targets)
1. **Current Repository (`AC Scan2Print Admin Dashboard`):** Contains only the React 19 + TypeScript + Vite 8 + Tailwind v4 Admin Dashboard foundation (`Shell.tsx`, `OverviewPage.tsx`, `SettingsPage.tsx`, `HelpPage.tsx`).
2. **External Integration Target (`Aman Computer Public Website`):** The public Customer QR Portal (`/quick-print*`) will ultimately integrate into the separate Aman Computer public website without duplicating the public site inside this admin repository or altering unrelated website modules.
3. **Backend Layer (`Supabase`):** PostgreSQL, Auth, Private Storage (`print-uploads`), RLS policies, Edge Functions, and optional Realtime (to be provisioned/implemented in Phase 2).
4. **Shop Desktop Layer (`Windows 11 Local Print Agent`):** C# / .NET 8 tray + background worker connecting outbound over HTTPS (to be prototyped in Phase 5 after hardware inspection).

### 1.3 Non-Negotiable Core Rules
- **Mandatory Operator Approval:** Customer document upload must **never** trigger automatic physical printing. Every job requires authorized review, price/payment handling, and explicit release.
- **Zero Fake Metrics:** All dashboard counts, revenue, printer status, and agent connectivity must derive strictly from backend records and heartbeats.
- **No Mandatory Customer Accounts (MVP):** Customers submit jobs anonymously using a secure, unguessable `tracking_token`.
- **Single Server-Side Pricing Authority:** Estimated and final prices must compute via one shared backend pricing engine.

---

## 2. Customer Printing Portal Requirements (`/quick-print*`)

Target experience: lightweight, fast-loading, mobile-first Android/iOS browser workflow.

### 2.1 Page Specifications

| Route | Screen | Core Purpose & Requirements |
| :--- | :--- | :--- |
| `/quick-print` | **Print Home** | Displays approved AC Scan2Print / Aman Computer identity, heading (**Smart Print — Scan. Upload. Print.**), 4-step instructions, supported file types (`PDF`, `JPG/JPEG`, `PNG`), max size & file count limits, shop hours/contact, privacy & document-retention notice, primary **Upload Document** CTA, and link to Help/Status check. No heavy animations or marketing clutter delaying upload. |
| `/quick-print/upload` | **Document Upload** | Multi-file picker within configured limits (proposed default: max 5 files/job, max 20 MB/file). Displays filename, size, upload progress bar, remove/retry controls before final submission. Client-side pre-checks paired with mandatory server-side validation (allowlist extension, MIME type, magic bytes, zero-byte rejection, filename sanitization, corrupt PDF check). Uploads directly to private Supabase Storage via short-lived signed upload URL (`create-print-upload-url`). Retries safely without creating duplicate jobs. |
| `/quick-print/options` | **Print Options & Estimate** | Configures per-job/file options dynamically filtered to active registered printer capabilities: Print mode (`B&W` / `Colour`), Paper size (`A4` default; `A3`/`Legal` only if active printer supports it), Sides (`Single-sided` default; `Double-sided` only after hardware test & printer support), Copies (`1–20` configurable), Page range (`All` / `Custom`), Orientation (`Auto` / `Portrait` / `Landscape`), Scaling (`Fit to page` / `Actual size`). Shows server-calculated **Estimated Amount** clearly labeled as an estimate subject to operator verification, plus optional customer name/phone **only if owner confirms collection**. Review-before-submit step. |
| `/quick-print/success` | **Submission Confirmation** | Shown after `finalize-print-upload`. Displays human-readable `job_number`, secret tracking link / copyable tracking reference (`tracking_token`), submission timestamp, file names, selected options, estimated price (labeled estimate), initial status (`Submitted / Under Review`), and clear "Next Step: Proceed to counter / Wait for review" guidance. Refreshing this page must **never** create a duplicate job (idempotent submission key + session state). |
| `/quick-print/track` | **Job Tracking** | Accessed via `?token=<tracking_token>` (never raw sequential `job_number` alone). Calls `get-print-job-status` Edge Function. Shows `job_number`, current status badge, safe status timeline, shop instructions, final confirmed price & payment state (when approved/set), and `Ready for collection` notice. **Never** exposes private document download links, internal error stacks, or staff-only notes. |
| `/quick-print/help` | **Help & Rules** | Explains supported formats, size/file limits, upload steps, how operator review & pricing confirmation work, Cash/UPI counter payment flow, tracking usage, upload failure troubleshooting, and approved shop contact details. |

*(Note: Per Roadmap §25, `/quick-print` upload → options → review may execute as routes or an accessible multi-step flow within `/quick-print`, while keeping canonical entry `/quick-print` and `/quick-print/track` stable.)*

### 2.2 Customer Notifications (Phase 1 Scope & Later Phase Boundary)
- **MVP:** Live/polling status updates inside `/quick-print/track` (using safe status labels).
- **Post-MVP (Phase 9):** Optional WhatsApp/SMS notifications only via owner-approved provider and explicit customer consent. Notifications must never include uploaded filenames, document contents, or sensitive credentials.

---

## 3. Admin Print Manager Information Architecture (15 Modules)

Integrated inside the existing Aman Computer Admin Dashboard shell (`Shell.tsx`) under permission-guarded `/admin/*` routes (exact route mapping in `PHASE_1_ROUTE_ARCHITECTURE.md`).

### Module 1: Dashboard Overview (`/admin/print-management`)
- **Purpose:** Real-time operational command center for shop owners and counter operators.
- **Navigation Placement:** Primary top group (`Overview` / `Print Management`).
- **Required Information:** Period selector (Today / 7d / 30d / Custom); clickable KPI tiles for Total Jobs, New Requests (`submitted`), Under Review, Awaiting Payment, Queued, Printing, Completed Today, Failed, and Needs Review; Confirmed Revenue Today (strictly from confirmed payment records); Recent Jobs list; Printer availability status with `last_seen_at`; Print Agent connectivity with `last_heartbeat_at`.
- **Actions:** Click KPI tile → navigate to `/admin/print-jobs` with matching filter; click recent job → `/admin/print-jobs/:jobId`; quick refresh.
- **Filters / Search:** Date period selector.
- **States:** Loading (layout-matched skeletons, never flashing `0` as loaded); Empty ("No print jobs recorded for this period yet"); Error (non-destructive retry banner distinguishing network vs permission failure); Stale device warning when heartbeat age exceeds threshold.
- **Permissions:** `Owner`, `Manager`, `Staff/Operator`, `Viewer` (read-only).

### Module 2: Print Jobs (`/admin/print-jobs`)
- **Purpose:** Search, triage, and manage all customer print requests.
- **Navigation Placement:** `Print Operations > Print Jobs`.
- **Required Information:** Table showing `job_number`, submission timestamp, optional customer label, file count, verified page count, print mode (`B&W`/`Colour`), copies, estimated/final amount, payment status, job status, assigned printer, and primary next contextual action.
- **Actions:** Open Job Detail; row quick-actions (Approve, Reject with reason, Hold, Release to Queue) gated by current state & role permissions, with confirmation modal for high-impact/irreversible actions.
- **Filters & Search:** Debounced search by `job_number`; combinable filters for Job Status, Date Range, Payment Status, Assigned Printer, and Print Mode. Server-side pagination.
- **States:** Loading skeletons; Empty ("No print jobs submitted yet"); Filtered No-Results ("No jobs match current filters" + Clear Filters button); Error with retry.
- **Permissions:** View (`Owner`, `Manager`, `Staff/Operator`, `Viewer`); mutations restricted per Role Matrix.

### Module 3: Print Job Details (`/admin/print-jobs/:jobId`)
- **Purpose:** Complete operational workspace and audit record for a single print job.
- **Navigation Placement:** Detail view reachable from Print Jobs, Queue, Dashboard, or Notifications (with breadcrumbs).
- **Required Information:** Job summary header (`job_number`, status badge, next valid action highlighted); Customer-submitted file list with validation results (`sha256_checksum`, `file_size`, `mime_type`, verified `page_count`); Authorized private document preview (PDF/Image viewer using short-lived signed URLs); Requested vs Final print settings (mode, paper size, sides, orientation, scaling, copies, page range); Estimated vs Final confirmed price; Payment record (method, reference, confirming operator, timestamp); Assigned device & printer; Print attempt history (`attempt_number`, `windows_spooler_job_id`, timestamps, safe errors); Immutable status timeline (`print_events`); Internal admin notes; Reprint history.
- **Actions:** Preview document; Verify/edit page count & print settings; Calculate/confirm final price (or authorized override with reason); Confirm Cash payment / Manually verify UPI payment; Approve; Hold; Reject (reason required); Assign/change printer; Release to Print Queue; Cancel (only in permitted pre-spooler states); Retry (confirmed failure only); Authorize Reprint (explicit reason + new attempt); Mark Handed Over / Completed; Manual fallback download (logged to `print_events`).
- **Filters / Search:** N/A (single record).
- **States:** Loading; Not Found / Unauthorized (`404`/`403`); Prominent **`Needs Review`** warning banner when print outcome is uncertain; Disabled-action tooltips explaining why an action is blocked (e.g., "Confirm payment or approval before releasing").
- **Permissions:** Preview/Approve/Payment/Release (`Owner`, `Manager`, `Staff/Operator` per matrix); Price override & Reprint (`Owner`, `Manager`, optional `Operator` if confirmed); Read-only (`Viewer`).

### Module 4: Print Queue (`/admin/print-queue`)
- **Purpose:** Live monitoring of released jobs moving through the Print Agent and Windows Spooler.
- **Navigation Placement:** `Print Operations > Print Queue`.
- **Required Information:** Active queue order, `job_number`, claim state, `claimed_by_device_id`, `lease_expires_at`, assigned printer, processing stage (`queued`, `claimed`, `downloading`, `printing`, `submitted_to_spooler`, `failed`, `needs_review`), attempt number, last event timestamp, safe error/blocked reason (e.g., printer offline, agent disconnected).
- **Actions:** Pause/resume queue dispatching (where supported), resolve `needs_review` (mark completed after counter check OR authorize explicit reprint with reason), retry confirmed `failed` jobs, reassign to another online printer, cancel queued job before claim/spooler. **Never** auto-reprint ambiguous attempts.
- **Filters & Search:** Filter by queue stage, device, printer, blocked condition; search by `job_number`.
- **States:** Loading; Empty ("Print queue is clear — no jobs waiting"); Blocked/Offline banner if target agent/printer is offline; Error with retry.
- **Permissions:** View (`Owner`, `Manager`, `Staff/Operator`, `Viewer`); Queue control/Retry/Resolve (`Owner`, `Manager`, `Staff/Operator` per matrix).

### Module 5: Printer Management (`/admin/printers`)
- **Purpose:** Manage physical USB, Wi-Fi, and Ethernet/LAN printers discovered by Print Agents.
- **Navigation Placement:** `Print Operations > Printers`.
- **Required Information:** Display name, `system_printer_name`, connection type (USB / Wi-Fi / LAN / Unknown), linked Agent device, online/offline/unknown status, `last_seen_at`, default printer badge, enabled/disabled toggle, **driver-reported capabilities** vs **admin-verified capabilities** (colour, duplex, supported paper sizes), pending/queued job impact count.
- **Actions:** Register/enable discovered printer; edit display name; set default printer; override/verify capability profile; assign job scope restrictions; trigger Test Print via authorized agent; disable printer (requires confirmation showing count of queued/active jobs affected).
- **Filters & Search:** Filter by linked device, status (online/offline/unknown), enabled/disabled, colour/duplex capability; search by name.
- **States:** Loading; Empty ("No printers discovered yet — enroll and connect a Windows Local Print Agent"); Stale/Unknown distinction; Driver warning badge when driver capability data is incomplete.
- **Permissions:** View (`Owner`, `Manager`, `Staff/Operator`, `Viewer`); Configure/Enable/Disable/Override (`Owner`, `Manager`); Test Print (`Owner`, `Manager`, `Staff/Operator` if enabled).

### Module 6: Print Agent Management (`/admin/print-agents`)
- **Purpose:** Enroll, monitor, pause, and revoke Windows 11 Local Print Agent installations.
- **Navigation Placement:** `Print Operations > Print Agents`.
- **Required Information:** `device_name`, device UUID, enrollment status (`pending`, `active`, `paused`, `offline`, `revoked`), `agent_version`, Windows 11 version/build, `last_heartbeat_at`, synchronized printers count, recent safe diagnostic events. **Never display raw device credentials or secrets.**
- **Actions:** Approve pending device enrollment; pause/resume polling; revoke device credential (confirmation dialog stating immediate loss of job claim & download access); view safe diagnostics; check version compatibility.
- **Filters & Search:** Filter by status (`pending`, `active`, `offline`, `revoked`); search by device name/ID.
- **States:** Loading; Empty ("No Print Agents enrolled"); Pending Enrollment alert callout; Stale Heartbeat warning (`last_heartbeat_at` age).
- **Permissions:** View (`Owner`, `Manager`, `Viewer`); Enroll Approve / Pause / Revoke (`Owner`, `Manager` — high-impact security audited actions).

### Module 7: Payments (`/admin/payments`)
- **Purpose:** Authoritative financial ledger for Cash and manually verified UPI print payments.
- **Navigation Placement:** `Finance > Payments`.
- **Required Information:** Linked `job_number`, payment method (`Cash`, `UPI`, `Unpaid`), amount, payment status (`unpaid`, `pending_verification`, `paid`, `refunded`), optional UPI/transaction reference, confirming staff member, confirmation timestamp. Daily/filtered confirmed paid vs pending totals.
- **Actions:** Confirm Cash received; Manually verify UPI payment (with optional reference field); navigate to linked job; record refund/adjustment (only if post-MVP/refund policy approved by owner). **No customer self-confirmation control.**
- **Filters & Search:** Filter by date range, payment method, payment status; search by `job_number` or transaction reference.
- **States:** Loading; Empty ("No payment records for selected range"); Error with retry.
- **Permissions:** View (`Owner`, `Manager`, `Staff/Operator`, `Viewer`); Confirm Cash/UPI (`Owner`, `Manager`, `Staff/Operator`); Adjustments/Refunds (`Owner`, `Manager`).

### Module 8: Pricing Management (`/admin/pricing`)
- **Purpose:** Manage centralized server-side pricing rules driving both customer estimates and admin final pricing.
- **Navigation Placement:** `Finance > Pricing`.
- **Required Information:** Rule name, paper size (`A4`, `A3`, `Legal`), print mode (`B&W`, `Colour`), sides (`Single`, `Duplex`), explicit **pricing unit** (`per_printed_page` vs `per_physical_sheet`), rate, minimum charge, `valid_from` / `valid_until`, active/inactive state, pricing change history.
- **Actions:** Create/edit rule; activate/deactivate rule; **Live Price Calculator Preview** (runs exact server pricing function against test page count, sides, mode, paper size, copies); configure override-reason requirement.
- **Filters & Search:** Filter by active/inactive, paper size, print mode; search by rule name.
- **States:** Loading; Empty ("No active pricing rules configured — customer estimates unavailable"); Validation errors (negative rates, overlapping active rules).
- **Permissions:** View (`Owner`, `Manager`, `Staff/Operator`, `Viewer`); Create/Edit/Toggle (`Owner`, `Manager` per owner confirmation).

### Module 9: Customers (`/admin/customers`) — Optional / Deferred for MVP
- **Purpose:** Minimal customer directory **only if** Aman Computer later chooses to collect customer name/phone or accounts.
- **Navigation Placement:** `Management > Customers` (hidden in MVP unless enabled).
- **Required Information:** Collected contact name/phone (masked/protected), linked job count, print history list.
- **Actions:** Search collected records, open linked job.
- **Filters & Search:** Search by collected phone/name.
- **States:** Disabled/hidden until approved; Empty ("Anonymous token mode active — customer profiles not collected").
- **Permissions:** Restricted (`Owner`, `Manager`) to protect personal phone numbers.

### Module 10: Staff & Permissions (`/admin/staff`)
- **Purpose:** Manage authorized admin/operator accounts, roles, and granular print permissions (upgrading/replacing local `#/settings/team`).
- **Navigation Placement:** `Management > Staff & Permissions`.
- **Required Information:** Staff name, email, assigned role (`Owner`, `Manager`, `Staff/Operator`, `Viewer`), active/deactivated status, capability summary, last active / recent audit events.
- **Actions:** Provision/invite staff via Supabase Auth flow (no public self-signup); change role; configure granular permissions; activate/deactivate access; view staff action history.
- **Filters & Search:** Filter by role, active status; search by name/email.
- **States:** Loading; Empty (only primary Owner exists); Permission denied for non-Owner/Manager; Confirmation on role elevation or deactivation.
- **Permissions:** View (`Owner`, `Manager`); Invite/Role/Permission/Deactivate (`Owner`, and `Manager` within non-Owner guardrails).

### Module 11: QR Management (`/admin/qr-management`)
- **Purpose:** Generate, verify, and export permanent shop QR code artwork & counter posters.
- **Navigation Placement:** `Management > QR Management`.
- **Required Information:** Permanent production Customer Portal URL (`https://<domain>/quick-print`), high-contrast QR code preview with quiet zone, destination verification status (blocks temporary signed URLs or `/admin/*` URLs), poster preview featuring AC Scan2Print & Aman Computer branding + counter steps.
- **Actions:** Verify live destination URL; download QR (`PNG` / `SVG`); export/print A4 shop counter poster (once poster export is built).
- **Filters & Search:** N/A.
- **States:** Domain-unconfigured warning if production domain is not set; Verification pass/fail indicator.
- **Permissions:** View (`Owner`, `Manager`, `Staff/Operator`, `Viewer`); Update Target URL (`Owner`); Download/Print Poster (`Owner`, `Manager`).

### Module 12: Reports & Analytics (`/admin/reports`)
- **Purpose:** Operational and financial reporting using verified stored records (reusing `Charts.tsx` primitives).
- **Navigation Placement:** `Insights > Reports & Analytics`.
- **Required Information:** Explicit date range; Total jobs (completed, failed, pending, rejected, cancelled); Total printed pages; B&W vs Colour split; Printer-wise workload; Confirmed revenue by payment method (Cash vs UPI); Average processing turnaround; Frequent failure reasons; Agent uptime summary.
- **Actions:** Change date range / group-by; export CSV/JSON summary (only when real export endpoint is implemented).
- **Filters & Search:** Date range, printer, print mode, payment method.
- **States:** Loading; Empty ("No completed print activity in selected range"); Clear definitions tooltip explaining revenue = confirmed payments only.
- **Permissions:** View (`Owner`, `Manager`, `Viewer` if permitted); Financial/Export restrictions per Role Matrix.

### Module 13: Notifications (`/admin/notifications`)
- **Purpose:** Centralized operational alert feed (backed by DB/Realtime, extending topbar bell in `Shell.tsx`).
- **Navigation Placement:** `Insights > Notifications` + Topbar Bell Popover.
- **Required Information:** Alert category (`new_job`, `awaiting_review`, `payment_pending`, `print_failed`, `needs_review`, `printer_offline`, `agent_offline`, `cleanup_issue`), severity, title, safe summary (zero document content/secrets), timestamp, read/unread indicator, deep link to job/device/printer.
- **Actions:** Mark single read; Mark all read; Navigate to target entity.
- **Filters & Search:** Filter by unread/all, category, severity.
- **States:** Loading; Empty ("All caught up — no operational alerts").
- **Permissions:** View & mark own read (`Owner`, `Manager`, `Staff/Operator`, `Viewer`).

### Module 14: Activity Logs (`/admin/activity-logs`)
- **Purpose:** Immutable, read-only compliance & operational audit trail written solely by trusted backend functions.
- **Navigation Placement:** `Insights > Activity Logs`.
- **Required Information:** Timestamp, actor (`customer`, `staff`, `agent`, `system` + actor identity), `event_type`, target entity (`job_number`, device, printer, pricing rule, staff), `old_status` → `new_status`, recorded reason, safe metadata. **No document contents, signed URLs, or secrets.**
- **Actions:** Inspect detail metadata; filter/paginate (strictly read-only — zero edit/delete buttons in UI).
- **Filters & Search:** Date range, actor, event type, job/entity search.
- **States:** Loading; Empty ("No audit events recorded yet"); Error with retry.
- **Permissions:** View (`Owner`, `Manager`, `Viewer` if audited read-only allowed; sensitive staff logs restricted per matrix).

### Module 15: Print System Settings (`/admin/settings`)
- **Purpose:** Extend existing `SettingsPage.tsx` (`Business`, `Team`, `Appearance`, `Alerts`, `Data`) with print operational, upload, retention, and health configuration.
- **Navigation Placement:** Bottom tool `Settings` (`/admin/settings`, preserving existing tab pattern via `TabsNav`).
- **Required Information:** Grouped settings:
  1. Business Info (existing `business` fields + shop hours/phone/support details for customer portal).
  2. Upload & Print Defaults (max file size, max files/job, allowed formats, max copies, enabled paper sizes, default options constrained by printer capabilities).
  3. Data Retention Policy (unsubmitted session TTL, rejected/cancelled TTL, completed doc TTL, failed/needs-review TTL, scheduled cleanup last run & status — clearly showing actual execution status rather than assuming deletion).
  4. Appearance & Alerts (existing `appearance` & `alerts` tabs preserved).
  5. System & Security Health (backend connectivity, agent version policy, JSON export — removing/guarding unsafe browser demo-reset in production).
- **Actions:** Validate inputs, save with confirmation modal for high-impact changes (e.g., shortening retention or tightening upload limits), write audit log on change.
- **Permissions:** Appearance (`all authenticated staff`); Business/Upload/Retention/Security (`Owner`, `Manager` per matrix).

---

## 4. Windows 11 Local Print Agent UX Requirements

Target environment: Windows 11 shop PC(s), C# / .NET 8 background worker + System Tray control UI.

1. **Installation & First Run:**
   - Guided Windows installer (`MSIX` or signed setup `.exe`); registers auto-start on login/boot; creates restricted local temp directory (`%LocalAppData%\ACScan2Print\Temp`); zero embedded Supabase `service_role` keys.
2. **Device Enrollment UX:**
   - Displays unique Device Name, OS version, Agent version, and one-time enrollment request/code (`agent-enroll`).
   - Shows `Pending Admin Approval` until staff approves in `/admin/print-agents`.
   - Upon approval, receives revocable device credential encrypted locally via **Windows DPAPI**.
3. **Printer Discovery & Multi-Printer Support:**
   - Automatically enumerates Windows installed printers across **USB**, **Wi-Fi** (TCP/IP / IPP / WSD), and **Ethernet/LAN**.
   - Reports driver-detected `system_printer_name`, `IsDefault`, `IsOffline`/`WorkOffline`, colour, duplex, and paper sizes via `agent-sync-printers`.
   - Allows selecting/viewing multiple active printers routed to the same PC; warns clearly if a Wi-Fi printer uses an unstable WSD port.
4. **Connection & Agent Health Tray UI:**
   - Clear status indicator: `Connected` (heartbeat active), `Disconnected` (network/Supabase unreachable — exponential backoff retry), `Paused` (operator paused locally or via Admin), or `Revoked` (credential invalidated).
   - Displays active printer health, current claiming/printing job (`job_number`, pages, copy progress), last 10 local print attempts (without storing permanent customer documents), and **Pause / Resume**, **Refresh Printers**, **Local Test Print**, and **Export Safe Diagnostics** (redacted of document PII/secrets).
5. **Job Receiving, Printing & Recovery:**
   - Polls `agent-claim-job` only when Connected and not Paused; locks job with time-bounded lease.
   - Downloads files over short-lived signed URLs, verifies SHA-256 checksum & size, applies allowlisted print settings, and submits silently via vetted PDF/image renderer to Windows Print Spooler, capturing `windows_spooler_job_id`.
   - Reports every step (`downloading` → `printing` → `submitted_to_spooler` → `completed` / `failed` / `needs_review`).
   - **Error & Recovery:** On printer offline/paper-out, stops claiming for that printer and reports `printer_offline` / `failed`. On mid-job crash/network loss: expired leases before spooler submission recover safely; ambiguous post-spooler crashes are flagged **`needs_review`** and **never auto-reprinted**. Temporary downloaded files auto-delete immediately after completion/failure retention window.

---

## 5. Pricing Specification

### 5.1 Fixed System Pricing Rules (Non-Negotiable Architecture)
1. **Single Authoritative Calculation:** Customer estimate (`/quick-print/options`) and Admin confirmation (`/admin/print-jobs/:jobId`) must invoke the **exact same server-side pricing calculation function** driven by `print_pricing_rules`.
2. **Explicit Unit Distinction:** Every pricing rule must declare `pricing_unit` as either **`per_printed_page`** (e.g., 1 duplex sheet = 2 printed page-sides) or **`per_physical_sheet`** (e.g., 1 duplex sheet = 1 sheet rate), eliminating ambiguity.
3. **Page-Count Basis:** Estimates and final totals derive from verified document page count × selected page range × copies (adjusted by duplex rule), **never** from raw file count.
4. **Estimate vs Final Label:** Customer UI always displays *"Estimated total — final price confirmed by counter staff after review"*.
5. **Minimum Charge Support:** Pricing function supports `minimum_charge` per job (applied after line-item calculation if total > 0 and < `minimum_charge`).
6. **Audited Manual Overrides:** When an authorized operator changes `final_amount` away from the calculated total, the system records `calculated_amount`, `final_amount`, `override_reason`, `actor_id`, and timestamp in `print_events`.

### 5.2 Configurable Business Values (Require Owner Confirmation — Zero Fabricated INR)
*(All actual INR numeric amounts are intentionally omitted until confirmed by the shop owner.)*
- Base rate for **A4 Black & White** (Single-sided & Duplex).
- Base rate for **A4 Colour** (Single-sided & Duplex).
- Rates for **A3** and **Legal** paper sizes (B&W and Colour, if hardware supports them).
- **Duplex billing model:** Per printed side vs per physical sheet (or discounted second side).
- **Partial/Mixed Colour rule:** Whether a page with small colour elements is billed at full colour rate or mixed-page breakdown.
- **Copies bulk discount** (if any, or linear multiplication).
- **Minimum job charge** (yes/no and amount).
- **Override permission & reason requirement:** Whether `Staff/Operator` can override prices or only `Manager`/`Owner`, and whether a text reason is mandatory on every override.
- **Cancellation / refund rule** after UPI/Cash payment prior to printing.
