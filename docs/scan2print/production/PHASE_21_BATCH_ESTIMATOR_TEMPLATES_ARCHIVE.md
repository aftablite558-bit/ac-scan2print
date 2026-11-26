# Phase 21 — Bulk Coaching Batch Estimator, Saved Shop Templates & Unified Single-Shop Print History Archive

Strictly single-shop **AMAN COMPUTER (AC Scan2Print)** operational upgrade for student notes batches, institutional volume slab pricing, repeat counter packet templates, and unified history search (zero WhatsApp/SMS notifications, zero cloud backup, zero multi-branch governance).

## 1. End-to-End Workflows

1. **Bulk Coaching Batch Estimator (`#/print-management/batch-archive` & `/quick-print/batch-pack`)**:
   - Multi-document booklet lines with configurable paper size (A4/A3/Legal), color mode (B&W/Colour), sides (Single/Duplex), N-Up (1/2/4-in-1), and finishing add-ons (Corner Stapling, Spiral Binding, Thermal Lamination, Project Cover Binding).
   - Automatic volume slab pricing tiers:
     - **Standard Rate**: `< 100` physical sheets (`0%` discount)
     - **Student Notes Slab**: `100+` physical sheets (`10%` discount)
     - **Coaching Batch Slab**: `300+` physical sheets (`18%` discount)
     - **Institutional Bulk Slab**: `1000+` physical sheets (`25%` discount)
   - Real-time GST calculation (18% inclusive breakdown: Taxable + CGST 9% + SGST 9%).
   - Commits batch job cards (`B-1001`) with atomic paper/spiral inventory auto-deduction, client Khata debit (with credit-limit guard), and printer page counter accumulation.

2. **Saved Shop Job Templates (`GET /api/batch-archive/public-presets`, `POST /api/batch-archive/templates`)**:
   - Pre-seeded system presets:
     - **Coaching Handwritten Notes**: 2-in-1 duplex A4 with spiral binding (80p + 16p practice sheet)
     - **Aadhaar + PAN + Voter ID Combo**: Colour A4 single with 125-micron waterproof lamination
     - **Govt Exam Admit Card + Undertaking**: B&W single with corner staple
     - **College Project Practical Cover Bind**: Colour cover + duplex body with card spine tape
   - 1-click loading into the batch estimator; ability for operators to save custom shop combos with protected system templates.

3. **Unified Single-Shop Print History Search Archive (`/api/batch-archive/state`, `/api/batch-archive/archive/export`)**:
   - Centralized search index combining:
     - Direct Walk-In POS receipts (`W-XXXX`)
     - Bulk Coaching Batches (`B-XXXX`)
     - Paper Wastage & Reprint Logs (`WS-XXXX`)
   - Real-time filtering by search query, record source, payment method (Cash, UPI, Khata, Internal Wastage), and date range.
   - Formula-safe CSV export protecting against spreadsheet formula injection (`=`, `+`, `-`, `@`).

## 2. Database, Auth & Verification Commands

- **Migration**: `supabase/migrations/202611260004_scan2print_phase21_batch_templates_archive.sql` (`print_job_templates`, `print_bulk_batches`, forced RLS).
- **Commands**:
  - `npm run batch:audit`
  - `npm run test:phase21`
  - `npm run test:qa`
