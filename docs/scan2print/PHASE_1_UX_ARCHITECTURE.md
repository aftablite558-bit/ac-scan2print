# AC Scan2Print (AMAN COMPUTER) — Smart QR Print System
## Phase 1: Spatial Enterprise UX Architecture

**Document Version:** 1.0  
**Phase:** Phase 1 — Product Specification & UX Design (Documentation Only)  
**Date:** 20 November 2026  
**Sources of Truth:**
- `public/assets/aistudio/Aman_Computer_Smart_QR_Print_UI_UX_Specification_v1.0_61c997a6.md`
- `src/index.css`, `index.html`, `src/components/Shell.tsx`, `Overlays.tsx`, `AnimatedControls.tsx`, `Charts.tsx`, `src/utils/animations.ts`

---

## 1. Design Vision & Principles

**AC Scan2Print — Spatial Enterprise UI** merges the warm, tactile glassmorphism foundation of the existing Aman Computer Admin Dashboard with the operational clarity, restrained depth, and speed required for high-throughput print counter operations.

### Priority Hierarchy
1. **Enterprise Usability & Legibility First** (tables, file previews, amounts, status, errors).
2. **Meaningful Spatial Depth Second** (canvas → surface → elevated card → solid overlay/dialog).
3. **Brand Expression Third** (AC Scan2Print identity + Aman Computer workspace continuity).
4. **Motion & Decorative Effects Last** (purposeful state transitions only; never blocking tasks).

---

## 2. Brand Identity & Asset Usage Specification

### 2.1 Coexisting Brand Relationship
- **Aman Computer** is the parent print studio / business workspace (`AMAN COMPUTER — Admin Dashboard`).
- **AC Scan2Print** is the smart QR printing product operating inside Aman Computer's website and Admin Dashboard.

### 2.2 Official AC Scan2Print Color Specification
| Role | Hex | Usage |
| :--- | :--- | :--- |
| **Obsidian Black** | `#111318` | High-contrast dark surface anchors, black monochrome logo, dark poster headers, agent tray dark header |
| **Electric Cyan** | `#25C7D9` | AC Scan2Print product highlights, customer portal `/quick-print*` primary CTAs & progress indicators, QR poster accents, active print-stream indicators |
| **Pure White** | `#FFFFFF` | Light surfaces, high-contrast QR code quiet zones, white horizontal logo placement on dark surfaces |

### 2.3 Required AC Scan2Print Brand Asset Package (Inspection Status)
A full inspection of `/public` and `/src` confirms **the 6 binary/SVG AC Scan2Print logo files are NOT yet present in the repository**:

| Required Asset | Target Placement | Repository Inspection Status |
| :--- | :--- | :--- |
| 1. **Primary Horizontal Logo** | `/quick-print` light header, QR poster light header, login light screen | **Missing from repo — must be supplied by owner (do NOT redraw/fabricate)** |
| 2. **White Horizontal Logo** | Dark Admin sidebar/module header, dark QR poster variant, dark splash/tray header | **Missing from repo — must be supplied by owner** |
| 3. **Black Monochrome Logo** | Thermal/B&W printable receipts or monochrome poster headers | **Missing from repo — must be supplied by owner** |
| 4. **Primary AC Monogram** | Collapsed Admin sidebar rail (`84px` width), compact mobile customer header, Print Agent tray header | **Missing from repo** *(currently `Shell.tsx` renders CSS `"A"` tile for Aman Computer)* |
| 5. **Application Icon** | Windows 11 Local Print Agent installer/executable icon, PWA/desktop app icon | **Missing from repo — must be supplied by owner** |
| 6. **Favicon** | Browser tab icon (`index.html`) across Admin Dashboard & `/quick-print` | **Missing from repo — must be supplied by owner** |

### 2.4 Existing Token Preservation & Coexistence Strategy (`src/index.css`)
- **Existing Verified Tokens Preserved Unchanged:**
  - Font: `"Urbanist", system-ui, -apple-system, "Segoe UI", sans-serif` (`index.html`), `.tabular-nums` mandatory for all currency, page counts, timestamps, spooler IDs, and KPI metrics.
  - Light / Dark Theme Architecture (`[data-theme="dark"]` & `:root`), Wallpaper backdrop (`/photos/wallpapers/wall-dusk.jpg`, `wall-street.jpg`, `wall-room.jpg`), `--frost`, `--blur: 26px`, `--r-sm: 10px`, `--r-md: 14px`, `--r-lg: 22px`, `--r-xl: 28px`.
  - Semantic hues: `--good` (`#126b45` / `#74dca8`), `--warn` (`#855400` / `#f2c26b`), `--bad` (`#b3261e` / `#ff978c`), `--info` (`#1c5a9e` / `#8cc7ff`).
  - Existing Workspace Accent: `--accent: #f07a2e` (Light) / `#ff8c42` (Dark).
- **Token Reconciliation Decision (Marked in `PHASE_1_OPEN_DECISIONS.md`):**
  - Keep existing `src/index.css` palette intact for the Admin `Shell` so no existing visual system breaks, while introducing semantic AC Scan2Print tokens (`--ac-obsidian: #111318`, `--ac-cyan: #25C7D9`, `--ac-white: #FFFFFF`) for the **Customer Portal (`/quick-print*`)**, **QR Poster artwork**, **Print Agent UI**, and **AC Scan2Print module badges** — OR seek owner confirmation if Admin `--accent` should also shift to Electric Cyan `#25C7D9`.

---

## 3. Spatial Depth & Material Layering Rules

