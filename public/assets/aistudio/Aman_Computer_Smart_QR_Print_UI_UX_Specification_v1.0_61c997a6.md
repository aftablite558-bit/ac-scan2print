# AMAN COMPUTER --- SMART QR PRINT SYSTEM

# Spatial Enterprise UI/UX Design Specification

**Document type:** UI/UX Design System + Screen Specification +
Interaction Guidelines\
**Project:** Aman Computer Smart QR Print System\
**Version:** 1.0\
**Date:** 21 November 2026\
**Status:** Design specification --- implementation not started\
**Related document:**
`Aman_Computer_Smart_QR_Print_System_Roadmap_v1.1.md`

------------------------------------------------------------------------

# 1. Purpose and Scope

This document defines the visual and interaction requirements for the
Aman Computer Smart QR Print System.

The target direction is **Spatial Enterprise UI**: a premium, carefully
composed interface that combines spatial depth and layered surfaces with
the clarity, restraint and operational reliability expected from
professional business software.

This document covers: - Admin dashboard visual direction. - Admin
navigation and page-level UI requirements. - Customer QR print portal UI
requirements. - Responsive behavior. - Motion and interaction
principles. - Accessibility and usability requirements. - Design-system
and implementation constraints. - UI quality and acceptance criteria.

This document does **not** authorize changes to the product
architecture, database, security model, pricing rules, job state machine
or business workflow defined in the technical roadmap.

## 1.1 Explicit exclusions

-   Do not change the existing Aman Computer logo or replace it with
    another logo.
-   Do not invent a new brand identity.
-   Do not invent or arbitrarily replace the existing project's color
    palette.
-   Do not create unrelated modules or features.
-   Do not use decorative 3D effects that reduce readability or slow
    down operational workflows.
-   Do not make customer document upload, job tracking, payment
    confirmation or print approval harder in the name of visual effects.
-   Do not present placeholder data as real business data.
-   Do not implement UI-only controls that imply backend functionality
    that does not exist.

## 1.2 Source-of-truth rule

Before implementation, inspect the current Aman Computer repository and
identify: - Existing logo assets and approved brand assets. - Existing
CSS variables and design tokens. - Existing font declarations and
licensed font files. - Existing admin shell, navigation, shared
components and responsive breakpoints. - Existing theme behavior, if
any. - Existing icon and chart libraries.

Reuse the existing source of truth. If the repository's actual values
differ from any visual example in this document, preserve the
repository's approved values unless the owner explicitly approves a
change.

Do not infer a color palette from screenshots, inspiration sites or
generic design trends.

------------------------------------------------------------------------

# 2. Design Vision

## 2.1 Design concept

**AMAN COMPUTER --- SPATIAL ENTERPRISE**

The product should feel like a purpose-built, professionally designed
print operations platform---not a generic admin template and not a
futuristic concept demo.

The visual language should communicate: - Precision. - Trust. - Calm
control. - Operational clarity. - Premium craftsmanship. - Fast
decision-making. - Reliability.

## 2.2 Design balance

Use the following balance as a qualitative design guide, not a literal
CSS percentage:

-   Enterprise usability first.
-   Spatial depth second.
-   Brand expression third.
-   Decorative effects last.

The spatial layer should support hierarchy and orientation. It must
never obscure data, controls or status information.

## 2.3 Visual references and interpretation

Use these references for study, not for copying their exact interfaces:

-   Apple Human Interface Guidelines --- Spatial Layout:
    `https://developer.apple.com/design/human-interface-guidelines/spatial-layout/`
-   Apple Human Interface Guidelines --- Materials:
    `https://developer.apple.com/design/human-interface-guidelines/materials/`
-   Mobbin: `https://mobbin.com/`
-   SaaS UI: `https://www.saasui.design/`
-   Awwwards: `https://www.awwwards.com/`
-   Dribbble dashboard exploration:
    `https://dribbble.com/search/saas-admin-dashboard`

Interpret the references selectively: - Apple spatial principles for
depth, layering and material restraint. - Mature SaaS products for dense
data, navigation, forms and operational workflows. - Award-winning
websites for visual craft and motion quality, not for copying
marketing-site interactions into an admin tool.

Do not reproduce another product's exact screen, branding or proprietary
design.

------------------------------------------------------------------------

# 3. Global Visual Principles

## 3.1 Spatial depth

Use a controlled depth hierarchy: 1. Base application canvas. 2. Main
content surface. 3. Elevated cards and panels. 4. Contextual overlays,
menus and dialogs. 5. Temporary focus or active interaction layer.

Depth must communicate which elements are grouped, active, floating or
in focus.

## 3.2 Layering

