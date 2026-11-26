# Phase 20 — Exam Form Photo/Signature KB Resizer, Paper Wastage Analytics & Daily Counter Shift Handoff Checklist

Strictly single-shop **AMAN COMPUTER (AC Scan2Print)** operational upgrade for Indian cyber-desk exam form prep, paper spoilage accountability, and daily shift handoffs (zero WhatsApp/SMS notifications, zero cloud backup, zero multi-branch governance).

## 1. End-to-End Workflows

1. **Offline Exam Form Photo, Signature & Scan-Clean Studio (`/quick-print/exam-prep` & `#/print-management/shop-tools`)**:
   - Built-in portal presets:
     - **SSC CGL / CHSL Photo**: `413×531 px`, `20–50 KB` JPEG
     - **SSC / RRB Signature Strip**: `472×236 px`, `10–20 KB` JPEG (auto-enables B&W shadow cleanup)
     - **UPSC CSE / NDA Portrait**: `550×700 px`, `20–300 KB` JPEG
     - **BPSC / Railway Photo**: `320×400 px`, `20–50 KB` JPEG
     - **PAN / Aadhaar Clean A4 Scan**: `1240×1754 px`, `40–200 KB` JPEG (high-contrast white floor filter)
   - Runs 100% locally via HTML5 Canvas with binary-search JPEG quality tuning, 1-click **Download Ready JPEG**, and 1-click **Send to Print Queue** (`/quick-print/exam-prep` -> `/quick-print/options`).
2. **Paper Wastage & Reprint Root-Cause Logbook (`POST /api/shop-tools/wastage`)**:
   - Captures spoiled sheet count, station (`HP M507dn`, `Epson L8050`, `Canon LBP226dw`), paper SKU (`A4 75 GSM`, `Legal 80 GSM`, `4×6 Glossy Photo`), root-cause category (`paper_jam`, `ink_streak`, `wrong_settings`, `toner_faint`, `customer_reprint`), job reference, and integer-paise cost impact.
   - Atomically deducts spoiled sheets from Phase 18 `shop_inventory_items` (`inventory_movements`) and increments Phase 19 `printer_maintenance_counters`.
   - Provides formula-safe CSV download (`GET /api/shop-tools/wastage/export`) sanitized against spreadsheet injection.
3. **Opening & Closing Counter Shift Handoff Checklist (`POST /api/shop-tools/checklist/toggle`, `POST /api/shop-tools/checklist/signoff`)**:
   - Enforces fail-closed `422` guard until all mandatory opening/closing readiness checks are verified, logs petty-cash float sign-offs, and supports 1-click reset for the next operating day.

## 2. Database, Auth & Verification Commands

- **Migration**: `supabase/migrations/202611260003_scan2print_phase20_exam_wastage_shift.sql` (`print_wastage_logs`, `print_shift_checklists`, forced RLS).
- **Commands**:
  - `npm run tools:audit`
  - `npm run test:phase20`
  - `npm run test:qa`
