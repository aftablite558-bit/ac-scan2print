# AMAN COMPUTER — Smart QR Print System
## Phase 0 Discovery & Hardware Audit Report

**Phase:** Phase 0 — Discovery & Hardware Audit (Audit & Documentation Only)  
**Date:** 20 November 2026  
**Repository Snapshot Audited:** `2026-11-18T12:04:38.014381Z`  
**Mandatory References:**
- `public/assets/aistudio/Aman_Computer_Smart_QR_Print_System_Roadmap_v1.1_8e7ca2d6.md`
- `public/assets/aistudio/Aman_Computer_Smart_QR_Print_UI_UX_Specification_v1.0_61c997a6.md`

---

## 1. Executive Summary

A full repository, architecture, design-system, backend, and hardware-readiness audit was conducted against the Aman Computer Smart QR Print System Roadmap (v1.1) and Spatial Enterprise UI/UX Specification (v1.0).

### Key Findings
1. **Frontend Foundation Only:** The current repository contains a clean, well-structured **React 19 + TypeScript + Vite 8 + Tailwind CSS v4 Admin Dashboard foundation** (`src/App.tsx`, `src/components/Shell.tsx`, `OverviewPage.tsx`, `SettingsPage.tsx`, `HelpPage.tsx`) using GSAP animations and `localStorage` persistence (`aman-computer:state:v1`).
2. **No Backend, Auth, or Supabase Present in Repo:** Contrary to the assumption that an existing Supabase project, authentication system, RBAC database, and public customer website already exist in the codebase, **none of those exist in the audited snapshot**. There is no `supabase/` directory, no `@supabase/supabase-js` dependency, no `server.ts`, no authentication flow, and no public customer-facing website routes.
3. **Existing Build & Unit Tests Pass:** Read-only verification confirmed `npx tsx --test src/utils/adminLogic.test.ts` passes (4/4), `npx tsc --noEmit` exits cleanly (`0`), and `npm run build` produces `dist/` without errors.
4. **Hardware & Commercial Decisions Still Unverified:** Shop Windows 11 PC specifications, physical printer brand(s)/model(s), USB/Wi-Fi/Ethernet topology, duplex/colour/paper-size hardware telemetry, PDF rendering library licensing, production domain, pricing rules, and external Supabase project credentials remain unverified/unconfirmed and require owner input and physical shop inspection.
5. **Readiness Verdict:** The codebase is **structurally clean and ready for Phase 1 (Product Specification, UX & Route Reconciliation)**, **partially blocked** for Phase 2+ implementation until Supabase project provisioning, owner business-rule decisions, and physical printer discovery details are confirmed.

---

## 2. Repository Architecture

### 2.1 Directory Tree (Verified)
```text
/
├── .env.example
├── .gitignore
├── bun.lock
├── index.html
├── metadata.json
├── package.json
├── tsconfig.json
├── vite.config.ts
├── public/
│   ├── assets/aistudio/
│   │   ├── Aman_Computer_Smart_QR_Print_System_Roadmap_v1.1_8e7ca2d6.md
│   │   └── Aman_Computer_Smart_QR_Print_UI_UX_Specification_v1.0_61c997a6.md
│   └── photos/wallpapers/
│       ├── wall-dusk.jpg
│       ├── wall-room.jpg
│       └── wall-street.jpg
└── src/
    ├── App.tsx
    ├── index.css
    ├── main.tsx
    ├── components/
    │   ├── AnimatedControls.tsx
    │   ├── Charts.tsx
    │   ├── Overlays.tsx
    │   └── Shell.tsx
    ├── context/
    │   └── AdminContext.tsx
    ├── data/
    │   └── seedData.ts
    ├── pages/
    │   ├── HelpPage.tsx
    │   ├── OverviewPage.tsx
    │   └── SettingsPage.tsx
    ├── types/
    │   └── admin.ts
    └── utils/
        ├── adminLogic.test.ts
        ├── adminLogic.ts
        └── animations.ts
```

### 2.2 `package.json` & Dependencies Audit
- **Name / Version:** `react-example` (`0.0.0`, `"type": "module"`, `"private": true`).
- **Scripts:**
  - `dev`: `vite --port=3000 --host=0.0.0.0`
  - `build`: `vite build`
  - `preview`: `vite preview`
  - `clean`: `rm -rf dist server.js`
  - `lint`: `tsc --noEmit`
- **Production Dependencies (`dependencies`):**
  - `react` (`^19.0.1`), `react-dom` (`^19.0.1`)
  - `vite` (`^8.3.0`), `@vitejs/plugin-react` (`^6.1.1`)
  - `tailwindcss` / `@tailwindcss/vite` (`^4.3.3`)
  - `gsap` (`^3.15.1`), `motion` (`^12.23.24`)
  - `lucide-react` (`^0.546.0`)
  - `express` (`^4.21.2`), `dotenv` (`^17.2.3`), `@google/genai` (`^2.4.0`) *(installed in `package.json` but currently unused in `src/`)*
- **Dev Dependencies (`devDependencies`):**
  - `typescript` (`^7.0.2`), `tsx` (`^4.21.0`), `esbuild` (`^0.25.0`), `autoprefixer` (`^10.4.21`)
  - `@types/node`, `@types/react`, `@types/react-dom`, `@types/express`
- **Missing Expected Dependencies (for future phases):**
  - `@supabase/supabase-js` (not installed)
  - Client router library (e.g., `react-router-dom` or custom History API router — currently using hash routing only)
  - QR generation library (for `/admin/qr-management`, e.g., `qrcode`)

