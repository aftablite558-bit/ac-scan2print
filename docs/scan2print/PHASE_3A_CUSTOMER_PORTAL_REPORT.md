# AC Scan2Print — Phase 3A Customer Portal Report (Frontend Only)

## 1. Architecture & Isolation Overview

The Customer Portal (`customer-portal/`) is implemented as an **isolated standalone React + Vite + Tailwind v4 SPA**, separate from the Admin Dashboard (`src/`), Express dev server (`server.ts`), and Phase 2 Supabase backend (`supabase/`):

- **Separate Entry & Build Output**: `customer-portal/index.html` + `customer-portal/vite.config.ts` build into `dist-customer/`.
- **Separate Firebase Hosting Config**: `customer-portal/firebase.json` and `customer-portal/.firebaserc.example` configure SPA rewrites (`** -> /index.html`), cache headers, and `Referrer-Policy: no-referrer` so private `?token=` links are never leaked via referrer headers.
- **Zero Admin Dashboard Coupling**: Verified that `customer-portal/` imports zero modules from `src/` and `src/` / `supabase/` remain completely untouched.
- **Authoritative Spec Alignment**: Built directly against `Aman_Computer_Smart_QR_Print_UI_UX_Specification_v1.0_61c997a6.md`, `PHASE_1_ROUTE_ARCHITECTURE.md`, `PHASE_1_UX_ARCHITECTURE.md`, `PHASE_2_API_CONTRACT.md`, and `PHASE_2_PAYMENT_WORKFLOW.md`.

---

## 2. Implemented Routes & Screens

| Route | Component | Purpose |
| --- | --- | --- |
| `/quick-print` | `PrintHomePage` | Hero, above-the-fold `Upload Document` & `Track Job` CTAs, file/size limits, 4-step workflow guide, privacy & retention notice |
| `/quick-print/upload` | `UploadPage` | Drag-and-drop & mobile file picker (`.pdf`, `.jpg`, `.jpeg`, `.png`, max 5 files, 20 MB/file), MIME/extension check, progress bar, retry/remove controls |
| `/quick-print/options` | `OptionsAndPaymentPage` | Print colour mode, paper size, single/double-sided, copies (`1–20`), custom page range (`1-3, 5` validation), orientation, scaling, optional pickup name/phone, live Price Summary (`Estimated total only`), UPI QR / UTR / optional screenshot or Cash at Counter selection, final review |
| `/quick-print/success` | `ConfirmationPage` | Job number, customer-safe status badge, counter next-step callout, private copyable tracking link & token, reload-safe idempotent confirmation (`sessionStorage`) |
| `/quick-print/track` | `TrackingPage` | Private tracking-token lookup (`?token=` or manual entry), quick session job chips, 6-stage progress timeline, customer-safe job summary (file names only, zero public download URLs) |
| `/quick-print/help` | `HelpPage` | Searchable FAQ accordion covering formats, limits, estimates, UPI/cash verification, tracking tokens, and upload troubleshooting |

---

## 3. File Inventory (`customer-portal/`)

- **Build & Hosting Config**:
  - `customer-portal/index.html`
  - `customer-portal/tsconfig.json`
  - `customer-portal/vite.config.ts`
  - `customer-portal/firebase.json`
  - `customer-portal/.firebaserc.example`
- **Design System & Types**:
  - `customer-portal/src/styles/portal.css` (Obsidian `#111318`, Electric Cyan `#25C7D9`, Pure White `#FFFFFF`, Urbanist typography, light/dark themes, 44px minimum touch targets, `tabular-nums`, `prefers-reduced-motion`)
  - `customer-portal/src/types/portal.ts` (aligned 1:1 with `supabase/functions/_shared/types.ts`)
- **Pure Logic & Pre-Validation**:
  - `customer-portal/src/lib/validation.ts` (`validateClientDocumentFile`, `validateClientEvidenceFile`, `validateUtrInput`, `validateOptionalPhone`, `parseCustomPageRange`, `estimateDocumentPageCountFromFile`, `formatFileSize`)
  - `customer-portal/src/lib/pricing.ts` (`parseCustomerRoute`, `calculatePhysicalSheets`, `calculateEstimateBreakdown`, `formatInr`, `getCustomerSafeStatusMeta`, `buildCustomerTrackingTimeline`)
- **API Adapter Layer**:
  - `customer-portal/src/api/CustomerPortalAdapter.ts` (Phase 2 contract interface)
  - `customer-portal/src/api/mockCustomerAdapter.ts` (Phase 3A development preview adapter with sample QR SVG preview, idempotency deduplication, UTR uniqueness check, custom page range calculation, and strict `pending_verification` / `submitted` safety — never auto-verifies payment or marks physical print completed)
  - `customer-portal/src/api/supabaseCustomerAdapter.ts` (Phase 3B integration shell targeting `create-print-job`, `create-print-upload-url`, signed storage upload, `finalize-print-upload`, `get-public-payment-settings`, `submit-upi-payment`, `get-print-job-status`)
- **State, UI Components & Pages**:
  - `customer-portal/src/context/PortalContext.tsx`
  - `customer-portal/src/components/BrandMark.tsx`
  - `customer-portal/src/components/PortalLayout.tsx`
  - `customer-portal/src/components/WorkflowStepper.tsx`
  - `customer-portal/src/components/StatusBadge.tsx`
  - `customer-portal/src/components/LoadingEmptyError.tsx`
  - `customer-portal/src/pages/PrintHomePage.tsx`, `UploadPage.tsx`, `OptionsAndPaymentPage.tsx`, `ConfirmationPage.tsx`, `TrackingPage.tsx`, `HelpPage.tsx`
  - `customer-portal/src/App.tsx`, `customer-portal/src/main.tsx`

---

## 4. Official Brand Asset Placement

No binary or SVG logo assets exist in the repository yet. To display the official horizontal logo image without substituting the parent Aman Computer orange `'A'` badge:

1. Place the official PNG/SVG logo at `customer-portal/public/assets/brand/ac-scan2print-horizontal.png`.
2. Set `VITE_CUSTOMER_BRAND_LOGO_URL=/assets/brand/ac-scan2print-horizontal.png` in the customer portal environment configuration.
3. Until configured, `BrandMark.tsx` renders an Obsidian `#111318` + Electric Cyan `#25C7D9` typographic lockup with zero missing-asset 404 requests.

---

## 5. Phase 3B Readiness Checklist (Not Yet Executed)

Phase 3A strictly stops at verified frontend UI/UX with `MockCustomerPortalAdapter`:
- Wire `PortalContext.tsx` to select `SupabaseCustomerPortalAdapter` when live Supabase functions and `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` are enabled.
- Add public Edge Function endpoint (if needed) to expose active `pricing_rules` & portal limits without authentication, replacing `DEFAULT_MOCK_CAPABILITIES`.
- Deploy `dist-customer/` to its dedicated Firebase Hosting target (`customer-portal/firebase.json`) once Phase 3B integration testing completes.
