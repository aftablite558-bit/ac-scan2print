# AC Scan2Print (AMAN COMPUTER) — Smart QR Print System
## Phase 2: Pre-Implementation Repository & Configuration Audit

**Document ID:** `PHASE_2_PRE_IMPLEMENTATION_AUDIT`  
**Phase:** Phase 2 — Database & Backend Foundation  
**Audit Timestamp:** 2026-11-20T12:24:00-08:00  
**Target Scope:** AC Scan2Print Backend Foundation (Supabase PostgreSQL, RLS, Private Storage, Edge Functions, Auth/Security, Testing & Documentation)

---

## 1. Existing Project Configuration

- **Framework & Toolchain:** React `19.0.1`, Vite `8.3.0`, TypeScript `7.0.2` (`tsc --noEmit`), Tailwind CSS `4.3.3` (`@tailwindcss/vite`), Express `4.21.2`, Node.js `node:sqlite` (`server.ts`), GSAP `3.15.1`, Motion `12.23.24`, Lucide React `0.546.0`.
- **`package.json` Scripts:**
  - `dev`: `tsx server.ts`
  - `start`: `node server.ts`
  - `build`: `vite build`
  - `preview`: `vite preview`
  - `lint`: `tsc --noEmit`
- **`tsconfig.json`:** Already excludes `"dist"` and `"supabase/functions"` from root Vite/React `tsc` pass and enables `"allowImportingTsExtensions": true`.
- **Existing Routing:** Hash-based routing inside `src/utils/adminLogic.ts` (`#/home`, `#/cms/*`, `#/enquiries`, `#/bihar-updates/*`, `#/access/*`, `#/settings/*`, `#/help`). No `/quick-print*` customer portal routes exist in this repository.
- **Existing Authentication (`server.ts` + `src/components/AuthScreen.tsx`):**
  - Uses local SQLite (`data/aman.db`) + `scrypt` password hashing + HMAC-SHA256 `HttpOnly` cookie (`aman_session`) for the existing Aman Computer Admin Dashboard.
  - Multi-role RBAC tables exist in `data/aman.db` for CMS/Door 5 features, which remain preserved for existing features and untouched in Phase 2.

---

## 2. Existing Supabase Connection Status

- **Installed Client SDK:** `@supabase/supabase-js` (`^2.119.2`) is installed in `package.json`.
- **Browser Helper (`src/lib/supabase.ts`):** Present, reading `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`, gracefully returning `null` when unconfigured.
- **Directory & CLI Status:**
  - `supabase/` directory does **NOT** exist yet (`supabase/config.toml`, `supabase/migrations/`, `supabase/functions/` are absent).
  - `supabase` CLI and `deno` CLI are **NOT** installed in the local container.
- **Environment Credentials:**
  - No `.env` file exists on disk.
  - `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SUPABASE_URL`, and `SUPABASE_SERVICE_ROLE_KEY` are **empty/unset** in `.env.example` and unset in the process environment.
- **Conclusion:** Although a new external Supabase project has been created by the owner, its Project Ref, URL, Anon Key, and Service Role Key are **not yet supplied** to the workspace. Remote schema push and live Edge Function deployment are therefore documented as external deployment blockers until credentials are configured.

---

## 3. Existing Firebase Connection Status

- **Installed Client SDK:** `firebase` (`^13.4.0`) is installed in `package.json`.
- **Browser Helper (`src/lib/firebase.ts`):** Present, reading `VITE_FIREBASE_*` environment variables for optional Firebase Analytics, Performance Monitoring, and FCM Web Push notifications (`registerFcmPushNotifications`). **Zero Firebase Authentication** code exists in the repository.
- **Config Files:** No `firebase.json`, `.firebaserc`, or `firebase-applet-config.json` exists in the workspace, and `VITE_FIREBASE_*` / `FIREBASE_SERVER_KEY` are **unset** in the environment.
- **Intended Phase 2 Responsibility:**
  - Keep Firebase strictly isolated to optional frontend hosting, analytics, performance, and future FCM operational push alerts using the **new** AC Scan2Print Firebase project (once configured via env vars).
  - Do **not** introduce Firebase Authentication; **Supabase Auth** is the single authoritative Admin identity provider for AC Scan2Print.

---

## 4. Existing Database Schema

- **Supabase PostgreSQL:** **0 tables / 0 migrations** exist in the repository prior to Phase 2.
- **Local SQLite (`data/aman.db` in `server.ts`):** Stores existing Aman Computer Admin Dashboard entities (`roles`, `permissions`, `role_permissions`, `admin_users`, `business_profile`, `hero_section`, `owner_profile`, `website_settings`, `reference_portraits`, `service_categories`, `services`, `gallery_items`, `testimonials`, `faqs`, `enquiries`, `enquiry_notes`, `govt_sources`, `govt_updates`, `govt_fetch_logs`, `admin_notifications`).
- **Action:** Preserve `server.ts` and `data/aman.db` completely untouched in Phase 2 so existing dashboard features do not regress. Author all AC Scan2Print tables (`print_*`) in clean, versioned PostgreSQL migrations under `supabase/migrations/`.

---

## 5. Existing Dependencies & Test Infrastructure

- **Dependencies Verified:** `@supabase/supabase-js`, `firebase`, `express`, `tsx`, `typescript`, `vite`, `@google/genai`, `multer`, `cheerio`, `rss-parser`, `sharp`, `lucide-react`, `gsap`, `motion`.
- **Existing Tests:** `src/utils/adminLogic.test.ts` (7 tests passing via `npx tsx --test`).
- **No Unnecessary Dependencies Required:** Phase 2 backend logic, cryptographic token generation/hashing, magic-byte inspection, pricing engine, state machine, Edge Functions, and automated test suite can be built cleanly with Web Standard APIs, Node built-ins (`node:test`, `node:assert`), and existing `@supabase/supabase-js`.

