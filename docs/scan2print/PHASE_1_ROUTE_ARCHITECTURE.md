# AC Scan2Print (AMAN COMPUTER) — Smart QR Print System
## Phase 1: Routing & Integration Architecture

**Document Version:** 1.0  
**Phase:** Phase 1 — Product Specification & UX Design (Documentation Only)  
**Date:** 20 November 2026  

---

## 1. Inspection of Existing Routing (`src/utils/adminLogic.ts` & `src/App.tsx`)

- **Current Mechanism:** Hash-based routing (`window.location.hash`) parsed by `parseHash(hash)` (`src/utils/adminLogic.ts:22-36`).
- **Existing Valid Routes:**
  - `#/home` → `OverviewPage`
  - `#/settings/{business|team|appearance|alerts|data}` → `SettingsPage`
  - `#/help` → `HelpPage`
- **Current Conflict Behavior:**
  1. Any root URL `/` or unrecognized path redirects silently to `#/home` (`OverviewPage`) via `parseHash()` default fallback and `AdminContext.tsx:134-136`.
  2. There is no authentication gate on `/` — loading the domain immediately opens the Admin Dashboard.
  3. Permanent QR codes on physical posters **must not** encode hash fragments (`#/quick-print`) or point to an admin route.

---

## 2. Hash Routing vs Path Routing Comparison

| Criterion | Hash Routing (`#/...`) | Path Routing (`/quick-print`, `/admin/...`) |
| :--- | :--- | :--- |
| **Permanent QR Poster URL** | Fragile (`https://domain/#/quick-print`), awkward on mobile scanners, stripped by some redirects/analytics | Clean, standard (`https://domain/quick-print`) as required by Roadmap §1.2 & §12 |
| **Public Website Integration** | Difficult to mount cleanly inside a separate Aman Computer public website | Standard — `/quick-print*` mounts naturally as public routes on Aman Computer's domain |
| **Deep Linking (`/admin/print-jobs/:jobId` & `/quick-print/track?token=...`)** | Awkward query/hash mixing (`#/quick-print/track?token=...`) | Clean query params & nested params (`useParams` / `URLSearchParams`) |
| **SEO / OpenGraph Meta / Fast Split Bundle** | Single entry HTML shares metadata and JS | Allows code-splitting public `/quick-print*` lightweight bundle completely apart from `/admin/*` |
| **Hosting Rewrite Requirement** | Works without server rewrite | Requires standard SPA fallback rewrite (`/* -> /index.html` 200) on Firebase Hosting / Vercel / Nginx |

**Recommendation:** Adopt **Path-Based Routing (Browser History API / React Router)** as the target production routing architecture in Phase 2/3, while preserving automatic client-side redirects for legacy bookmarks (`#/home` → `/admin/overview`, `#/settings/:tab` → `/admin/settings/:tab`, `#/help` → `/admin/help`).

---

## 3. Target Route Map & Separation Architecture

### 3.1 Public Customer QR Portal Routes (External Target: Aman Computer Public Website)
*Lightweight mobile-first shell — zero Admin `Shell.tsx`, zero GSAP wallpaper stack, zero admin bundle dependencies.*
- `/quick-print` — Print Home (QR landing destination)
- `/quick-print/upload` — File Upload & Server Validation *(or step 1 inside `/quick-print`)*
- `/quick-print/options` — Print Options & Server Price Estimate *(or step 2)*
- `/quick-print/success` — Idempotent Confirmation + Job ID + Tracking Link
- `/quick-print/track` — Secure Job Tracking (`?token=<tracking_token>` or path token)
- `/quick-print/help` — Customer Help, Limits & Shop Contact

### 3.2 Protected Admin Routes (Current Repository: AC Scan2Print Admin Dashboard)
*Protected by `RequireAuth` + `RequirePermission` guard; redirects unauthenticated visitors to `/admin/login`.*
- `/admin/login` — Staff Email/Password login & forgot-password reset flow (no public signup)
- `/admin/overview` *(alias/preserved from `#/home`)* — Existing Workspace Overview (`OverviewPage.tsx`)
- `/admin/print-management` — Smart Print Operational Dashboard (KPIs, Live Status, Quick Queue)
- `/admin/print-jobs` — Print Jobs Table & Search/Filters
- `/admin/print-jobs/:jobId` — Single Print Job Detail, Private Preview, Pricing, Payment & Actions
- `/admin/print-queue` — Active Agent/Spooler Queue Monitor
- `/admin/printers` — Discovered Printers & Capability Profiles
- `/admin/print-agents` — Windows 11 Local Print Agent Devices & Enrollment
- `/admin/payments` — Cash & Manual UPI Payment Ledger
- `/admin/pricing` — Server-Side Pricing Rules & Test Calculator
- `/admin/customers` — *(Optional / hidden in MVP)*
- `/admin/staff` — Staff & RBAC Permissions *(replaces/upgrades `#/settings/team`)*
- `/admin/qr-management` — Permanent QR Verification, Export & Poster Generator
- `/admin/reports` — Operational & Revenue Reports (`Charts.tsx`)
- `/admin/notifications` — Operational Alerts Feed
- `/admin/activity-logs` — Immutable Read-Only Audit Trail
- `/admin/settings` *(with existing tabs `business`, `appearance`, `alerts`, `data` + new `print-defaults`, `upload-limits`, `retention`)* — Reconciles existing `SettingsPage.tsx` without duplicating settings pages
- `/admin/help` *(preserved from `#/help`)* — Operator & Admin Help (`HelpPage.tsx`)

### 3.3 Legacy Hash & Root `/` Preservation Rules
- Opening `/` on the **Admin-only origin** (before integration with the Aman Computer public website):
  - If authenticated → navigate to `/admin/print-management` (or `/admin/overview`).
  - If unauthenticated → navigate to `/admin/login` (while allowing `/quick-print*` directly for testing/QR verification).
- Opening `/` on the **Integrated Aman Computer Public Website**:
  - `/` renders the Aman Computer public homepage (external website, untouched by this repo).
  - `/quick-print*` renders the Customer QR Portal.
  - `/admin/*` renders the protected Admin Dashboard.
- Legacy hashes (`#/home`, `#/settings/appearance`, `#/help`) map deterministically to `/admin/overview`, `/admin/settings/appearance`, `/admin/help` once authenticated.

---

## 4. Deployment & Hosting Requirements (No Migration Executed in Phase 1)

1. **Hosting Rewrites:** Production static/SPA host (e.g., Firebase Hosting, Vercel, Cloudflare Pages, or Nginx) must serve `index.html` for all `/quick-print/*` and `/admin/*` paths so mobile deep links (`/quick-print/track?token=...`) and admin refreshes (`/admin/print-jobs/<uuid>`) never return `404`.
2. **Public Website Integration Options (Confirm in Phase 1/2):**
   - **Option A (Single Domain — Recommended by Roadmap §12):** `https://<amancomputer-domain>/quick-print` and `/admin/*` served under one primary domain (via shared Vite/React build integration or reverse-proxy path routing to the Admin/Print SPA). Ensures zero CORS friction and simple QR URL.
   - **Option B (Subdomain Split):** `https://print.<domain>/quick-print` (or website `/quick-print`) + `https://admin.<domain>/admin/*`. Both share the exact same Supabase Project backend, Storage, and Edge Functions.
3. **Code-Splitting Requirement:** In Phase 3+, `/quick-print*` must use `React.lazy` dynamic imports so customer mobile browsers never download Admin Dashboard GSAP, chart, or wallpaper modules.
