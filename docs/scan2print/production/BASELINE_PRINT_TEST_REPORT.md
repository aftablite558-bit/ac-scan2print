# AC Scan2Print — Baseline Print Test Report & Practical Test Protocol

**Document Type:** Baseline Physical Print Verification Protocol & Test Plan  
**Inspection Date:** November 24, 2026  
**Auditor:** Senior Windows Printing Engineer & Principal QA Engineer  
**Execution Status:** Test Protocol Defined · **Physical Execution Awaiting Counter Hardware (NOT VERIFIED)**  

---

## 1. Executive Summary

In compliance with Phase 0 Discovery & Hardware Audit mandates (Roadmap §13 Phase 0, Remaining Work Roadmap §2.3), physical printing must be proven on the shop's actual Windows 11 PC and counter printer before connected production printing is enabled.

**Audit Rule Adherence:**
- Software logic and mathematical billing algorithms are verified locally via automated test suites (`npm run test:phase0`, `npm run test:phase4`).
- Actual physical paper output, mechanical paper feeding, toner fusing, and driver spooling **cannot be simulated** in software.
- In accordance with audit safety rules, **zero physical test results are fabricated**. All physical test cases are formally logged as `NOT VERIFIED (AWAITING PHYSICAL HARDWARE TEST)`.

---

## 2. Source Code Verification vs. Physical Hardware Verification

| Test Scope Layer | Verification Method | Execution Environment | Status | Evidence |
| :--- | :--- | :--- | :---: | :--- |
| **Document Magic Byte Check** | Automated Unit Tests | Node.js Test Runner | SOURCE VERIFIED | `tests/phase3/phase3_customer_portal.test.ts` |
| **Duplex Sheet Calculation** | Unit Math Verification | Node.js Test Runner | SOURCE VERIFIED | `tests/phase4/phase4_print_management.test.ts` (`ceil(p/2)`) |
| **Server Price Calculation** | Integration Tests | Node.js Test Runner | SOURCE VERIFIED | `calculateEstimatedPrice` in `handlers.ts` |
| **Spooler Job Dispatch** | Win32 API Call | Windows 11 Counter PC | NOT VERIFIED | Requires Phase 5 Windows Agent on shop PC |
| **Physical Paper Feeder** | Mechanical Roller Action | Physical Counter Printer | NOT VERIFIED | Requires shop counter printer |
| **Toner / Ink Output** | Fused Print Output | Physical Sheet in Tray | NOT VERIFIED | Requires visual inspection by operator |

---

## 3. Practical 14-Case Physical Print Test Matrix

This protocol outlines the 14 required test cases to be executed from the Windows 11 counter PC once connected to the shop printer:

| Case # | Test Scenario | Test Artifact / Input | Expected Physical Output | Verification Criteria | Execution Status |
| :-: | :--- | :--- | :--- | :--- | :---: |
| **TC-01** | Single-Page PDF | Standard A4 text/invoice PDF (1 page) | Exactly 1 physical A4 sheet | Crisp text, 0.25" margins intact, no scaling distortion | `NOT VERIFIED` |
| **TC-02** | Multi-Page PDF | 5-page mixed text & table document | Exactly 5 physical A4 sheets (simplex) | Correct page order (1 to 5), no dropped pages | `NOT VERIFIED` |
| **TC-03** | High-Res JPG Image | 300 DPI photo/scan (JPG format) | Centered image fit to A4 printable area | Aspect ratio preserved (no stretching), clean gradients | `NOT VERIFIED` |
| **TC-04** | PNG Image with Alpha | Document scan with transparent background | Clean rendering on white paper stock | Alpha rendered cleanly without black background artifact | `NOT VERIFIED` |
| **TC-05** | A4 Portrait Document | Standard vertical orientation document | Vertical feed matching paper orientation | Header at top, footer at bottom, correct rotation | `NOT VERIFIED` |
| **TC-06** | A4 Landscape Document| Wide horizontal spreadsheet / certificate | Rotated 90° to fit A4 paper horizontally | No clipping on left/right edges, orientation auto-detected | `NOT VERIFIED` |
| **TC-07** | Pure B&W Printing | Monochrome text document (Grayscale mode) | Printed using black toner/ink only | Zero colour toner consumption; sharp black text | `NOT VERIFIED` |
| **TC-08** | Full Colour Printing | Colour certificate or photo (Colour mode) | Accurate CMYK/RGB colour reproduction | Only if printer supports colour; clean saturation | `NOT VERIFIED` |
| **TC-09** | Single-Sided (Simplex) | 4-page PDF with simplex setting | 4 individual physical sheets printed on front only | Back of all 4 sheets completely blank | `NOT VERIFIED` |
| **TC-10** | Double-Sided (Duplex) | 3-page PDF with duplex setting | Exactly 2 physical sheets printed on both sides | Sheet 1: p1-2; Sheet 2: p3 (back blank); Long-edge flip | `NOT VERIFIED` |
| **TC-11** | Multiple Copies | 2-page document with `copies = 3` | Exactly 6 physical sheets (or 3 duplex sheets) | Collation verified (Set 1: p1-2, Set 2: p1-2, Set 3: p1-2) | `NOT VERIFIED` |
| **TC-12** | Printer Offline Scenario | Disconnect USB cable / power off printer | Job pauses safely in spooler; no data loss | Agent logs `PRINTER_OFFLINE`; resumes when reconnected | `NOT VERIFIED` |
| **TC-13** | Paper-Out Scenario | Empty paper tray before dispatching job | Printer halts with LED alert; job held in spooler | Agent reports error; completes cleanly after paper reload | `NOT VERIFIED` |
| **TC-14** | Paper Mismatch Error | Send Legal job to A4-only tray | Printer halts with tray size error on LCD/LED | Spooler holds job; cancels safely without paper waste | `NOT VERIFIED` |

