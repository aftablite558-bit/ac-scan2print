# AMAN COMPUTER — Smart QR Print System
## Phase 0 Acceptance Checklist

**Phase:** Phase 0 — Discovery & Hardware Audit  
**Date:** 20 November 2026  
**Legend:**
- **Verified** — Directly inspected and confirmed in the current repository (`2026-11-18T12:04:38.014381Z`).
- **Not Verified** — Cannot be confirmed from the repository alone; requires physical hardware/environment inspection or live service testing.
- **Blocked** — Depends on missing external system, credential, or hardware that does not yet exist.
- **Requires Owner Confirmation** — Policy, business, brand, or hardware decision that must be confirmed by the project owner.

---

### A. Repository & Existing Codebase Discovery

| ID | Acceptance Requirement | Status | Evidence / Notes |
| :-: | :--- | :---: | :--- |
| P0-01 | Inspect complete project directory structure, `package.json`, `tsconfig.json`, and `vite.config.ts` | **Verified** | React 19 + TypeScript 7 + Vite 8 + Tailwind v4 SPA (`src/` only). `express` & `@google/genai` listed in `package.json` but unused. |
| P0-02 | Verify existing TypeScript check, unit tests, and production build health | **Verified** | `npx tsx --test src/utils/adminLogic.test.ts` (4/4 pass), `npx tsc --noEmit` (0 errors), `npm run build` (`dist/` built cleanly). |
| P0-03 | Inspect existing Admin Dashboard pages, routes, shell, and reusable components | **Verified** | `#/home` (`OverviewPage`), `#/settings/*` (`SettingsPage`), `#/help` (`HelpPage`); `Shell.tsx`, `Overlays.tsx`, `AnimatedControls.tsx`, `Charts.tsx`. |
| P0-04 | Inspect existing CSS design tokens, themes, fonts, and wallpapers | **Verified** | `src/index.css` Light/Dark tokens (`--bg`, `--glass`, `--accent`, `--good`/`--warn`/`--bad`/`--info`), `Urbanist` font (`index.html`), 3 wallpapers in `public/photos/wallpapers/`. |
| P0-05 | Identify exact Aman Computer logo assets | **Requires Owner Confirmation** | **Verified finding:** No SVG/PNG logo file exists in `/public` or `/src`; `Shell.tsx` uses accent `"A"` monogram tile + `"AMAN COMPUTER"` text. Owner must confirm if this is the official logo or provide vector/raster asset. |
| P0-06 | Inspect existing customer-facing website routes (`/quick-print*`) | **Verified (Absent)** | No customer-facing pages or `/quick-print*` routes exist in the repository. |

---

### B. Authentication, RBAC & Supabase Audit

| ID | Acceptance Requirement | Status | Evidence / Notes |
| :-: | :--- | :---: | :--- |
| P0-07 | Inspect existing authentication system and protected route guards | **Verified (Absent)** | No authentication exists; `/` opens Admin Dashboard immediately with `localStorage` state. |
| P0-08 | Inspect existing RBAC tables and server-side permission checks | **Verified (Absent)** | Only frontend `TeamRole` union (`Owner`, `Manager`, `Staff`, `Viewer`) in `src/types/admin.ts` with no backend enforcement. |
| P0-09 | Inspect existing Supabase configuration, migrations, RLS, Storage buckets, and Edge Functions | **Verified (Absent)** | No `supabase/` directory, no `@supabase/supabase-js`, no migrations, no RLS, no `print-uploads` bucket, no Edge Functions in repo. |
| P0-10 | Confirm whether an external Supabase project already exists and inspect its live config | **Blocked / Requires Owner Confirmation** | No Supabase URL/Project Ref exists in `.env.example` or workspace. Requires owner to provide/create Supabase project before Phase 2. |

---

### C. Windows 11 Hardware & Shop Environment Audit (Roadmap §13 Phase 0)