Following UI/UX Spec §3.1–3.3, surfaces follow a strict 5-layer depth model:

| Depth Layer | Surface Treatment | Existing Repo Class / Token | Where Used |
| :-: | :--- | :--- | :--- |
| **1. Base Canvas** | Static/subtle backdrop | Wallpaper + `--wash` (Admin); Solid `--bg` / `#111318` or clean `#F7F9FB` (Customer `/quick-print`) | Root viewport |
| **2. Navigation & Frame** | Selective translucent glass | `.glass-pane` | Admin `Shell.tsx` desktop sidebar, sticky topbar |
| **3. Operational Content** | **High-contrast solid/semi-opaque surfaces** | `--glass-solid` / solid card fill | **Print Jobs table, Print Queue, Job Detail preview, Payment ledger, Pricing rules, Audit logs** |
| **4. Contextual Overlays** | High-contrast elevated modal/popover | `.glass-solid` + scrim | `Overlays.tsx` dialogs, Confirm Price/Payment/Reject/Reprint modals, Notifications popover |
| **5. Temporary Focus** | Micro-feedback / toast / active pill | `.snav__pill`, `AnimatedToast` | Active nav indicator, validation feedback, upload progress |

**Strict Anti-Clutter Guardrails:**
- **Never** render dense data tables, document previews, or financial numbers directly over transparent glass where wallpaper patterns reduce contrast.
- **Never** stack translucent glass over another translucent glass panel.
- **Never** add decorative 3D printer scenes or floating cards.

---

## 4. Existing Reusable Component Mapping (No Duplicate Systems)

| UI Need | Existing Component to Reuse | Proposed Extension (Phase 3–4) |
| :--- | :--- | :--- |
| Admin App Frame | `Shell.tsx` | Extend `navGroups` with grouped Print Operations / Finance / Management / Insights sections; enforce permission visibility |
| Section Sub-tabs | `AnimatedControls.tsx` (`TabsNav`, `SegControl`) | Use for `SettingsPage` tabs, Job Detail tabs (Files/Timeline/Attempts), Reports period switcher |
| Modals & Toasts | `Overlays.tsx` (`DialogWrap`, `SearchModal`, `AnimatedToast`) | Extend with Confirmation dialogs (Approve, Reject with reason, Verify UPI, Revoke Device, Reprint with reason) & `⌘K` search for Jobs/Printers |
| Analytics Charts | `Charts.tsx` (`Sparkline`, `LiveBarsChart`, `RingProgress`, `SimpleBarChart`, `StackedAreaChart`) | Reuse in `/admin/reports` and `/admin/print-management` for real job volume & B&W/Colour splits |
| Motion Utilities | `animations.ts` | Use restrained `revealCards`, `revealRows`, `popIcon`, `performThemeTransition`; **skip heavy character splits on dense operational tables** and **exclude GSAP from `/quick-print` customer bundle** |
| Icons | `lucide-react` (`^0.546.0`) | Single icon family (`1.75–2px` stroke) paired with explicit text labels |

---

## 5. Semantic Status & Accessibility Specification

### 5.1 Status Badge Treatment (Color + Icon + Text Mandatory)
Every job, payment, and device state maps to a deterministic badge `(semantic hue token + Lucide icon + concise label)`:
- **Neutral (`--muted`):** `draft`, `expired`, `unknown`
- **Info (`--info` / `--ac-cyan`):** `submitted`, `under_review`, `approved`, `queued`, `claimed`, `downloading`, `printing`, `submitted_to_spooler`
- **Warning (`--warn`):** `awaiting_payment`, `needs_review` *(high-visibility warning border + AlertTriangle icon)*, `paused`
- **Success (`--good`):** `completed`, `paid`, `active` / `online`
- **Danger (`--bad`):** `failed`, `rejected`, `cancelled`, `offline`, `revoked`

### 5.2 Accessibility (WCAG 2.2 AA) & Motion Restraint
- Keyboard navigation across all sidebar links, table rows, action menus, and modal focus traps (`Esc` closes modals, focus returns to trigger).
- Minimum `44×44px` touch targets on `/quick-print*` and mobile admin controls.
- Persistent form labels (never placeholder-only inputs) and explicit `aria-describedby` error text.
- `prefers-reduced-motion: reduce` disables parallax, iris clip-path animations, and bell wobbles while preserving instant state feedback and upload progress bars.

---

## 6. Responsive Strategy Across Breakpoints

| Breakpoint | Admin Dashboard (`Shell.tsx`) | Customer Portal (`/quick-print*`) |
| :--- | :--- | :--- |
| **Desktop (`>= 1280px`)** | Persistent `252px` (or `84px` collapsed) sidebar, multi-column KPI row, full operational tables, 2-column Job Detail (Document Preview left + Controls/Timeline right). | Centered max-width (`560px–680px`) clean card step flow — never stretched across ultrawide screens. |
| **Laptop (`1024px–1279px`)** | Collapsible sidebar (`[`), compact table columns with horizontal scroll guard, side-by-side Job Detail. | Same clean centered step container. |
| **Tablet (`768px–1023px`)** | Collapsible rail / drawer, 2-column KPI grid, stacked Job Detail (Preview above Actions). | Full-width comfortable touch card. |
| **Mobile (`< 768px`)** | Operational fallback: Bottom dock + Drawer (`Shell.tsx`), card-list view replacing wide tables, sticky bottom primary job action bar, zero hover-only actions. | **Primary target:** Single-column mobile-first flow, large dropzone/file picker button, thumb-friendly segmented options, minimal payload (`< 150 KB` initial route chunk goal). |
