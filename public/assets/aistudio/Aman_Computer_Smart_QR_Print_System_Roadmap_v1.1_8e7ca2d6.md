# AMAN COMPUTER --- Smart QR Print System

## End-to-End Product, Technical Architecture & Implementation Roadmap

**Document type:** Product Requirements + Technical Design + Phased
Implementation Plan\
**Project:** Aman Computer\
**Version:** 1.0\
**Date:** 18 November 2026\
**Status:** Proposed implementation blueprint

------------------------------------------------------------------------

# 1. Executive Summary

Aman Computer Smart QR Print System customers ko shop par lage permanent
QR code ko scan karke apne mobile se documents upload karne, print
options select karne aur print job track karne dega. Shop operator
existing Aman Computer Admin Panel se jobs review, price confirm,
payment status update aur print approve karega. Shop ke Windows PC par
installed **Local Print Agent** approved jobs ko connected printer tak
bhejega aur print status admin panel ko report karega.

System ko Aman Computer ki existing website aur Supabase backend ke
andar integrate karna hai. Alag customer website ya alag admin product
banana zaroori nahi hai.

## 1.1 Main components

1.  **Customer Print Portal** --- QR scan, upload, print preferences,
    estimated price, job tracking.
2.  **Admin Print Manager** --- incoming jobs, document preview,
    pricing, approval, queue, payment, retry, reports.
3.  **Local Print Agent** --- Windows PC par installed trusted
    application jo approved jobs ko local printer par print karta hai.
4.  **Supabase Backend** --- database, private file storage, Edge
    Functions, authorization, job state and audit logs.
5.  **Permanent QR Poster** --- shop ka fixed QR code jo customer portal
    ke public route ko open karega.

## 1.2 Recommended customer journey

1.  Customer shop ka QR scan karta hai.
2.  `https://<aman-computer-domain>/quick-print` open hota hai.
3.  Customer file upload karta hai.
4.  System file validate karke print options leta hai.
5.  Customer ko Job ID aur tracking page milta hai.
6.  Admin job aur document review karta hai.
7.  Admin final price aur payment status confirm karta hai.
8.  Payment/approval ke baad job print queue mein jaata hai.
9.  Local Print Agent job securely claim karta hai.
10. Agent selected printer par print bhejta hai.
11. Agent job status report karta hai.
12. Customer tracking page par status dekhta hai; operator print
    handover karta hai.

**Important:** Customer ke upload karte hi automatic printing nahi honi
chahiye. Default workflow mein operator approval mandatory rahega.

------------------------------------------------------------------------

# 2. Goals, Non-Goals & Success Criteria

## 2.1 Goals

-   Customer ko WhatsApp ya pen drive ke bina document submit karne
    dena.
-   Mobile-friendly upload experience.
-   Admin ke paas har print job ka control.
-   USB aur network-connected Windows printers ko support karna.
-   Duplicate printing aur unauthorized printing ko rokna.
-   Price, payment, print status aur daily revenue ka record rakhna.
-   Multiple printers/counters ke liye future-ready architecture.
-   Customer documents ko private rakhna aur retention period ke baad
    delete karna.

## 2.2 Initial non-goals

Initial release mein ye features mandatory nahi hain:

-   Customer ke phone se direct printer discovery/printing.
-   Public internet se shop PC ko inbound connection.
-   Automatic OCR correction or document editing.
-   Complex online payment gateway.
-   Multiple shop branches.
-   Customer account creation.
-   Fully unattended self-service kiosk printing.

In features ko later phases mein add kiya ja sakta hai.

## 2.3 Success criteria

Release tab successful maana jayega jab:

-   QR scan se portal mobile browser mein khule.
-   Allowed file types reliably upload hon.
-   Invalid, oversized ya unsafe files reject hon.
-   Admin har job ko review aur approve/reject kar sake.
-   Agent sirf authorized jobs claim kare.
-   Printer offline hone par job silently lost na ho.
-   Duplicate print ko prevent ya explicitly authorize kiya ja sake.
-   Job status customer aur admin dono ko consistent dikhe.
-   Agent restart aur internet reconnect ke baad recover kar sake.
-   Temporary document files configured retention ke baad delete hon.
-   Critical actions audit log mein record hon.

------------------------------------------------------------------------

# 3. Architecture Decision

## 3.1 Recommended technology stack

  -----------------------------------------------------------------------
  Layer                   Recommended technology  Responsibility
  ----------------------- ----------------------- -----------------------
  Existing website        React + TypeScript +    Customer portal and
                          Vite (existing project  admin UI
                          stack)                  

  Styling                 Existing Aman Computer  Consistent UI
                          design system /         
                          Tailwind                

  Backend                 Supabase                Database, Auth,
                                                  Realtime, Edge
                                                  Functions

  Database                PostgreSQL              Jobs, devices,
                                                  printers, prices, logs

  File storage            Supabase Private        Uploaded customer
                          Storage                 documents

  Server-side logic       Supabase Edge Functions Secure job creation,
                                                  approval, claiming,
                                                  status

  Local agent             C# / .NET 8 for Windows Reliable Windows
                                                  integration

  Windows printing        Windows Print Spooler   Printer discovery and
                          APIs                    print submission

  PDF rendering           A maintained PDF        PDF page rendering
                          rendering/printing      
                          component               

  Image printing          .NET image processing + JPG/PNG layout and
                          Windows print APIs      printing

  Installer               Signed Windows          Installation and
                          installer (MSIX or      updates
                          setup EXE)              

  QR                      Static QR pointing to   Customer entry point
                          public portal URL       
  -----------------------------------------------------------------------

### Why .NET for Local Print Agent?

Node.js/Electron is possible, but the agent ka primary kaam Windows
printers, spooler, device configuration aur background operation hai.
C#/.NET Windows APIs ke saath zyada natural integration deta hai.
Electron UI ki zaroorat nahi hai; lightweight Windows tray app +
background worker enough hai.

**Implementation note:** PDF printing ke liye ek maintained and licensed
rendering component select karna hoga. Component ka commercial-use
license, silent printing support, paper-size handling aur deployment
terms verify kiye bina library lock na karein. Windows par installed PDF
viewer ke command-line printing par permanent dependency banana avoid
karein.

## 3.2 High-level architecture

``` text
CUSTOMER PHONE
     |
     | Scan permanent QR
     v
AMAN COMPUTER WEBSITE
/quick-print
     |
     | Secure upload request
     v
SUPABASE EDGE FUNCTIONS
     |
     +------> POSTGRES DATABASE
     |          |
     |          +-- print_jobs
     |          +-- print_job_files
     |          +-- print_devices
     |          +-- printers
     |          +-- print_events
     |          +-- pricing_rules
     |
     +------> PRIVATE STORAGE BUCKET
                |
                | Admin-approved job only
                v
         ADMIN PRINT MANAGER
                |
                | Approve + release
                v
         SECURE JOB QUEUE
                |
                | Agent outbound HTTPS polling/claim
                v
         WINDOWS LOCAL PRINT AGENT
                |
                v
         WINDOWS PRINT SPOOLER
                |
                v
         USB / NETWORK PRINTER
                |
                | Status acknowledgement
                v
         SUPABASE JOB STATUS
                |
                v
         CUSTOMER TRACKING PAGE
```

## 3.3 Network model

-   Local Agent shop PC se outbound HTTPS connection karega.
-   Router par port forwarding ya public inbound port open nahi karna.
-   Agent Supabase Edge Function ko authenticated requests bhejega.
-   Realtime notification optional optimization ho sakta hai; reliable
    job claim/lease API source of truth rahegi.
-   Internet disconnect hone par agent new cloud jobs claim nahi kar
    sakta. Already submitted Windows spooler jobs ka status local level
    par inspect kiya ja sakta hai, lekin cloud status sync connection
    wapas aane par hoga.

------------------------------------------------------------------------

# 4. User Roles & Permissions

## 4.1 Customer

Can: - Public print portal open karna. - Allowed files upload karna. -
Print preferences select karna. - Job submit karna. - Job ID/token se
status check karna. - Shop ke rules aur estimated charges dekhna.

Cannot: - Kisi aur customer ki file dekhna. - Kisi job ko approve
karna. - Direct printer command bhejna. - Admin pricing ya print status
modify karna.

## 4.2 Operator

