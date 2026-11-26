# Phase 19 — Walk-In Counter POS, 300-DPI Passport/ID Photo Studio & Printer Maintenance Logbook

Single-shop counter upgrade for **AMAN COMPUTER (AC Scan2Print)** built strictly for local counter & customer print operations (zero WhatsApp/SMS push notifications, zero cloud backup, zero multi-branch governance).

## 1. End-to-End Workflows

1. **Direct Counter Walk-In POS (`#/print-management/walkin-pos`)**:
   - Counter operator can build multi-line bills for USB drive / photocopy / lamination / binding walk-ins without forcing a QR scan.
   - Supports integer-paise calculation across `document_print` (A4/Legal/A3, B&W/Colour, Single/Duplex, `1/2/4-in-1` N-Up, Finishing Add-Ons), `photo_sheet`, and `service_addon`.
   - Settles via **Counter Cash**, **UPI QR**, or **Regular Client Khata**, atomically:
     - Deducting paper, toner/ink yield, and spiral/lamination stock from `shop_inventory_items`
     - Posting Khata debits with server-side `422` credit-limit guard
     - Incrementing printer page-life counters
     - Generating Token (`W-XXXX`) + printable 80mm thermal slip & formula-safe CSV ledger (`/api/pos/orders/export`).
2. **300-DPI Passport & ID Card Photo Sheet Studio (`/quick-print/photo-sheet` & Admin Photo Studio)**:
   - Supports **4×6 Glossy (8 Passport 35×45 mm)**, **A4 (24 Passport 35×45 mm)**, **A4 Stamp (35 Mini 30×35 mm)**, and **A4 ID Card Front + Back (CR80 85.6×54 mm)**.
   - Live browser HTML5 Canvas draws exact 300-DPI sheets with optional scissors cut-guides, 1-click **Download 300-DPI PNG**, and 1-click **Send Sheet to Print Queue** (`/quick-print/photo-sheet` -> `/quick-print/options`).
3. **Printer Drum, Fuser & Printhead Maintenance Logbook**:
   - Tracks lifetime pages and `pages_since_service` against maintenance intervals across HP M507dn, Epson L8050, Canon LBP226dw, and Epson TM-T82III with `healthy`, `service_due`, and `overdue` statuses and counter reset logging (`POST /api/pos/maintenance/log`).

## 2. Database, Auth & Verification Commands

- **Migration**: `supabase/migrations/202611260002_scan2print_phase19_pos_photo_maintenance.sql` (`print_walkin_orders`, `print_printer_maintenance`, `print_maintenance_logs`, forced RLS).
- **Commands**:
  - `npm run pos:audit`
  - `npm run test:phase19`
  - `npm run test:qa`