-   Use overlapping surfaces only when the relationship is
    understandable.
-   Keep primary content aligned to a consistent grid.
-   Avoid stacking multiple translucent panels over one another.
-   Preserve strong text contrast on every material.
-   Do not put essential table data over blurred or moving backgrounds.
-   Keep dialogs and popovers clearly separated from the page behind
    them.

## 3.3 Materials

Use material effects selectively: - Subtle translucency for contextual
navigation, floating utility controls or small overlays where it
improves hierarchy. - Solid, high-contrast surfaces for tables, forms,
document previews and financial data. - Restrained borders and shadows
to separate surfaces. - Avoid excessive blur, glowing edges, neon
outlines and glossy gradients.

Glass is an accent material, not the default background for every
component.

## 3.4 Shape language

-   Use a consistent corner-radius scale.
-   Prefer clear geometry over excessive pill-shaped containers.
-   Use fully rounded shapes mainly for compact status chips, avatars or
    icon controls where appropriate.
-   Keep buttons, form fields, cards and dialogs consistent.
-   Do not give every element a different radius.

## 3.5 Typography

-   Inspect and reuse the project's approved font configuration first.
-   Use a clear type hierarchy for page title, section title, body,
    metadata, labels and numeric values.
-   Use tabular numerals for money, page counts, timestamps and
    dashboard metrics where supported.
-   Avoid oversized display typography in dense admin workflows.
-   Avoid excessively light font weights for operational information.
-   Ensure Hindi/English text remains legible if localization is added
    later.

## 3.6 Icons

-   Use one consistent icon family throughout the product.
-   Prefer recognizable line icons with consistent stroke weight.
-   Use labels alongside icons for important navigation and actions.
-   Avoid mixing unrelated icon styles, emoji icons and random
    decorative symbols.
-   Use icons to improve recognition, not as substitutes for clear
    labels.

------------------------------------------------------------------------

# 4. Brand and Design Tokens

## 4.1 Token discovery is mandatory

Do not create a new palette before inspecting the repository.

Identify and document the actual values used by: - Background/canvas. -
Primary and secondary surfaces. - Primary text. - Muted text. - Borders
and dividers. - Primary brand/accent color. - Success, warning, danger
and information states. - Focus ring. - Shadows and elevation. -
Typography. - Radius scale. - Spacing scale. - Motion durations and
easing.

## 4.2 Token architecture

Keep design tokens centralized in the project's existing token or global
stylesheet structure. Do not scatter literal colors, shadows, radii and
spacing values across individual components.

Suggested semantic token names (map them to existing project tokens
rather than blindly creating duplicates):

``` css
:root {
  /* Map these semantic roles to approved project values. */
  --color-canvas: ...;
  --color-surface: ...;
  --color-surface-elevated: ...;
  --color-text-primary: ...;
  --color-text-secondary: ...;
  --color-border: ...;
  --color-accent: ...;
  --color-success: ...;
  --color-warning: ...;
  --color-danger: ...;
  --color-info: ...;

  --radius-control: ...;
  --radius-card: ...;
  --radius-dialog: ...;

  --shadow-card: ...;
  --shadow-elevated: ...;
  --shadow-overlay: ...;

  --motion-fast: ...;
  --motion-standard: ...;
  --motion-emphasis: ...;
}
```

The ellipses are placeholders, not literal CSS values. Replace them only
with values verified from the existing design system or explicitly
approved by the owner.

## 4.3 Semantic status colors

Status must never be communicated by color alone. Pair color with text
and, where useful, an icon.

Required semantic categories: - Neutral / Draft. - Submitted / New. -
Under review. - Awaiting payment. - Approved. - Queued. - Claimed /
Processing. - Printing. - Submitted to spooler. - Completed. - Failed. -
Needs review. - Rejected. - Cancelled. - Expired. - Online / Offline /
Paused / Revoked for devices.

The same status must use the same semantic treatment across dashboard
cards, tables, detail pages, notifications and tracking.

------------------------------------------------------------------------

# 5. Application Shell

## 5.1 Admin shell

The admin application should use a consistent shell containing: -
Primary navigation. - Page title and contextual actions. - Main content
region. - Optional page-level filters. - Contextual notifications. -
Account/session controls using the existing authentication system.

The shell must remain usable at common desktop, laptop, tablet and
mobile widths.

## 5.2 Navigation behavior

-   Group navigation by operational purpose.
-   Clearly distinguish the active route.
-   Support collapsed navigation only if it remains discoverable and
    accessible.
-   Preserve navigation state when moving between related print
    operations.
-   Do not hide critical navigation solely behind hover.
-   Use clear labels; avoid cryptic abbreviations.
-   Navigation visibility must follow role permissions, but backend
    authorization remains mandatory.

