# AC Scan2Print (AMAN COMPUTER) — Smart QR Print System
## Phase 1: MVP Scope Definition & Feature Checklist

**Document Version:** 2.0 (Reconciled with Phase 0 Baseline & Fixed Owner Decisions)  
**Phase:** Phase 1 — Product Specification & UX Design (Documentation Only)  
**Date:** November 24, 2026  
**Status:** Approved Specification

---

## 1. MVP Architectural Boundary & Philosophy

The AC Scan2Print MVP is designed to establish **one complete, hardened, end-to-end print pipeline** from Customer QR Scan to physical shop printing at Aman Computer.

### Core Non-Negotiable Invariants:
1. **Single Super Admin Account:** Only UID `Yr0Wr7PuuAdOIMaqohmqaINNbNC2` authorized via `print_admin_accounts`. No sub-operator accounts.
2. **Optional Customer Identity:** Name and Phone optional. Anonymous tracking via cryptographic token hash.
3. **Verified UPI Auto-Release:** Verified UPI payment qualifies for print queue without secondary manual approval.
4. **Cash Payment Mandatory Approval:** Cash requires Admin confirmation and explicit job approval.
5. **Physical Sheet Duplex Billing:** Billed per physical sheet (`ceil(pages / 2)`).
6. **Dual-Branding Separation:** Admin remains Warm Orange (`#f07a2e`); Customer Portal uses Obsidian Dark (`#111318`) and Electric Cyan (`#25C7D9`).
7. **Zero Speculation:** Unknown hardware capabilities or prices marked strictly as `"PENDING OWNER INPUT"`.

---

## 2. Definitive MVP Feature Checklist

