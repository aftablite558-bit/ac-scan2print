# AC Scan2Print (AMAN COMPUTER) — Smart QR Print System
## Phase 1: Role, Permission & Security Matrix

**Document Version:** 2.0 (Reconciled with Phase 0 Baseline & Fixed Owner Decisions)  
**Phase:** Phase 1 — Product Specification & UX Design (Documentation Only)  
**Date:** November 24, 2026  
**Status:** Approved Architecture

---

## 1. Actor Taxonomy & Single-Admin Architecture (Non-Negotiable)

Following explicit owner decisions and Phase 0 production reconciliation (`PRODUCTION_BASELINE.md`), the MVP architecture strictly enforces a **Single Super Admin Account model**. There are **no Staff, Operator, Manager, or Viewer sub-accounts** in MVP.

| System Actor | Identity Mechanism | Scope & Authorization |
| :--- | :--- | :--- |
| **Super Admin** (Singleton) | Firebase Auth UID `Yr0Wr7PuuAdOIMaqohmqaINNbNC2` | Sole human administrator. Full operational, financial, pricing, printer, device, and audit authority across the entire system. Verified via `print_admin_accounts` table and RS256 token validation. |
| **Print Device** (Windows Agent) | Windows 11 Local Print Agent device credential stored encrypted in Windows DPAPI | Local shop PC background service. Scoped strictly to heartbeat, printer telemetry synchronization, atomic job claiming for its assigned printers, and reporting spooler events. Zero access to unrelated jobs or admin settings. |
| **Customer** (Anonymous / Token) | Cryptographic 256-bit `tracking_token` (SHA-256 hash stored) | Public walk-in customer. Access scoped strictly to submitting a print job, uploading files to private draft storage, and reading sanitized status of own job via `tracking_token`. Zero access to other jobs, document URLs, or admin data. |

*(Note: Multi-role RBAC, Staff accounts, and Operator permissions are deferred to post-MVP Phase 12.)*

---

## 2. Definitive MVP Permission Matrix

Legend: **Y** = Permitted | **N** = Denied (Enforced at Edge Functions & PostgreSQL RLS)

| Functional Capability | Super Admin (`Yr0Wr7...`) | Print Device (Local Agent) | Customer (`tracking_token`) |
| :--- | :---: | :---: | :---: |
| **Customer Portal & Upload** |
| Access `/quick-print` & submit print job | Y | N | Y |
| Read own job status via `tracking_token` | Y | N | Y *(Sanitized)* |
| Access private document download URLs via tracking | N | N | **N (Strictly Denied)** |
| Enumerate other customer print jobs | N | N | **N (Strictly Denied)** |
| **Print Job Management** |
| List & search all print jobs | Y | N | N |
| Generate short-lived signed preview URL for documents | Y | N | N |
| Edit verified page count & print settings | Y | N | N |
| Approve / Hold / Reject job (with reason) | Y | N | N |
| Release approved job to Print Queue (`queued`) | Y | N | N |
| Cancel eligible pre-spooler job | Y | N | N |
| Retry confirmed `failed` job (`admin-retry-print-job`) | Y | N | N |
| Authorize Reprint (`needs_review` / `completed`) | Y *(Mandatory Reason)* | N | N |
| Mark `completed` after physical counter check | Y | N | N |
| Download customer files for printing | Y *(Emergency fallback)* | Y *(Only while lease active)* | N |
| **Payment & Financial Ledger** |
| View payment records & daily revenue totals | Y | N | Own status only |
| Verify customer UPI payment (review UTR / proof) | Y | N | N |
| Confirm Cash payment received at counter | Y | N | N |
| Auto-release verified UPI job to Queue | **System Rule** | N | N |
| Manual price override (with mandatory reason) | Y *(Mandatory Reason)* | N | N |
| Configure pricing rules (`print_pricing_rules`) | Y | N | N |
| **Printer & Agent Device Operations** |
| View connected printers & agent status | Y | N | N |
| Send test print to shop printer | Y | N | N |
| Enable / disable printer or override capabilities | Y | N | N |
| Approve new Windows Agent enrollment | Y | N | N |
| Pause / resume / revoke Windows Agent | Y | Own local tray pause | N |
| Send agent heartbeat & sync local printers | N | Y *(Active Device Only)* | N |
| Claim queued print job atomically | N | Y *(Active Device Only)* | N |
| Report Windows spooler job ID & completion | N | Y *(Active Device Only)* | N |
| **System Settings, QR & Audit** |
| View immutable audit trail (`print_events`) | Y | N | N |
| Edit or delete audit trail records | **N (Immutable)** | **N (Immutable)** | **N (Immutable)** |
| Generate & download counter QR poster | Y | N | N |
| Configure upload limits & file retention TTLs | Y | N | N |

---

## 3. Core Security & Authentication Controls

### 3.1 Admin Authentication & Verification
- **Identity Provider:** Firebase Authentication (Email/Password).
- **Server-Side Verification:** Supabase Edge Functions verify the Firebase ID token cryptographically using `jose`, RS256 algorithm, and Google's official JWKS endpoint (`https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com`).
- **Singleton Authorization Check:** After verifying the token signature, the backend validates that `token.sub` matches the active Super Admin record in `public.print_admin_accounts` where `is_active = true` and `role = 'super_admin'`.
- **Zero Frontend Secrets:** No Supabase `service_role` key or Firebase service account private key is ever exposed in frontend bundles.

### 3.2 Customer Tracking Authorization
- Cryptographic 256-bit unguessable random token generated upon job creation (`tracking_token`).
- Frontend receives `tracking_token` once in the creation response and stores it in client session storage.
- Backend stores **only** the cryptographic hash `SHA-256(tracking_token)` in `print_jobs.tracking_token_hash`.
- Public endpoint `get-print-job-status` accepts `token`, hashes it server-side, queries by hash, and returns sanitized status data.
- Sequential `job_number` (e.g., `AC-261124-001`) is human-readable for counter pickup, but **cannot** be used alone to fetch job status or metadata without the secret token.

### 3.3 Private Storage Access & Isolation
Direct public bucket access is disabled across all three Supabase Storage buckets:
1. `print-uploads` (Private, 20 MiB limit): Customer document files. Stored at path `jobs/{job_id}/{file_id}.{ext}`.
2. `payment-evidence` (Private, 10 MiB limit): Customer UPI screenshot proofs. Stored at path `proofs/{job_id}/{proof_id}.{ext}`.
3. `payment-assets` (Private, 5 MiB limit): Shop counter UPI QR code image and branding assets.

**Signed URL Lifetimes:**
- Upload Signed URLs: Exactly **120 seconds** validity.
- Admin Preview Signed URLs: Exactly **120 seconds** validity.
- Agent Download Signed URLs: Exactly **120 seconds** validity, issued only upon atomic lease acquisition.

### 3.4 Windows Agent Device Security
- No database credentials, service role keys, or Firebase keys are stored on the Windows shop PC.
- Agent enrolls via one-time pairing key approved by the Super Admin in `/admin/print-agents`.
- Agent receives an isolated device API token stored encrypted via **Windows Data Protection API (DPAPI)** in `%LocalAppData%\ACScan2Print\credentials.dat`.
- Revoking a device instantly invalidates its token in PostgreSQL, halting all job claims, heartbeats, and downloads immediately.
