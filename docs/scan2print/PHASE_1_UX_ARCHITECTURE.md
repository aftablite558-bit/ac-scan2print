# AC Scan2Print (AMAN COMPUTER) — Smart QR Print System
## Phase 1: Comprehensive UI/UX Design System & Screen Specifications

**Document Version:** 2.0 (Reconciled with Phase 0 Baseline & Fixed Owner Decisions)  
**Phase:** Phase 1 — Product Specification & UX Design (Documentation Only)  
**Date:** November 24, 2026  
**Status:** Approved Specification

---

## 1. Design System & Dual-Brand Identity

AC Scan2Print operates with a deliberate architectural separation between the **Customer Facing Experience** and the **Shop Administration Experience**:

### 1.1 Customer Portal Branding (Mobile First)
- **Primary Canvas:** Obsidian Dark (`#111318`) — high-contrast, modern dark mode reducing battery consumption and glare on mobile screens.
- **Brand Accent:** Electric Cyan (`#25C7D9`) — primary CTAs, active file progress, selection highlights, and QR branding.
- **Text & Structure:** Pure White (`#FFFFFF`) for primary headers; Neutral Slate (`#94A3B8`) for secondary instructions; Slate Dark (`#1E293B`) for elevated cards and input containers.
- **Performance Budget:** Lightweight bundle (< 150 KB initial JS/CSS). Zero GSAP wallpaper animation, zero heavy admin charting dependencies.

### 1.2 Admin Dashboard Branding (Counter Workspace)
- **Existing Framework:** Tactile warm glassmorphism foundation (`src/index.css`).
- **Brand Accent:** Warm Aman Orange (`#f07a2e` light / `#ff8c42` dark).
- **Materiality:** 5-layer spatial depth (`--frost`, `--blur: 26px`, `--r-md: 14px`, `--glass-solid` for data tables). High-contrast solid card surfaces for dense operational queues, pricing, and document previews.

---

## 2. Customer Mobile Screen Specifications (6 Screens)

### Screen C1: Mobile Landing Screen (`/quick-print`)
- **Viewport:** Mobile-optimized, centered max-width 480px.
- **Header:** AC Scan2Print cyan monogram tile (`40×40px`) + **AMAN COMPUTER** wordmark in pure white.
- **Hero Title:** "Smart QR Print"
- **Subtitle:** "Upload documents directly from your phone. Collect your print at the counter."
- **4-Step Visual Flow Cards:**
  1. *Upload:* PDF, JPG, PNG (Max 20 MB/file)
  2. *Options:* Color/B&W, copies, page range & single/double sided
  3. *Pay:* Fast UPI payment or cash at counter
  4. *Collect:* Instant order number for counter pickup
- **Shop Status Badge:** "Shop Counter Online • Ready for Prints" (with glowing green indicator).
- **Privacy Assurance Box:** "🔒 **Your Privacy First:** Files are stored in encrypted private storage and automatically permanently deleted within 24 hours of printing."
- **Primary Action:** Large prominent button: **[ Upload Documents ]** (Background `#25C7D9`, Text `#111318`, bold 16px, 52px height).
- **Secondary Action:** Text link: "Already submitted a job? **Track Status**".

### Screen C2: Document Upload Screen (`/quick-print/upload`)
- **Header:** Back button (`<`) + "Step 1 of 3: Upload Documents".
- **Dropzone / Tap Zone:**
  - Border: Dashed 2px `#25C7D9` over dark slate background (`#1A202C`).
  - Icon: CloudUpload in Electric Cyan.
  - Text: "Tap to select PDF, JPG or PNG"
  - Subtext: "Up to 5 files • Max 20 MB per file".
- **File Queue List:**
  - Card per file: File type icon (PDF / Image), filename, formatted size (e.g., `2.4 MB`), and verified page count badge once inspected.
  - Real-time Progress Bar: Electric cyan fill with percentage indicator.
  - Action Controls: Retry icon (on failed upload), Remove icon (`X`).
- **Validation Messages:**
  - Error: "File exceeds 20 MB limit" or "Unsupported file format. Please upload PDF, JPG, or PNG."