### 2.3 TypeScript & Build Configuration
- **`tsconfig.json`:** `target: ES2022`, `module: ESNext`, `moduleResolution: bundler`, `jsx: react-jsx`, `types: ["vite/client"]`, `allowImportingTsExtensions: true`, `noEmit: true`, path alias `@/* -> ./*`. Note: `strict: true` is **not** explicitly enabled in `tsconfig.json`.
- **`vite.config.ts`:** Mounts `react()`, `tailwindcss()`, custom `copy-unbundled-src-assets` closeBundle plugin, `@` alias, and `DISABLE_HMR` toggle. Note: Vite 8 logs a non-fatal warning regarding `__dirname` in native config loader (`vite.config.ts:22`).
- **Testing Infrastructure:** Native Node test runner via `npx tsx --test src/utils/adminLogic.test.ts` (4 unit tests covering `parseHash`, `getPageTitle`, `filterFaqs`, `computeAdminSummary`). No E2E/Playwright or Supabase RLS test harness exists yet.
- **Environment Configuration (`.env.example` & `.gitignore`):**
  - `.env.example` defines only `GEMINI_API_KEY` and `APP_URL`. No `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, or server-side print/Supabase secrets are defined yet.
  - `.gitignore` ignores `.env*` while keeping `!.env.example`.

---

## 3. Existing Admin Dashboard Audit

### 3.1 Existing Pages & Routes
Routing is handled solely via `window.location.hash` and `parseHash()` (`src/utils/adminLogic.ts:22-36`), defaulting `#/` or empty URLs to `#/home` directly inside `src/App.tsx`:

| Current Hash Route | Component | Purpose |
| :--- | :--- | :--- |
| `#/home` (default `/`) | `OverviewPage.tsx` | Workspace summary, hero identity card, 4 tinted KPI tiles (Team, Alerts, Display, Tickets), quick settings shortcuts, local notifications, readiness checklist |
| `#/settings` / `#/settings/business` | `SettingsPage.tsx` | Business name, dashboard title, location, email, about (`localStorage`) |
| `#/settings/team` | `SettingsPage.tsx` | Mock local team list (2 seed profiles) + role selector + invite modal |
| `#/settings/appearance` | `SettingsPage.tsx` | Light / Dark / Match system theme, collapsed sidebar toggle, 3 studio wallpapers, Frost slider (`20%–95%`) |
| `#/settings/alerts` | `SettingsPage.tsx` | Toggle 4 local alert rule preferences |
| `#/settings/data` | `SettingsPage.tsx` | Export JSON snapshot & reset `localStorage` back to `INITIAL_STATE` |
| `#/help` | `HelpPage.tsx` | Searchable FAQ accordion (`HELP_FAQS`) + local internal support ticket logger |

### 3.2 Shared Layouts & Reusable Components
- **`Shell.tsx` (`1,068` lines):**
  - Fixed wallpaper backdrop (`/photos/wallpapers/<id>.jpg`) + `--wash` scrim.
  - Sticky collapsible desktop sidebar (`252px` expanded / `84px` collapsed via `[` shortcut or button), sliding liquid active pill (`snavPillRef` via GSAP `slideClipPill`), Flip icon transitions, bottom tool items (`Settings`, `Help`), and bottom Workspace Account popover (theme switcher + quick links).
  - Sticky glass topbar with breadcrumb (`AMAN COMPUTER > Section > Sub`), Search button (`⌘K`), Theme toggle button, and Notifications popover with unread badge & bell wobble animation.
  - Mobile bottom dock (`tabbarRef`) with sliding pill + slide-in mobile drawer (`mobilePanelRef`).
- **`Overlays.tsx`:**
  - `SearchModal` (`⌘K` / `Ctrl+K` command palette), `InviteTeamModal`, `ShortcutsModal` (`?`), `AnimatedToast` (bottom center pill with optional Undo & auto-dismiss).
- **`AnimatedControls.tsx`:**
  - `TabsNav` (horizontal tab strip with sliding accent underline `.tabs__line`) and `SegControl` (pill/box segmented control with sliding `.seg__thumb`).
- **`Charts.tsx`:**
  - Reusable pure-SVG/DOM GSAP-animated `Sparkline`, `LiveBarsChart`, `RingProgress`, `SimpleBarChart`, and `StackedAreaChart`. Currently unused by the 3 foundation pages — available for reuse in `/admin/reports` and `/admin/print-management`.
- **State Provider (`AdminContext.tsx`):**
  - Manages all state client-side in React `useState` synchronized to `localStorage` (`aman-computer:state:v1` and `aman-computer:theme`).

### 3.3 Missing Smart Print Modules (Roadmap §23–25 vs Current State)
All 14 Smart Print Admin modules and all 6 Customer Portal pages are **missing**:
- **Missing Admin Modules:** Print Management Dashboard (`/admin/print-management`), Print Jobs (`/admin/print-jobs` & `/admin/print-jobs/:jobId`), Print Queue (`/admin/print-queue`), Printers (`/admin/printers`), Print Agents (`/admin/print-agents`), Payments (`/admin/payments`), Pricing (`/admin/pricing`), optional Customers (`/admin/customers`), real Staff & Permissions (`/admin/staff` — replacing/upgrading local `#/settings/team`), QR Management (`/admin/qr-management`), Reports & Analytics (`/admin/reports`), backed Notifications (`/admin/notifications`), Activity Logs (`/admin/activity-logs`), and print/upload/retention System Settings (`/admin/settings`).
- **Missing Customer Portal Pages:** `/quick-print`, `/quick-print/upload`, `/quick-print/options`, `/quick-print/success`, `/quick-print/track`, `/quick-print/help`.

