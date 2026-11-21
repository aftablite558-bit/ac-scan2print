# AC Scan2Print — Phase 2: Deployment & Operations Guide

## 1. Prerequisites
- Dedicated **new** Supabase project created externally (do **not** connect to old Aman Computer projects).
- Dedicated **new** Firebase project created externally (strictly Hosting / Analytics / Performance / FCM — **no Firebase Auth**).
- Local or CI/CD workstation with `supabase` CLI (`>= 1.200`), `deno`, and `node` (`>= 20`).

---

## 2. Environment & Supabase Secrets Configuration

1. Populate `.env` (for Vite/local tooling; never commit `.env`) using `.env.example`:
   - `VITE_SUPABASE_URL` & `VITE_SUPABASE_ANON_KEY` (public client keys only)
   - `VITE_FIREBASE_*` (new AC Scan2Print Firebase project)
2. Set server-only Edge Function secrets in Supabase (`supabase secrets set`):
   ```bash
   supabase secrets set \
     ADMIN_BOOTSTRAP_SECRET="<64-char-random-secret>" \
     CRON_SECRET="<64-char-random-secret>" \
     CUSTOMER_PORTAL_URL="https://<your-customer-portal-domain>" \
     ALLOWED_ORIGINS="https://<your-admin-domain>,https://<your-customer-portal-domain>" \
     AGENT_CLAIM_LEASE_SECONDS="180"
   ```
   *(Supabase automatically injects `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` into deployed Edge Functions.)*

---

## 3. Database Migrations & Storage Provisioning

Link the new Supabase project and push all 3 Phase 2 migrations in order:
```bash
supabase link --project-ref <NEW_SUPABASE_PROJECT_REF>
supabase db push
```
Verify in Supabase Dashboard:
- All 13 `print_*` tables exist with RLS **Enabled + Forced**.
- Private buckets `print-uploads`, `payment-evidence`, and `payment-assets` exist with `public = false`.
- `print_pricing_rules` has 0 invented INR rates (ready for Admin pricing entry).

---

## 4. Deploy All 18 Edge Functions

```bash
supabase functions deploy create-print-job --no-verify-jwt
supabase functions deploy create-print-upload-url --no-verify-jwt
supabase functions deploy finalize-print-upload --no-verify-jwt
supabase functions deploy get-print-job-status --no-verify-jwt
supabase functions deploy get-public-payment-settings --no-verify-jwt
supabase functions deploy submit-upi-payment --no-verify-jwt
supabase functions deploy admin-bootstrap --no-verify-jwt
supabase functions deploy admin-review-print-job
supabase functions deploy admin-verify-payment
supabase functions deploy admin-confirm-cash
supabase functions deploy admin-update-payment-settings
supabase functions deploy admin-release-print-job
supabase functions deploy admin-retry-print-job
supabase functions deploy cleanup-expired-print-files --no-verify-jwt
supabase functions deploy agent-enroll
supabase functions deploy agent-heartbeat --no-verify-jwt
supabase functions deploy agent-claim-job --no-verify-jwt
supabase functions deploy agent-report-job-event --no-verify-jwt
```

---

## 5. Single MVP Admin Bootstrap

Call `admin-bootstrap` **once** over HTTPS with `x-admin-bootstrap-secret`:
```bash
curl -X POST "https://<PROJECT_REF>.supabase.co/functions/v1/admin-bootstrap" \
  -H "Content-Type: application/json" \
  -H "x-admin-bootstrap-secret: <ADMIN_BOOTSTRAP_SECRET>" \
  -d '{"email":"<ADMIN_EMAIL>","password":"<STRONG_10+_CHAR_PASSWORD>","fullName":"<OWNER_NAME>"}'
```
Subsequent calls automatically return `409 SINGLE_ADMIN_ALREADY_EXISTS`.

---

## 6. Post-Deployment Configuration (Owner Actions)
1. Configure real INR rates in `print_pricing_rules` (duplex MUST use `pricing_unit = 'per_physical_sheet'`).
2. Upload shop UPI QR image and enable UPI handle via `admin-update-payment-settings`.
3. Confirm final retention hours (`print_system_settings.retention_policy_confirmed = true`) before switching `cleanup-expired-print-files` from `dry_run` to scheduled `execute`.