- **Bottom Bar:**
  - Summary: "3 files uploaded (14 pages total)".
  - Next Button: **[ Choose Print Options → ]** (Disabled until >= 1 valid file completes upload).

### Screen C3: Print Options & Pricing Estimate (`/quick-print/options`)
- **Header:** Back button + "Step 2 of 3: Print Options".
- **Print Mode Segmented Control:**
  - `[ Black & White ]` (Default) | `[ Full Colour ]`
- **Paper Size Segmented Control:**
  - `[ A4 ]` (Default) | `[ A3 (Disabled - Offline) ]` | `[ Legal (Disabled - Offline) ]`
- **Print Sides Segmented Control (Duplex):**
  - `[ Single-Sided ]` (Default) | `[ Double-Sided (Duplex) ]`
  - Helper note below Duplex: *"Double-sided is billed per physical sheet (e.g., 3 pages = 2 sheets)."*
- **Copies Stepper:**
  - `[-] 1 [+]` (Range 1 to 20).
- **Page Range Selector:**
  - Radio options: `[x] All Pages (1-14)` | `[ ] Custom Range` (e.g., `1-5, 8`).
- **Orientation:**
  - `[ Auto ]` (Default) | `[ Portrait ]` | `[ Landscape ]`.
- **Optional Identification:**
  - Customer Name: `[ Optional: Enter your name ]`
  - Mobile Number: `[ Optional: 10-digit mobile number ]`
  - Subtext: *"Used only to call your name at the counter."*
- **Live Pricing Summary Box:**
  - Breakdown: 14 pages • 7 duplex sheets • 1 copy.
  - Price: **₹XX.XX (Estimated Total)**
  - Disclaimer: *"Estimated total. Final amount will be verified by counter staff."*
- **Bottom Bar:**
  - Next Button: **[ Proceed to Payment → ]**.

### Screen C4: Payment Selection & Proof Submission (`/quick-print/payment`)
- **Header:** Back button + "Step 3 of 3: Payment".
- **Tabs:**
  - `[ ⚡ Pay via UPI (Fastest) ]` | `[ 💵 Cash at Counter ]`
- **Tab 1: UPI Payment View:**
  - Shop Counter UPI QR Code (high-contrast display with quiet zone).
  - Amount to Pay: **₹XX.XX** in large bold cyan.
  - Shop UPI ID: `amancomputer@upi` + `[ Copy UPI ID ]` button.
  - Instructions: "1. Scan QR with GPay / PhonePe / Paytm • 2. Enter 12-digit UTR below".
  - Input: `[ Enter 12-digit UTR / Transaction ID ]` (Format check: 12 alphanumeric characters).
  - Optional Proof Upload: `[ + Upload Payment Screenshot ]` (stored in private `payment-evidence`).
  - Guarantee Notice: *"Once UTR is verified, your job moves automatically to the print queue!"*
  - Action Button: **[ Submit Job & Verify Payment ]**.
- **Tab 2: Cash at Counter View:**
  - Icon: Banknotes in amber.
  - Message: "Please pay cash directly to the counter operator upon arrival."
  - Action Button: **[ Submit Job (Pay Cash at Counter) ]**.

### Screen C5: Submission Confirmation Screen (`/quick-print/success`)
- **Hero State:** Glowing green checkmark.
- **Title:** "Print Job Submitted!"
- **Job Identifier Card:**
  - Label: "YOUR JOB NUMBER"
  - Display: **`AC-261124-001`** (Monospace, 28px, cyan accent, one-tap copy).
- **Next Steps Guide:**
  - For UPI: "Your UPI reference is being verified. Your print will start shortly."
  - For Cash: "Show this Job Number to the counter operator to pay and start printing."
- **Job Summary:** 3 files • 14 pages (Duplex) • B&W • Amount: ₹XX.XX.
- **Copyable Tracking Link:**
  - URL box + `[ Copy Tracking Link ]`.
- **Primary CTA:** **[ Track Live Print Status ]**.