---

## 6. Missing Credentials, Unconfirmed Values & Blockers

| Item | Current Status | Impact |
| :--- | :--- | :--- |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | **Missing in workspace** | Blocks live remote `supabase db push`, live Storage bucket verification, and live Edge Function deployment. |
| `VITE_FIREBASE_*`, `FIREBASE_SERVER_KEY` | **Missing in workspace** | Blocks live Firebase hosting/analytics/FCM binding; Firebase Auth intentionally excluded. |
| `supabase` CLI / `deno` binary | **Not installed in container** | Blocks local `supabase start` / `deno test` execution inside container; mitigated by strict Deno-compatible TS + Node `tsx --test` execution of all shared modules & Edge Function handlers. |
| Exact Print Pricing Rates (INR) (`OD-08`) | **Unconfirmed by Owner** | Database schema and pricing engine implemented **without** invented INR rates; unconfigured pricing returns `PRICING_NOT_CONFIGURED`. |
| Production Customer Portal Domain (`OD-13`) | **Unconfirmed by Owner** | Configurable `CUSTOMER_PORTAL_URL` env/setting used; no domain invented. |
| Retention Policy Final Hours (`OD-15`) | **Proposed Defaults Only** | Configurable `print_retention_policies` table seeded with owner-reviewable defaults (`1h` draft, `24h` completed/rejected/cancelled, `72h` failed/needs_review) flagged as unconfirmed policy. |
| Physical Shop Printers (`OD-16`–`OD-18`) | **Unverified** | `print_devices` / `print_printers` tables created with capability fields defaulting conservatively without inventing printer models. |

---

## 7. Security Risks Identified Prior to Phase 2

1. **Dual Auth Confusion Risk:** Existing `server.ts` has local SQLite auth (`aman_session`) for Aman Computer CMS. AC Scan2Print must enforce **single-admin Supabase Auth JWT + `print_admin_accounts` server-side authorization** for all `print_*` tables and Edge Functions without allowing public signup or legacy SQLite session fallback on Supabase routes.
2. **Customer PII Exposure Risk:** Uploaded PDFs/images and UPI screenshots must live strictly in private Storage buckets (`print-uploads`, `payment-evidence`, `payment-assets`) with opaque UUID paths, magic-byte verification, and short-lived signed URLs—never public URLs.
3. **Payment Spoofing Risk:** Customers submitting UTRs or screenshots must never be trusted to set `payment_status = 'paid'`; only server-verified Admin calls may mark payments `paid`.
4. **Pricing & Page Count Tampering:** Client-submitted page counts or totals must be ignored; server inspection + `print_pricing_rules` (`per_physical_sheet` for duplex) must be the single authority.
5. **Tracking Token Enumeration:** Sequential `job_number` (`SC2P-...`) must never authorize job status lookup; 256-bit random tokens stored solely as SHA-256 hashes + constant-time comparison + rate limiting are mandatory.
6. **Duplicate Printing / Ambiguous Spooler State:** Atomic DB lease RPC + partial unique active attempt constraint + strict `needs_review` escalation prevent double physical prints.

---

## 8. File Impact Plan

### Files That Must Remain Untouched (Existing Dashboard Preservation)
- `src/App.tsx`, `src/components/Shell.tsx`, `src/components/Overlays.tsx`, `src/components/AnimatedControls.tsx`, `src/components/Charts.tsx`, `src/components/AuthScreen.tsx`
- `src/pages/*` (all existing Admin Dashboard pages)
- `src/context/AdminContext.tsx`, `src/data/seedData.ts`, `src/utils/adminLogic.ts`, `src/utils/animations.ts`, `src/index.css`
- `server.ts`, `data/aman.db`
- `docs/scan2print/PHASE_0_*`, `docs/scan2print/PHASE_1_PRODUCT_REQUIREMENTS.md`, `PHASE_1_UX_ARCHITECTURE.md`, `PHASE_1_USER_FLOWS.md`, `PHASE_1_JOB_STATE_MACHINE.md`, `PHASE_1_ROLE_PERMISSION_MATRIX.md`, `PHASE_1_ROUTE_ARCHITECTURE.md`, `PHASE_1_MVP_SCOPE.md`, `PHASE_1_ACCEPTANCE_CHECKLIST.md`

### Files Added / Modified in Phase 2
- `supabase/config.toml`
- `supabase/migrations/202611200001_scan2print_core_schema.sql`
- `supabase/migrations/202611200002_scan2print_rls_and_storage.sql`
- `supabase/migrations/202611200003_scan2print_atomic_rpcs.sql`
- `supabase/functions/_shared/*.ts` (authoritative pricing, state machine, security, PDF/magic-byte validation, types, handlers, DB adapter)
- `supabase/functions/<18 Edge Functions>/index.ts` (customer, admin, bootstrap, cleanup, and future device foundation)
- `tests/phase2/*.test.ts` (comprehensive security, RLS/authorization, pricing, state machine, token, upload, and all 20 negative tests)
- `.env.example` (adding Phase 2 Scan2Print variables without secrets)
- `package.json` (adding `"test:phase2"` script cleanly via `replace_file_content`)
- `docs/scan2print/PHASE_1_OPEN_DECISIONS.md` (decision register update reflecting owner-approved Phase 2 choices)
- `docs/scan2print/PHASE_2_*.md` (8 Phase 2 specification & verification reports)