Can: - Incoming jobs dekhna. - Uploaded documents preview karna. - Page
count verify karna. - Price calculate/adjust karna (permission ke
according). - Cash/UPI payment status update karna. - Job
approve/reject/hold karna. - Approved job ko print queue mein release
karna. - Authorized reprint initiate karna.

## 4.3 Admin

Can: - Operator ke sab permissions. - Pricing rules manage karna. -
Printers aur agent devices manage karna. - Job cancel/retry/release
karna. - Reports aur audit logs dekhna. - Retention settings manage
karna. - Staff permissions configure karna.

## 4.4 Device identity

Har Local Print Agent installation ka unique device record hoga. Device
ko admin approval ke baad hi jobs milenge. Device identity ko normal
customer session ya public API key ke saath confuse nahi karna hai.

------------------------------------------------------------------------

# 5. Customer Portal --- Detailed Requirements

Route: `/quick-print`

## 5.1 Landing screen

Display: - Aman Computer logo and brand. - Heading: **Smart Print ---
Scan. Upload. Print.** - Short instructions. - Supported file types and
maximum file size. - Shop opening hours/contact. - Privacy/retention
notice. - Upload button. - Help/FAQ.

Mobile-first design: large touch targets, clear steps, no unnecessary
animation, fast loading.

## 5.2 Supported formats

Suggested initial support: - PDF - JPG / JPEG - PNG

Later, if reliable conversion and preview are implemented: - DOC /
DOCX - XLS / XLSX - PPT / PPTX

**Recommendation:** First release mein PDF and image files tak limit
rakhein. Office files ko direct print support tabhi add karein jab
server-side conversion, fonts, page layout aur macro safety properly
tested ho. Browser file extension alone par trust na karein.

## 5.3 Upload validation

Validate on both client and server: - Maximum file size (initial
proposal: 20 MB per file; admin-configurable). - Maximum files per job
(initial proposal: 5). - File extension allowlist. - MIME type. - File
signature/magic bytes. - Corrupt/unreadable file detection. - Zero-byte
file rejection. - Filename sanitization. - Malware scanning where
operationally available.

Do not accept executable, script, archive or macro-enabled formats in
the initial release.

## 5.4 Upload flow

1.  Customer selects one or more files.
2.  Browser shows filename, size and upload progress.
3.  Backend creates a pending job and a restricted upload authorization.
4.  File uploads to a private bucket using a short-lived signed upload
    URL or authenticated upload flow.
5.  Backend verifies uploaded object metadata.
6.  Job is submitted and a tracking token is generated.
7.  Customer sees confirmation.

Do not expose the bucket publicly. Do not put service-role keys in
frontend code.

## 5.5 Print options

Initial options: - Print mode: Black & White / Colour. - Paper size: A4
/ A3 / Legal (only if selected printer supports it). - Sides:
Single-sided / Double-sided (only if printer supports duplex). - Copies:
1--20 (admin-configurable). - Page range: All pages / Custom range. -
Orientation: Auto / Portrait / Landscape. - Scaling: Fit to page /
Actual size (where supported). - Paper type: Normal (additional paper
types later).

The UI must only offer options supported by the selected printer/counter
configuration. Admin must be able to override settings after review.

## 5.6 Price estimate

Show an estimate before submission, with a clear note that final price
is confirmed by the operator after document review.

Potential price inputs: - Page count. - Colour or B&W. - Paper size. -
Single or double-sided. - Copies. - Special paper or finishing charge
(later).

Do not calculate price only from file count. Page count must be
extracted/verified, and duplex pricing rules must be explicitly defined.

## 5.7 Confirmation and tracking

After submission display: - Job ID (human-readable). - Secret tracking
token or secure tracking link. - Submitted time. - File names. -
Selected options. - Estimated price. - Status: Submitted / Under Review.

Tracking access must use an unguessable token or OTP. A short sequential
Job ID alone must never authorize document access.

------------------------------------------------------------------------

# 6. Admin Print Manager --- Detailed Requirements

Route suggestion: `/admin/print-management`

## 6.1 Dashboard overview

Cards: - New Requests - Awaiting Payment - Approved / Queued -
Printing - Completed Today - Failed / Needs Attention - Today's Print
Revenue

## 6.2 Print queue

Table columns: - Job ID - Customer name (optional) - Submitted time -
File count - Page count - Print mode - Copies - Estimated/final price -
Payment status - Job status - Assigned printer/device - Actions

Filters: - Status - Date range - Printer - Payment status - Colour/B&W -
Search by Job ID

## 6.3 Job detail screen

Must show: - File list and secure preview. - Page count. - File
validation result. - Customer print preferences. - Estimated price and
final price. - Payment record. - Status timeline. - Assigned
device/printer. - Agent result/error. - Admin notes. - Reprint history.

## 6.4 Admin actions

-   Approve
-   Reject with reason
-   Put on hold
-   Confirm price
-   Mark cash received
-   Mark UPI received (manual confirmation in MVP)
-   Release to print queue
-   Cancel before printing
-   Retry failed job
-   Authorize reprint
-   Mark handed over

Every important action must write an audit event with actor, time, old
status, new status and reason where applicable.

## 6.5 Payment

MVP: - Cash - UPI paid (operator verifies payment manually) - Unpaid /
pending

Do not mark UPI paid merely because customer clicks a button or uploads
a screenshot. Automated payment gateway/webhook integration can be a
later phase.

------------------------------------------------------------------------

# 7. Local Print Agent --- Complete Design

## 7.1 What it is

Local Print Agent ek Windows application/service hai jo Aman Computer ke
shop PC par install hoga. Ye approved print jobs ko secure backend se
fetch karega, local printer configuration ke according print request
prepare karega aur Windows Print Spooler ko job submit karega.

It is the bridge between the cloud website and physical printer.

## 7.2 Agent components

1.  **Windows Background Worker**
    -   Runs in the background.
    -   Starts automatically after system startup.
    -   Maintains device heartbeat.
    -   Checks for authorized jobs.
2.  **Tray/Control UI**
    -   Shows agent online/offline.
    -   Shows connected printers.
    -   Shows current job and recent results.
    -   Allows admin/operator to pause/resume the device.
    -   Shows update and error notifications.
3.  **Secure API Client**
    -   Authenticates device.
    -   Claims jobs.
    -   Downloads approved files using short-lived signed URLs.
    -   Reports job lifecycle events.
4.  **Print Job Processor**
    -   Verifies downloaded file checksum/size.
    -   Validates supported file type.
    -   Applies allowed print settings.
    -   Submits job to Windows printing subsystem.
    -   Records Windows spooler job ID where available.
5.  **Local Temporary Storage**
    -   Stores only the files needed for processing.
    -   Uses a restricted application data folder.
    -   Deletes files after completion/failure retention policy.
    -   Does not store permanent customer archives.
6.  **Diagnostics and Update Module**
    -   Logs errors without logging document contents or secrets.
    -   Supports version checks and controlled updates.
    -   Allows admin to revoke a device.

## 7.3 Agent lifecycle

1.  Windows starts.
2.  Agent service starts.
3.  Agent loads protected device credentials.
4.  Agent connects to backend over HTTPS.
5.  Backend validates device status.
6.  Agent sends heartbeat.
7.  Agent fetches supported printer list from Windows.
8.  Agent waits for available jobs.
9.  Agent claims one job with a time-limited lease.
10. Agent downloads files via short-lived signed URLs.
11. Agent validates file and requested settings.
12. Agent submits print job to Windows spooler.
13. Agent records spooler acknowledgement/job ID.
14. Agent reports status to backend.
15. Agent monitors completion where Windows driver/spooler exposes
    reliable information.
16. Agent cleans up temporary files according to policy.
17. Agent claims next job.

## 7.4 Job claim and lease

A job must not be delivered to two agents at the same time.

Backend claim operation should be atomic: - Confirm job is approved and
released. - Confirm device is active and authorized for the
printer/counter. - Confirm job is not already claimed by another active
worker. - Set `claimed_by_device_id`. - Set `lease_expires_at`. -
Generate a claim token. - Return job details and short-lived download
URLs.

If the agent crashes, the lease expires and the job returns to a
recoverable state. Before reprinting, the system must check whether the
previous attempt may already have reached the Windows spooler. Ambiguous
outcomes should go to **Needs Review**, not automatic retry.

## 7.5 Exactly-once printing limitation

