# AC Scan2Print (AMAN COMPUTER) — Smart QR Print System
## Phase 1: Job, Attempt & Device State Machines

**Document Version:** 2.0 (Reconciled with Phase 0 Baseline & Fixed Owner Decisions)  
**Phase:** Phase 1 — Product Specification & UX Design (Documentation Only)  
**Date:** November 24, 2026  
**Status:** Approved Specification  
**Authority:** Technical Roadmap v1.1 Section 9 & Production Database Schema

---

## 1. Complete Canonical Job States (16 States)

The database table `public.print_jobs` utilizes the `job_status` enum. All 16 canonical states are strictly defined below, alongside their customer-facing tracking label, operational meaning, and authoritative actor:

| Canonical `status` | Customer-Facing Tracking Label | Operational Meaning | Authoritative Actor |
| :--- | :--- | :--- | :--- |
| `draft` | Upload in Progress | Customer initialized upload session; files uploading to private storage. | Customer / Client |
| `submitted` | Request Submitted | Upload finalized; job registered in system; awaiting counter intake. | Customer (`finalize-print-upload`) |
| `under_review` | Under Review | Super Admin opened job; inspecting document preview and settings. | Super Admin |
| `awaiting_payment` | Awaiting Payment | Price confirmed; waiting for customer UPI UTR verification or cash at counter. | Super Admin |
| `approved` | Approved | Settings & price confirmed; approved for print release. | Super Admin |
| `queued` | Queued for Print | Released to active printer queue; eligible for Local Print Agent claim. | System (UPI) / Super Admin (Cash) |
| `claimed` | Preparing Print | Print Agent acquired exclusive 120-second lease (`lease_expires_at`). | Windows Print Agent |
| `downloading` | Downloading Files | Print Agent downloading private files via short-lived signed URLs. | Windows Print Agent |
| `printing` | Rendering & Spooling | Agent rendering PDF/images and submitting to Windows Print Spooler. | Windows Print Agent |
| `submitted_to_spooler` | Submitted to Printer | Windows Spooler accepted job (`windows_spooler_job_id` recorded). | Windows Print Agent |
| `completed` | Ready for Collection | Physical output printed cleanly and confirmed at counter. | Agent / Super Admin |
| `failed` | Print Failed | Confirmed pre-spooler failure (corrupt file, driver error, printer offline). | Agent / System |
| `needs_review` | Checking Print Output | Ambiguous post-spooler outcome (crash, timeout, paper jam). Auto-reprint blocked! | System Sweeper |
| `rejected` | Request Rejected | Super Admin declined job with mandatory recorded reason. | Super Admin |
| `cancelled` | Cancelled | Job cancelled prior to printing. | Customer / Super Admin |
| `expired` | Session Expired | Stale unsubmitted draft or uncollected job exceeded retention lifetime. | System Cleanup Cron |

---

## 2. Orthogonal Payment State Machine (`payment_status`)

Payment state is tracked independently from job processing state to maintain absolute financial accounting accuracy:

| `payment_status` | Operational Definition | Allowed Transition Trigger |
| :--- | :--- | :--- |
| `unpaid` | No payment received yet (default for cash or initial upload). | Initial creation or cash option selected. |
| `pending_verification` | Customer submitted 12-digit UTR or screenshot proof via UPI. | Customer submitted UPI details in Customer Portal. |
| `paid` | Payment verified in shop bank account or cash received in hand. | Super Admin clicks "Verify UPI" or "Confirm Cash". |
| `refunded` | Payment returned/reversed (only if authorized by Super Admin). | Super Admin records refund in payment ledger. |

---

## 3. Formal Job State Transition Matrix

```text
[draft] ──(finalize upload)────────────────────────► [submitted]
   │                                                      │
   └──(TTL 1h)──► [expired]                               ▼
                                                    [under_review]
                                                     │    │    │
                    (reject w/ reason)───────────────┘    │    └─(cancel)─► [cancelled]
                       ▼                                  │
                   [rejected]                             ▼
                                                    [awaiting_payment]
                                                      │           │
                                       (Cash confirm) │           │ (UPI verified:
                                                      ▼           │  auto-release)
                                                  [approved]      │
                                                      │           │
                                       (Admin release)│           │
                                                      ▼           ▼
                                                  [queued] ◄──────┘ ◄───(retry from failed)
                                                      │
                                                      ▼
                                                  [claimed] ──(lease timeout pre-spooler)──► [queued] / [failed]
                                                      │
                                                      ▼
                                                [downloading] ──(checksum error)──────────► [failed]
                                                      │
                                                      ▼
                                                 [printing] ──(driver / offline error)────► [failed]
                                                      │
                                                      ▼
                                            [submitted_to_spooler] ──(crash / timeout)────► [needs_review]
                                                      │                                           │
                                                      │                               (paper jam/ │ (tray OK)
                                       (spooler done) │                               reprint)    ▼
                                                      ▼                                ┌───► [completed]
                                                 [completed]                           │
                                                      │                                │
                                                      └───(reprint w/ reason)──────────┴───► [queued]
```

### Complete Transition Guard Table

