# AC Scan2Print --- Remaining Work: End-to-End Implementation Roadmap

**Project:** Aman Computer Smart QR Print System\
**Product:** AC Scan2Print\
**Baseline:** `Aman_Computer_Smart_QR_Print_System_Roadmap_v1.1.md`
(Sections 1--31; Phases 0--12)\
**Version:** 1.0 \| **Prepared:** 25 November 2026\
**Purpose:** Detailed phase-wise plan for completing the remaining work,
production hardening, physical printing, launch and operations.\
**Mode:** Planning only. This document does not authorize code,
database, configuration or deployment changes.

------------------------------------------------------------------------

## 0. Purpose, baseline and rules

This document supplements---not replaces---the original v1.1 roadmap.
The original roadmap remains authoritative for product requirements.
This document converts unfinished work into implementation tasks,
technical contracts, deliverables, test cases and phase exit gates.

### 0.1 Known project baseline

  Item                               Known value
  ---------------------------------- --------------------------------------------
  Product                            AC Scan2Print
  Supabase project ref               `tvtfgsijxlxpwgakpeag`
  Supabase URL                       `https://tvtfgsijxlxpwgakpeag.supabase.co`
  Firebase project                   `aman-computer-27b21`
  Firebase Hosting site known        `ac-scan2print`
  Hosting URL                        `https://ac-scan2print.web.app`
  Repository                         `~/ac-scan2print`
  Branch                             `main`
  Admin build output (reported)      `dist/`
  Customer build output (reported)   `dist-customer/`
  Windows Print Agent                Not implemented
  Physical print workflow            Not verified

### 0.2 Confirmed owner decisions --- do not silently change

1.  AC Scan2Print uses separate, dedicated Firebase and Supabase
    projects.
2.  Admin dashboard branding is orange; customer product branding is
    cyan.
3.  One Admin account only. Do not add Staff/Operator roles without
    explicit approval.
4.  Customer name and phone are optional.
5.  Verified UPI payment may proceed without a second manual Admin
    approval, once the configured verification process actually verifies
    payment.
6.  Cash payment requires Admin confirmation before printing.
7.  Duplex billing is per physical sheet.
8.  Customer portal remains separate from the Admin dashboard
    experience.
9.  Customer scans using the phone's native camera; no in-app scanner is
    required.
10. GitHub automatic deployment remains disabled. All releases are
    staged and manually approved.
11. Do not use the existing Aman Computer Firebase/Supabase projects.
12. Never expose Supabase service-role credentials in browser code or
    the Windows Agent.

### 0.3 Status rules

-   **COMPLETE --- VERIFIED:** Code, tests and required live/hardware
    evidence pass.
-   **PARTIAL:** Some implementation exists; acceptance criteria remain.
-   **PENDING:** Not implemented.
-   **BLOCKED:** Dependency prevents safe progress.
-   **NEEDS LIVE VERIFICATION:** Source exists but production/hardware
    behavior is unproven.
-   **NOT APPLICABLE:** Explicitly excluded by approved scope.

A UI, migration file, mock, documentation page or passing unit test
alone does not prove a production feature is complete.

### 0.4 Important audit reconciliation

The 24 November AI audit contains claims that conflict with earlier
direct verification:

-   `202611210001_scan2print_phase0_printers.sql` was previously
    executed successfully in Supabase SQL Editor. Its added columns,
    constraints, indexes and hardened RPCs were verified. Treat it as
    **APPLIED / VERIFIED** unless a fresh live check proves otherwise.
    Do not reapply blindly.
-   Previously verified production bucket names are `print-uploads`,
    `payment-evidence`, and `payment-assets`. The AI report's
    `customer-print-files`, `payment-proofs`, and `admin-assets`
    conflict with that evidence.
-   `202611230001_scan2print_service_role_grants.sql` had not been
    executed in the earlier verification sequence. Inspect its exact SQL
    and compare every grant with live privileges before deciding whether
    to apply.
-   Earlier source review identified risks around payment consistency,
    price override during pending payment, bootstrap allowlisting, and
    non-atomic multi-step updates. Do not accept a blanket "zero
    vulnerabilities" conclusion without retesting them.
-   The reported 41.7%, 59.7%, and 21.4% are estimates from an AI
    audit's counting method, not signed-off engineering measurements.

If a fresh live query contradicts these findings, preserve the query,
timestamp, project reference and output as new evidence.

------------------------------------------------------------------------

# 1. Target architecture and end-to-end workflow

## 1.1 Components

  -----------------------------------------------------------------------
  Component                           Responsibility
  ----------------------------------- -----------------------------------
  Customer QR Portal                  Mobile upload, print preferences,
                                      payment evidence, tracking

  Admin Print Manager                 Review, pricing, payment
                                      verification, approval, release,
                                      printer/device management

  Supabase Edge Functions             Authentication, authorization,
                                      validation, orchestration

  PostgreSQL                          Jobs, files metadata, payments,
                                      printers, devices, attempts,
                                      events, settings

  Supabase Private Storage            Customer documents, payment
                                      evidence, Admin assets

  Windows Local Print Agent           Secure job claim, download,
                                      validation, print submission, event
                                      reporting

  Windows Print Spooler               Local queue and print subsystem

  Physical printer                    Paper output

  Firebase Hosting                    Admin and customer web applications
  -----------------------------------------------------------------------

## 1.2 Full customer-to-printer flow

1.  Customer scans permanent QR and opens `/quick-print`.
2.  Customer selects PDF/JPG/PNG.
3.  Browser performs usability checks; backend independently validates.
4.  Backend creates draft job and short-lived upload authorization.
5.  Files upload to private `print-uploads`.
6.  Finalization verifies actual bytes, size, signature and page count.
7.  Server calculates estimate using active pricing rules.
8.  Customer submits job and receives Job ID plus high-entropy tracking
    credential.
9.  Admin reviews file and requested settings.
10. Final price is confirmed.
11. UPI branch: customer submits UTR/evidence; payment remains pending
    until approved verification confirms it. A screenshot alone is not
    bank confirmation.
12. Cash branch: job cannot print until Admin confirms cash received.
13. Backend checks payment, approval, printer and device eligibility.
14. Admin releases job atomically to queue.
15. Active Agent claims one job with a lease and attempt ID.
16. Agent downloads short-lived URLs and verifies size, checksum and
    file type.
