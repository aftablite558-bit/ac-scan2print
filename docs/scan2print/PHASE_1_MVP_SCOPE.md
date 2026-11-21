# AC Scan2Print (AMAN COMPUTER) — Smart QR Print System
## Phase 1: MVP Scope Definition & Delivery Boundaries

**Document Version:** 1.0  
**Phase:** Phase 1 — Product Specification & UX Design (Documentation Only)  
**Date:** 20 November 2026  

---

## 1. MVP Philosophy (Roadmap §19 & §22)
Prove **one complete, rock-solid, end-to-end secure workflow** from Customer QR Scan → Private Upload → Operator Review/Pricing/Payment → Windows 11 Local Print Agent → Actual Physical Shop Printer **before** adding multi-branch, automated payment gateways, or Office document conversion.

---

## 2. Included in MVP (Phase 2–11 Target)

### A. Backend & Security (Phase 2)
- Versioned Supabase PostgreSQL migrations (`print_jobs`, `print_job_files`, `print_devices`, `print_printers`, `print_job_attempts`, `print_events`, `print_pricing_rules`, `print_payment_records`, `print_service_settings`, `print_notifications`).
- Strict RLS policies on every table + Supabase Auth + RBAC enforcement.
- Private Storage bucket (`print-uploads`) with short-lived signed upload & download URLs.
- Core Edge Functions (`create-print-job`, `create-print-upload-url`, `finalize-print-upload`, `get-print-job-status`, `admin-review-print-job`, `admin-release-print-job`, `admin-retry-print-job`, `agent-enroll`, `agent-heartbeat`, `agent-sync-printers`, `agent-claim-job`, `agent-report-job-event`, `cleanup-expired-print-files`).
- Single server-side price calculation function.
- Scheduled storage file cleanup verified against real Storage objects.

### B. Customer QR Portal (Phase 3)
- Permanent public route `/quick-print` + mobile-first upload, options, idempotent confirmation, secure token tracking (`/quick-print/track`), and help.
- Supported formats: **PDF, JPG/JPEG, PNG only** (server magic-byte + corruption validated).
- Paper size: **A4 default** (`A3`/`Legal` shown only if enabled shop printer supports it).
- Print mode: **B&W / Colour** (filtered by active printer capability).
- Sides: **Single-sided** initially (**Double-sided** unlocked only after hardware duplex testing).
- Copies (`1–20` configurable), basic page range, orientation, scaling, clear estimated price disclaimer, and retention privacy notice.

### C. Admin Print Manager (Phase 4)
- Authenticated access integrated into existing Admin `Shell.tsx`.
- Operational Dashboard Overview (`/admin/print-management`).
- Print Jobs list with search/filters + Job Detail with secure document preview, verified page count, price confirmation/override, Cash & manual UPI payment verification, Approve / Hold / Reject / Release / Cancel / Retry / Authorize Reprint / Handover.
- Print Queue monitor + `needs_review` resolution workflow.
- Printer & Agent Device management (enrollment approval, pause/resume, revocation, capability override, test print).
- Pricing Rules management + test preview.
- Permanent QR Management (verified URL, PNG/SVG export, printable poster).
- Read-only Activity Logs, Notifications, Basic Reports, and Print/Retention Settings.

### D. Windows 11 Local Print Agent (Phase 5–8)
- C# / .NET 8 background worker + System Tray UI on **1 Windows 11 PC** supporting **1+ USB/Wi-Fi/LAN printers**.
- Device enrollment + Windows DPAPI credential storage.
- Atomic job claim with lease, SHA-256 verification, silent PDF + JPG/PNG printing via licensed/vetted PDF renderer, spooler ID capture, offline/error handling, `needs_review` protection, reconnect, temp file purge, and Windows installer.

---

## 3. Explicitly Excluded from MVP (Deferred to Post-MVP / Phase 9–12)

| Deferred Feature | Target Phase | Rationale for Deferral |
| :--- | :---: | :--- |
| Optional `/admin/customers` directory & customer login accounts | Phase 12 | Customer accounts add friction; anonymous `tracking_token` is faster and safer for shop walk-ins |
| Office Document Support (`DOC/DOCX`, `XLS/XLSX`, `PPT/PPTX`) | Phase 12 | Requires sandboxed conversion, macro isolation, and font/layout QA |
| Automated Online Payment Gateway & UPI Webhooks (Razorpay/PhonePe/etc.) | Phase 12 | Shop counter handles Cash & manual UPI verification reliably in MVP |
| Automated Customer WhatsApp / SMS Alerts | Phase 9 | Requires third-party BSP approval, templates, and customer phone consent |
| Multi-branch / Multi-shop routing & Self-service Kiosk mode | Phase 12 | Single-shop physical reliability must be proven first |
| Hindi / English UI language switcher | Phase 12 | Core English operational UI + clear copy prioritized first |
| Advanced consumables / ink-toner predictive analytics | Phase 12 | Requires vendor-specific SNMP telemetry across printer fleet |
| Automated "Direct-Print without Operator Review" mode | Post-Pilot (if ever) | High risk of wasted paper/unpaid jobs until pilot proves stability |
