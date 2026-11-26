# AC Scan2Print — Phase 14: Live Rollout Execution, Post-Deploy Smoke Verification & Post-Launch Operations

> **Purpose:** Complete operator execution and post-launch maintenance playbook after code readiness (Phase 13) to deploy AC Scan2Print live across **Supabase Cloud (`tvtfgsijxlxpwgakpeag`)**, **Firebase Hosting (`aman-computer-27b21`)**, and the **Shop Windows 11 Counter PC**.

---

## 1. Live Cloud Deployment Sequence (Operator Terminal)

1. Push all **7 SQL migrations** and set production Edge secrets:
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
2. Deploy all **21 Edge Functions** with `--no-verify-jwt`.
3. Run one-time Super Admin provisioning (`npm run admin:bootstrap`).
4. Build unified bundle and deploy Firebase Hosting:
   ```bash
   npm run build:hosting
   firebase use aman-computer-27b21
   firebase deploy --only hosting
   ```

---

## 2. Post-Deploy Smoke Verification (`npm run cloud:smoke`)

Immediately verify both live hosting routes (`/` and `/quick-print`), CORS headers, public configuration contract, and fail-closed unauthenticated 401 gates:

```bash
npm run cloud:smoke
```

Expected pass criteria:
- `https://ac-scan2print.web.app/` returns HTTP `200` serving **Admin Dashboard — AMAN COMPUTER**.
- `https://ac-scan2print.web.app/quick-print` returns HTTP `200` serving **AC Scan2Print — Smart QR Print** (never Admin Login).
- `get-public-payment-settings` returns `portalConfig` + `upiEnabled`.
- `admin-print-jobs` & `cleanup-expired-print-files` reject unauthenticated calls (`401`).
- `create-print-job` rejects empty requests (`400`).

To verify local Express dual-surface preview before deploy:
```bash
npm run cloud:smoke -- --local
```

---

## 3. On-Site Windows 11 Counter PC Cutover & 10-Job Supervised Pilot Sign-Off

1. Run elevated PowerShell on the counter Windows 11 x64 PC:
   ```powershell
   .\agent\installer\scripts\publish-release.ps1
   .\agent\installer\scripts\install-agent.ps1
   ```
2. Open **AC Scan2Print Tray → Enroll Device** and paste the one-time **`dev_...` credential** generated from **Admin → Devices & Printers → Enroll Shop PC** (encrypted into `%ProgramData%\ACScan2Print\Security` via `DataProtectionScope.LocalMachine`).
3. Verify Windows Service + Spooler + Printers + DPAPI files:
   ```powershell
   .\agent\installer\scripts\health-check.ps1
   ```
4. Complete the **10-Job Supervised Counter Dry Run**:
   - Single-page B&W PDF (Counter Cash confirm → queue release → physical sheet).
   - Multi-page PDF A4 Duplex Long-Edge (`pricing_unit = 'per_physical_sheet'` verification).
   - Color JPG & PNG photo scaling (`fit` vs `actual`).
   - Customer UPI 12-digit UTR upload → Admin **Verify & Release** → automatic print execution.
   - Offline printer fault (`needs_review`) → Admin **Retry** after powering printer back on.
   - Counter **Emergency Intake Pause** toggle → verify Customer QR Portal displays notice (`HTTP 503 PORTAL_INTAKE_PAUSED`) → resume intake.
5. Sign off all 5 items in **Admin → Pilot & Go-Live** and transition stage to **Live Pilot** → **Production Go-Live**.

---

## 4. Automated Retention Cleanup & Daily Shift Operations

### CLI & Windows Task Scheduler Retention Runner
1. Confirm retention hours in **Admin → Pilot & Go-Live → Document Retention & Auto-Purge Control** (`retention_policy_confirmed = true`).
2. Test dry-run cleanup from operator terminal:
   ```bash
   npm run cloud:cleanup
   ```
3. Run live expired-file purge (deletes only expired drafts/completed/retention-elapsed files; skips active/disputed jobs):
   ```bash
   npm run cloud:cleanup -- --execute
   ```
4. Register daily 03:00 AM local Counter PC Temp & Health maintenance task on Windows 11 (zero backend secrets stored on the counter PC):
   ```powershell
   .\agent\installer\scripts\register-cleanup-task.ps1
   ```

### Daily Shift Closeout & Emergency Rollback
- **Shift Closeout:** Open **Payment Verification → Daily Shift Financial Closeout**, select date, export formula-safe CSV ledger, and verify cash drawer + UPI bank credits against integer-paise totals.
- **Emergency Rollback:** Click **Pause Customer Intake Now** in **Pilot & Go-Live** (blocks new QR uploads while preserving tracking & active counter jobs) or run `Stop-Service ACScan2PrintAgent` on the counter PC during hardware servicing.