### Screen C6: Live Status Tracking Screen (`/quick-print/track?token=...`)
- **Header:** "Job Status: AC-261124-001" + Refresh icon.
- **Current Status Banner:**
  - Large semantic badge: e.g., `Queued for Print` (Cyan) or `Ready for Collection!` (Glowing Green).
  - Friendly explanation: "Your document is currently being printed on the shop laser printer."
- **Visual Vertical Progress Stepper:**
  - [✓] Job Submitted (`11:42 AM`)
  - [✓] Review & Settings Confirmed (`11:43 AM`)
  - [✓] Payment Verified (`11:44 AM`)
  - [●] Printing in Progress (`11:45 AM`)
  - [○] Ready for Collection
- **Counter Collection Card:**
  - "When ready, collect your document at **Counter 1 (Aman Computer)**."
- **Customer Action:**
  - `[ Cancel Print Job ]` (Enabled only before printing starts).
- **Security Guard:** Document preview and download buttons are strictly omitted.

---

## 3. Admin Operational Screen Specifications (Counter Operator)

### Screen A1: Admin Queue & Operations Dashboard (`/admin/print-queue` / `/admin/print-management`)
- **Theme:** Warm Aman Orange (`#f07a2e`) on obsidian slate glass.
- **Top Metrics KPI Row:**
  - **New Requests (`submitted`):** Large counter + badge.
  - **Awaiting Payment:** Amber card with pending UPI UTRs count.
  - **Queued for Print:** Cyan card showing jobs ready for agent claim.
  - **Active Printing:** Animated pulse showing current spooler jobs.
  - **Needs Review:** Red alert card with badge if any print attempt crashed.
  - **Today's Revenue:** Total confirmed cash + verified UPI in INR.
- **Hardware Telemetry Bar:**
  - Windows Print Agent: `● Connected (Heartbeat 4s ago)` | Version `1.0.4`.
  - Printer 1: `● HP LaserJet M1005 (USB) - Ready`.
  - Printer 2: `● Canon LBP2900 (USB) - Ready`.
- **Live Operational Queue Table:**
  - Columns: Priority, Job Number, Submitted Time, Customer, Files/Pages, Duplex, Mode, Amount, Payment Status, Job Status, Context Action.
  - Context Actions:
    - On `submitted`: `[ Review Job ]`
    - On `pending_verification`: `[ Verify UTR ]`
    - On `approved` (Cash): `[ Release to Queue ]`
    - On `needs_review`: `[ Check Output ]` (Highlighted in red)

### Screen A2: Admin Job Detail & Verification Workspace (`/admin/print-jobs/:jobId`)
- **Layout:** 2-Column Desktop Grid.
- **Left Column (Document Preview & Technical Check):**
  - Integrated PDF / Image Canvas Viewer (authenticated 120s signed URL).
  - Page Navigation: `Page [ 1 ] of 14` + Zoom controls (`-`, `+`, `Fit`).
  - File Information: Filename, MIME type, SHA-256 hash, byte size.
  - Page-by-Page Inspector: Confirms extracted page count matches visual pages.
- **Right Column (Controls & Financial Actions):**
  - **Customer Details:** Name & Mobile (if provided, else labeled "Anonymous Walk-in").
  - **Print Settings Editor:**
    - Mode toggle: B&W / Colour.
    - Paper Size: A4 / A3 / Legal.
    - Duplex: Single / Double-sided (`ceil(pages/2)` sheet calculation).
    - Copies: Number input.
  - **Pricing Panel:**
    - Calculated Total: `₹XX.XX` (derived from active pricing rules).
    - Override Checkbox: `[x] Apply Manual Price Override`.
    - Final Amount Input: `[ ₹XX.XX ]`.
    - Override Reason Input: `[ Mandatory: e.g. Customer provided own paper ]` (minimum 5 chars).
  - **Payment Verification Panel:**
    - If UPI: Shows customer UTR (`123456789012`) + `[ Preview Screenshot Proof ]` button.
    - Button: **[ Verify UPI Payment & Auto-Release ]** (Green).
    - If Cash: Shows unpaid notice.
    - Button: **[ Confirm Cash Received ]** (Amber).
  - **Action Toolbar:**
    - **[ Release to Print Queue ]** (Active once payment confirmed).
    - **[ Reject Job ]** (Opens modal requiring mandatory rejection reason).
    - **[ Authorize Reprint ]** (Active if in `needs_review` or `completed`; requires reason).
  - **Audit History Feed (`print_events`):**
    - Chronological log of every status change, timestamp, actor UID, and reason.