Suggested groups:

**Overview** - Dashboard

**Print Operations** - Print Jobs - Print Queue - Printers - Print
Agents

**Finance** - Payments - Pricing

**Management** - Customers - Staff & Permissions - QR Management

**Insights** - Reports & Analytics - Notifications - Activity Logs

**Configuration** - System Settings

Optional modules such as Customers may be hidden until implemented and
approved for use.

## 5.3 Page header

Every admin page should provide: - Clear page title. - Short purpose
statement where useful. - Primary action, if one exists. - Contextual
secondary actions. - Breadcrumbs for deep detail routes where helpful.

Do not repeat the same page title in multiple large panels.

## 5.4 Content density

-   Optimize desktop pages for operational scanning.
-   Use compact but comfortable table rows.
-   Maintain enough spacing to distinguish groups.
-   Avoid oversized dashboard cards that push real work below the fold.
-   Keep important actions near the data they affect.
-   Use pagination or controlled virtualization for large datasets.

------------------------------------------------------------------------

# 6. Admin Dashboard Screen Specifications

## 6.1 Dashboard --- `/admin/print-management`

Purpose: Give the operator or administrator a fast, accurate view of
current shop operations.

Required content: - Total jobs for the selected period. - New
requests. - Under-review jobs. - Awaiting-payment jobs. - Queued jobs. -
Printing jobs. - Completed jobs today. - Failed jobs. - Needs-review
jobs. - Confirmed revenue today. - Recent job activity. - Printer
availability. - Agent/device connectivity.

Interaction requirements: - Metric cards navigate to the matching
filtered job list. - Date range is explicit. - Revenue must be based on
confirmed payment records. - Printer and agent status must show when the
information was last updated. - Recent activity links to the relevant
job or event. - Empty states must explain that no records exist yet. -
Loading and error states must not be confused with zero values.

Avoid: - Decorative charts with no operational purpose. - Fake
percentage changes. - Unverified online indicators. - Fake activity feed
entries. - Excessive 3D movement on metric cards.

## 6.2 Print Jobs --- `/admin/print-jobs`

Purpose: Find, inspect and process customer print requests.

Required UI elements: - Search by Job ID. - Status filter. - Date range
filter. - Payment status filter. - Printer filter. - Print mode
filter. - Paginated job table. - Clear status labels. - Contextual row
actions. - Job detail navigation.

Suggested table information: - Job ID. - Submission time. - File
count. - Verified page count. - Print mode. - Copies. - Final amount,
when set. - Payment status. - Job status. - Assigned printer. -
Available authorized action.

Interaction requirements: - Filters must be combinable. - Search must
have clear loading, no-result and error behavior. - Row actions must
respect the user's permission. - Destructive or irreversible actions
require confirmation. - Do not put too many actions directly in each
row; use a contextual action menu when necessary.

## 6.3 Job Detail --- `/admin/print-jobs/:jobId`

Purpose: Provide a complete operational record for one print request.

Organize information into clear sections: - Job summary. -
Customer-submitted files. - Secure document preview. - File validation
and verified page count. - Requested print settings. - Final print
settings. - Estimated and confirmed price. - Payment information. -
Assigned printer and device. - Current job state. - Print attempts. -
Agent result and safe error details. - Status timeline. - Admin notes
where supported. - Reprint history.

Primary actions depend on the current state and permissions: -
Approve. - Reject with reason. - Hold. - Confirm price. - Confirm
payment. - Release to queue. - Cancel when permitted. - Retry only when
safe and authorized. - Authorize reprint with reason. - Mark handed
over/completed where the workflow requires it.

Important interaction rules: - Keep the current state and next permitted
action obvious. - Explain why an action is disabled when possible. -
Confirm high-impact actions. - Never expose private file URLs. - Never
imply that spooler acceptance guarantees physical paper output. - Show
`Needs Review` prominently when the print outcome is uncertain.

## 6.4 Print Queue --- `/admin/print-queue`

Purpose: Monitor released jobs and their progress through the Local
Print Agent.

Required information: - Queue position where meaningful. - Job ID. -
Claim state. - Assigned device. - Assigned printer. - Current processing
stage. - Last event time. - Safe error or blocked reason. - Attempt
number.

Required operational states: - Queued. - Claimed. - Downloading. -
Printing. - Submitted to spooler. - Completed. - Failed. - Needs
review. - Paused/blocked where applicable.

Interaction rules: - Do not offer retry for an ambiguous attempt as if
it were a confirmed failure. - Do not automatically duplicate a job. -
Show device/printer offline conditions clearly. - Pause/resume controls
must reflect actual backend/agent support. - Preserve a traceable
attempt history.

