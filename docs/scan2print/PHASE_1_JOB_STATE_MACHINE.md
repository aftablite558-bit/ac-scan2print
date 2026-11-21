# AC Scan2Print (AMAN COMPUTER) — Smart QR Print System
## Phase 1: Job, Attempt & Device State Machines

**Document Version:** 1.0  
**Phase:** Phase 1 — Product Specification & UX Design (Documentation Only)  
**Date:** 20 November 2026  
**Authority:** Technical Roadmap v1.1 Section 9 (authoritative for state definitions)

---

## 1. Reconciliation of Job States (Roadmap §9 vs Prompt Labels)

Roadmap §9 is authoritative for database state values. The table below maps user-facing labels to canonical backend `print_jobs.status` and `payment_status` values so there is zero discrepancy:

| Canonical `print_jobs.status` | Prompt / UI Equivalent Term | Owner / Meaning |
| :--- | :--- | :--- |
| `draft` | Upload in progress | Customer started upload session; files not yet finalized |
| `submitted` | Pending review / New request | Customer finalized upload; waiting for operator to open |
| `under_review` | Pending review | Operator actively reviewing documents, page count, and print options |
| `awaiting_payment` | Awaiting payment / Payment verification | Final price confirmed; waiting for Cash or manual UPI verification |
| `approved` | Approved | Operator approved job & confirmed price/payment; ready for queue release |
| `queued` | Queued | Released to target printer queue; eligible for active Print Agent claim |
| `claimed` | Claimed | One Print Agent holds an active time-limited lease (`lease_expires_at`) |
| `downloading` | Claimed / Preparing | Print Agent downloading encrypted files via short-lived URLs & checking SHA-256 |
| `printing` | Printing | Agent rendering/submitting job to Windows Print Spooler |
| `submitted_to_spooler` | Submitted to spooler | Windows spooler accepted job (`windows_spooler_job_id` captured); physical output not yet guaranteed |
| `completed` | Completed | Physical print confirmed / handed over by operator |
| `failed` | Failed | Confirmed pre-spooler or explicit driver failure; safe to retry after diagnosis |
| `needs_review` | Needs review | Outcome uncertain (e.g., crash/timeout/disconnect after spooler handoff); **auto-retry forbidden** |
| `rejected` | Rejected | Operator declined job with recorded reason (e.g., unreadable/unsupported content) |
| `cancelled` | Cancelled | Cancelled before irreversible spooler submission |
| `expired` | Expired | Draft or stale uncollected job exceeded configured lifetime |

### Separate `payment_status` Enum (Orthogonal to `print_jobs.status`)
- `unpaid` — No payment recorded yet.
- `pending_verification` — Optional counter state while UPI receipt is being checked on shop device (never marks `paid` automatically).
- `paid` — Cash received or UPI manually verified by authorized staff (`confirmed_by`, `confirmed_at`).
- `refunded` — Authorized refund/reversal recorded (only if shop refund workflow is enabled).

---

## 2. Allowed Job State Transitions (Server-Enforced Only)

Frontend UI must **never** mutate `print_jobs.status` directly. Every transition executes inside a validated Edge Function / database transaction and appends an immutable `print_events` row.

```text
[draft] ──(finalize-print-upload)──────────────────► [submitted]
   │                                                      │
   └──(TTL 1h cleanup)──► [expired]                       ▼
                                                    [under_review] ◄────┐
                                                     │    │    │        │
                   (reject)──────────────────────────┘    │    └─(hold)─┘
                      ▼                                   │
                  [rejected]                              ▼
                                                   [awaiting_payment]
                                                          │
                                       (confirm payment)  │
                                                          ▼
                                                     [approved]
                                                          │
                                        (release to queue)│
                                                          ▼
                                                      [queued] ◄───(admin-retry-print-job from failed)
                                                          │
                                        (agent-claim-job) │
                                                          ▼
                                                      [claimed] ──(lease expired pre-spooler)──► [queued] or [failed]*
                                                          │
                                                          ▼
                                                    [downloading] ──(checksum/URL error)──► [failed]
                                                          │
                                                          ▼
                                                     [printing] ──(pre-spooler error)────► [failed]
                                                          │
                                         (spooler Job ID) ▼
                                               [submitted_to_spooler] ──(lease timeout / crash / unknown)──► [needs_review]
                                                          │                                                        │
                                     (confirmed done /    │                  (operator verifies physical output)   │
                                      operator handover)  ▼                         ┌──────────────────────────────┤
                                                     [completed] ◄──────────────────┘                              │
                                                                                                                   ▼
                                                                             (authorize reprint w/ reason) ──► [queued]

*Cancellation:* [draft | submitted | under_review | awaiting_payment | approved | queued] ──(admin/authorized cancel)──► [cancelled]
*Expiration:*   [draft | submitted | awaiting_payment] ──(retention sweep)──► [expired]
```
*\*Note on `claimed` lease expiry:* Only if `print_job_attempts.submitted_to_spooler_at IS NULL` can lease recovery return a job to `queued` (or `failed` after max attempt threshold); if `submitted_to_spooler_at IS NOT NULL`, lease expiry **must** move the job to **`needs_review`**.