| # | System Area | Feature / Capability | MVP Scope Status | Notes & Invariants |
| :-: | :--- | :--- | :---: | :--- |
| **A** | **Authentication & Security** | | | |
| A1 | Backend Auth | Firebase Auth with RS256 token verification via Google JWKS | **INCLUDED (MVP)** | Edge Functions verify via `jose` library |
| A2 | Admin Access | Single Super Admin singleton guard (`Yr0Wr7...`) | **INCLUDED (MVP)** | Enforced via `print_admin_accounts` table |
| A3 | Multi-Role Staff | Sub-accounts (Staff, Operator, Viewer, Manager) | **DEFERRED (Phase 12)** | Explicit owner decision |
| A4 | Customer Identity | Anonymous submission via 256-bit `tracking_token` | **INCLUDED (MVP)** | Only `SHA-256(tracking_token)` stored in DB |
| A5 | Customer Accounts | Customer sign-up, login, or password protection | **DEFERRED (Phase 12)** | Zero customer accounts in MVP |
| **B** | **Storage & File Security** | | | |
| B1 | Storage Buckets | 3 Private buckets (`print-uploads`, `payment-evidence`, `payment-assets`) | **INCLUDED (MVP)** | Zero public bucket access |
| B2 | Upload Security | 120-second signed upload URLs | **INCLUDED (MVP)** | Direct-to-storage private upload |
| B3 | Admin Preview | 120-second signed preview URLs for documents & proofs | **INCLUDED (MVP)** | Generated only for verified Admin |
| B4 | File Retention | Automated 24h permanent deletion of files & proofs | **INCLUDED (MVP)** | Scheduled cleanup cron function |
| **C** | **Customer Portal (`/quick-print*`)** | | | |
| C1 | Route Design | Dedicated mobile-first routes (`/quick-print` through `/track`) | **INCLUDED (MVP)** | Obsidian dark (`#111318`) & Cyan (`#25C7D9`) |
| C2 | File Upload | Multi-file upload for PDF, JPG, PNG (<= 20 MB, max 5 files) | **INCLUDED (MVP)** | Magic-byte & corruption validated |
| C3 | Office Documents | Word (.docx), Excel (.xlsx), PowerPoint (.pptx) | **DEFERRED (Phase 12)** | Requires sandboxed conversion cluster |
| C4 | Print Options | B&W/Colour, A4, Duplex, Copies (1-20), Page Range | **INCLUDED (MVP)** | Hardware-dependent options gated |
| C5 | Duplex Pricing | Duplex calculation per physical sheet (`ceil(pages/2)`) | **INCLUDED (MVP)** | Formula disclosed upfront to customer |
| C6 | Price Estimate | Server-calculated estimated total with counter notice | **INCLUDED (MVP)** | Exact same pricing engine as Admin |
| C7 | UPI Payment | Shop UPI QR display, VPA copy, 12-digit UTR input, proof upload | **INCLUDED (MVP)** | Proofs to `payment-evidence` bucket |
| C8 | Cash Payment | "Pay Cash at Counter" toggle | **INCLUDED (MVP)** | Sets `payment_status = 'unpaid'` |
| C9 | Confirmation | Monospace `job_number` & copyable tracking link | **INCLUDED (MVP)** | Idempotent on browser refresh |
| C10| Live Tracking | Real-time status badge & vertical progress timeline | **INCLUDED (MVP)** | Public tracking never exposes private URLs |
| C11| WhatsApp/SMS | Automated SMS / WhatsApp status notifications | **DEFERRED (Phase 9)** | Requires WhatsApp BSP approval |
| **D** | **Admin Dashboard (`/admin/*`)** | | | |
| D1 | UI Frame | Warm Orange (`#f07a2e`) glassmorphic shell (`Shell.tsx`) | **INCLUDED (MVP)** | Preserves existing brand identity |
| D2 | Dashboard Overview | Clickable KPI tiles for all 16 states & today's revenue | **INCLUDED (MVP)** | Real-time operational metrics |
| D3 | Print Jobs Ledger | Searchable, filterable table of all customer jobs | **INCLUDED (MVP)** | Debounced search & server pagination |
| D4 | Document Preview | Integrated PDF & image viewer via 120s signed URLs | **INCLUDED (MVP)** | Verified page count check |
| D5 | Pricing Calculation | Server-calculated total + manual price override | **INCLUDED (MVP)** | Override requires mandatory text reason |
| D6 | UPI Verification | UTR match + screenshot preview with Auto-Release | **INCLUDED (MVP)** | Auto-release to queue upon verification |
| D7 | Cash Confirmation | "Confirm Cash Received" button + manual approve | **INCLUDED (MVP)** | Explicit Admin approval required |
| D8 | Job Rejection | Reject job with mandatory recorded reason modal | **INCLUDED (MVP)** | Emits audit event & updates tracking |
| D9 | Live Print Queue | Real-time monitor of active agent leases & spooler jobs | **INCLUDED (MVP)** | Displays lease countdown timers |
| D10| Ambiguity Guard | Flag post-spooler crash as `needs_review` | **INCLUDED (MVP)** | **Strictly blocks auto-reprint** |
| D11| Authorize Reprint | Manual reprint button requiring mandatory reason | **INCLUDED (MVP)** | Increments attempt number |
| D12| Printer Fleet | Manage USB/Wi-Fi printers & capability overrides | **INCLUDED (MVP)** | Gated by tri-state nullability |
| D13| Agent Management | Device enrollment approval, heartbeat tracking, revoke | **INCLUDED (MVP)** | Real-time agent status indicator |
| D14| QR & Posters | Permanent URL check, SVG/PNG QR export, A4 poster | **INCLUDED (MVP)** | Permanent counter QR assets |
| D15| Immutable Audit | Read-only activity logs (`print_events`) | **INCLUDED (MVP)** | Zero edit/delete functionality |
| **E** | **Windows 11 Local Print Agent** | | | |
| E1 | Platform & Worker | C# / .NET 8 background service on Windows 11 shop PC | **INCLUDED (MVP)** | Zero Supabase `service_role` keys |
| E2 | Local Security | DPAPI-encrypted device token storage | **INCLUDED (MVP)** | Encrypted in `%LocalAppData%` |
| E3 | Printer Discovery | Auto-enumeration of USB, Wi-Fi, and LAN printers | **INCLUDED (MVP)** | Syncs to `print_printers` via API |
| E4 | Job Claim & Lease | Atomic job claim with 120-second lease | **INCLUDED (MVP)** | Issues 120s download URLs |
| E5 | Spooler Submission | Silent PDF rendering + Windows Print Spooler submission | **INCLUDED (MVP)** | Captures `windows_spooler_job_id` |
| E6 | Error & Recovery | Pre-spooler failure vs post-spooler `needs_review` | **INCLUDED (MVP)** | Temp files deleted immediately |
| E7 | System Tray UI | Windows Tray icon with status, pause, test print | **INCLUDED (MVP)** | Visual status indicator on shop PC |

---

## 3. Open Parameters Register ("PENDING OWNER INPUT")

The following items are strictly marked as unresolved until the shop owner provides verified values:

1. **Exact Print Rates (INR):**
   - Rate per page for A4 Black & White (Single-sided).
   - Rate per physical sheet for A4 Black & White (Duplex).
   - Rate per page for A4 Colour (Single-sided).
   - Rate per physical sheet for A4 Colour (Duplex).
   - Minimum job charge (if applicable).
   - *Status:* **PENDING OWNER INPUT** (Zero hardcoded INR rates in code; table seeded empty).
2. **Printer Fleet Hardware Inventory:**
   - Exact brand and model of primary counter printer (e.g., HP LaserJet, Canon LBP).
   - Connection type (USB cable vs Wi-Fi static IP).
   - Hardware automatic duplex support (Yes / No).
   - Colour support (Monochrome only vs Colour).
   - Physically loaded paper trays (A4, Legal, A3).
   - *Status:* **PENDING OWNER INPUT** (Columns set to tri-state `NULL` / Unknown).
3. **Production Domain URL:**
   - Exact custom domain (e.g., `print.amancomputer.in` or `amancomputer.in/quick-print`).
   - *Status:* **PENDING OWNER INPUT** (Defaults to `https://ac-scan2print.web.app/quick-print`).