## 6.5 Printers --- `/admin/printers`

Purpose: Manage all printers discovered by registered agents.

Required information: - Display name. - Windows printer name. -
Connection type when known. - Linked agent/device. -
Online/offline/unknown status. - Last seen. - Default printer
indicator. - Enabled/disabled state. - Supported colour mode. -
Supported duplex mode. - Supported paper sizes.

Required actions: - Add/register discovered printer. - Edit display
name. - Enable/disable. - Set default printer. - Configure capability
profile. - Assign allowed job scope where supported. - Run test print. -
View recent errors/activity.

Interaction rules: - Clearly distinguish driver-reported capabilities
from manually configured capabilities. - Never promise a paper size or
duplex feature that has not been verified. - Confirm before disabling a
printer that has active or queued jobs. - Show which jobs may be
affected by a printer going offline or being disabled.

## 6.6 Print Agents --- `/admin/print-agents`

Purpose: Manage Windows Local Print Agent installations.

Required information: - Device name and ID. - Enrollment status. - Agent
version. - Windows version. - Last heartbeat. - Connected printers. -
Device status. - Recent safe diagnostic events.

Required actions: - Approve enrollment. - Pause/resume where
supported. - Revoke device. - View diagnostics. - Review version
compatibility.

Security-sensitive actions require confirmation and an audit event.
Never display raw device credentials.

## 6.7 Payments --- `/admin/payments`

Purpose: Review payment records associated with print jobs.

Required content: - Job ID. - Payment method. - Amount. - Payment
status. - Transaction reference where collected. - Confirming
operator. - Confirmation time.

Required filters: - Date. - Method. - Status.

Required actions: - Confirm cash received. - Confirm manually verified
UPI payment. - View linked job. - Add a correction or refund record only
if the approved business process supports it.

Do not provide a customer-facing self-confirmation control that changes
payment status.

## 6.8 Pricing --- `/admin/pricing`

Purpose: Manage server-side pricing rules.

Required content: - Rule name. - Paper size. - Print mode. - Sides. -
Pricing unit. - Rate. - Minimum charge. - Effective date. -
Active/inactive state.

Required interactions: - Create/edit pricing rule. - Preview a
calculation using clearly labeled test inputs. - Activate/deactivate
rule. - View pricing change history. - Require a reason for authorized
overrides where configured.

Always label whether the rate is per page or per physical sheet.

## 6.9 Customers --- `/admin/customers` (optional)

This module is not an MVP requirement.

If implemented: - Show only information the business actually
collects. - Keep customer records minimal. - Link a record to its print
history only where a reliable association exists. - Avoid mandatory
customer accounts. - Protect phone numbers and other personal details.

## 6.10 Staff & Permissions --- `/admin/staff`

Required content: - Staff identity. - Assigned role. - Account status. -
Relevant permissions. - Recent activity where authorized.

Required actions: - Provision/invite staff using the existing
authentication flow. - Assign roles. - Update permissions where
supported. - Deactivate access. - Review activity.

The interface must make the difference between Admin and Operator
permissions understandable. Backend enforcement is mandatory.

## 6.11 QR Management --- `/admin/qr-management`

Required content: - Permanent production customer portal URL. - QR
preview. - Destination verification status.

Required actions: - Generate or refresh QR artwork from the same
permanent URL. - Download supported image formats. - Print/export poster
when poster generation is implemented. - Verify destination before
printing.

Do not allow a temporary signed upload URL or admin URL to become the
permanent QR destination.

## 6.12 Reports --- `/admin/reports`

Required report categories: - Job volume. - Completed/failed/pending
jobs. - Printed pages. - B&W versus colour workload. - Printer-wise
workload. - Revenue by confirmed payment method. - Average processing
time. - Failure reasons.

Requirements: - Clear date range. - Clear metric definitions. - Honest
empty states. - Consistent currency and number formatting. - Export
controls only when the export function actually exists.

Avoid decorative chart overload. Prefer a small number of useful,
readable visualizations.

## 6.13 Notifications --- `/admin/notifications`

Required categories: - New job. - Job awaiting review. - Payment
pending. - Print failure. - Needs review. - Printer offline. - Agent
offline. - System/cleanup issue.

Requirements: - Read/unread state where supported. - Timestamp. -
Related job/device link. - Clear severity. - No document contents or
secrets in notification text.

## 6.14 Activity Logs --- `/admin/activity-logs`

Required information: - Event time. - Actor. - Event type. - Related
job/device/printer. - Old and new status where relevant. - Reason where
relevant.

Required filters: - Date range. - Actor. - Event type. - Related entity.

