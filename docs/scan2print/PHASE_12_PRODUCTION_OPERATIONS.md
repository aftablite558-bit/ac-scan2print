# AC Scan2Print — Phase 12 Post-Launch Operations, Financial Reconciliation & Cutover Runbook

## 1. Phase 12 Capabilities Implemented
1. **Daily Shift Financial Closeout & Reconciliation**
   - Authoritative server-side aggregation (`computeDailyFinancialReconciliation` in `supabase/functions/_shared/printManagement.ts`, exposed via `admin-print-jobs` `action=list`) across **all** database rows regardless of UI pagination.
   - Exact integer paise accounting for UPI Confirmed INR, Counter Cash Confirmed INR, Pending UPI Verification exposure, Unpaid Counter Cash exposure, Refunded totals, Completed Physical Sheets, and B&W / Colour / Single / Duplex breakdowns.
   - Interactive date picker & closeout summary panel inside **AC Scan2Print → Payment Verification**.

2. **Formula-Safe Shift Ledger & Audit Trail CSV Exports**
   - `buildJobsLedgerCsv` & `buildAuditEventsCsv` in both server (`_shared/printManagement.ts`) and client (`src/utils/printManagement.ts`) enforce RFC-4180 quoting and OWASP CSV formula-injection prefixing (`= + - @ \t \r`).
   - Direct CSV download in **All Print Jobs**, **Daily Shift Financial Closeout**, and **Access Control & Audit → Audit Trail**.

3. **Single Super Admin Governance & Live Scan2Print Audit Trail**
   - Removed the deprecated multi-admin creation form from `AccessAuditPage.tsx` and aligned the UI with the database singleton invariant (`print_admin_accounts.singleton_guard = true`).
   - Wired live `print_events` and `print_cleanup_logs` inspection, keyword search, and CSV export into **Access Control & Audit → Audit Trail**.

4. **Cloud Operational Backup Snapshot (`Settings → Data Backup`)**
   - Added sanitized **Scan2Print Live Cloud Snapshot (JSON)** export covering metrics, daily reconciliation, pricing rules, printers, devices, recent jobs, cleanup logs, and recent events without exposing credentials.

5. **Unified Dual-Surface Local/Production Server (`server.ts`)**
   - Express serves both the **Admin Control Center** (`/`, `/admin/*`) and the **Customer QR Portal** (`/quick-print`, `/quick-print/*`) on port `3000` across development (dual Vite middlewares) and production (`dist/` + `dist-customer/`).

---

## 2. Next Step — Phase 13: Live Cloud Provisioning & On-Site Counter Cutover
1. Verify all 7 Supabase migrations (`202611200001`–`202611250001`) are applied and all 21 Edge Functions + secrets (`FIREBASE_PROJECT_ID`, `ADMIN_BOOTSTRAP_SECRET`, `CRON_SECRET`, `CUSTOMER_PORTAL_URL`) are deployed.
2. Run `npm run admin:bootstrap` once with the verified Firebase Admin UID (`Yr0Wr7PuuAdOIMaqohmqaINNbNC2`).
3. Configure real shop INR pricing rules, upload UPI QR / confirm VPA, enroll the counter Windows PC (`agent-enroll`), and install the `.NET 8` Print Agent via Inno Setup.
4. Execute one end-to-end physical counter dry run, sign off the 5-item Pilot Checklist, and switch `pilot_stage` to `production`.
