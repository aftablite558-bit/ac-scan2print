# AC Scan2Print — Printer Capability & Compatibility Matrix

**Document Type:** Hardware Compatibility Matrix & Driver Telemetry Specification  
**Inspection Date:** November 24, 2026  
**Auditor:** Senior Windows Printing Engineer & Systems Architect  
**Status:** Software Constraints SOURCE VERIFIED · **Hardware Cells Awaiting User Audit (NEEDS USER INPUT)**  

---

## 1. Executive Summary

This matrix bridges the software capabilities of AC Scan2Print with the physical printers deployed at the Aman Computer counter.

**Software Invariant (Zero-Assumption Architecture):**
The database schema (`public.print_printers`) and Customer Portal strictly enforce a **tri-state capability model**:
- If `supports_colour = NULL` or `FALSE`, the customer portal hides or disables colour selection.
- If `supports_duplex = NULL` or `FALSE`, the customer portal hides or disables duplex selection.
- If `supported_paper_sizes` is empty or unverified, the portal restricts options strictly to `'A4'`.
- Software will **never fabricate** capabilities that have not been physically verified on the shop printer.

---

## 2. Printer Compatibility Matrix (Counter Hardware)

The table below maps candidate printer profiles against the AC Scan2Print software requirements. The actual shop printer row will be finalized once the user runs the PowerShell discovery script.

| Hardware Feature / Profile | Software Baseline Requirement | Primary Shop Counter Printer (Model Pending) | Secondary / Backup Printer (If Applicable) | Status |
| :--- | :--- | :---: | :---: | :---: |
| **Manufacturer & Model** | Known hardware identifier | `NEEDS USER INPUT` | `NEEDS USER INPUT` | PENDING |
| **Windows Driver Type** | Type 3 (V3) or Type 4 (V4) | `NEEDS USER INPUT` | `NEEDS USER INPUT` | PENDING |
| **Print Technology** | Laser (Monochrome/Colour) or InkTank | `NEEDS USER INPUT` | `NEEDS USER INPUT` | PENDING |
| **Primary Connection** | USB 2.0 / LAN / Wi-Fi | `NEEDS USER INPUT` | `NEEDS USER INPUT` | PENDING |
| **A4 Paper (210 × 297 mm)** | Mandatory for MVP | `NEEDS USER INPUT` | `NEEDS USER INPUT` | PENDING |
| **Legal Paper (216 × 356 mm)**| Optional (Configurable) | `NEEDS USER INPUT` | `NEEDS USER INPUT` | PENDING |
| **A3 Paper (297 × 420 mm)** | Optional (Large Format) | `NEEDS USER INPUT` | `NEEDS USER INPUT` | PENDING |
| **Colour Printing** | True colour or Grayscale only | `NEEDS USER INPUT` | `NEEDS USER INPUT` | PENDING |
| **Duplex Printing Method** | Auto-Duplex / Manual Flip / None | `NEEDS USER INPUT` | `NEEDS USER INPUT` | PENDING |
| **Duplex Flip Edge** | Long-Edge (Book) / Short-Edge (Tablet)| `NEEDS USER INPUT` | `NEEDS USER INPUT` | PENDING |
| **Spooler Job ID Capture** | Reliable win32 `JobId` return | `NEEDS LIVE VERIFICATION` | `NEEDS LIVE VERIFICATION` | PENDING |
| **Paper-Out Detection** | Spooler status `JOB_STATUS_PAPEROUT` | `NEEDS LIVE VERIFICATION` | `NEEDS LIVE VERIFICATION` | PENDING |
| **Printer Offline Detection**| Spooler status `PRINTER_STATUS_OFFLINE`| `NEEDS LIVE VERIFICATION` | `NEEDS LIVE VERIFICATION` | PENDING |
| **Print Speed (PPM)** | Pages per minute baseline | `NEEDS USER INPUT` | `NEEDS USER INPUT` | PENDING |

---

## 3. Software Constraints vs. Hardware Capability Mapping

| User-Selected Print Option | Database Column / Logic | Software Guard Rule | Hardware Failure Mode if Unverified |
| :--- | :--- | :--- | :--- |
| **Colour (Colour Mode)** | `print_jobs.requested_print_mode = 'colour'` | Permitted only if `supports_colour = TRUE` in `print_printers`. | If printer is monochrome, driver forces halftoning, wasting expensive colour billing. |
| **Double-Sided (Duplex)**| `print_jobs.sides = 'duplex'` | Permitted only if `supports_duplex = TRUE` in `print_printers`. | If printer lacks auto-duplex, job hangs waiting for manual user paper flip at counter. |
| **Legal Paper Size** | `print_jobs.paper_size = 'Legal'` | Permitted only if `'Legal' = ANY(supported_paper_sizes)`. | If Legal paper is not in tray, printer halts with "Paper Mismatch" error on LED panel. |
| **Copies Count** | `print_jobs.copies` (1–20) | Enforced via system limits and server pricing calculation. | High copy counts on low-memory printers may exhaust printer onboard RAM. |

---

## 4. Driver Handling & Telemetry Fallback Protocol

Windows printer drivers vary widely in how much status telemetry they report back to the Windows Spooler:

1. **High-Telemetry Drivers (Full Bidirectional Support):**
   - Driver reports: `PRINTER_STATUS_PAPER_JAM`, `PRINTER_STATUS_PAPER_OUT`, `JOB_STATUS_PRINTING`, `JOB_STATUS_PRINTED`.
   - Software Action: Windows Print Agent captures exact spooler event and reports lifecycle progress to `agent-report-job-event`.
2. **Low-Telemetry / Generic Drivers (Unidirectional Support):**
   - Driver reports `JOB_STATUS_DELETING` or clears job from spooler queue immediately upon buffer ingestion, before paper actually exits the rollers.
   - Software Action: Windows Print Agent captures `submitted_to_spooler`. In accordance with Roadmap §9 and §22, the system **never assumes paper output**. The final handover must be confirmed by the counter operator.
3. **Manual Duplex Warning:**
   - If the counter printer only supports manual duplex (driver prompts operator on PC screen to reinsert paper upside down), `supports_duplex` must be set to `FALSE` in `print_printers`. Automated background services running under Windows Service context cannot interact with desktop GUI prompts. Only **hardware auto-duplex** is eligible for unattended agent execution.

---

## 5. Risks & Operational Recommendations
- **Risk:** Setting `supports_duplex = TRUE` on a manual-duplex printer will stall print queues indefinitely.
- **Action:** Inspect physical printer model to verify presence of an internal duplex unit (e.g., look for "d" in model suffix: HP LaserJet M126nw = simplex; HP LaserJet Pro M227fdw = auto-duplex).