Logs are read-only from the ordinary admin UI. Do not create a UI action
that edits or deletes authoritative audit history unless a formally
approved retention process requires it.

## 6.15 Settings --- `/admin/settings`

Organize settings into clear functional groups: - General business
information. - Upload limits. - Supported file formats. - Print
defaults. - Retention configuration. - Staff/security configuration. -
Agent/device configuration. - Operational health.

Requirements: - Explain the impact of settings that affect customer
submissions or print operations. - Validate values before saving. -
Confirm high-impact changes. - Record sensitive configuration changes in
the audit log. - Do not expose secrets.

------------------------------------------------------------------------

# 7. Customer Portal UI Specifications

The customer portal must prioritize speed, clarity and trust. It is a
mobile-first workflow, not a miniature admin dashboard.

## 7.1 Print Home --- `/quick-print`

Required content: - Correct Aman Computer logo. - Clear service
heading. - Short scan/upload/collect instructions. - Supported file
formats. - Maximum file size and file count. - Shop contact/help
information where approved. - Privacy and document-retention notice. -
Primary upload action.

Avoid: - Large decorative animations. - Complex navigation. - Marketing
sections that delay the upload action. - Unverified pricing promises.

## 7.2 Upload --- `/quick-print/upload`

Required elements: - File picker. - Multi-file selection within
configured limits. - Selected file list. - File name and size. - Upload
progress. - Remove/retry controls before final submission. - Validation
feedback. - Clear upload failure recovery.

Requirements: - Validate file type, size and content server-side. - Do
not rely only on filename extensions. - Do not expose public Storage
URLs. - Do not lose the user's progress unnecessarily after a
recoverable network error. - Prevent accidental duplicate job creation.

## 7.3 Print Options --- `/quick-print/options`

Required options, only when supported: - Black & White / Colour. - Paper
size. - Single-sided / Double-sided. - Copies. - Page range. -
Orientation. - Scaling.

Requirements: - Do not show unsupported options. - Explain estimate
versus final price. - Use touch-friendly controls. - Keep option labels
plain and understandable. - Provide a clear review-before-submit step.

## 7.4 Confirmation --- `/quick-print/success`

Required information: - Job ID. - Secure tracking reference/link. -
Submission time. - Submitted file names. - Selected print preferences. -
Estimated amount, clearly labeled. - Initial status.

Requirements: - Provide a clear next step. - Do not reveal another
customer's data. - Refresh must not create a second job. - Do not expose
a sequential Job ID as the sole authorization secret.

## 7.5 Tracking --- `/quick-print/track`

Required information: - Job ID. - Current status. - Status timeline
where safe. - Shop instructions. - Final price/payment information only
when approved for customer visibility. - Handover-ready status when
confirmed.

Requirements: - Access through an unguessable token or equivalent secure
mechanism. - Never expose document download links publicly. - Use
accurate wording for spooler submission versus physical completion. -
Avoid showing internal error details or staff-only notes.

## 7.6 Help --- `/quick-print/help`

Explain: - Supported formats. - File limits. - How to upload. - How to
select print options. - How pricing confirmation works. - How payment is
handled. - How to track a job. - What to do if upload fails. - How to
ask shop staff for help.

------------------------------------------------------------------------

# 8. Responsive Design

## 8.1 Desktop

Desktop is the primary admin workspace.

Requirements: - Use available width efficiently. - Keep navigation
persistent where practical. - Provide readable data tables. - Keep
important job actions visible. - Support multi-column detail layouts
only where they improve scanning. - Avoid excessive horizontal
scrolling.

## 8.2 Laptop

-   Preserve the same task hierarchy as desktop.
-   Allow secondary panels to collapse.
-   Keep the primary table usable.
-   Avoid tiny controls or truncated status labels.
-   Ensure dialogs fit within the viewport.

## 8.3 Tablet

-   Allow navigation to collapse into an accessible drawer.
-   Reflow dashboard metrics.
-   Convert wide tables into carefully designed compact layouts or
    controlled horizontal scrolling.
-   Keep critical actions reachable.
-   Support touch targets.

## 8.4 Mobile admin

Mobile admin is a responsive operational fallback, not a direct copy of
desktop.

Requirements: - Simplified navigation. - Single-column content. -
Readable job summaries. - Clearly separated actions. - No hover-only
functionality. - Large enough touch targets. - Dialogs and menus fit the
viewport. - Critical status and payment information remain visible.

## 8.5 Customer mobile

Customer upload and tracking must be designed mobile-first: - Large
upload target. - Simple step progression. - Clear progress and error
feedback. - Touch-friendly print options. - Minimal page weight. - No
unnecessary animation. - Good behavior on common Android browsers and
smaller screens.