Cloud APIs and Windows spooler cannot guarantee true exactly-once
physical printing in every failure scenario. Example: printer receives
pages, but PC loses internet before the completion event is saved.
Backend cannot know with certainty whether paper came out.

Therefore: - Use idempotency keys for job attempts. - Store each print
attempt separately. - Record Windows spooler job ID. - Do not
automatically retry an ambiguous print. - Show "Needs Review" and
require operator decision. - Provide explicit "Reprint" action with
reason and audit event.

## 7.6 Printer discovery and capability

Agent should detect: - Installed printer names. - Default printer. -
Online/offline state where Windows driver exposes it. - Supported paper
sizes. - Colour capability. - Duplex capability. - Driver status/errors
where available.

Printer capabilities are driver-dependent. Do not assume every printer
reports every property accurately. Admin should be able to manually
configure and test the printer profile.

## 7.7 Printing formats

MVP: - PDF - JPG/JPEG - PNG

PDF: - Verify page count. - Respect page range. - Apply copies, paper
size, colour mode and duplex where supported. - Preserve orientation and
scaling rules. - Render/print without requiring a visible
customer-facing dialog.

Images: - Apply selected paper size. - Fit or actual-size option. -
Orientation. - Copies. - Colour/B&W handling.

Office formats: - Later phase only. - Use controlled conversion to PDF
in a sandboxed process. - Do not open untrusted documents with macros
enabled. - Test fonts, page breaks, spreadsheet print areas and slide
layouts.

## 7.8 Agent security

-   Never embed Supabase service-role key in the agent.
-   Each device gets its own identity and revocable credential.
-   Store device secrets using Windows DPAPI or an equivalent
    OS-protected mechanism.
-   Use HTTPS with certificate validation.
-   Short-lived signed file URLs.
-   Restrict device to configured printer(s) and job types.
-   Admin can deactivate/revoke a device.
-   Do not expose a local HTTP server to the public network.
-   Do not accept arbitrary shell commands or arbitrary file paths from
    backend.
-   Validate all print settings against allowlists.
-   Keep logs free of secrets and document contents.
-   Sign installer and updates where possible.

## 7.9 Agent UI

Suggested screens: - Status: Connected / Disconnected / Paused. - Device
name and ID. - Active printer. - Printer status. - Current job. - Last
10 jobs. - Test print. - Pause / Resume. - Refresh printer list. -
Diagnostics. - Version and update status.

The tray UI should not allow changing security-critical settings without
admin authorization.

------------------------------------------------------------------------

# 8. Database Design

Final schema should follow existing Aman Computer Supabase naming
conventions and migrations. Proposed entities:

## 8.1 `print_jobs`

Suggested columns: - `id` UUID primary key - `job_number` unique
human-readable identifier - `tracking_token_hash` secure hash, not raw
token - `customer_name` nullable - `customer_phone` nullable, only if
genuinely needed - `status` - `payment_status` - `estimated_amount` -
`final_amount` - `currency` - `requested_print_mode` - `paper_size` -
`sides` - `orientation` - `scaling` - `copies` - `page_range` -
`page_count` - `assigned_printer_id` - `claimed_by_device_id` -
`lease_expires_at` - `submitted_at` - `approved_at` - `completed_at` -
`expires_at` - `created_at` - `updated_at`

## 8.2 `print_job_files`

-   `id`
-   `job_id`
-   `storage_path`
-   `original_filename`
-   `mime_type`
-   `file_size`
-   `sha256_checksum`
-   `page_count`
-   `validation_status`
-   `created_at`
-   `deleted_at`

Never store public file URLs in this table. Store private bucket paths.

## 8.3 `print_devices`

-   `id`
-   `device_name`
-   `device_fingerprint`
-   `credential_hash` or secure credential reference
-   `status` (pending/active/revoked)
-   `agent_version`
-   `last_heartbeat_at`
-   `approved_by`
-   `created_at`
-   `updated_at`

Avoid storing raw device secrets in readable database columns. Use a
secure enrollment and credential rotation design.

## 8.4 `print_printers`

-   `id`
-   `device_id`
-   `system_printer_name`
-   `display_name`
-   `is_default`
-   `is_enabled`
-   `supports_colour`
-   `supports_duplex`
-   `supported_paper_sizes`
-   `last_status`
-   `last_seen_at`

## 8.5 `print_job_attempts`

-   `id`
-   `job_id`
-   `device_id`
-   `printer_id`
-   `attempt_number`
-   `idempotency_key`
-   `status`
-   `windows_spooler_job_id`
-   `started_at`
-   `submitted_to_spooler_at`
-   `finished_at`
-   `error_code`
-   `error_message_safe`
-   `created_by`

## 8.6 `print_events`

-   `id`
-   `job_id`
-   `actor_type` (customer/admin/agent/system)
-   `actor_id`
-   `event_type`
-   `old_status`
-   `new_status`
-   `metadata` JSONB with safe, non-sensitive data only
-   `created_at`

## 8.7 `print_pricing_rules`

-   `id`
-   `name`
-   `paper_size`
-   `print_mode`
-   `sides`
-   `price_per_sheet` or clearly defined pricing unit
-   `minimum_charge`
-   `is_active`
-   `valid_from`
-   `valid_until`
-   `created_at`
-   `updated_at`

Pricing rules must clearly distinguish **page** from **physical sheet**.
For duplex jobs, one sheet may contain two printed pages.

## 8.8 Optional later tables

-   `print_counters`
-   `print_payment_records`
-   `print_device_enrollments`
-   `print_service_settings`
-   `print_notifications`

------------------------------------------------------------------------

# 9. Job Status State Machine

Recommended statuses:

  Status                   Meaning
  ------------------------ ---------------------------------------------------------
  `draft`                  Upload/session started but not submitted
  `submitted`              Customer submitted request
  `under_review`           Operator reviewing files/options
  `awaiting_payment`       Final price set; payment pending
  `approved`               Admin approved job
  `queued`                 Released to agent queue
  `claimed`                Agent has a valid lease
  `downloading`            Agent downloading approved files
  `printing`               Job submitted to print subsystem / printing in progress
  `submitted_to_spooler`   Windows accepted the print job
  `completed`              Operator/agent has sufficient completion confirmation
  `failed`                 A confirmed failure occurred
  `needs_review`           Outcome uncertain or manual intervention needed
  `rejected`               Admin rejected the job
  `cancelled`              Job cancelled before irreversible print submission
  `expired`                Job exceeded configured lifetime

Transitions must be enforced server-side. Frontend must never update job
status directly with unrestricted database writes.

**Important distinction:** "Submitted to Windows spooler" is not the
same as "paper physically printed." UI wording should not overpromise.
If printer telemetry cannot confirm physical output, operator should
confirm final handover/completion.

------------------------------------------------------------------------

# 10. Supabase Security & Data Protection

## 10.1 Storage

-   Use a private bucket, e.g. `print-uploads`.
-   Disable public access.
-   Use randomized storage object paths, not customer filenames.
-   Signed URLs should be short-lived and generated only after
    authorization.
-   Separate upload permission from download/print permission.
-   Agent download URL only after successful job claim.
-   Delete storage objects after configured retention period.

## 10.2 RLS

Enable RLS on every customer-facing and admin-facing table.

Policies must ensure: - Anonymous customers cannot list all jobs. -
Customer can access only a job through a secure tracking mechanism. -
Public tracking does not expose original document files. - Only
authorized admin/operator roles can review documents. - Only
backend-controlled functions can approve/release jobs. - Only an active
registered agent can claim jobs assigned to its allowed device/printer
scope. - Revoked devices cannot fetch jobs or files.

Do not rely on hiding buttons in the frontend as authorization.

## 10.3 Edge Functions

Suggested functions: - `create-print-job` - `create-print-upload-url` -
`finalize-print-upload` - `get-print-job-status` -
`admin-review-print-job` - `admin-release-print-job` - `agent-enroll` -
`agent-heartbeat` - `agent-list-printers` - `agent-claim-job` -
`agent-get-job-files` - `agent-report-job-event` -
`admin-retry-print-job` - `cleanup-expired-print-files`

Every function must validate caller identity, role/device state, payload
and job transition.

## 10.4 Data retention

Proposed initial policy (admin-configurable): - Unsubmitted upload
sessions: delete after 1 hour. - Rejected/cancelled files: delete within
24 hours unless operationally required. - Completed print documents:
delete after 24 hours. - Failed/needs-review documents: retain for a
limited support window, e.g. up to 72 hours, then delete unless admin
extends with reason. - Job metadata and financial/audit records: retain
according to applicable business/accounting requirements.