### 3.4 Route & Integration Conflicts Identified
1. **Hash Routing (`#/...`) vs History Path Routing (`/quick-print`, `/admin/...`):**
   - `parseHash()` redirects any unknown hash to `home` (`OverviewPage`). Permanent shop QR posters require clean, canonical HTTPS paths (`/quick-print`), and unauthenticated public customers hitting `/quick-print` must **never** load the Admin `Shell` or redirect to Admin Overview.
   - **Recommendation for Phase 1:** Migrate to real path-based routing (or top-level pathname split: `/quick-print/*` public lightweight layout vs `/admin/*` protected Admin `Shell`, preserving legacy `#/home`, `#/settings/*`, `#/help` redirects to `/admin/*` if bookmarked).
2. **Existing `#/settings` & `#/settings/team` Overlap:**
   - Roadmap §24 proposes `/admin/settings` and `/admin/staff`. Existing `SettingsPage.tsx` already implements Business, Team, Appearance, Alerts, and Data tabs. Phase 1 must reconcile whether Staff/Permissions lives under `/admin/staff` (linking to or replacing `#/settings/team`) and how Print/Upload/Retention settings integrate into `SettingsPage.tsx` without duplicating UI.
3. **Existing `"Reset workspace data"` Control (`SettingsPage.tsx:537-555`):**
   - Currently clears `localStorage` via `resetDemoData()`. In production with Supabase, this must NOT exist for production business/print records (only safe local UI/appearance preferences reset, if kept at all).
4. **Unused `express` & `@google/genai` Packages:**
   - Installed in `package.json`, no server entrypoint exists. Roadmap §3 specifies Supabase Edge Functions for server-side logic (while AI Studio runtime supports `server.ts` if local proxy/testing is needed, production deployment target in Roadmap §3 & §18 is Supabase Edge Functions + Frontend).

---

## 4. Authentication and RBAC Audit

| Capability | Current Repository State | Roadmap / Security Requirement | Gap |
| :--- | :--- | :--- | :--- |
| **Admin Login / Session** | **Not Implemented.** Anyone opening `/` immediately enters Admin Overview with full UI access. | Authenticated Supabase Auth session required for all `/admin/*` routes; unauthenticated users blocked both on UI and backend. | **Critical Gap** |
| **Public Customer Access** | **Not Implemented.** | Anonymous upload & unguessable `tracking_token` access on `/quick-print*` without forcing customer accounts. | **Missing** |
| **RBAC Roles** | Hardcoded UI type `TeamRole = 'Owner' \| 'Manager' \| 'Staff' \| 'Viewer'` (`src/types/admin.ts:8`) with descriptive strings only (`ROLE_CAPABILITIES`). | Server-enforced roles separating `Admin` vs `Operator` (and `Super Admin` / staff permissions mapping cleanly to Roadmap §4 & §23.10) + distinct `Device identity` for Print Agents. | **Critical Gap** |
| **Authorization Enforcement** | None — client-side `localStorage` mutation only (`updateTeamRole`, `inviteTeamMember`). | Server-side RLS policies + Edge Function role verification; zero reliance on frontend UI hiding. | **Critical Gap** |
| **Staff Provisioning** | Mock modal (`InviteTeamModal`) appends a local object to `state.team` without creating real credentials. | Secure Supabase Auth user invitation / provisioning with audit logging and no open public admin signup. | **Missing** |

---

## 5. Supabase Audit

### 5.1 Verified Repository Findings
- **Project Configuration:** No `supabase/config.toml`, no `.env` Supabase keys, no `src/lib/supabase.ts`, and no `@supabase/supabase-js` package exist in the workspace.
- **Database Schema & Migrations:** No `supabase/migrations/` directory or SQL schema files exist.
- **RLS Policies:** None present.
- **Admin Roles & Permissions Tables:** None present.
- **Storage Buckets:** None configured (`print-uploads` private bucket does not exist in repo).
- **Edge Functions:** No `supabase/functions/` directory exists.
- **Authentication & Realtime:** Neither Supabase Auth nor Realtime subscriptions exist in the codebase.

### 5.2 External Supabase Project Status
- **Not Verified:** No Supabase Project URL, Project Ref, or anon key exists in the workspace or environment config. Whether an external Supabase project has already been created in the Supabase Dashboard by the owner is **unknown / unverified** and requires owner confirmation before Phase 2.

---

## 6. Existing Design System Audit

### 6.1 Brand & Logo Assets (Critical Observation)
- **Official Logo Asset Check:** A complete scan of `/public` and `/src` confirms **no `.svg`, `.png`, `.webp`, or `.jpg` logo file exists in the repository**.
- **Actual In-Code Brand Mark (`Shell.tsx:477-489, 750-753, 960-966`):**
  - A `40×40px` (`rounded-[12px]`) solid accent square tile (`bg-[var(--accent)] text-[var(--accent-ink)]`) displaying bold letter **`A`**, paired with text **`AMAN COMPUTER`** and subtitle **`Admin Dashboard`**.
- **Owner Confirmation Required:** Because global rules require preserving *"the exact existing official Aman Computer logo"*, the owner must confirm whether the existing `"A"` accent monogram tile + `"AMAN COMPUTER"` wordmark is the official logo to preserve, or whether an external image/SVG logo file will be supplied.

### 6.2 Verified CSS Design Tokens (`src/index.css` & `index.html`)
- **Typography:**
  - Google Fonts (`index.html:20-23`): `Urbanist` weights `400, 500, 600, 700`.
  - CSS Variable: `--font: "Urbanist", system-ui, -apple-system, "Segoe UI", sans-serif`, base `14px`, `line-height: 1.45`.
  - Tabular numbers helper: `.tabular-nums` (`font-variant-numeric: tabular-nums`).