### Complete Transition Guard Matrix

| From | To | Permitted Actor | Mandatory Guards & Side Effects |
| :--- | :--- | :--- | :--- |
| `(new)` | `draft` | Customer | Valid file metadata within limits; generates `job_number` & idempotency key. |
| `draft` | `submitted` | Customer (`finalize-print-upload`) | >= 1 valid uploaded object verified in Storage; magic bytes + page count OK; generates `tracking_token_hash`; emits `admin_notification`. |
| `draft` | `expired` | System Cleanup | `now() > expires_at` (e.g., >1h unsubmitted); deletes Storage objects. |
| `submitted` | `under_review` | Operator / Admin | Operator opens review or starts verification; locks/assigns reviewer. |
| `under_review` | `awaiting_payment` | Operator / Admin | Verified page count & settings saved; `final_amount` computed/confirmed (reason logged if overridden). |
| `under_review` / `awaiting_payment` | `approved` | Operator / Admin | `final_amount` confirmed AND (`payment_status = 'paid'` OR explicit authorized pay-on-pickup rule if owner enables). |
| `under_review` / `awaiting_payment` | `rejected` | Operator / Admin | Non-empty `rejection_reason` mandatory; schedules file retention deletion. |
| `approved` | `queued` | Operator / Admin | `assigned_printer_id` is set and enabled; `payment_status = 'paid'` (unless owner overrides default rule). |
| `queued` | `claimed` | Active Print Agent | Atomic conditional update (`WHERE status='queued' AND claimed_by_device_id IS NULL`); Agent device is `active` & owns `assigned_printer_id`; sets `lease_expires_at` + creates `print_job_attempts` row. |
| `claimed` | `downloading` | Claiming Agent | Matching `device_id` + valid active lease + matching `attempt_id`. |
| `downloading` | `printing` | Claiming Agent | SHA-256 verified; printer online & ready locally. |
| `printing` | `submitted_to_spooler` | Claiming Agent | Spooler accepted job; stores `windows_spooler_job_id` + `submitted_to_spooler_at`. |
| `submitted_to_spooler` | `completed` | Agent / Operator | Driver/spooler completion confirmed OR operator confirms physical handover at counter; schedules 24h file deletion. |
| `claimed` / `downloading` / `printing` | `failed` | Claiming Agent / System | Only when `submitted_to_spooler_at IS NULL`; stores `error_code` + `error_message_safe`. |
| `submitted_to_spooler` / `printing` | `needs_review` | System / Agent | Triggered if lease expires after spooler handoff, agent disconnects mid-print, or spooler state is ambiguous. **Blocks auto-retry.** |
| `failed` | `queued` | Operator / Admin (`admin-retry-print-job`) | Printer online; creates new `print_job_attempts` (`attempt_number + 1`) + audit event. |
| `needs_review` | `completed` | Operator / Admin | Operator physically verified pages came out cleanly at counter; audit reason recorded. |
| `needs_review` / `completed` | `queued` | Operator / Admin (Reprint) | **Explicit Authorize Reprint action** with mandatory `reprint_reason`; creates new `print_job_attempts` row + audit log. |
| `draft`..`queued` | `cancelled` | Operator / Admin | Only before `claimed` (or if claim cleanly aborted pre-spooler); reason logged. |

---

## 3. Print Device & Attempt State Machines

### 3.1 `print_devices.status`
- `pending` → Agent ran `agent-enroll`; cannot claim jobs or list download URLs.
- `active` → Approved by Owner/Manager; may send heartbeats, sync printers, and claim jobs for its linked printers.
- `paused` → Operator paused locally or Admin paused remotely; heartbeats continue, job claims paused.
- `offline` *(derived operational view)* → `status = 'active'` but `now() - last_heartbeat_at > heartbeat_timeout` (e.g., 60–90 seconds); Admin UI flags device offline and prevents misleading "Ready" claims.
- `revoked` → Credential invalidated by Owner/Manager; immediately returns `401/403` on all agent endpoints and triggers `needs_review` / lease release for any in-flight claimed job.

### 3.2 `print_job_attempts` (Idempotency Guarantee)
Every execution pass creates a dedicated `print_job_attempts` record containing:
- `attempt_number` (`1, 2, 3...`)
- `idempotency_key` (UUID preventing duplicate attempt execution on network retry)
- `device_id`, `printer_id`
- `windows_spooler_job_id` (nullable until Windows Spooler accepts)
- `started_at`, `submitted_to_spooler_at`, `finished_at`
- `error_code`, `error_message_safe`, `created_by`

**Invariant:** No job may hold two simultaneous active (`finished_at IS NULL`) print attempts.