Do not promise automatic deletion until scheduled cleanup is
implemented, monitored and tested. Deleting a database row does not
automatically delete the Storage object.

------------------------------------------------------------------------

# 11. Pricing & Business Rules

Admin-configurable rates should include: - A4 B&W single-sided per
printed page or sheet. - A4 B&W duplex. - A4 colour. - A3 B&W / colour
if available. - Legal size if supported. - Minimum job charge. -
Additional service charges if applicable.

Before implementation, Aman Computer must decide: 1. Price per page or
per sheet? 2. Duplex charge: per sheet or per printed side? 3. Colour
page charge if a page has only a small colour element? 4. Minimum
charge? 5. Customer cancellation/refund rule? 6. Whether operator can
override estimate and whether reason is mandatory?

The price calculator must use a single server-side pricing function so
customer UI and admin UI cannot produce conflicting totals.

------------------------------------------------------------------------

# 12. QR Code & Shop Poster

## 12.1 Permanent QR

QR should encode only the stable public URL, for example:

`https://your-domain.example/quick-print`

Replace the example with the final production domain before printing the
poster.

Do not encode a temporary signed upload link or admin URL. Permanent QR
must continue working even if the website backend changes.

## 12.2 Poster copy

**AMAN COMPUTER**\
**SMART PRINT**

Scan. Upload. Print.

1.  Scan the QR code\
2.  Upload your document\
3.  Select print options\
4.  Collect your print at the counter

Supported: PDF, JPG, PNG\
Ask the counter for pricing and assistance.

Poster should include: - High-contrast QR with sufficient quiet zone. -
Short URL below QR as fallback. - Aman Computer logo. - Clear
instructions. - Shop contact/help information. - Privacy note.

Print a test poster and scan it from multiple Android/iPhone cameras at
realistic distances and lighting.

------------------------------------------------------------------------

# 13. Phased Implementation Roadmap

Each phase must end with a review, tests and acceptance sign-off. Do not
start the next phase while critical security or data-integrity issues
remain open.

## Phase 0 --- Discovery & Hardware Audit

**Purpose:** Confirm the actual shop setup before writing the agent.

Tasks: - Confirm Windows 10/11 version and PC specifications. - List
every printer make/model. - Confirm USB or LAN/Wi-Fi connection. -
Record installed Windows driver and driver version. - Check colour,
duplex, paper sizes and tray support. - Test printing PDF and images
manually. - Confirm internet reliability and power backup. - Decide
number of PCs, counters and printers. - Decide shop pricing and
operating rules. - Confirm production website domain and existing
Supabase project.

Deliverables: - Hardware inventory. - Supported printer capability
matrix. - Final MVP scope. - Pricing rules. - Deployment assumptions.

Acceptance: - At least one target Windows PC and printer are available
for development/testing. - Printer model and driver are known. - All
initial print options are confirmed.

## Phase 1 --- Product Specification & UX

Tasks: - Define customer flow. - Define admin workflow. - Define all job
states and transitions. - Design mobile upload screen. - Design tracking
page. - Design admin queue and job details. - Design agent tray UI. -
Define error and empty states. - Define pricing display and privacy
copy.

Deliverables: - Approved screen designs. - User-flow diagram. - Status
transition matrix. - MVP feature checklist.

Acceptance: - Customer and operator flows can be completed without
ambiguity. - No unsupported printer options are shown.

## Phase 2 --- Database & Backend Foundation

Tasks: - Create versioned Supabase migrations. - Create print
jobs/files/devices/printers/attempts/events/pricing tables. - Add
indexes and constraints. - Enable RLS. - Create private Storage
bucket. - Implement Edge Functions for job creation and upload
finalization. - Implement secure admin review/approval. - Implement
audit event writing. - Implement retention metadata and cleanup plan. -
Add server-side price calculation.

Deliverables: - Database migrations. - Edge Functions. - RLS policy
tests. - API contract documentation.

Acceptance: - Anonymous user cannot enumerate jobs. - Customer cannot
access another customer's job. - Public users cannot download private
documents. - Admin actions are role-checked server-side. - Service-role
secrets never reach browser or agent.

## Phase 3 --- Customer QR Print Portal

Tasks: - Add `/quick-print` route to existing Aman Computer website. -
Build responsive upload UI. - Implement client-side file checks for
usability. - Implement server-side validation. - Implement secure
private upload. - Add print preferences. - Add price estimate. - Add
submit confirmation and Job ID. - Add secure tracking link/token. - Add
clear upload failure/retry handling. - Add privacy/retention notice.

Deliverables: - Working customer portal. - Upload and tracking APIs. -
Mobile responsive screens.

Acceptance: - Test on common Android browsers. - Valid PDFs/images
upload. - Invalid and oversized files reject. - Refreshing confirmation
page does not create duplicate jobs. - Tracking token cannot be guessed
or enumerated.

## Phase 4 --- Admin Print Management

Tasks: - Add Print Management module to existing admin sidebar. - Build
queue dashboard. - Build job details and secure document preview. - Add
page count and print setting review. - Add price confirmation. - Add
approve/reject/hold actions. - Add cash/UPI manual payment status. - Add
release-to-queue action. - Add cancel/retry/reprint controls with
permissions. - Add event timeline and audit logs. - Add filters, search
and pagination.

Deliverables: - Admin Print Manager. - Role/permission integration. -
Operator workflow documentation.

Acceptance: - Operator can process a complete job. - Unapproved job
cannot enter agent queue. - Reprint requires explicit authorized
action. - Every sensitive action is auditable.

## Phase 5 --- Local Print Agent Prototype

**Purpose:** Prove real printing on the actual shop hardware before
building the complete production agent.

Tasks: - Create C#/.NET Windows application. - Detect installed
printers. - Show printer status and capabilities. - Print a local test
PDF. - Print JPG and PNG test files. - Apply paper size, copies, colour
and duplex where supported. - Capture spooler job ID/status where
available. - Test printer offline, paper-out and driver error
scenarios. - Confirm PDF rendering component and license.

Deliverables: - Local prototype. - Printer compatibility report. - Test
print samples. - Chosen rendering/printing implementation.

Acceptance: - Test files print correctly on the actual shop printer. -
Unsupported settings are rejected safely. - Errors are visible and
diagnosable. - No cloud credentials are required for local test mode.

## Phase 6 --- Secure Device Enrollment & Agent Backend

Tasks: - Create device enrollment flow. - Admin approves device. - Issue
device-specific credential. - Protect credential using Windows DPAPI. -
Implement device heartbeat. - Implement device revocation. - Implement
printer registration and capability sync. - Implement authenticated
agent APIs. - Add rate limits and request validation.

Deliverables: - Device management admin screen. - Enrollment and
heartbeat APIs. - Secure agent identity lifecycle.

Acceptance: - Unknown device cannot claim jobs. - Revoked device
immediately loses access. - One device cannot impersonate another. - No
service-role key is present in agent package.

## Phase 7 --- Job Queue, Claim & Print Execution

Tasks: - Implement atomic job claim with lease. - Implement idempotency
and attempt records. - Download approved files with short-lived URLs. -
Verify checksum and file metadata. - Implement PDF/image print
processing. - Apply validated print settings. - Submit to Windows
spooler. - Report every lifecycle event. - Implement timeout and lease
recovery. - Handle ambiguous outcomes with `needs_review`. - Prevent
silent automatic duplicate printing.

Deliverables: - End-to-end cloud-to-printer workflow. - Job attempt
history. - Recovery and failure handling.

Acceptance: - Approved job prints on target printer. - Two agents cannot
claim the same active job. - Crashed agent lease can recover safely. -
Uncertain print result is not automatically reprinted. - Admin can
identify and resolve failed jobs.

## Phase 8 --- Production Agent Installer & Operations

Tasks: - Create Windows installer. - Configure service startup and tray
UI. - Add controlled update mechanism. - Add log rotation. - Add
diagnostics export without sensitive document data. - Add graceful
shutdown. - Add network reconnect. - Add local temp file cleanup. - Add
version compatibility checks. - Sign installer/update packages where
feasible. - Document install, uninstall and recovery steps.

Deliverables: - Production installer. - Installation guide. - Agent
operations guide. - Version/update policy.