- **Light Theme Tokens (`:root`, `src/index.css:4-70`):**
  - Canvas & Surfaces: `--bg: #e9e6e2`, `--wash: rgba(246, 242, 238, 0.58)`, `--glass: rgba(255, 255, 255, calc(0.46 + var(--frost) * 0.26))`, `--glass-2: rgba(255, 255, 255, 0.5)`, `--glass-hi: rgba(255, 255, 255, 0.78)`, `--glass-solid: rgba(250, 248, 246, 0.94)`.
  - Text: `--ink: #1d1a1e`, `--ink-2: #3b363c`, `--muted: #5b5459`.
  - Brand Accent: `--accent: #f07a2e`, `--accent-ink: #2a1203`, `--accent-hi: #f58d47`, `--accent-soft: rgba(240, 122, 46, 0.15)`, `--accent-text: #a8470d`.
  - Semantic Status: `--good: #126b45`, `--warn: #855400`, `--bad: #b3261e`, `--info: #1c5a9e` (plus `-soft` variants).
  - Borders & Shadows: `--line: rgba(30, 24, 28, 0.09)`, `--line-2: rgba(30, 24, 28, 0.16)`, `--shadow`, `--shadow-lg`.
- **Dark Theme Tokens (`[data-theme="dark"]`, default in `index.html:2`, `src/index.css:72-128`):**
  - Canvas & Surfaces: `--bg: #0d1117`, `--wash: rgba(8, 10, 16, 0.5)`, `--glass: rgba(20, 22, 30, calc(0.42 + var(--frost) * 0.28))`, `--glass-solid: rgba(22, 24, 32, 0.95)`.
  - Text: `--ink: #f4f0ee`, `--ink-2: #ddd6d4`, `--muted: #b5adac`.
  - Brand Accent: `--accent: #ff8c42`, `--accent-ink: #2a1203`, `--accent-hi: #ffa264`, `--accent-text: #ffb784`.
  - Semantic Status: `--good: #74dca8`, `--warn: #f2c26b`, `--bad: #ff978c`, `--info: #8cc7ff` (plus `-soft` variants).
- **Radius & Glass Tokens:**
  - `--r-sm: 10px`, `--r-md: 14px`, `--r-lg: 22px`, `--r-xl: 28px`, `--blur: 26px`, `--frost: 0.6`.
  - Utility classes: `.glass-pane`, `.glass-solid`, `.glass-tile`, `.btn-primary`, `.btn-ghost`, `.admin-input`.
- **Wallpapers (`public/photos/wallpapers/`):**
  - `wall-dusk.jpg` (default), `wall-street.jpg`, `wall-room.jpg`.
- **Icon Library:** `lucide-react` (`^0.546.0`).
- **Motion System (`src/utils/animations.ts` & `src/index.css`):**
  - GSAP 3.15.1 + `Flip` plugin, circular `startViewTransition` theme switch, `reducedMotion()` media query support (`@media (prefers-reduced-motion: reduce)` + `dur()`).

### 6.3 Specification Alignment & Conflicts (UI/UX Spec v1.0 vs Existing CSS)
1. **Glass Restraint on Dense Print Tables & Previews (Spec §3.2, §3.3):**
   - Existing `Shell.tsx` uses `.glass-pane` over a full-viewport wallpaper for every card.
   - UI/UX Spec §3.3 states: *"Solid, high-contrast surfaces for tables, forms, document previews and financial data... Glass is an accent material, not the default background for every component."*
   - **Action for Phase 1/4:** Use the existing shell/wallpaper/glass navigation intact while rendering dense print tables, document preview viewers, payment ledgers, and audit logs inside crisp high-contrast inner surfaces (`.glass-solid` or higher-opacity `--card-2`/`--glass-solid` containers derived from existing tokens) for effortless legibility.
2. **Customer Portal Lightweight Constraint (Spec §7.1, §8.5, §9.4, §16):**
   - Customer routes (`/quick-print*`) are mobile-first and must NOT download GSAP character-split animations or heavy desktop wallpaper backdrops that slow down Android mobile browsers over shop mobile data. Keep `/quick-print*` in a separate lazy-loaded lightweight layout sharing the exact `--bg`, `--accent`, `--ink`, `--good`/`--warn`/`--bad`, and `Urbanist` tokens.
3. **Additional Semantic Status Tokens Needed (Spec §4.3):**
   - Existing CSS defines 4 semantic hues (`--good`, `--warn`, `--bad`, `--info`) + neutral `--muted`. Print workflows require 15+ distinct job states and 4 device states; Phase 1 must map every state to consistent `(hue token + icon + explicit text label)` combinations so status is never communicated by color alone.

---

## 7. Windows 11 Hardware Checklist

**Verification Status:** All physical shop hardware items below are **NOT VERIFIED** (no physical shop hardware is attached to or observable from the repository environment). Physical inspection at Aman Computer is required before Phase 5.