17. Agent validates selected printer/settings.
18. Agent renders PDF/image and submits to Windows spooler.
19. Agent records spooler ID/status and reports lifecycle events.
20. Ambiguous outcomes go to `needs_review`; never blindly reprint.
21. Admin/operator confirms physical output and handover where telemetry
    cannot prove paper output.
22. Customer sees accurate tracking state.
23. Retention worker deletes eligible Storage objects and records
    evidence.

## 1.3 Non-negotiable invariants

-   Job number alone never grants access.
-   Customer A cannot access Customer B's job or file.
-   Raw tracking tokens, draft secrets and device credentials are not
    stored in plaintext.
-   Customer cannot set price, paid, approved, queued, printing or
    completed states.
-   Only eligible paid/approved jobs can be claimed.
-   Pending, paused, revoked or unapproved devices/printers cannot
    receive work.
-   One job cannot have two active valid claims.
-   Every retry creates a traceable new attempt.
-   Ambiguous spooler outcomes become `needs_review`.
-   `submitted_to_spooler` is not proof of physical paper output.
-   Service-role secrets never reach browser or Agent.
-   Every privileged mutation is authorized server-side and audited.
-   Duplex price uses physical-sheet calculation.
-   Deployment is manual; no GitHub auto-deploy.

------------------------------------------------------------------------

# 2. Phase 0 --- Production reconciliation and hardware discovery

**Status:** Software audit support exists. Physical hardware inventory
and baseline print tests remain. Phase 0 printer migration was
previously applied and verified.

## 2.1 Database reconciliation

1.  Confirm correct project ref: `tvtfgsijxlxpwgakpeag`.
2.  Verify all expected 13 `print_*` tables.
3.  Verify `print_printers` contains `printer_model`,
    `discovery_source`, `approval_status`, `last_verified_at`,
    `archived_at`, `archived_by`, `audit_notes`.
4.  Verify Phase 0 constraints/indexes.
5.  Verify hardened definitions of `rpc_release_print_job` and
    `rpc_claim_next_print_job`; do not overwrite them with older
    definitions.
6.  Verify RPC execution permissions.
7.  Read migration `202611230001_scan2print_service_role_grants.sql`
    completely.
8.  Compare its GRANT/REVOKE statements against live privileges.
9.  Identify missing and excessive privileges.
10. Apply only reviewed missing grants via Supabase Dashboard SQL
    Editor, after export/backup and explicit approval.
11. Capture before/after evidence.

**Acceptance:** no unnecessary reapplication of migration 5;
least-privilege service-role grants; no direct anon/authenticated
writes; no production permission errors.

## 2.2 Physical Windows PC and printer inventory

Record: - Windows edition/version/build. - CPU, RAM, free disk space. -
Windows service identity plan. - USB ports/controller. - Network
adapters and connectivity. - UPS/power backup. - Printer make, exact
model, driver/version, queue name and connection type. - Supported paper
sizes/trays. - Colour and duplex capability. - Driver status behavior
and available telemetry.

Do not treat driver-reported capabilities as verified until physically
tested.

## 2.3 Baseline physical test prints

Print and retain: - Single-page PDF. - Multi-page PDF. - JPG and PNG. -
A4 portrait/landscape. - B&W/colour if supported. - Single/duplex if
supported. - Multiple copies. - Safe offline/paper-out/error scenario
where practical.

Record expected vs actual alignment, scaling, orientation, colour,
duplex edge and print time.

## 2.4 Deliverables and exit gate

Create: - `docs/scan2print/production/PRODUCTION_BASELINE.md` -
`HARDWARE_INVENTORY.md` - `PRINTER_COMPATIBILITY_MATRIX.md` -
`BASELINE_PRINT_TEST_REPORT.md` - `DATABASE_RECONCILIATION.md`

**Exit:** at least one real target PC and printer are known; baseline
physical output is documented.

------------------------------------------------------------------------

# 3. Phase 1 --- Freeze implementation contracts

**Status:** Product and UX documentation reported complete. Review only;
do not redesign without approval.

## 3.1 MVP scope

-   PDF, JPG/JPEG, PNG.
-   Existing proposal: 20 MB per file, maximum five files per job.
-   Optional customer name/phone.
-   No customer account requirement.
-   No in-app QR scanner.
-   No Office conversion in MVP.
-   No multi-branch support in MVP.

## 3.2 State machine contract

Document allowed transitions for: `draft`, `submitted`, `under_review`,
`awaiting_payment`, `approved`, `queued`, `claimed`, `downloading`,
`printing`, `submitted_to_spooler`, `completed`, `failed`,
`needs_review`, `rejected`, `cancelled`, `expired`.

For every transition specify: - Allowed actor. - Preconditions. -
Payment condition. - Printer/device condition. - Required reason. -
Attempt creation behavior. - Audit event. - Customer-visible wording.

## 3.3 Payment contract

-   UPI cannot become paid because customer clicks a button or uploads a
    screenshot.
-   Once configured verification actually verifies UPI payment, no
    second manual Admin approval is required.
-   Cash requires explicit Admin confirmation.
-   Price changes during pending payment must invalidate/reconcile the
    pending amount safely.
-   Payment update, job state, events and release decision must be
    atomic or recoverable.

**Exit:** no frontend or Agent code invents states or payment rules
outside the approved contract.

------------------------------------------------------------------------

# 4. Phase 2 --- Backend hardening and production deployment

**Status:** Core schema, RLS, Storage and Edge Function source are
substantially implemented. Production deployment and consistency review
remain.

## 4.1 Migration ledger

Known migrations: 1. `202611200001_scan2print_core_schema.sql` 2.
`202611200002_scan2print_rls_and_storage.sql` 3.
`202611200003_scan2print_atomic_rpcs.sql` 4.
`202611200004_scan2print_firebase_auth_admin.sql` 5.
`202611210001_scan2print_phase0_printers.sql` 6.
`202611230001_scan2print_service_role_grants.sql`

For each record checksum, production-applied state, object verification,
later hotfixes, re-execution safety and data impact. Migration 5 was
previously verified applied. Migration 6 needs SQL review and privilege
comparison. Never blindly replay all migrations.

## 4.2 Required security/data-integrity review

### Admin bootstrap