Acceptance: - Agent starts after Windows restart. - Agent reconnects
after internet interruption. - Operator can pause/resume. - Uninstall
removes application components and credentials safely. - Updates cannot
be installed from untrusted sources.

## Phase 9 --- Notifications, Payment & Customer Experience

Tasks: - Add customer status notifications in tracking page. - Add
optional WhatsApp/SMS integration only through approved provider and
consent. - Add print-ready notification. - Add payment receipt/reference
capture if needed. - Add operator handover confirmation. - Improve help
and failure guidance.

Deliverables: - Customer notification workflow. - Payment record
workflow. - Handover status.

Acceptance: - Notifications do not reveal document content. - Payment
status is not customer-self-declared. - Customer sees accurate job
status.

## Phase 10 --- Security, Reliability & QA

Test categories:

**Functional** - Upload valid PDF/image. - Multiple files. - Large
file. - Corrupt file. - Unsupported file. - Page range. - Copies. -
Colour/B&W. - Duplex. - Paper size. - Price estimate and final price. -
Reject/cancel/reprint.

**Security** - RLS tests. - Token guessing. - Cross-customer access. -
Expired signed URL. - Revoked device. - Forged status update. -
Unauthorized queue claim. - File path traversal attempts. - Malicious
filenames and MIME spoofing. - Secret scanning of frontend and
installer.

**Reliability** - Internet disconnect. - PC restart during job. - Agent
crash. - Printer disconnect. - Printer offline. - Paper out. - Spooler
restart. - Duplicate API request. - Expired lease. - Storage download
failure. - Supabase service interruption.

**Operational** - Daily queue review. - Device heartbeat monitoring. -
Cleanup job verification. - Backup and restore test. - Audit log review.

Deliverables: - QA report. - Security checklist. - Known limitations. -
Release approval.

Acceptance: - No open critical/high security issue. - No duplicate print
on ordinary retry path. - Failure states are visible and recoverable. -
Retention cleanup is verified against actual Storage objects.

## Phase 11 --- Pilot Launch

Tasks: - Install on one shop PC. - Connect one printer. - Generate
permanent QR. - Print and display QR poster. - Run staff training. -
Start with operator approval for every job. - Monitor first 50--100 real
jobs. - Record upload failures, print failures and average turnaround. -
Adjust price and UI based on actual use.

Deliverables: - Pilot report. - Updated operating procedure. - Go-live
approval.

Acceptance: - Staff can operate without developer intervention for
routine jobs. - All job outcomes are traceable. - Customer complaints
and failure rate are reviewed.

## Phase 12 --- Scale & Advanced Features

Possible additions: - Multiple printers and counters. - Printer routing
by paper size/colour capability. - Multiple shop branches. -
DOCX/XLSX/PPTX conversion. - Online payment gateway. - Customer accounts
and order history. - Bulk document upload. - Advanced daily/monthly
reports. - Consumables and page-count analytics. - Printer maintenance
alerts. - Hindi/English language toggle. - Self-service kiosk mode.

These are not MVP blockers.

------------------------------------------------------------------------

# 14. API Contract --- Proposed

Exact schemas should be finalized with the existing Supabase project
conventions.

  -----------------------------------------------------------------------------
  Function                        Caller               Purpose
  ------------------------------- -------------------- ------------------------
  `create-print-job`              Customer             Create draft job and
                                                       return upload
                                                       instructions

  `create-print-upload-url`       Customer             Get restricted
                                                       short-lived upload
                                                       authorization

  `finalize-print-upload`         Customer             Verify uploaded objects
                                                       and submit job

  `get-print-job-status`          Customer with        Read limited status
                                  tracking token       information

  `admin-review-print-job`        Admin/operator       Approve, reject, hold,
                                                       set final price

  `admin-release-print-job`       Admin/operator       Release approved/paid
                                                       job to queue

  `agent-enroll`                  New agent            Start device enrollment

  `agent-heartbeat`               Registered agent     Report device
                                                       health/version

  `agent-sync-printers`           Registered agent     Sync local printer
                                                       list/capabilities

  `agent-claim-job`               Registered agent     Atomically claim one
                                                       eligible job

  `agent-report-job-event`        Registered agent     Report
                                                       download/print/spooler
                                                       events

  `admin-retry-print-job`         Admin                Create an authorized new
                                                       attempt

  `cleanup-expired-print-files`   Scheduled backend    Delete expired Storage
                                                       objects safely
  -----------------------------------------------------------------------------

All endpoints must: - Validate input. - Authenticate caller. - Authorize
role/device. - Enforce valid status transitions. - Return structured
error codes. - Use idempotency for retryable requests. - Avoid exposing
stack traces or secrets.

------------------------------------------------------------------------

# 15. Error Handling Matrix

  ---------------------------------------------------------------------
  Error                              Expected behavior
  ---------------------------------- ----------------------------------
  Invalid file                       Reject upload with clear reason

  File too large                     Show configured size limit

  Upload interrupted                 Allow safe retry without duplicate
                                     job

  File corrupt                       Mark validation failed; notify
                                     operator/customer

  Printer offline                    Keep job queued or mark blocked;
                                     do not report printed

  Paper out                          Pause/retry only after operator
                                     checks printer

  Agent offline                      Keep job queued; show device
                                     offline

  Agent crashes before spooler       Lease expires; safe recovery after
  submission                         checking attempt state

  Agent crashes after spooler        Mark needs review if completion
  submission                         uncertain

  Duplicate claim request            Return existing claim/attempt or
                                     reject safely

  Signed URL expired                 Request a new authorized URL after
                                     revalidating claim

  Supabase unavailable               Agent backs off and retries; do
                                     not lose local diagnostics

  Customer tracking token invalid    Return generic
                                     not-found/unauthorized response
  ---------------------------------------------------------------------

------------------------------------------------------------------------

# 16. Monitoring & Reports

Admin should see: - Total jobs today. - Completed jobs. - Failed jobs. -
Pending jobs. - Total printed pages. - Colour vs B&W pages. - Revenue by
payment method. - Printer-wise workload. - Average job processing
time. - Agent online/offline status. - Frequent failure reasons.

Agent health: - Last heartbeat. - Agent version. - Windows version. -
Printer availability. - Last successful print. - Pending local
processing state, if any.

Do not collect unnecessary personal data or document contents for
analytics.

------------------------------------------------------------------------

# 17. Backup, Recovery & Maintenance

-   Use Supabase's supported backup/PITR options according to project
    plan and operational needs.
-   Keep database migrations in version control.
-   Do not treat Storage file backups as automatically covered by
    database backups.
-   Test restore procedure.
-   Monitor Edge Function failures and scheduled cleanup.
-   Rotate/revoke device credentials when PC is replaced or compromised.
-   Keep Windows and printer drivers updated after testing.
-   Keep a manual fallback: operator can download an approved document
    from admin and print it manually if agent is unavailable, with the
    manual action recorded in the job timeline.
-   Never allow manual fallback to bypass authorization or audit logs.

------------------------------------------------------------------------

# 18. Deployment Plan

## Website

-   Deploy `/quick-print` and admin module with the existing Aman
    Computer website.
-   Configure production environment variables only on trusted
    hosting/backend.
-   Confirm HTTPS and production domain.
-   Test QR URL before printing posters.

## Supabase

-   Apply migrations in staging first.
-   Verify RLS and Storage policies.
-   Deploy Edge Functions.
-   Configure secrets through Supabase secret management.
-   Configure scheduled cleanup.
-   Verify logs and alerts.

## Windows PC

-   Install signed/verified agent installer.
-   Enroll device.
-   Admin approves device.
-   Select printer and run test print.
-   Confirm agent heartbeat.
-   Confirm test job from admin queue.
-   Set Windows power/sleep policy so PC does not sleep during business
    hours.
-   Ensure printer driver is installed and default paper options are
    correct.

## QR Poster

-   Generate QR from production URL.
-   Test with multiple phones.
-   Print a sample.
-   Verify URL, contrast and scan reliability.
-   Display at counter.

------------------------------------------------------------------------

# 19. MVP Scope --- What to Build First

The first usable release should contain only:

### Customer

-   Permanent QR route.
-   PDF/JPG/PNG upload.
-   A4 paper.
-   B&W and colour if printer supports it.
-   Single-sided initially; duplex only after hardware test.
-   Copies.
-   Job ID and tracking page.

### Admin