| # | Category | Verification Item | Confirmed / Observed | Status | Notes / Target Requirement |
| :-: | :--- | :--- | :--- | :--- | :--- |
| 1 | **OS** | Windows 11 Edition & Build (Home / Pro, 22H2/23H2/24H2, 64-bit) | Windows 11 confirmed as OS family | **Requires Physical Inspection** | Check `winver` & `.NET 8 Desktop Runtime` x64 support |
| 2 | **PC Hardware** | CPU, RAM (min 8 GB recommended), free disk space, number of shop PCs | Unknown | **Requires Physical Inspection** | Ensure dedicated temp folder space for PDF rendering/spooling |
| 3 | **Printers** | Exact printer brand(s), model(s), serial/assets, and count | Multiple printers required | **Requires Owner / Physical Inspection** | Need exact OEM models (e.g., Epson EcoTank / HP LaserJet / Canon / Brother) |
| 4 | **USB** | Direct USB 2.0/3.0 cable connections, port stability, USB selective suspend disabled | USB connectivity in scope | **Requires Physical Inspection** | Verify Windows USB printer port (`USB001` etc.) & cable quality |
| 5 | **Wi-Fi** | Shop Wi-Fi printer IP assignment (DHCP reservation vs static IP), 2.4/5 GHz stability | Wi-Fi connectivity in scope | **Requires Physical Inspection** | Standard TCP/IP WSD vs RAW/IPP port; static IP strongly recommended |
| 6 | **Ethernet / LAN** | Wired LAN port / switch availability for LAN printers | LAN/Ethernet in scope if supported | **Requires Physical Inspection** | Preferred over Wi-Fi for lower spooler drop rate |
| 7 | **Drivers** | Vendor-signed Windows 11 drivers vs generic Microsoft IPP/Class drivers | Unknown | **Requires Physical Inspection** | Generic drivers often hide colour/duplex/tray/paper options |
| 8 | **Discovery** | Whether all printers appear in Windows `Settings > Bluetooth & devices > Printers & scanners` | Unknown | **Requires Physical Inspection** | Check `Get-Printer` PowerShell output |
| 9 | **Colour Capability** | Which printers are monochrome-only vs CMYK/colour | Unknown | **Requires Physical Inspection** | Must match Admin capability profile |
| 10 | **Duplex Capability** | Hardware automatic duplex vs manual duplex vs simplex-only | Unknown | **Requires Physical Inspection** | Do not enable automatic duplex in customer UI unless tested on hardware |
| 11 | **Paper Sizes** | Physically loaded trays (`A4`, `A3`, `Legal`, photo sizes) | Unknown | **Requires Physical Inspection** | Verify tray sensor & default paper size in driver Printing Preferences |
| 12 | **Default Printer** | Windows "Let Windows manage my default printer" setting | Unknown | **Requires Physical Inspection** | Recommend disabling Windows auto-default switching; Agent explicitly targets printer name |
| 13 | **Print Spooler** | `Spooler` service (`spoolsv.exe`) startup type (`Automatic`), spool directory health | Unknown | **Requires Physical Inspection** | Verify bidirectional support ("Enable bidirectional support") & status reporting |
| 14 | **Internet** | Shop broadband / fiber uptime, upload/download speeds, failover (hotspot) | Unknown | **Requires Physical Inspection** | Outbound HTTPS to Supabase Edge Functions & Storage |
| 15 | **Power Backup** | UPS capacity covering shop PC, router/ONT, and ideally ink/laser printer (note: laser fusers overload small UPS) | Unknown | **Requires Physical Inspection** | Prevents mid-print PC crash & ambiguous `needs_review` states |
| 16 | **Sleep Policy** | Windows Power & Sleep settings during shop operating hours | Unknown | **Requires Physical Inspection** | PC must stay awake (`Sleep: Never` when plugged in) so Agent stays online |

---

## 8. Printer Connectivity Feasibility

| Connection Type | Windows 11 Discovery | Reliability Assessment | Operational Risks & Mitigations |
| :--- | :--- | :--- | :--- |
| **USB** | Enumerated natively by Windows Print Spooler (`Win32_Printer`, `System.Drawing.Printing.PrinterSettings`, `LocalPrintServer`). | **High** (lowest latency, immune to Wi-Fi drops). | Risk of USB port sleep or cable unplugging changing queue status to `Offline` / `Error`. **Mitigation:** Disable Windows USB selective suspend; use `PrinterStatus` + `WorkOffline` checks before claiming/printing. |
| **Wi-Fi** | Enumerated via WSD (`WSD-*`) or Standard TCP/IP Port (`IP_*`) once installed on Windows 11. | **Medium** (subject to DHCP IP lease changes & router sleep). | WSD ports frequently report false "Offline" or stall after IP changes. **Mitigation:** Assign static LAN IP via router DHCP reservation and bind Windows printer using Standard TCP/IP / IPP port instead of WSD where vendor supports it. |
| **Ethernet / LAN** | Enumerated via Standard TCP/IP / IPP / Vendor network port on Windows 11. | **High** (stable enterprise link). | Requires switch/router port; printer SNMP status reporting varies by vendor. **Mitigation:** Test driver bidirectional status telemetry during Phase 5 hardware prototype. |
| **Multi-Printer Routing** | Supported cleanly: one Local Print Agent on one Windows 11 PC can enumerate all local + network queues installed on that PC and sync them to `print_printers`. | **High** (centralized per PC). | Avoid installing multiple PCs pointing to the *same* network printer simultaneously without per-printer ownership/claim scoping (`assigned_printer_id` + single active device mapping), otherwise two PCs could race or report conflicting offline states. |

---

## 9. Local Print Agent Feasibility (C# / .NET 8 on Windows 11)

### 9.1 Architecture Assessment
Roadmap §3 & §7 propose a **C# / .NET 8 Windows Background Worker + System Tray Control UI** communicating outbound over HTTPS to Supabase Edge Functions. This is technically **sound and the optimal choice** for Windows 11 printer integration.