-   Production must require the configured allowlisted Firebase UID.
-   A valid Firebase user plus bootstrap secret must not be sufficient
    if not allowlisted.
-   Add rate limiting and audit events.
-   Make one-time bootstrap race-safe.
-   Verify actual intended Firebase UID/email.

### UPI verification

-   Compare payment amount to authoritative final job amount.
-   Reject mismatches.
-   Validate selected printer before irreversible mutations.
-   Update payment, job, events and release state atomically.
-   Enforce duplicate UTR rules with database constraints where
    appropriate.
-   Handle concurrent verification with conditional updates/RPC.
-   A screenshot is evidence, not automatic bank confirmation.

### Price override

-   Block changes while payment is pending unless the same transaction
    invalidates/reconciles that payment.
-   Require reason and record old/new amount.
-   Paid jobs must not be silently repriced.

### Cash confirmation

-   Confirm job is eligible for cash.
-   Prevent duplicate cash payment records.
-   Use idempotency and database uniqueness.
-   Make payment/job/event update atomic.
-   Keep action Admin-only.

### Customer idempotency

-   Scope idempotency key to request/customer context.
-   Prevent key reuse from exposing another customer's job.
-   Add uniqueness and deterministic conflict handling.

### Upload lifecycle

-   Explicit allowlist of action values.
-   Enforce file count under concurrency.
-   Avoid orphan file rows if signed URL creation fails.
-   Make finalization conditional and race-safe.
-   Ensure invalid object cleanup is retried if Storage deletion fails.

### Multi-step mutations

Use database transaction/RPC or durable outbox for
job/payment/event/attempt operations. Do not depend on sequential calls
that can leave partially updated state.

### Public payment settings and Storage

-   Inspect `public_payment_settings_view` security semantics before
    altering it.
-   Return only intended public fields.
-   Decide whether Admin document access is signed-URL-only.
-   Keep buckets private and signed URLs short-lived.
-   Use the previously verified names: `print-uploads`,
    `payment-evidence`, `payment-assets`, unless a reviewed migration
    explicitly changes them.

## 4.3 Edge Function production deployment

Before deployment: - Complete source review. - Verify migration/grant
state. - Review `supabase/config.toml`. - Set production secrets in
Supabase Dashboard. - Restrict CORS to exact approved origins. - Verify
Firebase issuer/audience for `aman-computer-27b21`. - Set strong unique
bootstrap/cron secrets. - Review JWT gateway behavior per function.

Firebase ID tokens are validated inside the custom handler. If gateway
JWT verification is disabled for Firebase-token endpoints, the handler
must validate Firebase identity on every request. Do not disable
verification indiscriminately.

Manual deployment sequence: 1. Freeze source commit. 2. Run typecheck,
lint and all tests. 3. Verify project ref. 4. Review function config. 5.
Set secrets in Dashboard. 6. Deploy one low-risk function. 7. Invoke
authorized test request. 8. Inspect logs and DB side effects. 9. Deploy
remaining functions in controlled batches. 10. Verify all endpoints/auth
paths. 11. Record source commit, deployed functions and timestamp.

Required function inventory: `admin-bootstrap`, `admin-confirm-cash`,
`admin-print-jobs`, `admin-printers`, `admin-release-print-job`,
`admin-retry-print-job`, `admin-review-print-job`,
`admin-update-payment-settings`, `admin-verify-payment`,
`agent-claim-job`, `agent-enroll`, `agent-heartbeat`,
`agent-report-job-event`, `agent-sync-printers`,
`cleanup-expired-print-files`, `create-print-job`,
`create-print-upload-url`, `finalize-print-upload`,
`get-print-job-status`, `get-public-payment-settings`,
`submit-upi-payment`.

Pricing CRUD is reported as an action of `admin-print-jobs`; do not
invent a separate pricing function unless source proves it exists.

## 4.4 Realtime and retention scheduler

-   Inspect publication before adding `print_jobs`.
-   Subscribe Admin UI to inserts and relevant updates.
-   Keep polling/manual refresh fallback; Realtime is not source of
    truth.
-   Never send document contents through Realtime.
-   Schedule `cleanup-expired-print-files` using Supabase Cron and a
    secure server-to-server call.
-   Store credentials in approved secret storage/Vault, not source
    control.
-   Log run ID, deleted object count, failures and retries.
-   Verify actual Storage deletion, not only DB row deletion.

**Deliverables:** migration ledger, security remediation report,
function deployment matrix, production smoke tests, Realtime report,
retention scheduler report.

**Exit:** production functions work with real secrets; P0 data-integrity
issues are closed.

------------------------------------------------------------------------

# 5. Phase 3 --- Customer Portal production completion

**Status:** Source/local tests reported complete; hosting mapping and
live validation remain.

## 5.1 Hosting architecture decision

Two reported outputs exist: Admin `dist/`, Customer `dist-customer/`.

Choose one:

**Option A --- Separate Firebase Hosting sites** - Verify/create the
customer Hosting site in Firebase Console. - Assign explicit deploy
targets. - Keep separate hosting configs and release verification. - Use
this when apps have independent builds/releases.

**Option B --- One Hosting site** - Deliberately merge/copy outputs into
a unified layout. - Route `/quick-print/**` to customer app and Admin
paths to Admin app. - Test asset paths, SPA rewrites, deep links and
cache behavior. - Do not assume one build output serves both
applications.

Do not assume a second Hosting site already exists. Do not alter
DNS/custom domains without owner approval.

## 5.2 Production checklist

-   [ ] Portal URL approved.
-   [ ] Hosting target exists and maps to correct output.
-   [ ] SPA fallback and deep links work.
-   [ ] Static assets load correctly.
-   [ ] Environment points to correct projects.
-   [ ] CORS includes exact portal origin.
-   [ ] Upload URL creation and Storage upload work.
-   [ ] PDF/JPEG/PNG and invalid-file cases tested.
-   [ ] Size/file-count limits enforced server-side.
-   [ ] Tracking token absent from analytics/general logs.
-   [ ] Tracking does not expose private file URLs.
-   [ ] Android Chrome and another mobile browser tested.
-   [ ] Interrupted upload and retry tested.
-   [ ] Privacy/retention wording matches real cleanup.

