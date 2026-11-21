# AC Scan2Print (AMAN COMPUTER) — Smart QR Print System
## Phase 1: Role, Permission & Security Matrix

**Document Version:** 1.0  
**Phase:** Phase 1 — Product Specification & UX Design (Documentation Only)  
**Date:** 20 November 2026  

---

## 1. Role Taxonomy Reconciliation (Requires Owner Confirmation)

Inspection of `src/types/admin.ts:8` (`TeamRole`) vs Roadmap §4 shows two naming conventions that must be reconciled without creating duplicate RBAC systems:

| Existing Repo Role (`src/types/admin.ts`) | Roadmap §4 / §23 Role | Proposed Unified Mapping | Confirmation Status |
| :--- | :--- | :--- | :---: |
| `Owner` | `Admin` / Super Admin | **Owner** (full business, staff, RBAC, pricing, device, retention & financial authority) | **Proposed — Confirm with Owner** |
| `Manager` | `Admin` (Daily Ops) | **Manager** (full print operations, pricing rules, printer/device management, reports; cannot demote/delete Owner) | **Proposed — Confirm with Owner** |
| `Staff` | `Operator` | **Staff / Operator** (counter operations: preview, verify pages, confirm cash/UPI, approve/reject/release jobs, handover; restricted from system/staff deletion) | **Proposed — Confirm with Owner** |
| `Viewer` | Read-only Observer | **Viewer** (read-only dashboards/reports; **must NOT preview customer PII documents by default** unless explicitly enabled) | **Proposed — Confirm with Owner** |
| *(new)* | `Device identity` | **Print Device** (Windows 11 Local Print Agent credential; scoped strictly to its approved printers & leased jobs) | **Required by Roadmap §4.4** |
| *(new)* | `Customer` | **Customer (Anonymous)** (no account; authorized per-job solely via unguessable `tracking_token`) | **Required by Roadmap §4.1** |

---

## 2. Granular Permission Matrix

Legend: **Y** = Permitted | **C** = Conditional / Configurable (requires owner decision) | **N** = Denied (enforced via RLS + Edge Functions)

| Capability / Action | Owner | Manager | Staff / Operator | Viewer | Print Device | Customer (Token) |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **Customer Portal & Submission** |
| Open `/quick-print`, upload files, estimate price, submit | Y | Y | Y | Y | N | Y |
| View own job status via `tracking_token` | N/A | N/A | N/A | N/A | N/A | Y *(metadata only)* |
| Enumerate other jobs or download private docs via tracking | **N** | **N** | **N** | **N** | **N** | **N (Strictly Denied)** |
| **Print Jobs & Document Access** |
| List & search print jobs, view job metadata | Y | Y | Y | Y | N *(own claimed only)* | N |
| Preview private customer documents (signed URL) | Y | Y | Y | **N** *(default)* | N *(download on claim only)* | N |
| Edit verified page count / adjust print settings | Y | Y | Y | N | N | N |
| Approve / Hold / Reject job (with reason) | Y | Y | Y | N | N | N |
| Release approved job to Print Queue | Y | Y | Y | N | N | N |
| Cancel eligible pre-spooler job | Y | Y | **C** | N | N | **C** *(owner rule)* |
| Retry confirmed `failed` job | Y | Y | Y | N | N | N |
| Authorize **Reprint** (`needs_review` / `completed`) | Y | Y | **C** | N | N | N |
| Mark `completed` / Customer Handover | Y | Y | Y | N | Y *(spooler/driver)* | N |
| Manual fallback download & print | Y | Y | **C** | N | N | N |
| **Payments & Pricing** |
| View payment records | Y | Y | Y | Y | N | Own confirmed status only |
| Confirm Cash received | Y | Y | Y | N | N | N |
| Manually verify UPI payment | Y | Y | Y | N | N | N |
| Record refund / payment correction | Y | **C** | **N** | N | N | N |
| Override calculated price (with reason) | Y | Y | **C** | N | N | N |
| Create / edit / toggle Pricing Rules | Y | **C** | **N** | N | N | N |
| **Printers & Local Print Agents** |
| View printers & device heartbeat status | Y | Y | Y | Y | N | N |
| Run test print via agent | Y | Y | Y | N | N | N |
| Enable/disable printer, edit capabilities/default | Y | Y | **N** | N | N | N |
| Approve or Revoke Print Agent device | Y | **C** | **N** | N | N | N |
| Pause / Resume Print Agent | Y | Y | **C** | N | Own tray pause | N |
| Agent heartbeat, printer sync, atomic claim, report event | N | N | N | N | **Y (Active Device Only)** | N |
| **Administration, QR, Reports & Security** |
| View & export Reports / Analytics | Y | Y | **C** | Y *(non-PII)* | N | N |
| View Activity Logs (read-only) | Y | Y | Own/Job | **C** | N | N |
| Edit/Delete Activity Logs | **N** | **N** | **N** | **N** | **N** | **N** |
| Generate/Download QR & Posters | Y | Y | Y *(view/dl)* | N | N | N |
| Change QR target production URL / Retention / Upload limits | Y | **N** | **N** | N | N | N |
| Invite / deactivate Staff & assign roles/permissions | Y | **C** *(non-Owner)* | **N** | N | N | N |