### 9.2 Component-by-Component Feasibility
1. **Windows Printer Discovery & Capability Detection:**
   - Using `System.Printing` (`LocalPrintServer`, `PrintQueue`, `PrintCapabilities`) and `System.Management` (`Win32_Printer` WMI/CIM) gives reliable enumeration of installed printer names, default printer, `IsOffline` / `WorkOffline`, `PrinterStatus`, colour support (`OutputColor`), duplex (`Duplexing`), and paper sizes (`PageMediaSize`).
   - *Limitation:* Windows drivers vary widely in WMI/`PrintCapabilities` accuracy (especially low-cost inkjets or GDI host-based printers). Therefore, Roadmap §7.6 & §23.5 requirement for **Admin-editable capability overrides** is mandatory.
2. **Windows Print Spooler Integration & Telemetry:**
   - `PrintQueue.AddJob` / `PrintDocument` / `PrintQueue.GetPrintJobInfoCollection()` can capture a Windows Spooler Job ID (`JobIdentifier`) and track whether the job leaves the spooler queue.
   - *Limitation (Confirmed in Roadmap §7.5 & §9):* Spooler job disappearance only proves the Windows spooler handed bytes to the port monitor/driver — **not** that paper physically exited without a paper jam or empty tray. UI and state machine must keep `submitted_to_spooler` distinct from `completed`, and crash/timeout ambiguity must go to `needs_review`.
3. **PDF Rendering Requirements & Licensing Risk:**
   - .NET 8 has **no built-in silent PDF rasterizer/printer**. Relying on Adobe Acrobat / Foxit / Edge CLI printing is fragile (window focus issues, silent flag breakage, dialog popups).
   - *Options to evaluate in Phase 5:*
     - **PDFium (`PDFium` / `PdfiumViewer` / `Docnet.Core` + GDI/WPF/Direct2D print surface):** Apache 2.0 / BSD-3-Clause permissive license (verify exact NuGet wrapper license and native `pdfium.dll` x64 bundling). Renders pages at target DPI (`300`/`600 DPI`) cleanly to Windows `PrintDocument` with full control over page range, scaling, orientation, copies, and duplex.
     - **Commercial SDKs (e.g., Syncfusion, IronPDF, Aspose, PDFtron):** Require paid commercial licensing.
   - **Phase 5 Gate:** License and print quality (fonts, Hindi/Devanagari Unicode glyphs, Aadhaar/government PDF forms, vector sharpness) must be tested before locking the library.
4. **Image Printing (JPG / PNG):**
   - Fully feasible natively via .NET (`System.Drawing.Common` / `SixLabors.ImageSharp` + Windows `PrintDocument`) with EXIF orientation normalization, fit-to-page vs actual-size DPI calculation, margins, and colour/greyscale `DefaultPageSettings.Color`.
5. **Background Service & Tray UI Split:**
   - **Important Windows Session 0 Isolation Constraint:** A Windows Service (`Session 0`) cannot directly display a System Tray icon (`NotifyIcon`) in the logged-in user's desktop (`Session 1+`), and Session 0 sometimes has different mapped/user-installed printer visibility than the interactive user session.
   - *Recommended Design for Phase 5:* Either run as an auto-started user-session tray + background worker host (via Windows Task Scheduler / Startup / MSIX `StartupTask` when counter staff logs into Windows) communicating over a local named pipe (ACL-protected to current user), OR a Windows Service for system-wide printers paired with a separate Tray UI client over ACL-protected Named Pipes (never an open local HTTP server).
6. **Windows DPAPI Credential Protection:**
   - `System.Security.Cryptography.ProtectedData.Protect(..., DataProtectionScope.LocalMachine or CurrentUser)` natively encrypts the device token/key without third-party dependencies.
   - Note: `DataProtectionScope.CurrentUser` vs `LocalMachine` must match whether the worker runs as a Windows Service or interactive user session.
7. **Agent-to-Supabase Communication:**
   - Standard `HttpClient` over TLS 1.2/1.3 outbound HTTPS (`443`) to Supabase Edge Functions + short-lived signed Storage download URLs. Zero inbound firewall ports required.
8. **Installer & Update Packaging:**
   - Self-contained .NET 8 single-file or MSIX / Inno Setup / WiX MSI installer. Authenticode code-signing certificate requires budget/confirmation (unsigned installers trigger Windows SmartScreen warnings).

---

## 10. Security Risk Register