Customer-visible states must distinguish submitted, under review,
payment pending, approved/queued, printing, submitted to spooler, ready
for collection, handed over, rejected, failed and needs review. Do not
display "Printed" merely because spooler accepted the job.

**Exit:** real phone completes production-like upload and tracking using
the permanent QR destination.

------------------------------------------------------------------------

# 6. Phase 4 --- Admin Print Manager production completion

**Status:** Main UI/workflows reported implemented; Realtime and live
verification remain.

## 6.1 Queue and job details

Verify server-side pagination/filtering, real DB metrics, secure
short-lived previews, page count, physical sheets, settings, pricing,
optional customer data and clear error states.

## 6.2 Payment and release

-   UPI amount must match final job amount.
-   Cash requires Admin confirmation.
-   Pending payment blocks release.
-   Price override cannot silently invalidate payment.
-   Printer assignment validated before irreversible mutations.
-   Release uses hardened atomic RPC.
-   Retry/reprint requires reason and a new attempt.
-   A spooler-submitted job cannot be silently released again.

## 6.3 Printer management

Admin can view device association, connection type, discovery source,
capability tri-state, last-seen/verified time, approve/reject,
enable/disable, set default, archive and inspect safe error status. A
printer is not production-ready until physical test print is recorded.

## 6.4 Device management

Admin can view pending/active/paused/revoked, approve, pause/resume,
revoke, inspect heartbeat/version/printers and review audit history.

## 6.5 Counter QR Poster Generator

Build an Admin utility to: - Use the owner-approved stable customer
portal URL. - Encode only that URL. - Use approved Aman Computer/AC
Scan2Print assets. - Preview and export print-ready PDF/PNG. - Include
short URL fallback and scan/upload/print/collect instructions. - Include
supported formats and help/contact. - Preserve high QR contrast and
quiet zone. - Never embed signed upload URLs, tracking tokens or Admin
URLs. - Test scan before printing.

**Exit:** Admin processes a complete real job and all privileged actions
are audited.

------------------------------------------------------------------------

# 7. Phase 5 --- Windows Local Print Agent prototype

**Status: NOT STARTED.** This is the most important missing physical
execution component.

## 7.1 Recommended architecture

Use: - C# / .NET 8 Worker Service for background work. - Windows Service
hosting for startup/recovery. - Separate lightweight tray/control UI for
operator visibility. - Windows Print Spooler APIs for discovery, queue
and job interaction. - Maintained PDF renderer selected after
license/deployment review. - .NET image processing and Windows printing
APIs for JPG/PNG.

A Windows Service should not be expected to display interactive UI in
the logged-in desktop session. Keep service and tray UI separate,
communicating over restricted local IPC.

## 7.2 Suggested solution layout

``` text
agent/
  ACScan2Print.Agent.sln
  src/
    ACScan2Print.Agent.Worker/
    ACScan2Print.Agent.Core/
    ACScan2Print.Agent.Infrastructure/
      Api/
      DeviceIdentity/
      Windows/PrinterDiscovery/
      Windows/PrintSpooler/
      Windows/Dpapi/
      Rendering/Pdf/
      Rendering/Images/
      Persistence/
      Logging/
    ACScan2Print.Agent.Tray/
    ACScan2Print.Agent.Tests/
  installer/
  docs/
```

Target structure only; these files are not claimed to exist.

## 7.3 Worker functions

-   Start with Windows.
-   Load protected device credential.
-   Validate configuration and version.
-   Connect outbound HTTPS.
-   Heartbeat and sync printers.
-   Claim eligible jobs.
-   Download only after claim.
-   Verify hash, size and magic bytes.
-   Process one job at a time initially.
-   Persist attempt state.
-   Submit print request.
-   Capture spooler ID/status.
-   Report events.
-   Recover leases safely.
-   Clean temporary files.

## 7.4 Printer discovery

Record system queue name, driver/version, port, local/network
connection, default flag, queue status, paper sizes, colour/duplex
capability and discovery timestamp.

Driver-reported capability is a hint, not proof. Unknown remains
unknown. Agent prints only to an Admin-approved registered printer.
Never accept arbitrary customer-supplied printer names.

## 7.5 PDF renderer selection

Compare candidate renderer/wrapper/native binaries for: - Commercial-use
and redistribution license. - Native runtime dependencies. - Windows 11
support. - Silent/headless printing. - Paper size/orientation. -
Duplex/colour/copies/page range. - Memory use for large PDFs. -
Security/update cadence. - x64 packaging and deployment.

PDFium may be evaluated, but inspect the exact wrapper package and
bundled native binaries separately. Upstream license does not
automatically establish every wrapper's license. Do not ship until the
license decision is recorded.

## 7.6 Image processing

-   Revalidate signature on Agent.
-   Decode with bounded memory.
-   Reject malformed or excessive pixel dimensions.
-   Apply orientation metadata where supported.
-   Implement fit-to-page and actual-size.
-   Apply paper size, orientation, copies and B&W/colour.
-   Avoid stretching.
-   Dispose GDI/image resources.
-   Remove temporary files under retention policy.

## 7.7 Print request model

Normalize: - Approved printer ID and Windows queue. - Paper size. -
Orientation. - Colour mode. - Single/duplex. - Copies. - Page range. -
Scaling.

Validate against server-authorized job settings and printer
capabilities. Reject unsupported settings; never silently substitute
another printer or mode.

## 7.8 Spooler and outcome handling

Capture job ID, attempt ID, device, printer, spooler job ID, submission
time, last observed status, safe error code and whether physical output
is confirmed or unknown.

Spooler acceptance is not proof paper emerged. On restart, reconcile
local attempt and spooler before retrying. Ambiguous outcomes become
`needs_review`.

## 7.9 Local storage and security

-   Dedicated restricted application-data directory.
-   Unpredictable per-attempt folders.
-   Safe path handling; never trust customer filename as path.
-   ACLs restricted to service identity.
-   No document content in logs.
-   Safe orphan cleanup after reconciling active attempts.
-   Never delete files needed for unresolved attempts.
-   No service-role key in Agent.
-   HTTPS certificate validation.
-   No arbitrary shell commands or backend-provided file paths.

## 7.10 Phase 5 tests and exit gate

