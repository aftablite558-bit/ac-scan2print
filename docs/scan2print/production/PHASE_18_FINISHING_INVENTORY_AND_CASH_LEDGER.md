# Phase 18 — Finishing Add-Ons, N-Up Paper Saver, Paper/Toner Stock, Shift Cash Tally & Client Khata

Single-shop counter efficiency upgrade for **AMAN COMPUTER (AC Scan2Print)** built strictly around in-shop workflows (zero multi-branch governance, zero customer SMS/WhatsApp push, zero external cloud backup).

## 1. End-to-End Customer & Counter Workflows

1. **N-Up Paper-Saver Layout & Finishing Add-Ons (`/quick-print/options`)**:
   - Customers select `1-in-1 Normal`, `2-in-1 Half Notes`, or `4-in-1 Compact` impressions per sheet with live sheets-saved calculation.
   - Finishing add-ons (`Standard Print Only`, `Corner / Set Stapling +₹5`, `Spiral Binding + Covers +₹30`, `A4 Thermal Lamination +₹20`, `Project Cover & Tape Bind +₹45`) add integer-paise per-copy surcharges cleanly into `calculateEstimateBreakdown`, confirmation summaries, and 80mm thermal counter slips (`formatThermalReceiptSlip`).
2. **Consumables & Finishing Supplies Tracker (`#/print-management/counter-ops`)**:
   - Tracks A4 75 GSM, Legal 80 GSM, Glossy 4x6 photo stock, HP 89A black toner yield, Epson 057 colour ink yield, spiral coils, thermal lamination pouches, and heavy covers.
   - Supports atomic transactional print-job deductions (`POST /api/counter/inventory/deduct-job`), quick ream/pack refills (`POST /api/counter/inventory/restock`), low-stock thresholds, and immutable audit movement history.
3. **Shift Cash Drawer Denomination Tally (`Shift Cash Drawer`)**:
   - Reconciles `Opening Float + Cash Sales - Paid Out Expenses` against physical Indian currency notes (`₹500`, `₹200`, `₹100`, `₹50`, `₹20`, `₹10`, coins), computes variance (`BALANCED` / `EXCESS` / `SHORTAGE`), generates printable 80mm Shift Z-Reports, and exports formula-safe CSV reports (`/api/counter/cash-tally/export`).
4. **Regular Coaching / Student / Office Khata Credit Ledger (`Client Khata Ledger`)**:
   - Maintains single-shop regular accounts (e.g., coaching institutes & regular offices) with enforced credit-limit checks, atomic print-debit & cash/UPI credit settlements (`POST /api/counter/khata/transactions`), and OWASP formula-safe CSV statements (`/api/counter/khata/export`).

## 2. Database, Security & Verification

- **Supabase PostgreSQL Migration**: `supabase/migrations/202611260001_scan2print_phase18_counter_ops.sql` adds `pages_per_sheet`, `finishing_service`, `finishing_charge_paise` to `print_jobs` and creates forced-RLS `print_inventory_items`, `print_inventory_movements`, `print_shift_cash_closes`, `print_khata_accounts`, and `print_khata_transactions`.
- **Fail-Closed Auth**: `/api/counter/catalog` and `/api/counter/quote` remain public calculator endpoints; `/api/counter/state`, mutations, and CSV exports require either a verified `aman_session` cookie or a verified Firebase Super Admin RS256 Bearer token (`401 UNAUTHORIZED` otherwise).
- **Commands**:
  - `npm run counter:audit`
  - `npm run test:phase18`
  - `npm run test:qa`
