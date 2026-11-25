# AC Scan2Print (AMAN COMPUTER) — Smart QR Print System
## Phase 1: Open Decisions & Parameters Register

**Document Version:** 2.0 (Reconciled with Phase 0 Baseline & Fixed Owner Decisions)  
**Phase:** Phase 1 — Product Specification & UX Design (Documentation Only)  
**Date:** November 24, 2026  
**Status:** Approved Architecture

All business parameters, physical hardware capabilities, and financial rates that cannot be verified directly from the codebase or existing hardware telemetry are strictly cataloged below. **Zero values are assumed or invented.**

---

## 1. Resolved & Approved Architectural Decisions

The following core architectural decisions have been confirmed by the project owner and Phase 0 baseline:

| ID | Decision Topic | Approved Architectural Resolution | Authority |
| :--- | :--- | :--- | :--- |
| **AD-01** | **Single Admin Model** | Exactly **ONE** Super Admin account (`Yr0Wr7PuuAdOIMaqohmqaINNbNC2`) verified via Firebase Auth RS256 token and `print_admin_accounts`. No Staff, Operator, or Viewer sub-accounts in MVP. | Non-Negotiable Owner Decision |
| **AD-02** | **Customer Anonymity** | Customer name and mobile number are optional. Anonymous tracking via 256-bit cryptographic `tracking_token` (only `SHA-256(tracking_token)` stored). | Non-Negotiable Owner Decision |
| **AD-03** | **Dual-Brand Visual System** | Admin Dashboard preserves existing Warm Aman Orange (`#f07a2e` / `#ff8c42`) glassmorphism frame; Customer Portal uses Obsidian Dark (`#111318`), Electric Cyan (`#25C7D9`), and Pure White (`#FFFFFF`). | Non-Negotiable Owner Decision |
| **AD-04** | **Duplex Billing Formula** | Duplex printing is strictly billed **per physical paper sheet (`ceil(pages / 2)`)**, never per logical page. Transparently disclosed to customers upfront. | Non-Negotiable Owner Decision |
| **AD-05** | **UPI Auto-Release Rule** | Once a customer's UPI payment (12-digit UTR and/or screenshot) is verified by Admin, the job **automatically qualifies for queue release** without a secondary manual approval click. | Non-Negotiable Owner Decision |
| **AD-06** | **Cash Mandatory Approval** | Cash payment requires explicit Admin confirmation of cash in hand, followed by manual Admin approval to release to the print queue. | Non-Negotiable Owner Decision |
| **AD-07** | **Ambiguity Guard (`needs_review`)** | Any print attempt where the agent crashes or disconnects *after* Windows Print Spooler submission transitions to `needs_review`. **Auto-reprint is strictly forbidden.** Admin must physically check printer tray. | Technical Roadmap v1.1 §9 |
| **AD-08** | **Storage & File Security** | 3 private Supabase buckets (`print-uploads`, `payment-evidence`, `payment-assets`). Direct public access disabled. All files accessed via 120s signed URLs and permanently purged after 24 hours. | Phase 0 Database Reconciliation |

---

## 2. Unresolved Parameters ("PENDING OWNER INPUT")

The following operational, hardware, and business parameters require physical on-site discovery or explicit owner input:

| ID | Parameter Category | Specific Item Needed | Engineering Default / Current State | Owner Input Status |
| :--- | :--- | :--- | :--- | :---: |
| **OD-01** | **Brand Assets** | 6 Official AC Scan2Print logo files (Primary horizontal logo, white logo, monochrome logo, monogram icon, app icon, favicon). | Currently fallback CSS monogram ("A") used. | **PENDING OWNER INPUT** |
| **OD-02** | **Pricing: B&W Rates** | Exact INR rate per page for A4 Black & White (Single-sided) and rate per physical sheet (Duplex). | `0.00` in database; returns `PRICING_NOT_CONFIGURED` until set. | **PENDING OWNER INPUT** |
| **OD-03** | **Pricing: Colour Rates** | Exact INR rate per page for A4 Colour (Single-sided) and rate per physical sheet (Duplex). | `0.00` in database; returns `PRICING_NOT_CONFIGURED` until set. | **PENDING OWNER INPUT** |
| **OD-04** | **Pricing: Paper Sizes** | Rates for A3 and Legal paper sizes (if supported). | Disabled in customer portal until hardware confirms support. | **PENDING OWNER INPUT** |
| **OD-05** | **Pricing: Minimum Charge**| Whether a minimum order charge (e.g., ₹5.00 or ₹10.00) applies per job. | Default `0.00` (no minimum charge). | **PENDING OWNER INPUT** |
| **OD-06** | **Hardware: Printer Fleet**| Exact brand, model name, and connection type (USB vs Wi-Fi IP) for counter printers. | Set to `NULL` / Unknown in `print_printers`. | **PENDING OWNER INPUT** |
| **OD-07** | **Hardware: Duplex Support**| Whether connected printer supports automatic hardware duplex or requires manual flip. | Tri-state `supports_duplex = NULL` (defaults to single-sided). | **PENDING OWNER INPUT** |
| **OD-08** | **Hardware: Shop PC** | Windows 11 edition, build number, and sleep/power configuration on counter PC. | Required prior to Windows Print Agent installation (Phase 5). | **PENDING OWNER INPUT** |
| **OD-09** | **Production Domain** | Custom domain for customer QR access (e.g., `print.amancomputer.in` vs default). | Default: `https://ac-scan2print.web.app/quick-print`. | **PENDING OWNER INPUT** |