---

## 4. Step-by-Step Execution Protocol for Shop Operator

When on-site at the Aman Computer counter:

1. **Prerequisite Check:**
   - Confirm printer is loaded with standard A4 paper (75/80 GSM).
   - Ensure USB or LAN cable is firmly connected.
   - Confirm printer status is "Ready" with a solid green status LED.
2. **Execution Steps (Manual Baseline):**
   - Print a Windows Test Page (`Settings -> Bluetooth & devices -> Printers & scanners -> [Printer Name] -> Print test page`).
   - Open a sample 1-page PDF in Edge or Adobe Acrobat and print to counter printer. Record print duration.
   - Open a sample landscape document and verify orientation.
   - If printer has an auto-duplex unit, print a 3-page test file with duplex enabled. Verify Sheet 1 has p1 & p2, Sheet 2 has p3, and flip is Long-Edge.
3. **Observation Checklist:**
   - Margins: Verify text is not clipped along top, bottom, or side margins.
   - Orientation: Confirm portrait documents print vertically and landscape documents rotate automatically.
   - Duplex Alignment: Confirm reverse side is right-side up when turned like a book (Long-Edge Binding).
   - Paper Jam Recovery: Confirm printer does not duplicate pages after a cleared jam.

---

## 5. Physical Print Evidence Ledger (To Be Populated On-Site)

| Test ID | Execution Date | Operator Name | Actual Sheet Count | Print Time (s) | Pass / Fail | Defect / Note |
| :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| TC-01 | `PENDING` | `NEEDS INPUT` | `PENDING` | `PENDING` | `NOT VERIFIED` | Awaiting shop execution |
| TC-02 | `PENDING` | `NEEDS INPUT` | `PENDING` | `PENDING` | `NOT VERIFIED` | Awaiting shop execution |
| TC-03 | `PENDING` | `NEEDS INPUT` | `PENDING` | `PENDING` | `NOT VERIFIED` | Awaiting shop execution |
| TC-04 | `PENDING` | `NEEDS INPUT` | `PENDING` | `PENDING` | `NOT VERIFIED` | Awaiting shop execution |
| TC-05 | `PENDING` | `NEEDS INPUT` | `PENDING` | `PENDING` | `NOT VERIFIED` | Awaiting shop execution |
| TC-06 | `PENDING` | `NEEDS INPUT` | `PENDING` | `PENDING` | `NOT VERIFIED` | Awaiting shop execution |
| TC-07 | `PENDING` | `NEEDS INPUT` | `PENDING` | `PENDING` | `NOT VERIFIED` | Awaiting shop execution |
| TC-08 | `PENDING` | `NEEDS INPUT` | `PENDING` | `PENDING` | `NOT VERIFIED` | Awaiting shop execution |
| TC-09 | `PENDING` | `NEEDS INPUT` | `PENDING` | `PENDING` | `NOT VERIFIED` | Awaiting shop execution |
| TC-10 | `PENDING` | `NEEDS INPUT` | `PENDING` | `PENDING` | `NOT VERIFIED` | Awaiting shop execution |
| TC-11 | `PENDING` | `NEEDS INPUT` | `PENDING` | `PENDING` | `NOT VERIFIED` | Awaiting shop execution |
| TC-12 | `PENDING` | `NEEDS INPUT` | `PENDING` | `PENDING` | `NOT VERIFIED` | Awaiting shop execution |
| TC-13 | `PENDING` | `NEEDS INPUT` | `PENDING` | `PENDING` | `NOT VERIFIED` | Awaiting shop execution |
| TC-14 | `PENDING` | `NEEDS INPUT` | `PENDING` | `PENDING` | `NOT VERIFIED` | Awaiting shop execution |

---

## 6. Risks & Next Steps
- **Immediate Next Step:** Provide the PowerShell hardware discovery output and execute manual test prints on the counter PC.
- **Phase Exit Gate:** Phase 0 physical sign-off will be marked complete once TC-01 through TC-14 pass on the real counter printer.