---

## 4. Windows 11 Local Print Agent Tray UI Specification

### 4.1 Tray Icon Visual States
- **Normal / Connected:** AC Monogram in solid Electric Cyan with green dot.
- **Disconnected / Offline:** Monogram in Slate with flashing red exclamation.
- **Paused:** Monogram in Amber with pause bars.
- **Printing Active:** Animated rotating cyan ring.

### 4.2 System Tray Context Menu (Right Click)
```text
┌──────────────────────────────────────────────┐
│ AC Scan2Print Local Agent — v1.0.4          │
│ Status: Connected to Aman Computer Cloud     │
├──────────────────────────────────────────────┤
│ Current Job: AC-261124-001 (Page 3/14)      │
│ Target: HP LaserJet M1005 (USB)             │
├──────────────────────────────────────────────┤
│ [ ] Pause Incoming Print Claims              │
│ [↻] Refresh Connected Printers               │
│ [🖨] Run Local Test Page                     │
│ [⚙] Open Diagnostic Logs                     │
├──────────────────────────────────────────────┤
│ Lock / Exit Agent                            │
└──────────────────────────────────────────────┘
```

### 4.3 Agent Diagnostic Window (Double Click)
- **Local Identity:** Device Name: `COUNTER-PC-01` • Windows 11 Pro 23H2.
- **API Status:** Latency: `24ms` • Last Heartbeat: `2s ago`.
- **Discovered Printers List:**
  - `HP LaserJet M1005` (USB001) — Status: Idle • Ready.
  - `Canon LBP2900` (USB002) — Status: Idle • Ready.
- **Recent Attempt Cache:** Shows last 5 spooler job IDs and completion timestamps (zero stored customer files).

---

## 5. System States Specification (Loading, Empty, Error, Offline)

| State Category | Customer Portal Screen Treatment | Admin Dashboard Screen Treatment |
| :--- | :--- | :--- |
| **Loading** | Clean skeleton pulse containers with cyan shimmer matching card shapes. Zero full-screen blocking spinners. | High-contrast layout-matched skeleton tables and card outlines. Preserves sidebar navigation. |
| **Empty** | "No files selected yet. Tap above to choose your document." with upload illustration. | "No print jobs in this status." with clear filters button and quick link to active queue. |
| **Error (Validation)** | Inline amber/red callout below input: "File is too large (max 20 MB)" or "Enter valid 12-digit UTR". | Toast notification and red input border with specific database/form error reason. |
| **Error (Network)** | Non-blocking retry bar: "Connection lost. Reconnecting to Aman Computer..." with manual [ Retry ] CTA. | Warning banner at top of workspace: "Backend unreachable. Polling will resume automatically." |
| **Offline (Agent)** | Customer sees normal queue: "Your job is in line for printing." (Prevents customer alarm). | Red alert badge on topbar: "Print Agent Disconnected. Check counter PC." Blocks new automated release. |
| **Success** | Confetti-free, clear confirmation screen with prominent Job Number and next counter instruction. | Green success toast and smooth row transition into next queue state. |

---

## 6. Standardized Customer-Facing Copy & Legal Notices

### 6.1 Pricing Disclaimer
> *"₹XX.XX (Estimated Total) — Final price will be verified by counter staff based on actual document pages and paper type."*

### 6.2 Duplex Billing Disclosure
> *"Double-sided printing is billed per physical sheet (e.g., 3 pages = 2 sheets)."*

### 6.3 24-Hour Privacy & Retention Notice
> *"🔒 **Your Privacy is Protected:** Uploaded documents and payment screenshots are encrypted in private storage and permanently deleted from our servers within 24 hours of printing or cancellation."*

### 6.4 Ready for Collection Notification
> *"🎉 **Your Print is Ready!** Please proceed to the Aman Computer counter and present Job Number **AC-261124-001** to collect your document."*