---

## 3. Authentication, Authorization & Security Controls

### 3.1 Admin Authentication & Route Protection
- **Primary Auth:** Supabase Auth (Email + Password; password reset via secure token; **zero public registration**).
- **Bootstrap:** Secure initial Owner/Super Admin provisioning (one-time setup or CLI/admin provisioning; never hardcode credentials in client source).
- **Route Guards:** Every `/admin/*` route checks authenticated Supabase session + active staff record + role permission before rendering; every Supabase table and Edge Function enforces authorization independently via JWT + Postgres RLS.

### 3.2 Customer Tracking Authorization
- `create-print-job` + `finalize-print-upload` generates a 256-bit random cryptographic `tracking_token`, returns it once to the customer browser, and stores **only** `SHA-256(tracking_token)` (`tracking_token_hash`) in `print_jobs`.
- `get-print-job-status` accepts `tracking_token`, hashes it server-side, returns sanitized status/summary/final-price-if-approved, and returns a generic `404/403` on mismatch. Sequential `job_number` alone **never** grants access.

### 3.3 Private Document Access & Storage Security
- Bucket `print-uploads` is **100% private** (`public = false`).
- Storage object keys use opaque UUID paths (`jobs/{job_uuid}/{file_uuid}`), never raw customer filenames.
- Customer upload receives a short-lived signed upload URL scoped strictly to that draft path.
- Admin preview signed URLs (`60–120s` expiry) are issued only by server Edge Function after verifying caller role (`Owner`, `Manager`, `Staff/Operator`) and logging preview access if required.
- Agent file download signed URLs (`60–120s` expiry) are generated only inside `agent-claim-job` for the exact device holding an active, unexpired lease on that job.

### 3.4 Device Authorization (Windows 11 Local Print Agent)
- Zero `service_role` keys inside the `.NET 8` binary, installer, or config files.
- Each installation receives an individual revocable device credential during admin-approved enrollment (`agent-enroll`).
- Credential is encrypted on the shop PC using Windows DPAPI (`ProtectedData`).
- Revoking a device (`print_devices.status = 'revoked'`) immediately blocks `agent-heartbeat`, `agent-sync-printers`, `agent-claim-job`, and `agent-report-job-event` at the Edge Function layer.

### 3.5 Mandatory Audit Logging (`print_events` & Staff Audit)
Backend-only inserts (immutable from client UI) record actor ID, role/type, IP/device ID where appropriate, old state → new state, reason, and safe metadata for:
- Job creation, validation failure, approval, hold, rejection, cancellation, queue release.
- Price calculation, final confirmation, and manual price override (with mandatory reason).
- Payment confirmation (Cash / manual UPI + transaction reference).
- Print claim, spooler submission (`windows_spooler_job_id`), failure, `needs_review`, manual completion, and **authorized reprint** (with reason).
- Device enrollment approval/pause/revocation, printer enable/disable/capability override.
- Staff creation, role change, deactivation, and retention/pricing/system settings updates.
- **Redaction Rule:** Audit logs and notifications must **never** store document contents, raw customer files, signed URLs, or credentials.