-   [ ] Detect actual shop printer.
-   [ ] Show queue/model/connection.
-   [ ] Print one-page and multi-page PDF.
-   [ ] Print JPG and PNG.
-   [ ] Test copies, paper size and orientation.
-   [ ] Test B&W/colour and duplex where supported.
-   [ ] Reject unsupported options.
-   [ ] Capture spooler ID/status.
-   [ ] Handle offline/error states.
-   [ ] Survive Agent restart.
-   [ ] Clean temporary files safely.
-   [ ] Local test mode needs no cloud credentials.

**Exit:** at least one real target printer prints PDF and image test
files correctly with validated settings. Do not connect production jobs
until local print behavior is proven.

------------------------------------------------------------------------

# 8. Phase 6 --- Secure device enrollment and identity

**Status:** Backend enrollment/heartbeat/device verification/printer
sync are reported present; Windows client is missing.

## 8.1 Enrollment sequence

1.  Agent starts unpaired.
2.  Admin creates short-lived one-time enrollment challenge.
3.  Agent presents challenge and generated device identity.
4.  Backend validates expiry, one-time use and scope.
5.  Pending device is created.
6.  Admin reviews PC details and discovered printers.
7.  Admin approves.
8.  Backend issues device credential once.
9.  Agent protects it with DPAPI.
10. Agent confirms enrollment and sends heartbeat.

Match existing `agent-enroll` contract; do not invent an incompatible
second protocol.

## 8.2 Credential rules

-   Cryptographically random device credential.
-   Store only hash server-side.
-   Return raw credential once.
-   Protect local secret using `ProtectedData`/DPAPI.
-   Decide `CurrentUser` vs `LocalMachine` based on Windows Service
    identity.
-   Test profile loading and decryption across reboot/service restart.
-   Never write raw credential to logs, registry plaintext or installer
    arguments.
-   Support rotation and revocation.
-   Use TLS certificate validation.

## 8.3 Heartbeat and printer sync

Heartbeat: device identity, Agent version, online/paused/busy/error,
safe health fields, printer inventory hash and timestamp. No customer
document names/content.

Printer sync: normalized capability values, unknown preserved as NULL,
stable identity mapping, bounded payloads, Admin approval required
before jobs can route to a newly discovered printer.

## 8.4 Lifecycle and acceptance

States: pending, active, paused, revoked. Offline may be derived from
stale heartbeat.

-   [ ] Unknown device cannot claim.
-   [ ] Pending device cannot claim.
-   [ ] Paused device cannot claim.
-   [ ] Revoked device cannot claim/download.
-   [ ] Credential protected at rest.
-   [ ] Rotation invalidates old credential.
-   [ ] Reboot preserves secure auth.
-   [ ] No service-role key in Agent.
-   [ ] Admin can revoke immediately.

------------------------------------------------------------------------

# 9. Phase 7 --- Queue, claim and print execution

**Status:** Backend atomic claim/lease and event endpoints are reported
present; Agent execution is missing.

## 9.1 Claim protocol

Agent authenticates with device credential and sends request
ID/idempotency key. Backend: 1. Authenticates active device. 2. Checks
device state and printer scope. 3. Selects only eligible
paid/approved/released jobs. 4. Atomically locks/claims one job. 5.
Creates or returns correct attempt. 6. Sets lease expiry. 7. Returns job
metadata and short-lived download authorization.

Use the existing hardened `rpc_claim_next_print_job`; do not recreate
claim logic in frontend/Agent.

## 9.2 Lease and attempt

-   Unique attempt ID per claim.
-   Bounded configurable lease.
-   Renew only during active work.
-   Persist local attempt before spooler submission.
-   Reject stale claim tokens.
-   Prevent concurrent claims.
-   Retry creates new attempt and preserves history.

## 9.3 Download and verification

-   URLs only after successful claim.
-   Short-lived signed URLs.
-   Restricted local temp storage.
-   Verify expected size, SHA-256 and magic bytes.
-   Reject path traversal.
-   Never log signed URLs.
-   Renew expired URL only after claim revalidation.

## 9.4 Event sequence

``` text
claimed -> downloading -> file_verified -> print_prepared
-> printing -> submitted_to_spooler -> spooler_status_observed
-> completed OR failed OR needs_review
```

Use only server-supported job states. Other milestones may be event
types/attempt metadata.

## 9.5 Exactly-once limitation

Exactly-once physical printing cannot be guaranteed in every
crash/network failure. Persist attempt state, capture spooler ID,
reconcile after restart, never blindly resubmit if prior submission may
have succeeded, and require Admin reason for reprint.

## 9.6 Acceptance

-   [ ] One eligible job claimed by one Agent only.
-   [ ] Two concurrent Agents cannot claim same job.
-   [ ] Agent downloads only claimed job files.
-   [ ] Checksum mismatch blocks print.
-   [ ] PDF/image reaches selected printer.
-   [ ] Spooler ID recorded where available.
-   [ ] Lifecycle trace is complete.
-   [ ] Lease expiry recovers safely.
-   [ ] Ambiguous result enters `needs_review`.
-   [ ] Reprint requires explicit authorization/reason.

------------------------------------------------------------------------

# 10. Phase 8 --- Production Agent installer and operations

**Status:** Not started; depends on Phases 5--7.

## 10.1 Installer selection

Choose MSI/WiX or a reputable setup EXE after checking Windows 11
compatibility, service management, upgrade/rollback, signing, silent
install, repair and per-machine/per-user behavior.

## 10.2 Installation sequence

1.  Check OS prerequisites.
2.  Install signed binaries.
3.  Create least-privilege service identity.
4.  Register Windows Service.
5.  Create restricted data/log/temp directories.
6.  Configure service recovery.
7.  Install tray UI separately if needed.
8.  Run enrollment wizard.
9.  Pair device with Admin.
10. Verify heartbeat.
11. Discover/sync printers.
12. Run test print.
13. Mark installation ready.

## 10.3 Updates and operations

-   Verify signed package.
-   Check version compatibility.
-   Download over HTTPS.
-   Stage before switching.
-   Stop service gracefully.
-   Preserve encrypted identity safely.
-   Apply update and health-check.
-   Roll back on failure.
-   Never execute arbitrary commands from backend.
-   Add log rotation, diagnostics export, network reconnect, temp
    cleanup and version reporting.

## 10.4 Acceptance