-   Job queue.
-   Secure document preview.
-   Page count verification.
-   Price confirmation.
-   Cash/UPI manual payment status.
-   Approve/reject/release.
-   Print status and audit history.

### Local Agent

-   One Windows PC.
-   One configured printer.
-   Device enrollment.
-   Secure job claim.
-   PDF/image print.
-   Job result reporting.
-   Pause/resume and diagnostics.

### Backend

-   Private Storage.
-   RLS.
-   Edge Functions.
-   Device authentication.
-   Job attempts and audit logs.
-   Scheduled file cleanup.

Do not start with multi-branch, automated payment gateway, office file
conversion or fully automatic customer printing. Prove one complete
workflow on the actual shop printer first.

------------------------------------------------------------------------

# 20. Decisions Required Before Development

The following facts cannot be safely guessed:

1.  Windows 10 or Windows 11?
2.  Printer brand and exact model?
3.  USB, Ethernet or Wi-Fi printer?
4.  One printer or multiple printers?
5.  Does the printer support colour?
6.  Does it support automatic duplex?
7.  Which paper sizes are physically available?
8.  What are the B&W and colour rates?
9.  Will customer pay at counter or online?
10. Should customer provide name/phone, or should anonymous Job ID be
    enough?
11. What is the maximum file size?
12. How long should completed documents remain available?
13. What is the final Aman Computer production domain?
14. Which admin roles may approve and release print jobs?

Recommended defaults until confirmed: - One Windows 11 PC. - One
USB/network printer. - PDF/JPG/PNG only. - 20 MB maximum per file. - 5
files maximum per job. - Operator approval mandatory. - Cash/UPI manual
confirmation. - 24-hour retention for completed documents. - No customer
account required; secure tracking token used.

These are proposed defaults, not confirmed facts.

------------------------------------------------------------------------

# 21. Definition of Done

The system is production-ready only when all of the following are true:

-   [ ] Permanent QR opens the correct production route.
-   [ ] Customer can upload supported files from a mobile phone.
-   [ ] Backend validates file type, size and integrity.
-   [ ] Uploaded files remain private.
-   [ ] Customer receives a secure tracking reference.
-   [ ] Admin can preview and review the job.
-   [ ] Price calculation is consistent and auditable.
-   [ ] Unapproved jobs cannot be printed.
-   [ ] Agent is individually enrolled and revocable.
-   [ ] Agent contains no service-role key.
-   [ ] Agent detects configured printer and supported capabilities.
-   [ ] Approved jobs are claimed atomically.
-   [ ] Print attempts are recorded with idempotency.
-   [ ] Actual printer output is tested for PDF and images.
-   [ ] Ambiguous outcomes go to manual review.
-   [ ] Customer/admin status is accurate.
-   [ ] Failed jobs can be diagnosed and safely retried.
-   [ ] Retention cleanup deletes actual Storage objects.
-   [ ] Security and recovery tests pass.
-   [ ] Staff have an operating guide and manual fallback.

------------------------------------------------------------------------

# 22. Final Recommendation

Build this as an integrated Aman Computer service, not as a separate
product.

The correct implementation order is:

**Hardware Audit → UX & Rules → Supabase Backend → Customer Portal →
Admin Print Manager → Local Agent Prototype → Secure Device Enrollment →
Job Queue & Printing → Installer → QA → Pilot Launch.**

The biggest technical risk is not the QR code or upload page. It is
reliable, secure printing through the actual Windows printer driver,
especially when the PC, internet or printer fails mid-job. Prove that
workflow early with the exact shop hardware.

**Do not promise "100% automatic printing" until the actual printer
model and driver have passed end-to-end tests.** The system can automate
job delivery and spooler submission, but physical paper output
confirmation depends on printer/driver telemetry and may require
operator confirmation.

------------------------------------------------------------------------

# 23. Admin Dashboard Information Architecture

**Purpose:** Define the complete functional page and navigation
structure for the Smart QR Print System's admin area.

**Scope note:** This section defines pages, routes, responsibilities and
functional boundaries only. It does not define visual design, colors,
typography, animations, component styling, wireframes or UI mockups. UI
design will be specified separately when explicitly requested.

The Admin Print Manager must be integrated into the existing Aman
Computer Admin Panel. It must not become a separate admin product or
require a separate admin login system unless the existing authentication
architecture requires a dedicated route guard.

## 23.1 Main admin modules

The proposed main modules are:

1.  Dashboard
2.  Print Jobs
3.  Print Queue
4.  Printers
5.  Print Agents / Devices
6.  Payments
7.  Pricing
8.  Customers (optional for MVP)
9.  Staff & Permissions
10. QR Management
11. Reports & Analytics
12. Notifications
13. Activity Logs
14. System Settings

Modules must be permission-aware. Hiding a navigation item is not
authorization; every underlying API, Edge Function and database
operation must enforce permissions server-side.

## 23.2 Dashboard

**Suggested route:** `/admin/print-management`

Responsibilities: - Show total jobs and current job counts by status. -
Show new requests and jobs awaiting review. - Show jobs awaiting
payment. - Show approved and queued jobs. - Show jobs currently
printing. - Show completed jobs for the current business day. - Show
failed and needs-review jobs. - Show today's confirmed print revenue. -
Show recent jobs and their current status. - Show registered printer
availability. - Show Local Print Agent device connectivity and last
heartbeat. - Provide navigation to the relevant filtered job, payment,
printer or device lists.

Dashboard values must come from backend data. Do not display hard-coded
sample figures as live business metrics. When there is no data, return
an explicit empty state rather than fabricated totals.

## 23.3 Print Jobs

**Suggested route:** `/admin/print-jobs`

Responsibilities: - List all print jobs. - Filter by status, date range,
payment status, printer, print mode and job number. - Search by
human-readable Job ID. - Open a job detail record. - Review uploaded
files through authorized private previews. - Review file validation
results and verified page counts. - Review customer print preferences. -
Set or confirm the final price. - Approve, reject or hold a job. -
Record a rejection or hold reason where applicable. - Confirm payment
status when authorized. - Release eligible jobs to the print queue. -
Cancel jobs only when the state machine permits cancellation. - View
print attempts, status history and audit events. - Authorize a reprint
with a reason and a new attempt record. - Mark customer
handover/completion when required by the operating workflow.

The frontend must not directly write unrestricted job status changes to
database tables. All state transitions must use authorized backend
operations.

## 23.4 Print Queue

**Suggested route:** `/admin/print-queue`

Responsibilities: - Show jobs released for printing. - Show queued,
claimed, downloading, printing and submitted-to-spooler jobs. - Show the
assigned printer and device. - Show claim/lease information where
appropriate. - Show blocked jobs, offline printer conditions and agent
connectivity issues. - Allow authorized pause/resume or queue-management
actions where supported. - Allow retry only for confirmed recoverable
failures. - Route uncertain outcomes to `needs_review`. - Show print
attempt history and safe error information.

The queue must not automatically reprint an ambiguous job. Physical
output may be uncertain even when the Windows spooler accepted the job.

## 23.5 Printer Management

**Suggested route:** `/admin/printers`

Responsibilities: - List printers discovered by registered Local Print
Agents. - Register or enable a printer for use by the system. - Disable
a printer without deleting historical job records. - Display printer
name, linked device, connection type and last-seen information. -
Support USB-connected and network-connected printers when detected by
Windows. - Support multiple printers connected to one or more authorized
agent devices. - Configure the system display name and default-printer
selection. - Configure supported paper sizes, colour and duplex
capabilities. - Show capability information reported by the Windows
driver. - Allow an authorized administrator to correct a capability
profile when driver reporting is incomplete. - Run a test print through
an authorized agent. - Show printer status and recent printer-related
errors. - Assign or restrict printers to permitted job types or counters
where applicable.

Connection type and capabilities must not be assumed from the printer
name. The Local Print Agent and installed Windows driver are the
operational source for discovered capabilities. Unsupported options must
not be offered to customers.

## 23.6 Print Agent / Device Management

**Suggested route:** `/admin/print-agents`

Responsibilities: - List all enrolled agent devices. - Show pending,
active, offline and revoked devices. - Review and approve new device
enrollment. - Display device name, device ID, agent version and last
heartbeat. - Display the printers synchronized by each device. - Pause
or resume a device where supported. - Revoke a device credential. - Show
safe diagnostics and recent connection errors. - Track agent version
compatibility. - View device activity and enrollment history.