| ID | Acceptance Requirement | Status | Evidence / Notes |
| :-: | :--- | :---: | :--- |
| P0-11 | Confirm Windows 11 version, edition, and shop PC specifications (CPU, RAM, disk, PC count) | **Not Verified / Requires Owner Confirmation** | Windows 11 OS family confirmed; exact build, specs, and PC count require physical inspection at shop. |
| P0-12 | List exact printer brand(s), model(s), and initial printer count | **Requires Owner Confirmation** | Multiple printers required; exact OEM brands and models unknown. |
| P0-13 | Confirm physical connectivity per printer (USB, Wi-Fi, Ethernet/LAN) | **Not Verified / Requires Owner Confirmation** | USB & Wi-Fi confirmed in scope (+ LAN where compatible); physical port/IP layout not verified. |
| P0-14 | Record installed Windows printer drivers and driver versions | **Not Verified** | Cannot be verified without inspecting the shop Windows 11 PC(s). |
| P0-15 | Verify physical printer capabilities (colour, automatic duplex, supported paper sizes & trays) | **Not Verified** | Requires physical hardware + Windows driver capability check. |
| P0-16 | Manually test printing PDF and JPG/PNG files on target Windows 11 printer(s) | **Blocked** | Blocked until physical shop Windows 11 PC and target printer(s) are accessible. |
| P0-17 | Verify Windows Print Spooler behavior, default printer setting, power/sleep policy, UPS backup, and internet stability | **Not Verified** | Requires physical shop inspection (`winver`, Power Options, UPS load check, broadband reliability). |

---

### D. Architecture, Business Rules & Phase 1 Readiness

| ID | Acceptance Requirement | Status | Evidence / Notes |
| :-: | :--- | :---: | :--- |
| P0-18 | Evaluate Local Print Agent (.NET 8, DPAPI, Spooler, PDF/image printing) feasibility and risks | **Verified** | Documented in `PHASE_0_AUDIT_REPORT.md` §8–9 (Session 0 isolation, WSD vs TCP/IP, PDFium/PDF licensing, spooler ambiguity). |
| P0-19 | Produce prioritized Security & Operational Risk Register | **Verified** | 13 prioritized risks (`Critical`, `High`, `Medium`) documented in `PHASE_0_AUDIT_REPORT.md` §10. |
| P0-20 | Confirm final printing pricing rules (rates per page vs sheet, duplex rule, minimum charge, override policy) | **Requires Owner Confirmation** | Unknown; must be confirmed before Phase 2 server-side pricing engine. |
| P0-21 | Confirm MVP operational rules (max file size/count, customer name/phone policy, retention hours, approver roles) | **Requires Owner Confirmation** | Roadmap §30.2 defaults proposed (`20 MB`, `5 files`, `PDF/JPG/PNG`, `24h` completed retention, anonymous token) pending confirmation. |
| P0-22 | Confirm final Aman Computer production domain for permanent QR poster URL | **Requires Owner Confirmation** | Unknown; mandatory before Phase 11 poster printing (QR verification). |
| P0-23 | Confirm PDF rendering component & commercial licensing terms | **Blocked / Not Verified** | Deferred to Phase 5 hardware prototype evaluation; PDFium-based vs commercial SDK options identified. |
| P0-24 | Reconcile Roadmap v1.1 vs UI/UX Spec v1.0 vs existing codebase conflicts (routing, roles, glass vs dense tables) | **Verified (Documented)** | All 4 specification/repo conflicts documented in `PHASE_0_AUDIT_REPORT.md` §14A for owner decision in Phase 1. |

---

### Phase 0 Sign-Off Gate

- **Phase 0 Audit Deliverables Created:** `docs/scan2print/PHASE_0_AUDIT_REPORT.md` & `docs/scan2print/PHASE_0_ACCEPTANCE_CHECKLIST.md`.
- **Code / DB / Config Untouched:** Confirmed — zero application files, migrations, dependencies, or production configs were modified.
- **Stop Condition:** Phase 0 complete. **Stopped and awaiting explicit project owner authorization** before starting Phase 1.