-   [ ] Starts after reboot.
-   [ ] Reconnects after internet interruption.
-   [ ] Recovers after crash.
-   [ ] Rejects untrusted updates.
-   [ ] Uninstall removes app components and credentials safely.
-   [ ] Logs contain no secrets/document content.
-   [ ] Operator can see connected/offline/paused/busy/error.

------------------------------------------------------------------------

# 11. Phase 9 --- Notifications, payment UX and handover

**Status:** Tracking/payment reference partly implemented; external
messaging and final operational polish remain.

## 11.1 Tracking

Display submitted, review, payment pending, approved/queued, printing,
submitted to spooler, ready for collection, handed over, rejected,
failed and needs review. Explain spooler submission versus physical
output.

## 11.2 Optional WhatsApp/SMS

Not an MVP blocker. If later enabled: - Use approved provider and
consent. - Store minimal contact data. - Never include document
content/file names/payment evidence. - Use idempotent notification jobs
and safe retries. - Track delivery separately from print status.

## 11.3 Payment receipt and handover

-   Receipt only after actual payment confirmation.
-   UTR/reference and verification metadata retained.
-   Duplicate receipt/payment prevented.
-   Admin marks handed over only after physical collection.
-   Handover event includes actor/time/note.
-   Agent must not mark handover unless owner approves.

**Exit:** customer status is accurate, payment is not self-declared,
handover is auditable.

------------------------------------------------------------------------

# 12. Phase 10 --- Security, reliability and QA

**Status:** 103 automated tests reported passing, but live security
tests, physical fault injection, restore drill and scheduled cleanup
verification remain.

## 12.1 Functional tests

PDF single/multi-page, JPG, PNG, file count/size boundaries,
zero-byte/corrupt file, MIME spoofing, page ranges, copies, paper sizes,
orientation, scaling, B&W/colour, simplex/duplex, odd-page duplex,
minimum charge, price override, cash, UPI, duplicate UTR,
cancel/reject/retry/reprint, expiry and retention.

## 12.2 Security tests

-   Customer enumeration denied.
-   Cross-customer access denied.
-   Tracking token guessing denied.
-   Tracking tokens absent from query strings/logs.
-   Draft secret invalid after finalization.
-   Signed URL expires.
-   Private bucket cannot be listed publicly.
-   Customer cannot forge payment/price/status.
-   Non-admin Firebase identity denied.
-   Expired/wrong issuer/wrong audience token denied.
-   Bootstrap allowlist enforced.
-   Unknown/paused/revoked device denied.
-   Credential rotation invalidates old secret.
-   Agent cannot access arbitrary paths or execute commands.
-   No service-role key in frontend/installer.
-   Malicious filenames rejected.
-   UTR race and concurrent verification tested.
-   Concurrent finalization tested.
-   Concurrent claim tested.
-   Price override during pending payment tested.

## 12.3 Reliability/fault injection

Test internet loss before/during/after download and spooler submission;
PC restart; Agent crash; printer offline; USB unplug; network
disconnect; paper out; spooler restart; Storage failure; expired
URL/lease; Supabase outage; duplicate request; Realtime disconnect; disk
full; corrupt temp file.

## 12.4 Backup/restore

-   Confirm backup coverage/retention.
-   Export schema/migration state.
-   Define Storage backup strategy.
-   Restore into non-production project.
-   Verify jobs, payments, settings and events.
-   Document RPO/RTO.
-   Never test restore by overwriting production.

## 12.5 Observability and release gates

Monitor Edge errors, upload failures, payment mismatches, queue age,
stuck claims, heartbeat age, printer errors, lease expiry,
`needs_review`, cleanup failures.

No release with critical/high security issues, cross-customer access,
exposed service key, duplicate print on ordinary retry, inconsistent
payment totals, revoked device access, incorrect cleanup or misleading
print status.

------------------------------------------------------------------------

# 13. Phase 11 --- Controlled pilot launch

**Status:** Not started.

## 13.1 Prerequisites

-   Production DB reconciled.
-   Edge Functions deployed/smoke-tested.
-   Customer portal public and verified.
-   Admin production verified.
-   Agent installed on one shop PC.
-   One printer physically tested.
-   Printer capability matrix approved.
-   QR poster test-scanned and displayed.
-   Payment rules confirmed.
-   Admin trained.
-   Backup/rollback and support procedure ready.

## 13.2 Pilot stages

**A --- Internal dry run:** controlled test jobs, UPI/cash branches, one
job per supported print mode, tracking and handover.

**B --- Supervised customer pilot:** low volume, every physical print
observed, record upload/review/payment/print/handover times and
failures.

**C --- First 50--100 real jobs:** measure upload success, invalid
uploads, payment mismatch, review time, print time, printer failures,
duplicate/uncertain outcomes, support requests, cleanup success and
Admin intervention.

## 13.3 Exit criteria

-   Routine operation without developer intervention.
-   Traceable lifecycle for every job.
-   No unresolved critical/high issue.
-   No unexplained duplicate physical prints.
-   Admin can resolve failures.
-   Customer complaints and turnaround reviewed.
-   Owner signs Go-Live approval.

Deliverables: pilot report, SOP, known limitations, final price
confirmation, Go-Live approval.

------------------------------------------------------------------------

# 14. Phase 12 --- Post-MVP scaling

**Status:** Not started; intentionally excluded from MVP critical path.

Only after the single-counter pilot is stable: 1. Multiple
printers/counters and capability-based routing. 2. Multiple branches. 3.
DOCX/XLSX/PPTX conversion in a sandboxed service. 4. Payment
gateway/webhooks. 5. Customer accounts/history. 6. Bulk uploads. 7.
Advanced reporting. 8. Consumables/page analytics. 9. Printer
maintenance alerts. 10. Hindi/English toggle. 11. Kiosk mode.

Each feature needs scope, threat model, data model, acceptance criteria
and rollback plan.

------------------------------------------------------------------------

# 15. API, data and error contracts

## 15.1 Data relationships

Preserve relationships among job, file, payment, printer, device,
attempt, event, pricing rule, settings and cleanup log. Use foreign keys
and constraints for invariants. Inspect existing schema before
adding/renaming tables.

## 15.2 Agent API contract

For each endpoint document method, route, auth, request/response schema,
size limits, errors, rate limit, idempotency, state preconditions, audit
behavior and retry behavior.