------------------------------------------------------------------------

# 9. Motion and Interaction Design

## 9.1 Motion philosophy

Motion should feel intentional, controlled and physically plausible. It
should help users understand state changes, hierarchy and relationships.

Do not animate merely to make the product look futuristic.

## 9.2 Appropriate motion

Use restrained motion for: - Navigation state changes. - Dialog and
popover entrance/exit. - Expand/collapse sections. - Table row or
detail-panel transitions where useful. - Upload progress. - Queue state
changes. - Small hover/focus feedback. - Dashboard data refresh when it
does not distract.

## 9.3 Spatial motion

Permitted selectively: - Small depth changes on interactive surfaces. -
Subtle parallax in non-critical decorative areas. - Gentle elevation
changes on hover. - Layered transitions between related panels.

Avoid: - Large perspective rotations on data tables. - Floating
dashboard cards that drift continuously. - Scroll-jacking. - Full-screen
animated backgrounds. - 3D effects on every button. - Motion that delays
access to controls.

## 9.4 Performance

-   Prefer CSS transforms and opacity for simple transitions.
-   Avoid expensive continuous animation.
-   Lazy-load heavy 3D assets.
-   Do not load a 3D engine on routes that do not need it.
-   Respect reduced-motion preferences.
-   Keep customer upload and tracking routes lightweight.
-   Ensure animations do not block input or page interaction.

## 9.5 Reduced motion

When `prefers-reduced-motion: reduce` is active: - Remove nonessential
parallax and spatial movement. - Replace long transitions with immediate
or minimal state changes. - Preserve status feedback and progress
information. - Never make an animation the only way to communicate a
state change.

------------------------------------------------------------------------

# 10. Interaction States

Every interactive component must define:

-   Default.
-   Hover (for pointer devices).
-   Focus-visible.
-   Active/pressed.
-   Disabled.
-   Loading.
-   Success.
-   Error where applicable.

Every data-driven page must define: - Initial loading. - Empty state. -
Populated state. - Filtered no-results state. - Recoverable error. -
Permission denied. - Offline or stale-data state where relevant.

Do not leave controls visually interactive when no working action is
connected.

------------------------------------------------------------------------

# 11. Tables, Forms and Data Visualization

## 11.1 Tables

-   Use consistent column alignment.
-   Right-align numeric and monetary values.
-   Use tabular numerals where available.
-   Keep status labels consistent.
-   Provide accessible row actions.
-   Make sorting state visible.
-   Make active filters visible and removable.
-   Support pagination for large lists.
-   Avoid excessive borders and decorative table effects.
-   Preserve usable keyboard navigation.

## 11.2 Forms

-   Use persistent labels; do not rely only on placeholders.
-   Group related settings.
-   Explain constraints before submission.
-   Validate fields with actionable messages.
-   Preserve entered data after recoverable errors.
-   Mark required and optional fields clearly.
-   Confirm high-impact changes.
-   Avoid oversized forms that mix unrelated settings.

## 11.3 Charts

-   Use charts only when they answer a real operational question.
-   Label axes, units and date ranges.
-   Provide a readable summary or data alternative.
-   Use consistent semantic colors.
-   Avoid 3D charts and perspective effects that distort values.
-   Do not use color alone to distinguish series.
-   Ensure charts remain legible on mobile.

------------------------------------------------------------------------

# 12. Accessibility and Usability

Target WCAG 2.2 AA practices where applicable.

Requirements: - Sufficient text and control contrast. - Visible keyboard
focus. - Semantic headings and landmarks. - Accessible labels for
icon-only controls. - Keyboard-operable menus, dialogs and tables. -
Correct focus management in dialogs. - Error messages associated with
their fields. - Status communicated through text, not color alone. -
Touch targets appropriate for mobile use. - Screen-reader-friendly
upload progress and status updates. - Reduced-motion support. - Do not
rely on hover to reveal essential information.

------------------------------------------------------------------------

# 13. Loading, Empty, Error and Offline Experiences

## 13.1 Loading

-   Use layout-aware skeletons only where they help.
-   Avoid flashing fake values before real data loads.
-   Keep the page structure stable to reduce layout shift.
-   Show progress for long uploads and actions.

## 13.2 Empty

Examples: - No print jobs yet. - No printers registered. - No agents
enrolled. - No payments recorded. - No matching results. - No
notifications.

Empty states should explain what the absence means and, when
appropriate, provide the next valid action.

## 13.3 Errors

-   Use plain language.
-   Explain whether the action failed.
-   Provide a safe retry where possible.
-   Do not expose stack traces, database internals, secrets or raw
    backend payloads.
