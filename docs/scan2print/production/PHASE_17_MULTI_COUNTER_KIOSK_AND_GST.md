# AC Scan2Print — Phase 17: Multi-Counter Load Balancing, Self-Service Kiosk Mode & Monthly GST/P&L Analytics

> **Document Type:** Fleet Expansion Architecture, Kiosk SOP & Indian GST Tax Accounting  
> **Platform:** AC Scan2Print (AMAN COMPUTER)  
> **Status:** 100% VERIFIED · MULTI-COUNTER FLEET, KIOSK TERMINAL & GST LEDGER ACTIVE  
> **Target Date:** November 25, 2026

---

## 1. Multi-Counter Fleet Load Balancing

AC Scan2Print Phase 17 introduces dynamic, capability-aware print routing across multiple counter stations:

| Station ID | Counter Location | Printer Model | Capabilities | Routing Algorithm |
| :--- | :--- | :--- | :--- | :--- |
| `station-1-main-bw` | Counter Front (Station A) | HP LaserJet Enterprise M507dn | A4 / Legal · B&W · Duplex (45 ppm) | Least-Busy / High-Page Duplex |
| `station-2-colour-photo` | Counter Graphic Bay (Station B) | Epson EcoTank L8050 Photo | A4 / 4x6 / 5x7 · Colour Ink Tank | Capability Affinity (Colour) |
| `station-3-kiosk-express` | Customer Walk-in Kiosk 1 | Canon imageCLASS LBP226dw | A4 · B&W · Duplex (38 ppm) | Express Kiosk (≤10 Pages) |
| `station-4-thermal-slip` | Intake Token Desk | TVS RP-3200 Plus 80mm | 80mm ESC/POS Roll | Receipt & Token Printing Only |

### Deterministic Routing Priorities
1. **Express Kiosk Lane (`kiosk_express`)**: Jobs flagged for self-service kiosk pickup with `<= 10` B&W pages route to `station-3-kiosk-express` when its active queue is `<= 2`.
2. **Capability Affinity (`capability_affinity`)**: Colour jobs and specialized media (`Photo_4x6`, `Photo_5x7`) strictly target `station-2-colour-photo`.
3. **Least-Busy Balancing (`least_busy`)**: Remaining jobs distribute to the online, capable station with the smallest active spooler queue.

---

## 2. Unattended Self-Service Kiosk Mode (`/quick-print/kiosk`)

- **Touch-Optimized 4-Digit PIN Release**: Customers enter the 4-digit pickup PIN displayed on their mobile tracking screen (`Track`) or thermal token slip using 56px+ touch keypad controls.
- **Privacy Auto-Reset**: An automatic 60-second inactivity countdown clears entered PINs and pickup receipts before the next customer approaches the kiosk monitor.
- **Live Fleet Visibility**: Displays live station queue counts at the bottom of the kiosk screen.

---

## 3. 80mm Thermal Counter Receipt Slip (ESC/POS)

The counter thermal slip formatter (`formatThermalReceiptSlip`) produces standardized 40-column ESC/POS receipts containing:
- Trade Name (`AMAN COMPUTER SCAN2PRINT`) & Bihar GSTIN (`10AAAAA0000A1Z5`)
- Token Number (`T-XXXX`) & 4-digit Kiosk Pickup PIN
- Paper Size, Colour/B&W mode, Duplex sheet calculation (`ceil(pages/2)`)
- Inclusive 18% GST Tax Split (9% CGST + 9% SGST under SAC/HSN `9989`)
- Payment Method & 12-digit Bank UTR verification reference

---

## 4. Monthly GST (HSN 9989) & Operating P&L Analytics

- **Integer Paise Precision**: Prevents floating-point rounding drift when computing taxable turnover (`Gross / 1.18`), 9% CGST, and 9% SGST.
- **Operating Margin Tracking**: Deducts paper stock (`₹0.45 / sheet`) and ink/toner consumables (`₹0.35 / page`) to compute Net Operating Profit and Operating Margin %.
- **Formula-Safe CSV Export**: `/api/gst/export?month=YYYY-MM` exports sanitized GSTR-1 / P&L summaries guarding all cells against formula injection (`=`, `+`, `-`, `@`, `\t`, `\r`).

---

## 5. Verification Commands

```bash
# 1. Verify multi-counter routing, ESC/POS slip & monthly GST calculations
npm run fleet:audit

# 2. Run Phase 17 test suite
npm run test:phase17

# 3. Verify Admin & Customer Portal builds and types
npm run lint:customer && npm run build:hosting
```