Existing operations to reuse where available: - `agent-enroll` -
`agent-heartbeat` - `agent-sync-printers` - `agent-claim-job` -
`agent-report-job-event`

Do not create duplicate endpoints without checking the current 21
function source.

## 15.3 Standard error shape

``` json
{
  "ok": false,
  "error": {
    "code": "PRINTER_UNAVAILABLE",
    "message": "The selected printer is currently unavailable.",
    "retryable": true,
    "correlation_id": "opaque-request-id"
  }
}
```

Never return stack traces, SQL details, secrets, raw tokens or private
Storage paths to customers.

## 15.4 Idempotency contract

For every retryable mutation define key scope, DB uniqueness, payload
conflict behavior, replay response, retention and audit behavior.
Duplicate requests must not create duplicate payment, attempt or
physical print.

------------------------------------------------------------------------

# 16. Deployment and environment management

## 16.1 Environment separation

Keep local development, staging/test (if provisioned) and production
distinct. Never run destructive tests against production customer data.

## 16.2 Variable inventory

Document each variable's name, runtime, public/secret classification,
environment, rotation and last verification. `VITE_*` values are public
build-time configuration, not secrets. Service-role, bootstrap, cron and
device credentials are secrets.

## 16.3 Manual release sequence

1.  Freeze source commit.
2.  Run typecheck/lint/tests.
3.  Build Admin and Customer Portal.
4.  Inspect outputs and environment.
5.  Verify migration state.
6.  Deploy approved Edge Functions.
7.  Run backend smoke tests.
8.  Deploy Admin Hosting target.
9.  Verify Admin/auth.
10. Deploy Customer Hosting target.
11. Verify `/quick-print`, upload and tracking.
12. Verify Agent connectivity.
13. Run controlled physical print.
14. Record deployment manifest.

No GitHub auto-deployment.

## 16.4 Rollback

Record previous good commit, Hosting release, function source/version,
DB compatibility, migration reversibility, emergency pause for new jobs
and active-attempt reconciliation. Never roll back schema blindly after
newer code has written data.

------------------------------------------------------------------------

# 17. Operations runbook

## Daily opening

-   PC online; Agent service running; heartbeat current.
-   Printer online; paper/ink/toner loaded.
-   Test print when required.
-   Admin and portal accessible.
-   UPI settings correct.
-   QR scans to correct portal.

## During operation

-   Review incoming jobs.
-   Verify files/page count.
-   Confirm price.
-   Verify payment according to method.
-   Release eligible jobs only.
-   Monitor queue/Agent/printer.
-   Resolve errors.
-   Review `needs_review` before reprint.
-   Mark handover only after collection.

## Daily closing

-   No unexplained active claims.
-   Stuck jobs reconciled.
-   Payment records checked.
-   Cleanup run checked.
-   Agent/printer health reviewed.
-   Audit events retained.

## Incident playbooks

Document Agent offline, printer offline, paper out, stuck job, payment
dispute, duplicate UTR, interrupted upload, expired URL, Agent crash
after spooler submission, suspected duplicate, lost credential, Supabase
outage and data exposure.

------------------------------------------------------------------------

# 18. Priority and phase gates

  -----------------------------------------------------------------------
  Priority                Work                    Reason
  ----------------------- ----------------------- -----------------------
  P0                      Production DB           Prevent
                          reconciliation and      schema/permission
                          migration 6 review      failure

  P0                      Payment and state       Protect money and job
                          consistency remediation integrity

  P0                      Phase 5 local printer   Prove physical print
                          prototype               path

  P1                      Phase 6 device client   Secure Agent identity

  P1                      Phase 7                 Execute approved jobs
                          cloud-to-spooler        

  P1                      Customer Hosting and    Public usable workflow
                          Admin Realtime          

  P1                      QR poster generator     Counter entry point

  P2                      Phase 8                 Reliable unattended
                          installer/operations    service

  P2                      Phase 10 live           Production confidence
                          QA/security             

  P2                      Phase 11 pilot          Validate real business
                                                  workflow

  P3                      Phase 12 enhancements   Scale after MVP
  -----------------------------------------------------------------------

A phase is complete only when implementation, automated tests, manual
tests, required live/hardware verification, security review,
documentation and owner acceptance are all recorded.

Suggested evidence tree:

``` text
docs/scan2print/
  production/
    PRODUCTION_BASELINE.md
    DATABASE_RECONCILIATION.md
    MIGRATION_LEDGER.md
    EDGE_FUNCTION_DEPLOYMENT.md
    HOSTING_DEPLOYMENT.md
  agent/
    ARCHITECTURE.md
    PDF_RENDERER_DECISION.md
    PRINTER_COMPATIBILITY.md
    INSTALLATION_GUIDE.md
    TROUBLESHOOTING.md
  qa/
    PHASE_5_LOCAL_PRINT_TESTS.md
    PHASE_6_DEVICE_SECURITY_TESTS.md
    PHASE_7_END_TO_END_PRINT_TESTS.md
    SECURITY_TEST_REPORT.md
    RELIABILITY_TEST_REPORT.md
    BACKUP_RESTORE_DRILL.md
  pilot/
    PILOT_PLAN.md
    PILOT_RESULTS.md
    GO_LIVE_APPROVAL.md
```

------------------------------------------------------------------------

# 19. Master remaining-work checklist

## Phase 0

-   [ ] Reconcile production DB.
-   [ ] Inspect migration 6 and compare grants.
-   [ ] Record Windows PC specifications.
-   [ ] Record printer models/drivers/connections.
-   [ ] Perform baseline PDF/image test prints.
-   [ ] Sign hardware acceptance.

## Phase 1

-   [ ] Freeze payment and state transition contract.
-   [ ] Freeze Agent API contract and MVP limits.

## Phase 2

-   [ ] Fix payment amount reconciliation and atomicity.
-   [ ] Fix duplicate UTR/concurrent verification.
-   [ ] Fix price override during pending payment.
-   [ ] Require production bootstrap allowlist.
-   [ ] Verify upload concurrency/orphan cleanup.
-   [ ] Review public view and Storage policy.
-   [ ] Deploy and smoke-test required Edge Functions.
-   [ ] Schedule and verify retention cleanup.
-   [ ] Verify Realtime publication/subscription.

## Phase 3