Each installation must have an individual revocable device identity. Raw
device secrets must not be displayed or stored in readable database
fields. The agent must never contain the Supabase service-role key.

## 23.7 Payment Management

**Suggested route:** `/admin/payments`

Responsibilities: - List payment records and their linked print jobs. -
Filter by payment status, payment method and date range. - Support cash
payment confirmation. - Support manual UPI payment verification for the
MVP. - Record payment amount, method, confirmation time and confirming
staff member. - Record a UPI reference or transaction reference when
operationally needed. - Show unpaid, pending and paid totals. - Preserve
payment history and audit changes. - Support refund records only after
the shop's refund policy and accounting workflow are defined.

A customer clicking a button or uploading a screenshot must never
automatically mark a payment as paid. For the MVP, UPI is manually
verified by an authorized operator. Automated payment gateway
integration is a later-phase feature.

## 23.8 Pricing Management

**Suggested route:** `/admin/pricing`

Responsibilities: - Create and manage active pricing rules. - Configure
rates for supported paper sizes. - Configure B&W and colour rates. -
Configure single-sided and duplex rates when supported. - Configure
minimum job charges. - Configure effective dates and active/inactive
state. - Define whether each rate is per printed page or per physical
sheet. - Define duplex pricing consistently. - Permit authorized price
overrides with a recorded reason. - Keep a history of pricing changes.

All price calculations must use one server-side pricing function.
Customer and admin interfaces must not calculate conflicting totals
independently. The pricing model must distinguish a printed page from a
physical sheet.

## 23.9 Customer Records (Optional for MVP)

**Suggested route:** `/admin/customers`

This module is optional because customer accounts are not required in
the initial roadmap.

If customer information is collected, responsibilities may include: -
Search customer records using only collected information. - View limited
customer contact details when genuinely required. - View print-job
history associated with a customer record. - Avoid collecting a name or
phone number unless the business workflow needs it. - Apply access
controls to customer information.

Anonymous customer submissions using secure tracking tokens remain the
recommended MVP approach. Do not introduce mandatory customer
registration as an MVP dependency.

## 23.10 Staff & Permissions

**Suggested route:** `/admin/staff`

Responsibilities: - List authorized admin and operator accounts. -
Invite or provision staff through the existing authentication process. -
Assign roles. - Configure granular permissions where supported by the
existing RBAC model. - Activate or deactivate staff access. - Review
staff activity and relevant access history.

Suggested permission capabilities: - View print jobs. - Preview customer
documents. - Approve jobs. - Reject or hold jobs. - Confirm cash
payments. - Confirm UPI payments. - Set or override prices. - Release
jobs to the queue. - Cancel eligible jobs. - Authorize reprints. -
Manage printers. - Manage agent devices. - Manage pricing. - View
reports. - Manage staff and permissions. - Manage retention settings.

Permission checks must be performed server-side. A staff member must not
gain access merely because a frontend control is visible.

## 23.11 QR Management

**Suggested route:** `/admin/qr-management`

Responsibilities: - Store and display the permanent customer portal
URL. - Generate or provide the permanent QR code for that URL. -
Download the QR code in suitable print formats such as PNG or SVG where
supported. - Provide a printable poster document when the
poster-generation feature is implemented. - Display the destination URL
for verification. - Validate that the QR points to the production
customer portal before poster printing.

The permanent QR must encode only the stable public customer portal URL,
for example `/quick-print`. It must never encode an admin URL, a
temporary signed upload URL or a job-specific tracking token.

## 23.12 Reports & Analytics

**Suggested route:** `/admin/reports`

Responsibilities: - Daily, weekly and monthly job summaries. -
Completed, pending, rejected and failed job counts. - Total printed
pages. - B&W versus colour workload. - Printer-wise workload. - Revenue
by payment method. - Average processing time. - Frequent failure
reasons. - Agent availability and operational summaries.

Reports must use recorded backend data and clearly define their date
range and calculation basis. Financial reports must use confirmed
payment records, not merely estimated job prices.

Advanced exports and analytics can be added after the core workflow is
stable.

## 23.13 Notifications

**Suggested route:** `/admin/notifications`

Responsibilities: - Show new print-job alerts. - Show jobs awaiting
review or payment. - Show failed or needs-review job alerts. - Show
printer offline alerts. - Show Local Print Agent offline alerts. - Show
relevant system or cleanup failures. - Maintain read/unread state where
supported.

Customer WhatsApp/SMS notifications are optional later-phase
integrations. They must use an approved provider and appropriate
customer consent. Notifications must not expose uploaded document
contents or sensitive tracking credentials.

## 23.14 Activity Logs & Audit

**Suggested route:** `/admin/activity-logs`

Responsibilities: - Search and filter important administrative events. -
Show job status changes. - Show approval, rejection, hold and release
actions. - Show payment status changes. - Show price overrides. - Show
reprint authorizations. - Show printer configuration changes. - Show
agent enrollment, approval and revocation. - Show staff permission
changes. - Show actor, timestamp, event type, old/new status and reason
where applicable.

Audit records must be written by trusted backend operations. Do not rely
on the browser to submit its own authoritative audit history. Logs must
not contain document contents, raw credentials, service-role keys or
other secrets.

## 23.15 System Settings

**Suggested route:** `/admin/settings`

Responsibilities may be grouped as follows.

**General business settings** - Shop name and contact information where
required. - Business operating hours. - Customer-facing instructions and
support information.

**Upload and print settings** - Maximum file size. - Maximum files per
job. - Allowed file formats. - Maximum copies. - Supported paper
sizes. - Default print preferences. - Settings must not enable
capabilities unsupported by the configured printers.

**Retention settings** - Unsubmitted upload-session lifetime. -
Rejected/cancelled document retention. - Completed document retention. -
Failed/needs-review retention. - Cleanup execution status.

Retention changes must be permission-controlled and audited. A
configured retention period must not be presented as guaranteed deletion
until scheduled cleanup has been implemented and verified against actual
Storage objects.

**System and security settings** - Backend health information. -
Agent/device configuration status. - Relevant operational diagnostics. -
Role-protected security settings. - Cleanup and scheduled-task status.

Do not expose backend secrets or service-role credentials in the admin
browser.

------------------------------------------------------------------------

# 24. Route & Navigation Inventory

The following routes are proposed for the integrated admin module. They
must be reconciled with the existing Aman Computer router and naming
conventions before implementation.

  Module            Suggested route
  ----------------- ---------------------------
  Dashboard         `/admin/print-management`
  Print Jobs        `/admin/print-jobs`
  Print Queue       `/admin/print-queue`
  Printers          `/admin/printers`
  Print Agents      `/admin/print-agents`
  Payments          `/admin/payments`
  Pricing           `/admin/pricing`
  Customers         `/admin/customers`
  Staff             `/admin/staff`
  QR Management     `/admin/qr-management`
  Reports           `/admin/reports`
  Notifications     `/admin/notifications`
  Activity Logs     `/admin/activity-logs`
  System Settings   `/admin/settings`

Routes are proposals, not instructions to create duplicate pages if
equivalent pages already exist. Reuse existing authenticated layouts,
route guards, RBAC utilities and shared data services wherever possible.

## 24.1 Print job detail route

A job detail route should identify a single job using its internal UUID
or a safely resolved identifier, for example:

`/admin/print-jobs/:jobId`

The page must load the job through an authorized backend query and must
not make private documents public.

## 24.2 Route authorization

-   Public customer routes must remain separate from admin-only routes.
-   Admin routes must require an authenticated, authorized staff
    account.
-   Operator and admin access must follow assigned permissions.
-   Device APIs must use device authentication, not an ordinary customer
    or admin browser session.
-   Unauthorized route access must be denied by backend authorization as
    well as frontend route guards.

------------------------------------------------------------------------

# 25. Customer Portal Page Inventory

The customer portal is part of the existing Aman Computer website. It is
not a separate customer website.

  ------------------------------------------------------------------------
  Page                    Suggested route          Responsibility
  ----------------------- ------------------------ -----------------------
  Print Home              `/quick-print`           Explain the service and
                                                   start a print request

  Upload                  `/quick-print/upload`    Select and securely
                                                   upload allowed
                                                   documents

  Print Options           `/quick-print/options`   Select supported print
                                                   preferences

  Submission Confirmation `/quick-print/success`   Show Job ID and secure
                                                   tracking reference

  Job Tracking            `/quick-print/track`     Show limited status
                                                   using a secure token

  Help                    `/quick-print/help`      Explain supported
                                                   files, steps and shop
                                                   assistance
  ------------------------------------------------------------------------