| Current State | Target State | Permitted Actor | Mandatory Guards & Preconditions | Side Effects & Audit Events |
| :--- | :--- | :--- | :--- | :--- |
| `(none)` | `draft` | Customer | File metadata valid; generates temporary `job_id` and signed upload URL. | Storage folder created in `print-uploads`. |
| `draft` | `submitted` | Customer | `>= 1` uploaded file exists; magic bytes valid; page count verified; `idempotency_key` checked. | Sets `job_number`, generates `tracking_token`, stores `tracking_token_hash`, emits `job_submitted` event. |
| `draft` | `expired` | System Cron | `now() > created_at + interval '1 hour'`. | Deletes unfinalized draft files from storage. |
| `submitted` | `under_review` | Super Admin | Super Admin opens Job Details in Admin Dashboard. | Assigns reviewer, emits `review_started` event. |
| `under_review` | `awaiting_payment`| Super Admin | Verified page count and settings confirmed; price calculated. | Emits `price_confirmed` event. |
| `awaiting_payment`| `approved` | Super Admin | **Cash Workflow:** Admin clicked "Confirm Cash Received" (`payment_status = 'paid'`). | Records cash receipt, emits `cash_confirmed` & `job_approved` events. |
| `approved` | `queued` | Super Admin | Target printer is enabled & online; Admin clicks "Release to Queue". | Sets `assigned_printer_id`, emits `job_queued` event. |
| `awaiting_payment` / `under_review` | `queued` | **System Rule** | **UPI Workflow:** Admin verified UPI UTR / proof (`payment_status = 'paid'`). Auto-qualifies for queue without secondary approval. | Sets `status = 'queued'`, sets `assigned_printer_id`, emits `upi_verified` & `job_queued` events. |
| `under_review` / `awaiting_payment` | `rejected` | Super Admin | Mandatory `rejection_reason` provided (>= 5 chars). | Sets `rejection_reason`, schedules 24h file cleanup, emits `job_rejected` event. |
| `draft` .. `queued` | `cancelled` | Customer / Admin | Allowed only before Print Agent claims the job. Mandatory reason if Admin cancels. | Sets `cancellation_reason`, schedules 24h cleanup, emits `job_cancelled` event. |
| `queued` | `claimed` | Windows Agent | Atomic SQL query: `status = 'queued' AND claimed_by_device_id IS NULL`. Target printer belongs to claiming active device. | Sets `claimed_by_device_id`, sets `lease_expires_at = now() + 120s`, creates `print_job_attempts` row, issues 120s download URLs. |
| `claimed` | `downloading` | Claiming Agent | Agent holds active lease; starts HTTP stream download. | Updates attempt status to `downloading`. |
| `downloading` | `printing` | Claiming Agent | File SHA-256 verified; printer online; starts rendering. | Updates attempt status to `printing`. |
| `printing` | `submitted_to_spooler`| Claiming Agent | Windows Print Spooler accepted job. | Records `windows_spooler_job_id` and `submitted_to_spooler_at`. |
| `submitted_to_spooler`| `completed` | Agent / Admin | Spooler finished successfully or Admin verified physical paper at counter. | Sets `completed_at`, starts 24h file retention timer, emits `job_completed` event. |
| `claimed` / `downloading` / `printing` | `failed` | Agent / System | Error occurred **before spooler submission** (`submitted_to_spooler_at IS NULL`). | Stores `error_code` and `error_message_safe`, releases claim lease. |
| `submitted_to_spooler`| `needs_review` | System Sweeper | Lease expired or agent disconnected **after spooler submission** (`submitted_to_spooler_at IS NOT NULL`). | **Blocks auto-reprint.** Alerts Admin to check physical printer paper tray. |
| `needs_review` | `completed` | Super Admin | Admin physically confirmed document printed successfully at counter. | Records admin confirmation, sets `completed_at`. |
| `needs_review` / `failed` | `queued` | Super Admin | Admin clicks "Retry" or "Authorize Reprint" with mandatory `reprint_reason`. | Creates new attempt (`attempt_number + 1`), sets `status = 'queued'`, emits `reprint_authorized` event. |

---

## 4. Print Attempt Tracking (`print_job_attempts`)

To guarantee strict idempotency and prevent duplicate billing or ghost printing:
1. Every claim generates an immutable attempt record with a unique `idempotency_key`.
2. Fields tracked per attempt:
   - `attempt_number` (1, 2, 3...)
   - `device_id` & `printer_id`
   - `windows_spooler_job_id` (nullable until accepted by Windows)
   - `started_at`, `submitted_to_spooler_at`, `finished_at`
   - `error_code` (e.g., `PRINTER_OFFLINE`, `PAPER_JAM`, `CORRUPT_PAYLOAD`)
   - `error_message_safe` (sanitized for customer/admin display)
3. **Database Invariant:** No job may have more than one active attempt (`finished_at IS NULL`) at any time.

---

## 5. Print Device State Machine (`print_devices`)

The Windows 11 Local Print Agent device transitions through these states:
- `pending`: Device requested enrollment (`agent-enroll`). Awaiting Super Admin approval. Cannot claim jobs.
- `active`: Super Admin approved device. Heartbeats active. Authorized to claim jobs for linked printers.
- `paused`: Super Admin paused remotely or operator paused in tray UI. Heartbeats continue, but job claims halted.
- `offline`: (Derived view) Last heartbeat older than 90 seconds. System flags printers as unavailable.
- `revoked`: Super Admin revoked device credential. All API requests rejected immediately (`401/403`).