-   [ ] Choose Hosting strategy.
-   [ ] Configure Customer Portal target.
-   [ ] Verify production env/CORS.
-   [ ] Test mobile upload and tracking live.

## Phase 4

-   [ ] Verify Admin payment/release live.
-   [ ] Wire Realtime.
-   [ ] Verify printer/device controls.
-   [ ] Build QR poster PDF/PNG utility.
-   [ ] Test printed QR.

## Phase 5

-   [ ] Create .NET 8 Worker solution.
-   [ ] Implement printer discovery.
-   [ ] Select renderer after license review.
-   [ ] Implement PDF and image printing.
-   [ ] Apply/validate print settings.
-   [ ] Capture spooler ID/status.
-   [ ] Test real shop hardware.
-   [ ] Sign Phase 5 report.

## Phase 6

-   [ ] Enrollment client.
-   [ ] DPAPI credential protection.
-   [ ] Heartbeat loop.
-   [ ] Printer sync.
-   [ ] Pause/revoke/rotation.
-   [ ] Reboot and recovery tests.

## Phase 7

-   [ ] Secure claim loop and lease renewal.
-   [ ] Signed file downloader.
-   [ ] Checksum/type verification.
-   [ ] Durable attempt state.
-   [ ] Spooler submission and event reporting.
-   [ ] Ambiguous outcome recovery.
-   [ ] Cloud-to-printer E2E test.

## Phase 8

-   [ ] Installer and Windows Service.
-   [ ] Tray UI.
-   [ ] Signed update/rollback.
-   [ ] Log rotation and diagnostics.
-   [ ] Safe temp cleanup.
-   [ ] Install/uninstall/recovery docs.

## Phase 9

-   [ ] Verify tracking semantics.
-   [ ] Verify payment receipt/reference.
-   [ ] Verify handover.
-   [ ] External messaging only if approved.

## Phase 10

-   [ ] Functional matrix.
-   [ ] Security matrix.
-   [ ] Fault injection.
-   [ ] Live cleanup verification.
-   [ ] Backup/restore drill.
-   [ ] QA sign-off.

## Phase 11

-   [ ] Install on one shop PC.
-   [ ] Connect/test one printer.
-   [ ] Display permanent QR poster.
-   [ ] Train Admin workflow.
-   [ ] Supervised pilot.
-   [ ] Monitor first 50--100 real jobs.
-   [ ] Pilot report and Go-Live approval.

## Phase 12

-   [ ] Start only after MVP pilot stability.
-   [ ] Prioritize based on measured demand.

------------------------------------------------------------------------

# 20. Definition of Done --- end-to-end MVP

The MVP is operational only when all are true:

1.  Customer scans permanent QR and opens live portal.
2.  Mobile upload accepts valid PDF/JPG/PNG.
3.  Server rejects invalid/oversized files.
4.  Job receives secure tracking credential.
5.  Admin sees the real job.
6.  Admin securely previews the document.
7.  Server calculates final price correctly.
8.  UPI is verified or cash confirmed by Admin.
9.  Eligible job is atomically released.
10. Active Agent claims exactly one job.
11. Agent downloads authorized file and verifies checksum.
12. Agent prints to selected approved Windows printer.
13. Spooler attempt ID/status is recorded where available.
14. Ambiguous outcomes go to `needs_review`.
15. Admin can authorize retry/reprint with reason.
16. Customer sees accurate status.
17. Admin confirms handover.
18. Retention deletes eligible Storage objects and records evidence.
19. Security and reliability gates pass.
20. Pilot report is accepted by owner.

If any item is false, do not describe the product as a fully operational
end-to-end print system.

------------------------------------------------------------------------

# 21. Official technical references

Recheck versions and licensing when implementation begins.

## Microsoft --- Windows printing, services and DPAPI

-   [Windows Print Spooler
    API](https://learn.microsoft.com/en-us/windows/win32/printdocs/print-spooler-api)
-   [Print Spooler API
    functions](https://learn.microsoft.com/en-us/windows/win32/printdocs/printing-and-print-spooler-functions)
-   [.NET Worker Service as a Windows
    Service](https://learn.microsoft.com/en-us/dotnet/core/extensions/windows-service?pivots=dotnet-8-0)
-   [ProtectedData / DPAPI
    API](https://learn.microsoft.com/en-us/dotnet/api/system.security.cryptography.protecteddata)
-   [How to use Windows Data
    Protection](https://learn.microsoft.com/en-us/dotnet/standard/security/how-to-use-data-protection)

## Supabase --- Functions, secrets and scheduling

-   [Deploy Edge
    Functions](https://supabase.com/docs/guides/functions/deploy)
-   [Edge Function
    secrets](https://supabase.com/docs/guides/functions/secrets)
-   [Edge Functions
    overview](https://supabase.com/docs/guides/functions)
-   [Schedule Edge
    Functions](https://supabase.com/docs/guides/functions/schedule-functions)
-   [Supabase Cron](https://supabase.com/docs/guides/cron)

## Firebase Hosting

-   [Firebase Hosting multiple
    sites](https://firebase.google.com/docs/hosting/multisites)
-   [Firebase Hosting deploy
    targets](https://firebase.google.com/docs/cli/targets)
-   [Firebase Hosting
    configuration](https://firebase.google.com/docs/hosting/full-config)

## PDF rendering

-   [PDFium upstream
    license](https://github.com/PDFium/PDFium/blob/master/LICENSE)

**License warning:** Review the exact renderer, wrapper, native binaries
and redistribution obligations before commercial distribution. An
upstream project's license does not automatically establish the license
of every third-party wrapper or bundled binary.

------------------------------------------------------------------------

# 22. Final engineering direction

The next milestone is **Phase 0 production reconciliation plus Phase 5
local-only printer prototype**. Do not spend the critical path on
installer polish, external notifications, multi-branch support or kiosk
mode before proving physical printing.

The first demonstrable milestone:

> On the actual Windows 11 shop PC, the Agent detects the approved
> printer and reliably prints a known PDF and image test file with
> validated settings, records spooler outcome, and safely cleans
> temporary files.

Only after that local proof should the Agent be connected to production
enrollment, queue claiming and customer jobs.

**This document is a plan, not proof of completion. All checkboxes
remain open until implementation evidence and acceptance results are
recorded.**
