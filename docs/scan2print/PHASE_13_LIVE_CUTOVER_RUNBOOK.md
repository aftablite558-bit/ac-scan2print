# AC Scan2Print — Phase 13: Live Cloud Provisioning & On-Site Counter Cutover Runbook

> **Scope:** Exact, repeatable operator procedure to transition **AMAN COMPUTER / AC Scan2Print** from local development into live cloud production across **Supabase (`tvtfgsijxlxpwgakpeag`)**, **Firebase Hosting (`aman-computer-27b21` / `https://ac-scan2print.web.app/quick-print`)**, and the **Windows 11 Counter PC Print Agent**.

---

## 1. Automated Preflight Verification

Before running cloud deployments, verify local bundles, migration count (`7`), Edge Function `config.toml` entries (`21`), Windows Agent packaging scripts, and live Supabase HTTP/CORS readiness:

```bash
npm run build:hosting
npm run cloud:preflight
```

The Admin Dashboard **Pilot & Go-Live** tab also displays the live read-only **Live Cloud Provisioning & Cutover Preflight** panel (backed by `GET /api/cutover/preflight` on the local workspace server).

---

## 2. Database Schema (All 7 Migrations) & Edge Secrets

Link your authenticated `supabase` CLI to project `tvtfgsijxlxpwgakpeag`, push all 7 SQL migrations in chronological order, and set server-only Edge Function secrets:

1. `202611200001_scan2print_core_schema.sql`
2. `202611200002_scan2print_rls_and_storage.sql`
3. `202611200003_scan2print_atomic_rpcs.sql`
4. `202611200004_scan2print_firebase_auth_admin.sql`
5. `202611210001_scan2print_phase0_printers.sql`
6. `202611230001_scan2print_service_role_grants.sql`
7. `202611250001_scan2print_phase11_pilot_controls.sql`

```bash
supabase link --project-ref tvtfgsijxlxpwgakpeag
supabase db push

supabase secrets set \
  FIREBASE_PROJECT_ID="aman-computer-27b21" \
  ADMIN_BOOTSTRAP_ALLOWED_UID="Yr0Wr7PuuAdOIMaqohmqaINNbNC2" \
  ADMIN_BOOTSTRAP_SECRET="<64-char-random-secret>" \
  CRON_SECRET="<64-char-random-secret>" \
  CUSTOMER_PORTAL_URL="https://ac-scan2print.web.app/quick-print" \
  ALLOWED_ORIGINS="https://ac-scan2print.web.app" \
  AGENT_CLAIM_LEASE_SECONDS="180" \
  --project-ref tvtfgsijxlxpwgakpeag
```

---

## 3. Deploy All 21 Edge Functions (`--no-verify-jwt`)

Firebase Admin ID tokens and Customer tracking tokens are verified cryptographically inside the Edge Functions (`supabase/config.toml` specifies `verify_jwt = false` on all 21 functions):

```bash
for fn in \
  admin-bootstrap \
  admin-confirm-cash \
  admin-print-jobs \
  admin-printers \
  admin-release-print-job \
  admin-retry-print-job \
  admin-review-print-job \
  admin-update-payment-settings \
  admin-verify-payment \
  agent-claim-job \
  agent-enroll \
  agent-heartbeat \
  agent-report-job-event \
  agent-sync-printers \
  cleanup-expired-print-files \
  create-print-job \
  create-print-upload-url \
  finalize-print-upload \
  get-print-job-status \
  get-public-payment-settings \
  submit-upi-payment
do
  supabase functions deploy "$fn" --no-verify-jwt --project-ref tvtfgsijxlxpwgakpeag
done
```

---

## 4. Provision Single Super Admin Account

Sign into Firebase Auth as the shop owner (`Yr0Wr7PuuAdOIMaqohmqaINNbNC2`), copy a fresh Firebase ID token into `FIREBASE_ID_TOKEN`, set `ADMIN_BOOTSTRAP_SECRET` in shell env, and execute:

```bash
npm run admin:bootstrap
```

Re-run `npm run cloud:preflight` and confirm **`STATUS: READY FOR LIVE COUNTER CUTOVER`**.

---

## 5. Build & Deploy Unified Firebase Hosting (`/` + `/quick-print`)

`firebase.json` rewrites `/quick-print` and `/quick-print/**` to `/quick-print/index.html` before the root Admin `** -> /index.html` catch-all:

```bash
npm run build:hosting
firebase use aman-computer-27b21
firebase deploy --only hosting
```

Verify live URLs:
- Admin Dashboard: `https://ac-scan2print.web.app/`
- Customer QR Portal: `https://ac-scan2print.web.app/quick-print`

---

## 6. Windows 11 Counter PC Agent Cutover (Session-0 Service + Tray)

Run on the counter Windows 11 x64 PC from an elevated PowerShell prompt:

```powershell
.\agent\installer\scripts\publish-release.ps1
.\agent\installer\scripts\install-agent.ps1
```

Enroll the counter PC using **AC Scan2Print Tray → Enroll Device**:
- Paste either a **Firebase Super Admin JWT** or a one-time **`dev_...` Device Credential** generated from **Admin → Devices & Printers → Enroll Shop PC**.
- Credentials are encrypted with **`DataProtectionScope.LocalMachine`** into `%ProgramData%\ACScan2Print\Security` (ACL locked to `SYSTEM` + `Administrators`), allowing the `ACScan2PrintAgent` Session-0 `LocalSystem` service and the desktop Tray app to share device identity seamlessly.

Verify on-site agent health:

```powershell
.\agent\installer\scripts\health-check.ps1
```
