# AC Scan2Print (AMAN COMPUTER) — Smart QR Print System
## Phase 1: Open Decisions & Owner Confirmation Register

**Document Version:** 1.0  
**Phase:** Phase 1 — Product Specification & UX Design (Documentation Only)  
**Date:** 20 November 2026  

All items below are either **missing brand/infra inputs** or **business/architecture choices** that must NOT be invented by engineering. Proposed safe defaults are listed strictly as recommendations pending project owner sign-off.

---

## 1. Critical Brand Asset & Visual Token Decisions (Before Phase 3–4 UI)

| ID | Topic | Finding / Conflict | Owner Decision Needed |
| :-: | :--- | :--- | :--- |
| **OD-01** | **AC Scan2Print Brand Asset Package (6 Files Missing)** | Workspace inspection confirmed **zero** `.svg`/`.png`/`.ico` files for AC Scan2Print exist in `/public` or `/src`. Required files: Primary horizontal logo, White horizontal logo, Black monochrome logo, Primary AC monogram, Application icon, Favicon. | **OPEN (Before Phase 3–4 UI):** Supply official AC Scan2Print logo files. |
| **OD-02** | **Color Palette Reconciliation (Existing Admin Orange vs AC Scan2Print Electric Cyan)** | Existing Admin Dashboard preserves Orange (`#f07a2e/#ff8c42`); AC Scan2Print brand uses Obsidian Black (`#111318`), Electric Cyan (`#25C7D9`), White (`#FFFFFF`). | **APPROVED:** Keep existing Admin Dashboard Orange theme unchanged; AC Scan2Print Customer Portal uses Obsidian Black + Electric Cyan + White. |

---

## 2. Role, Security & Backend Infrastructure Decisions (Before Phase 2)

| ID | Topic | Approved / Proposed State | Owner Decision Status |
| :-: | :--- | :--- | :--- |
| **OD-03** | **Supabase & Firebase Project Provisioning** | Completely **new** Supabase project + **new** Firebase project created externally by owner; **never** connect to old Aman Computer projects; Supabase Auth is authoritative Admin identity (zero duplicate Firebase Auth). | **APPROVED (Credentials Pending Supply to `.env`):** External projects created; awaiting URLs/keys in deployment env. |
| **OD-04** | **RBAC Role Mapping** | Exactly **ONE** Admin account for MVP (`print_admin_accounts` singleton guard). No Staff/Manager/Viewer UI or multi-role RBAC in MVP. | **APPROVED:** Single MVP Admin only; no public signup or role expansion UI. |
| **OD-05** | **Payment Gate Timing** | Manual UPI & Cash verification; both **Admin payment verification (`paid`)** AND **Admin job approval (`approved`)** are mandatory before releasing a job to `queued`. | **APPROVED:** Strictly no unpaid queue release; no Razorpay/Cashfree. |
| **OD-06** | **Customer Identity Collection** | Customer name and mobile are optional; anonymous submission authorized solely via cryptographic `tracking_token` (SHA-256 hash stored). | **APPROVED:** Optional Name/Phone + high-entropy tracking token. |
| **OD-07** | **Viewer Access to Customer Documents** | Superseded for MVP by **OD-04** (single MVP Admin only; no Viewer role in MVP). | **RESOLVED FOR MVP:** Single Admin only. |

---

## 3. Pricing Business Rules (Before Phase 2 Pricing Function)

*(No INR rates are assumed or invented.)*

| ID | Topic | Owner Confirmation Status |
| :-: | :--- | :--- |
| **OD-08** | **Exact Print Rates (INR)** | **OPEN (Admin Configuration Required):** Zero INR rates hardcoded; `print_pricing_rules` seeded empty; server returns `PRICING_NOT_CONFIGURED` until Admin enters actual rates. |
| **OD-09** | **Duplex Billing Unit** | **APPROVED:** Duplex billing unit MUST be `per_physical_sheet` (odd page counts `Math.ceil(pages / 2)`), enforced via DB `CHECK` constraint and server pricing engine. |
| **OD-10** | **Partial Colour Rule** | **OPEN:** Any page selection rule for mixed colour vs B&W will follow Admin pricing configuration (`bw` vs `colour` job mode in MVP). |
| **OD-11** | **Minimum Job Charge** | **OPEN (Supported in Schema):** Optional `minimum_charge` column (`>= 0`, default `0.00`) supported per pricing rule; `0.00` unless configured by Admin. |
| **OD-12** | **Price Override & Refunds** | **APPROVED FOR MVP:** Single Admin may override `final_amount` prior to `paid`/completion with mandatory `price_override_reason` (>= 5 chars) logged in `print_events`. |

---

## 4. Routing, Domain & Operational Policy (Before Phase 2–3 & Phase 11)

| ID | Topic | Current State | Owner Decision Status |
| :-: | :--- | :--- | :--- |
| **OD-13** | **Public Website Integration & Domain** | Customer Portal is a **separate app/deployment** from the Aman Computer public website (`CUSTOMER_PORTAL_URL` env/config). | **PARTIALLY APPROVED:** Separate portal architecture approved; exact production domain URL still **OPEN** (not invented). |
| **OD-14** | **Upload & File Limits** | `PDF, JPG/JPEG, PNG` only; max `20 MB` per file; max `5` files per job; max `20` copies (configurable in `print_system_settings`). | **PROPOSED DEFAULTS CONFIGURED** |
| **OD-15** | **Document Storage Retention** | Configurable `print_system_settings` TTLs (`1h` draft, `24h` completed/rejected/cancelled, `72h` failed/needs_review) with `retention_policy_confirmed = FALSE` & `auto_cleanup_enabled = FALSE` until confirmed. | **OPEN (Confirmation Pending):** Defaults remain safe/dry-run for cron until confirmed. |

---

## 5. Shop Windows 11 & Printer Hardware Decisions (Before Phase 5)

| ID | Topic | Owner Confirmation / Physical Audit Needed |
| :-: | :--- | :--- |
| **OD-16** | **Shop PCs & Windows 11 Details** | **OPEN (Before Phase 5):** Number of Windows 11 PCs running the agent, Windows 11 edition/build, CPU/RAM/disk specs, UPS backup, and sleep/power settings. |
| **OD-17** | **Printer Fleet Inventory** | **OPEN (Before Phase 5):** Exact printer brand(s), model(s), count, and connectivity per printer (USB, Wi-Fi static IP vs WSD, or Ethernet/LAN). |
| **OD-18** | **Verified Hardware Capabilities** | **OPEN (Before Phase 5):** For each printer: colour support, **hardware automatic duplex** vs manual duplex, and physically loaded paper sizes (`A4`, `A3`, `Legal`). |
| **OD-19** | **PDF Rendering Component & Signing** | **OPEN (Before Phase 5):** Confirm PDFium-based rendering / installer code-signing plan prior to Windows 11 Local Print Agent phase. |