-   Preserve user input where safe.
-   Distinguish validation errors from connectivity errors.

## 13.4 Offline and stale data

-   Show when printer or agent status was last updated.
-   Do not label stale status as live.
-   Distinguish unknown from offline.
-   Explain when a new cloud job cannot be claimed because the agent is
    disconnected.
-   Do not silently discard user actions.

------------------------------------------------------------------------

# 14. Security-Sensitive UI Rules

The UI must support, not replace, the security model in the technical
roadmap.

-   Never expose Supabase service-role keys.
-   Never expose raw device credentials.
-   Never expose private Storage object URLs as permanent public links.
-   Never allow customer tracking to reveal document contents.
-   Never allow frontend-only permission checks to authorize actions.
-   Confirm payment actions and record the acting staff member.
-   Confirm reprint actions and require a reason where configured.
-   Make uncertain print outcomes visibly distinct from confirmed
    failures.
-   Keep staff-only notes and diagnostics out of customer views.
-   Do not place secrets or sensitive document data in notifications.
-   Show the actual consequence of revoking a device or disabling a
    printer.

------------------------------------------------------------------------

# 15. Design and Frontend Implementation Constraints

## 15.1 Reuse before adding

Before creating a component: - Inspect existing shared components. -
Reuse existing design tokens. - Reuse the existing router and
authenticated layout. - Reuse the existing form, table, dialog and
notification primitives. - Reuse the current icon library if consistent
and maintained.

Do not create a second design system alongside the existing one.

## 15.2 Suggested component families

These are functional component categories, not instructions to create
duplicate components if equivalents already exist:

-   Application shell.
-   Navigation groups.
-   Page header.
-   Metric summary.
-   Status badge.
-   Data table.
-   Filter bar.
-   Search control.
-   Empty state.
-   Loading state.
-   Error state.
-   Confirmation dialog.
-   Detail section.
-   Timeline.
-   File preview container.
-   Upload dropzone.
-   Progress indicator.
-   Printer/device status.
-   Payment summary.
-   Chart container.

## 15.3 Libraries

Use existing dependencies where possible. Do not install a library
simply because it appears in this document.

Potential options, subject to repository audit: - Framer Motion for
restrained interface transitions. - GSAP only for complex motion that
CSS or the existing motion library cannot handle cleanly. - Three.js /
React Three Fiber only for a justified, isolated spatial feature. -
Lucide or the project's existing icon set. - Recharts or the existing
chart library. - TanStack Table or the existing table solution.

Do not introduce multiple overlapping animation, chart or icon libraries
without a clear technical reason.

## 15.4 Three-dimensional rendering

Three.js / React Three Fiber is optional, not a global requirement.

Use 3D only if: - It communicates useful spatial hierarchy or a
meaningful system state. - It does not interfere with core task
completion. - It can be isolated and lazy-loaded. - It performs
acceptably on supported hardware. - It has an accessible non-3D
equivalent.

Do not create a 3D printer model or animated print-room scene merely as
decoration.

------------------------------------------------------------------------

# 16. Performance Requirements

The visual quality must not compromise operational performance.

Requirements: - Keep customer upload and tracking routes lightweight. -
Avoid loading large 3D libraries on ordinary admin routes. - Lazy-load
noncritical charts and advanced visualizations. - Optimize images and
icons. - Avoid layout shifts. - Avoid unnecessary rerenders during live
queue updates. - Debounce search inputs appropriately. - Paginate or
virtualize large datasets when needed. - Keep animation work off
expensive layout/paint paths where possible. - Ensure keyboard and touch
interaction remains responsive.

Measure real performance on representative desktop, laptop and Android
devices. Do not claim performance success based only on local
development mode.

------------------------------------------------------------------------

# 17. Content and Microcopy

Use concise, direct operational language.

Examples of preferred wording: - "Approve job" - "Reject job" - "Confirm
cash received" - "Verify UPI payment" - "Release to print queue" -
"Printer offline" - "Agent disconnected" - "Print outcome needs
review" - "Submitted to Windows spooler" - "Ready for collection"

Avoid misleading wording: - Do not say "Printed successfully" merely
because the Windows spooler accepted the job. - Do not say "Payment
successful" before an authorized confirmation or verified gateway
event. - Do not say "Printer online" when the last heartbeat/status is
stale. - Do not call an estimate a final price.

Use consistent date, time, currency and number formatting across the
application.

------------------------------------------------------------------------

# 18. UI Quality Assurance

## 18.1 Visual QA

