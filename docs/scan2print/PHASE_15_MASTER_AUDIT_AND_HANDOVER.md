# AC Scan2Print — Phase 15: Master Production Audit & Final Operational Handover

> **Document Type:** Production Acceptance, System Audit & Final Maintenance Handover  
> **Platform:** AC Scan2Print (AMAN COMPUTER)  
> **Status:** 100% CODE VERIFIED · READY FOR FINAL OPERATOR CUTOVER  
> **Target Date:** November 25, 2026

---

## 1. Executive Summary & Verification Scorecard

AC Scan2Print has completed all 15 roadmap phases of engineering, security hardening, dual-surface UI design, Windows agent interop, and live cloud cutover readiness.

```text
========================================================================================
AC SCAN2PRINT — 8-LAYER PRODUCTION SCORECARD: 100% HEALTH (8/8 LAYERS VERIFIED)
========================================================================================
Layer 1: PostgreSQL Database & Migrations      [PASS]  7/7 migrations, 13 RLS tables
Layer 2: Supabase Edge Functions Gateway       [PASS]  21/21 functions (verify_jwt=false)
Layer 3: Private Cloud Storage & Policies      [PASS]  3/3 private buckets (120s signed URLs)
Layer 4: Dual Frontend & Unified Hosting       [PASS]  Unified / & /quick-print dist mounted
Layer 5: Windows 11 Print Agent (Session-0)    [PASS]  LocalMachine DPAPI + Win32 Spooler
Layer 6: Security Governance & Single Admin    [PASS]  Singleton guard + zero plain secrets
Layer 7: Financial Accounting & Reconciliation [PASS]  Integer paise + formula-safe CSVs
Layer 8: Operational Resilience & Rollback     [PASS]  Emergency intake pause + retention purge
========================================================================================
```

---

## 2. Master Operational Verification Commands

The following command suite provides full operational verification from the operator terminal:

```bash
# 1. Build unified Firebase Hosting bundle (Admin / + Customer /quick-print):
npm run build:hosting

# 2. Preflight verification of migrations, Edge functions, and live Supabase schema:
npm run cloud:preflight

# 3. Post-deploy live smoke suite (hosting split, CORS, 401 security gates):
npm run cloud:smoke

# 4. Safe document retention cleanup dry run (zero deletions):
npm run cloud:cleanup

# 5. Full 8-layer master architecture audit:
npm run master:audit

# 6. Complete test gate across all 15 phases:
npm run test:qa
```

---

## 3. Physical Counter PC Handover & Go-Live Checklist

On-site shop owner actions for opening day counter cutover:

1. **Hardware Inspection:**
   - Power on the Windows 11 x64 Counter PC.
   - Connect primary printer via USB or local LAN.
   - Ensure paper tray has clean 75/80 GSM A4 paper and toner/ink levels are adequate.
2. **Agent Installation:**
   - Run `publish-release.ps1` and `install-agent.ps1` as Administrator.
   - Open AC Scan2Print System Tray and paste the one-time `dev_...` credential generated from the Admin Control Center (**Devices & Printers → Enroll Shop PC**).
   - Run `health-check.ps1` and verify all 7 checks pass (`PASS`).
3. **Supervised 10-Job Pilot:**
   - Run the 10-case dry run protocol (Single-page B&W, Duplex A4 Long-Edge, Colour photo, Cash flow, UPI UTR verification, Emergency Pause toggle).
4. **Permanent Counter Poster Placement:**
   - Print the vector standee poster from **Admin → Pilot & Go-Live → Counter QR Poster** and display it prominently at the customer intake counter.
5. **Stage Transition:**
   - Sign off the 5 checklist items in **Admin → Pilot & Go-Live** and transition stage from **Dry Run** to **Supervised Pilot** to **Production Go-Live**.

---

## 4. Disaster Recovery & Emergency Contacts

- **Printer Jam / Offline:** The Agent automatically reports `needs_review`. The Admin can clear the jam, power cycle the printer, and click **Retry Print Job** without requiring the customer to re-upload.
- **Counter Queue Surge:** Click **Pause Customer Intake Now** in **Pilot & Go-Live**. New uploads return `HTTP 503` with a custom message while customer live tracking of in-flight jobs remains operational.
- **Service Restart:** Run `Restart-Service ACScan2PrintAgent` in elevated PowerShell. DPAPI credentials in `%ProgramData%\ACScan2Print\Security` are preserved across restarts and updates.