| ID | Risk Area | Severity | Description & Threat Scenario | Required Control / Mitigation |
| :-: | :--- | :---: | :--- | :--- |
| R-01 | **Authentication & Unprotected Admin Routes** | **Critical** | Currently `/` opens Admin Overview with zero authentication. Any visitor could view/modify business or print data once connected. | Implement Supabase Auth gate for all `/admin/*` routes + Edge Function JWT verification; keep `/quick-print*` strictly isolated. |
| R-02 | **Customer Document Privacy & Storage URL Exposure** | **Critical** | Customer uploads contain highly sensitive PII (Aadhaar, PAN, certificates, exam admits). Public bucket or permanent URLs would cause severe data breach. | Use strictly **private** `print-uploads` bucket, randomized UUID storage paths, zero public access, and short-lived signed URLs issued only to authorized admins/claiming agents. |
| R-03 | **RLS & Missing Backend Enforcement** | **Critical** | Current app relies 100% on client state. Adding client Supabase calls without RLS or using `service_role` in frontend/agent would expose entire DB. | Enable RLS on every `print_*` table; enforce RBAC server-side in Edge Functions; **never** embed `service_role` key in Vite bundle or `.NET` agent. |
| R-04 | **Duplicate Physical Printing** | **Critical** | Network drops, double-clicks, or two agents polling simultaneously could claim and print the same paid/unpaid job twice, wasting paper/ink and exposing documents. | Atomic DB claim with `claimed_by_device_id` + `lease_expires_at` + per-attempt `idempotency_key`; uncertain spooler outcomes transition to `needs_review` (never auto-reprint). |
| R-05 | **Unauthorized Job Claiming / Device Spoofing** | **High** | A compromised or unregistered PC attempts to call `agent-claim-job` to steal customer PDFs. | Individual device enrollment + admin approval (`print_devices.status = 'active'`), revocable hashed device credential stored via Windows DPAPI, strict printer-to-device binding. |
| R-06 | **Sequential Job ID Enumeration (IDOR)** | **High** | Customer tracking via `/quick-print/track?job=JOB-101` alone would allow anyone to guess `JOB-102` and read job status/metadata. | Require an unguessable cryptographic `tracking_token` (stored hashed as `tracking_token_hash`) via `get-print-job-status` Edge Function; never expose file download links on tracking page. |
| R-07 | **Malicious File Upload / MIME Spoofing** | **High** | Attackers renaming `.exe`/`.html`/`.svg`/corrupt files to `.pdf` or uploading zip bombs / 500MB files to DoS storage or agent parser. | Client + server allowlist (`PDF`, `JPG/JPEG`, `PNG`), magic-byte header verification, zero-byte & size cap enforcement (20 MB default), filename sanitization, corrupt PDF detection. |
| R-08 | **Pricing Tampering / Estimate Mismatch** | **High** | Client submitting spoofed page count or manipulated price, or customer UI disagreeing with Admin totals. | Compute authoritative page count and pricing solely via a single server-side pricing function (`print_pricing_rules`); label customer estimate clearly; require operator confirmation & audit reason for overrides. |
| R-09 | **Existing Architecture / Routing Conflicts** | **Medium** | Current hash router (`parseHash`) redirects unknown routes to Admin `home`, conflicting with `/quick-print` permanent QR URLs and admin subroutes. | Refactor routing in Phase 1/2 so `/quick-print*` is cleanly separated from `/admin/*`, while preserving existing shell styling and legacy hash fallback. |
| R-10 | **Printer Driver Capability Mismatch** | **Medium** | Customer selects A3 or Duplex when the physical printer is A4 simplex-only, causing silent clipping or stalled jobs. | Restrict customer options dynamically to verified `print_printers` capabilities; allow admin capability override and job-setting adjustment on review. |
| R-11 | **Windows Spooler & Agent Crash / Network Drop** | **Medium** | PC restarts or broadband drops mid-download or after spooler submission, leaving jobs stuck in `claimed`/`printing`. | Lease expiration recovery (`lease_expires_at`), persistent local spooler ID tracking, `needs_review` escalation for post-spooler ambiguity, manual admin fallback download + audit log. |
| R-12 | **Storage Retention Failure (Orphaned PII Files)** | **Medium** | Deleting DB rows without deleting Storage objects or failing cron cleanup leaves sensitive customer PDFs indefinitely in cloud storage. | Implement scheduled `cleanup-expired-print-files` Edge Function deleting actual Storage objects + setting `deleted_at`, with admin health visibility. |
| R-13 | **PDF Rendering Library Licensing & Font Accuracy** | **Medium** | Unlicensed commercial library or broken Hindi/Devanagari/government-PDF rendering produces unreadable prints or legal noncompliance. | Audit library license (e.g., PDFium OSS vs commercial) and test real customer PDFs (Hindi, Aadhaar, landscape scans) in Phase 5 prototype. |

---

## 11. Architecture Gaps

Summary of verified gaps between the current repository (`src/` snapshot) and the Target System (Roadmap v1.1 + UI/UX Spec v1.0):

1. **No Public Website / Customer Entrypoint:** Missing `/quick-print`, `/quick-print/upload`, `/quick-print/options`, `/quick-print/success`, `/quick-print/track`, `/quick-print/help`.
2. **No Routing Isolation:** App currently uses `#/home` hash routing at `/` without public/protected route separation or deep detail routes (`/admin/print-jobs/:jobId`).
3. **No Backend or Persistence Layer:** Zero Supabase SDK, zero migrations, zero RLS, zero private Storage buckets, zero Edge Functions (`localStorage` only).
4. **No Authentication or Server-Side RBAC:** No login screen, no session persistence, no password reset, no server-checked `Admin` vs `Operator` permissions, and no `Device` authentication model.
5. **No Audit Log Subsystem:** Current `AdminContext` mutates local state directly without immutable backend `print_events` or `admin_audit_logs`.
6. **No Smart Print Admin Modules:** None of the 14 print/operations/finance/device/QR modules exist in `Shell.tsx` navigation or `src/pages/`.
7. **No Local Print Agent Codebase:** No `.NET 8` C# solution exists yet (expected — scheduled for Phase 5–8 after Phase 0 hardware audit).
8. **Missing Official Binary Logo Asset:** Only CSS `"A"` tile + `"AMAN COMPUTER"` text exists; needed if printable QR posters or customer portal require an official vector/raster brand logo.

---

## 12. Implementation Dependencies

```text
[Phase 0: Discovery & Owner Decisions + Hardware Audit]
          │
          ▼
[Phase 1: UX, Route Reconciliation, State Machine & Pricing Rules Spec]
          │
          ├──► [Phase 2: Supabase Project, Migrations, RLS, Private Bucket & Edge Functions]
          │              │
          │              ├──► [Phase 3: Customer QR Portal (/quick-print/*)]
          │              │
          │              └──► [Phase 4: Admin Print Manager (Queue, Review, Payments, Pricing, QR)]
          │
          └──► [Phase 5: Windows 11 Hardware Prototype (C# / .NET 8 + Actual Printers)]
                         │
                         ▼
               [Phase 6: Secure Device Enrollment, DPAPI & Heartbeat APIs]
                         │
                         ▼
               [Phase 7: Atomic Job Claim, Spooler Submission & Needs-Review Recovery]
```