Check: - Correct approved Aman Computer logo. - Correct
repository-derived brand tokens. - Consistent typography. - Consistent
spacing and component geometry. - Clear hierarchy. - No accidental
clipping or overflow. - No overlapping menus or dialogs. - No
inconsistent icon styles. - No excessive glass, gradients or shadows. -
Readable data tables. - Consistent status presentation.

## 18.2 Responsive QA

Test: - Desktop widescreen. - Standard laptop. - Tablet portrait and
landscape. - Android mobile browser. - Narrow mobile viewport.

Check navigation, forms, tables, dialogs, upload and tracking behavior.

## 18.3 Functional UI QA

-   Every visible button has a real action or is clearly disabled.
-   Filters affect the correct data.
-   Search handles empty and error results.
-   Forms validate correctly.
-   Dialogs manage focus correctly.
-   Status updates reflect backend state.
-   Permission restrictions are visible and enforced.
-   No fake live metrics.
-   No duplicate job creation on refresh or retry.
-   Customer tracking never exposes private documents.

## 18.4 Motion QA

-   No motion blocks task completion.
-   Reduced-motion preference works.
-   No persistent distracting animation.
-   No excessive GPU usage.
-   No scroll-jacking.
-   No animation-only status communication.

## 18.5 Accessibility QA

-   Keyboard navigation.
-   Focus visibility.
-   Screen-reader labels.
-   Contrast.
-   Form error association.
-   Dialog focus handling.
-   Status text alternatives.
-   Reduced-motion behavior.

------------------------------------------------------------------------

# 19. Definition of UI Done

The UI specification is considered implemented only when:

-   [ ] Existing logo and approved brand assets are preserved.
-   [ ] Existing repository tokens are inspected and reused.
-   [ ] No unapproved palette or font replacement is introduced.
-   [ ] Admin shell is consistent across all implemented modules.
-   [ ] Navigation reflects actual implemented routes and permissions.
-   [ ] Dashboard uses real backend data.
-   [ ] Job tables and details are readable and operational.
-   [ ] Queue states are clear and accurate.
-   [ ] Printer and agent states distinguish online, offline and
    unknown.
-   [ ] Payment and pricing interfaces reflect the approved business
    rules.
-   [ ] Customer upload works on common Android browsers.
-   [ ] Customer tracking uses secure access.
-   [ ] Empty, loading, error and offline states are implemented.
-   [ ] All interactive controls work and respect permissions.
-   [ ] Motion is restrained and supports usability.
-   [ ] Reduced-motion support is implemented.
-   [ ] Mobile layouts are usable without hover.
-   [ ] Accessibility checks are completed.
-   [ ] Performance is measured on representative devices.
-   [ ] No critical workflow is compromised by visual effects.
-   [ ] No unrelated Aman Computer functionality is changed.

------------------------------------------------------------------------

# 20. Implementation Handoff Rules

Before writing UI code:

1.  Read the current Smart QR Print technical roadmap.
2.  Inspect the existing Aman Computer repository.
3.  Identify the real logo, fonts, tokens, component library and admin
    shell.
4.  Compare existing routes against the route inventory in the roadmap.
5.  Identify reusable components and avoid duplication.
6.  Map each planned screen to its real data source and permission.
7.  Identify which screens can be functional now and which depend on
    backend phases.
8.  Record missing dependencies rather than inventing behavior.
9.  Implement in small, testable groups.
10. Verify desktop and mobile behavior after each group.

Do not begin a broad redesign of unrelated website pages. Keep the work
scoped to the Smart QR Print System unless the owner explicitly expands
the scope.

------------------------------------------------------------------------

# 21. Relationship to the Technical Roadmap

This UI/UX specification complements, and does not replace, the
technical roadmap.

The technical roadmap remains authoritative for: - Architecture. -
Database schema. - Storage. - RLS and security. - Edge Functions and API
contracts. - Job state machine. - Device authentication. - Print Agent
behavior. - Printing reliability. - Retention. - Pricing business
rules. - Implementation phases. - Hardware verification and pilot
acceptance.

If a visual requirement conflicts with security, data integrity, actual
printer capability or the approved workflow, the technical and
operational requirements take priority. Escalate the conflict instead of
silently changing behavior.

------------------------------------------------------------------------

# 22. Version History

  -----------------------------------------------------------------------
  Version                 Date                    Changes
  ----------------------- ----------------------- -----------------------
  1.0                     21 November 2026        Initial Spatial
                                                  Enterprise UI/UX
                                                  specification for the
                                                  Aman Computer Smart QR
                                                  Print System

  -----------------------------------------------------------------------

**Final design direction:** Spatial Enterprise UI with restrained depth,
premium visual craft, professional SaaS usability, accessible
interactions and operational performance. The product must feel
intentionally designed and production-ready---not like a generic
AI-generated dashboard.