The actual flow may use fewer routes if the existing application uses a
multi-step form. Do not create unnecessary route complexity.

Customer-facing requirements: - Mobile-first operation. - PDF, JPG/JPEG
and PNG support for the MVP. - File size and file count limits enforced
on the server. - Private Storage uploads. - Print options restricted to
configured printer capabilities. - Estimated price clearly distinguished
from final operator-confirmed price. - Secure, unguessable tracking
reference. - No customer account required for the MVP. - No public
document download through the tracking page. - Refreshing a confirmation
page must not create a duplicate job.

------------------------------------------------------------------------

# 26. Page-Level Functional Contracts

Before implementing a page, define the following for that page:

1.  Route and required access permission.
2.  Data source and backend query/function.
3.  Allowed actions.
4.  Server-side authorization requirements.
5.  Loading, empty, error and success behavior.
6.  Validation rules.
7.  Audit events required for sensitive actions.
8.  Pagination, filtering and search behavior where applicable.
9.  Relevant automated tests.
10. Acceptance criteria.

A page is not complete merely because its route renders. Its data
access, permissions, state transitions, error handling and tests must
also work.

## 26.1 No fabricated operational data

-   Do not show fake jobs as real customer submissions.
-   Do not show fake payments as collected revenue.
-   Do not show a printer as online without current or sufficiently
    recent device information.
-   Do not show an agent as connected without heartbeat evidence.
-   Use explicit empty states when there are no records.
-   Development seed data, if needed, must be clearly isolated from
    production data.

## 26.2 Shared backend source of truth

-   Job state must be controlled by backend transition functions.
-   Pricing must be calculated by a single server-side pricing function.
-   Payment confirmation must be performed by an authorized staff member
    or verified payment integration.
-   Printer capability must be based on the registered printer profile
    and agent/driver information.
-   Device status must be based on authenticated heartbeat and
    operational events.
-   Reports must derive from stored records and documented calculation
    rules.

------------------------------------------------------------------------

# 27. Integration with Existing Aman Computer Admin Panel

The Smart QR Print System must extend the existing Aman Computer Admin
Panel.

Implementation requirements: - Inspect the existing project structure
before adding routes or tables. - Reuse the current authentication and
admin authorization system. - Reuse existing RBAC tables and permission
utilities if they satisfy the requirements. - Reuse existing database
naming conventions and migration practices. - Avoid creating duplicate
staff, role, permission or audit systems. - Avoid changing unrelated
website modules. - Keep print-specific backend functions and data access
logically isolated. - Add migrations incrementally and preserve existing
production data. - Do not create a second admin login product. - Do not
put Supabase service-role credentials in frontend code or the Local
Print Agent.

If the existing admin system lacks a required capability, document the
gap and propose the smallest compatible extension before changing the
architecture.

------------------------------------------------------------------------

# 28. Implementation Order for Admin and Customer Modules

The module list above is the target information architecture, not a
recommendation to build all modules simultaneously.

Recommended delivery order:

  -----------------------------------------------------------------------
  Order                   Workstream              Roadmap phase
  ----------------------- ----------------------- -----------------------
  1                       Confirm existing admin  Phase 0--1
                          architecture, roles and 
                          hardware assumptions    

  2                       Print database, RLS,    Phase 2
                          Storage and backend     
                          functions               

  3                       Customer upload,        Phase 3
                          submission and tracking 
                          workflow                

  4                       Admin job list, job     Phase 4
                          detail, review and      
                          approval                

  5                       Pricing and manual      Phase 2--4
                          payment confirmation    

  6                       Print queue and audit   Phase 4 and 7
                          integration             

  7                       Actual printer          Phase 5
                          prototype and           
                          capability discovery    

  8                       Printer and             Phase 5--6
                          agent/device management 

  9                       Secure job claiming and Phase 7
                          print execution         

  10                      Agent installer,        Phase 8
                          recovery and            
                          diagnostics             

  11                      Customer notifications  Phase 9
                          and operational         
                          improvements            

  12                      Reports, analytics and  Phase 9--12
                          advanced operational    
                          features                

  13                      Security, reliability,  Phase 10--11
                          pilot and release       
                          verification            
  -----------------------------------------------------------------------

Customers, advanced analytics, automated payment gateways and
multi-branch support are not MVP blockers.

------------------------------------------------------------------------

# 29. Admin Module Acceptance Checklist

The admin information architecture is ready for implementation planning
when:

-   [ ] All proposed modules have an agreed purpose.
-   [ ] Routes have been checked against the existing application
    router.
-   [ ] Existing authentication and RBAC capabilities have been
    inspected.
-   [ ] Admin and operator permissions are mapped to actions.
-   [ ] Customer routes are separate from protected admin routes.
-   [ ] Print job state transitions are defined server-side.
-   [ ] Printer and device management responsibilities are separated.
-   [ ] Payment confirmation is restricted to authorized staff.
-   [ ] Pricing rules distinguish pages from physical sheets.
-   [ ] QR management uses only the permanent customer portal URL.
-   [ ] Audit events are defined for sensitive operations.
-   [ ] Reports use real stored data and documented calculations.
-   [ ] Optional customer records are not made mandatory for the MVP.
-   [ ] Empty, loading and error behavior is specified for each
    functional page.
-   [ ] No unrelated Aman Computer modules are changed.

------------------------------------------------------------------------

# 30. Confirmed Decisions, Proposed Defaults & Open Questions

This section distinguishes confirmed information from assumptions.
Proposed defaults must not silently become confirmed facts.

## 30.1 Confirmed in the current planning discussion

-   The project is the Aman Computer Smart QR Print System.
-   The system will be integrated into the existing Aman Computer
    website and Admin Panel.
-   Windows 11 is the confirmed operating system for the planned shop
    PC.
-   Multiple printers are required.
-   The intended printer connectivity scope includes USB and Wi-Fi;
    LAN/Ethernet support is also included in the proposed architecture
    where Windows and the printer support it.
-   The admin dashboard currently exists only as a basic structure and
    does not yet contain the complete print-system details.
-   The admin module/page inventory is being documented before
    implementation.
-   Visual UI design is intentionally outside the scope of this roadmap
    update and must not be generated as part of this document.

## 30.2 Proposed defaults from the original roadmap

These remain proposals until verified: - One initial Windows 11 PC. -
PDF, JPG/JPEG and PNG for MVP. - 20 MB maximum per file. - Five files
maximum per job. - Operator approval before printing. - Cash and
manually verified UPI payment. - Secure tracking token; no mandatory
customer account. - 24-hour retention for completed documents. - One or
more printers, with the first end-to-end pilot performed on actual
available hardware.

## 30.3 Open decisions

The following still need confirmation: 1. Exact printer brands and
models. 2. Number of printers in the initial deployment. 3. Whether
printers will connect by USB, Wi-Fi, Ethernet or a combination. 4.
Number of Windows PCs running Local Print Agent. 5. Which printers
support colour. 6. Which printers support automatic duplex. 7. Paper
sizes physically available for each printer. 8. Final B&W and colour
rates. 9. Whether pricing is per printed page or physical sheet for each
service. 10. Whether customer name or phone number is needed. 11. Final
production domain. 12. Which staff roles can approve and release jobs.
13. Actual document retention policy. 14. PDF rendering/printing
component and its license after testing.

Do not invent printer models, prices, hardware capabilities or
production URLs.

------------------------------------------------------------------------

# 31. Roadmap Version History

  -----------------------------------------------------------------------
  Version                 Date                    Changes
  ----------------------- ----------------------- -----------------------
  1.0                     18 November 2026        Original product
                                                  requirements, technical
                                                  architecture and
                                                  13-phase implementation
                                                  roadmap

  1.1                     21 November 2026        Added Admin Dashboard
                                                  information
                                                  architecture, proposed
                                                  routes, customer page
                                                  inventory, functional
                                                  contracts, integration
                                                  rules, implementation
                                                  order and decision
                                                  tracking
  -----------------------------------------------------------------------

**Preservation note:** The original Sections 1--22 are retained.
Sections 23--31 extend the roadmap and do not replace the original
technical requirements or implementation phases.