**Hard External Blockers Before Code Implementation (Phase 2+):**
- External Supabase project URL, project ID, and secret management setup.
- Owner answers to Section 14 Open Questions (especially pricing unit, printer capabilities, domain, and retention hours).
- Physical Windows 11 + printer hardware availability before Phase 5.

---

## 13. Phase 1 Readiness Assessment

| Criterion | Status | Explanation |
| :--- | :---: | :--- |
| Existing repository fully inspected & verified | **Ready** | 100% of files read; `tsc --noEmit`, `npm run build`, and `adminLogic.test.ts` pass cleanly. |
| Existing design tokens, fonts, animations cataloged | **Ready** | `src/index.css`, `index.html`, `animations.ts`, `Shell.tsx`, `Charts.tsx`, `AnimatedControls.tsx` fully documented. |
| Route reconciliation strategy clear | **Ready** | Hash-to-path migration and public/admin isolation requirements identified for Phase 1 design. |
| Core product & UI specifications available | **Ready** | Roadmap v1.1 and Spatial Enterprise UI/UX Spec v1.0 both verified with minor tensions documented. |
| **Ready to proceed to Phase 1 (Product Spec & UX)?** | **YES (Conditional)** | **Phase 1 is documentation/UX/contract design**, so it can start once owner authorizes Phase 1 and confirms open business/logo questions (Section 14). **Phase 2+ coding remains blocked** on Supabase provisioning and Phase 1 sign-off. |

---

## 14. Open Questions & Conflicts Requiring Owner Confirmation

### A. Document / Repo Conflicts to Resolve
1. **Official Logo Asset:** No raster/SVG logo file exists in `/public` — `Shell.tsx` renders an orange `"A"` monogram tile (`bg-[var(--accent)]`) next to `"AMAN COMPUTER"`. Is this `"A"` monogram + wordmark the exact official logo to preserve everywhere (including customer portal and QR poster), or will an official SVG/PNG logo file be provided?
2. **Routing Convention:** Should the app transition from `#/home` hash routing to clean Browser History path routing (`/quick-print` for customers and `/admin/print-management`, `/admin/settings`, etc. for admins) so permanent QR URLs contain no `#` fragment?
3. **Existing Role Taxonomy Reconciliation:** Existing `src/types/admin.ts` uses `Owner | Manager | Staff | Viewer`, while Roadmap §4 specifies `Admin | Operator` (and `Customer`, `Device`). How should existing roles map onto Smart Print permissions?
4. **Glassmorphism vs High-Contrast Operational Tables:** Confirm the balanced approach in Phase 1: keep existing wallpaper + glass shell (`Shell.tsx`) while using solid/high-opacity surfaces (`.glass-solid`) for dense print tables, document previews, and financial ledgers, and a fast, wallpaper-free mobile theme on `/quick-print`.

### B. Unconfirmed Business & Hardware Decisions (Roadmap §30.3)
1. **Printers:** Exact printer brand(s), model(s), and initial quantity?
2. **Connectivity:** Which printer(s) use USB, Wi-Fi, or Ethernet/LAN?
3. **PCs:** Number of Windows 11 PCs running the Local Print Agent (1 initial vs multiple counters)?
4. **Hardware Capabilities:** Which printer(s) support colour, automatic duplex, and which paper sizes (`A4`, `A3`, `Legal`) are physically loaded?
5. **Pricing Rules:** Exact rates for B&W and Colour (`A4`, `A3`, `Legal`), whether pricing is per **printed page** or **physical sheet** (especially for duplex), and any minimum job charge?
6. **Price Override & Refunds:** Can Operators override estimated prices, is a reason mandatory, and what is the cancellation/refund policy?
7. **Customer Fields:** Should customer name and/or phone number be optional, required, or omitted (anonymous Job ID + tracking token only)?
8. **Upload & Retention Limits:** Confirm proposed defaults (`20 MB` max/file, `5` files/job, `PDF/JPG/PNG` only, `24h` completed file retention, `72h` failed retention)?
9. **Production Domain & Supabase Project:** What is the final production domain for permanent QR codes, and does an external Supabase project already exist (or should a new one be created in Phase 2)?
10. **PDF Rendering Component:** Any existing commercial PDF license owned by Aman Computer, or approve open-source permissive evaluation (e.g., PDFium-based) in Phase 5?

---

## 15. Final Recommendations

1. **Do NOT implement code or create migrations yet.** Obtain owner confirmation on the Section 14 questions and physical hardware inventory first.
2. **Authorize Phase 1 (Product Specification, State Machine, Route Contract & Spatial Enterprise Wireframes/Specs)** as the immediate next step, reconciling `/quick-print*` and `/admin/*` routing with the existing `Shell.tsx` and `SettingsPage.tsx`.
3. **Confirm/Provision the Supabase Project** prior to Phase 2 so database migrations, private Storage (`print-uploads`), RLS policies, and Auth/RBAC can be built and verified against real Supabase infrastructure rather than browser `localStorage`.
4. **Prioritize Phase 5 Hardware Prototyping Early (per Roadmap §22):** Once the exact Windows 11 printer model(s) and drivers are known, prove silent PDF + image printing and spooler telemetry on the real shop printer before finalizing advanced agent features.
