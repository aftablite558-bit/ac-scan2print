# AC Scan2Print — Firebase Authentication Migration Impact, Rollback & Execution Plan

**Status:** PHASE A (Backend Migration) & PHASE B (Security Verification) IMPLEMENTED — Awaiting Owner Review Before Phase C (Frontend)  
**Date:** 20 November 2026  
**Supersedes:** Prior Phase 2 Supabase Auth Admin JWT design where conflicting with the Final Architecture Decision.

---

## 1. Confirmed Target Architecture Summary
- **Admin Dashboard:** Hosted on **Firebase Hosting**; authenticated strictly via **Firebase Authentication (Email & Password)** for **one single MVP Admin account**; zero public registration; zero Staff/Manager/Viewer/Customer accounts.
- **Customer Portal:** Separate website/deployment; QR-scanned anonymous workflow; upload documents, select options, submit manual UPI/Cash evidence, and track via 256-bit `tracking_token` (stored as SHA-256 hash).
- **Supabase Backend:** Remains authoritative for PostgreSQL, Private Storage (`print-uploads`, `payment-evidence`, `payment-assets`), Edge Functions, RLS, server-side pricing, manual UPI/Cash verification, 16-state job lifecycle, printer/device management, immutable `print_events`, and retention cleanup.
- **Firebase Scope:** Firebase Authentication (Admin login), Firebase Hosting (Admin Dashboard), optional future Analytics & FCM. **No Firebase Database / Firestore and no Firebase Storage.**

---

## 2. Complete Inventory of Existing Auth & JWT Dependencies

### A. Supabase Configuration & Edge Functions
| File | Current Usage | Migration Impact |
| :--- | :--- | :--- |
| `supabase/config.toml` | Sets `verify_jwt = true` on 6 Admin Edge Functions (`admin-review-print-job`, `admin-verify-payment`, `admin-confirm-cash`, `admin-update-payment-settings`, `admin-release-print-job`, `admin-retry-print-job`) and `verify_jwt = false` on `agent-enroll`, `admin-bootstrap`, `cleanup-expired-print-files`, customer & agent endpoints. | **CRITICAL:** Supabase API Gateway's `verify_jwt = true` rejects RS256 Firebase ID tokens before Deno executes. All Admin endpoints must set `verify_jwt = false` at gateway and enforce cryptographic Firebase ID token verification inside the Edge Function. |
| `supabase/functions/_shared/types.ts` | `PrintAdminAccount.user_id: string`; `Scan2PrintBackendAdapter.verifyAdminJwt`, `getActiveAdminByUserId`, `createAuthAdminUser`. | Replace/extend with `firebase_uid: string`, `verifyFirebaseIdToken(idToken)`, and `getActiveAdminByFirebaseUid(firebaseUid)`. |
| `supabase/functions/_shared/handlers.ts` | `requireMvpAdmin()` (lines 95–118) validates Bearer JWT via `verifyAdminJwt` + `getActiveAdminByUserId`; `handleAdminBootstrap()` (lines 853–930) supports `createAuthAdminUser` / `userId`. | Update `requireMvpAdmin()` to verify Firebase ID Token, extract verified `sub` (Firebase UID), and match `print_admin_accounts.firebase_uid`. Update `handleAdminBootstrap()` to require a valid **Firebase ID Token** from the owner's single Firebase Auth user + `x-admin-bootstrap-secret` (removing server-side Supabase Auth user creation). |
| `supabase/functions/_shared/supabaseAdapter.ts` | `verifyAdminJwt()` calls `authClient.auth.getUser(bearerToken)`; `createAuthAdminUser()` calls `adminClient.auth.admin.createUser(...)`; `getActiveAdminByUserId()` queries `print_admin_accounts.user_id`. | Replace `authClient.auth.getUser()` with RS256 Google JWKS Firebase ID token verification (`jose` `createRemoteJWKSet` + `jwtVerify`); query `print_admin_accounts.firebase_uid`. |

### B. PostgreSQL Migrations & RLS
| File | Current Usage | Migration Impact |
| :--- | :--- | :--- |
| `supabase/migrations/202611200001_scan2print_core_schema.sql` | `print_admin_accounts.user_id UUID NOT NULL UNIQUE -- Links to auth.users(id)` (line 10). | **CRITICAL TYPE MISMATCH:** Firebase UIDs are alphanumeric strings (`TEXT`, up to 128 chars), **not UUIDs**. Requires an additive migration adding `firebase_uid TEXT UNIQUE NOT NULL` (or altering `user_id` / adding `firebase_uid` + nullable `supabase_user_id` during transition). |
| `supabase/migrations/202611200002_scan2print_rls_and_storage.sql` | `public.is_scan2print_admin()` checks `a.user_id = auth.uid()` (line 15); 12 `authenticated` RLS policies + `storage.objects` policy call `is_scan2print_admin()`. | With Firebase Auth ONLY (no Supabase Auth session), `auth.uid()` is `NULL` for browser clients. Keep ALL Admin operations inside Edge Functions (`service_role` after Firebase token verification) and **deny direct browser table/storage reads** (`anon` + `authenticated` remain locked unless Supabase Third-Party Auth for Firebase is explicitly configured later). Do **not** weaken RLS. |
| `supabase/migrations/202611200003_scan2print_atomic_rpcs.sql` | `rpc_release_print_job`, `rpc_claim_next_print_job`, `rpc_check_rate_limit` (`GRANT EXECUTE ... TO service_role`). | **Zero breaking impact** — called solely by Edge Functions using `service_role`. `p_admin_id` continues to pass `print_admin_accounts.id` (`UUID`). |

### C. Frontend & Tests
| File | Current Usage | Migration Impact |
| :--- | :--- | :--- |
| `src/lib/firebase.ts` | Initializes `FirebaseApp` for Analytics/Performance/FCM; no `firebase/auth` imported yet. | Add `firebase/auth` helpers (`getAuth`, `signInWithEmailAndPassword`, `signOut`, `sendPasswordResetEmail`, `onIdTokenChanged`, `getIdToken`) strictly for single-Admin login, preserving separate Firebase project config. |
| `src/lib/supabase.ts` | Creates `SupabaseClient` with `{ auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }` and `subscribeAdminRealtime`. | Disable Supabase Auth session persistence (`persistSession: false`, `autoRefreshToken: false`) when Firebase Auth is sole login provider; use Supabase client strictly for invoking Edge Functions (with `Authorization: Bearer <firebaseIdToken>`) or calling `public_payment_settings_view` / Edge Function endpoints. |
| `src/context/AdminContext.tsx`, `src/components/AuthScreen.tsx`, `server.ts` | Existing CMS/Bihar Admin Dashboard uses local Express SQLite (`aman_session`) auth. | Scope carefully during implementation: AC Scan2Print Admin API calls must pass Firebase ID tokens, and if replacing/unifying login on Firebase Hosting (no Express `server.ts` in static Firebase Hosting!), migrate Admin login state cleanly to Firebase Auth when approved—without breaking existing UI design. |
| `tests/phase2/mockBackendAdapter.ts`, `tests/phase2/phase2_backend_security.test.ts` | Simulates `verifyAdminJwt` and UUID `userId`. | Generate real test RSA keypair + RS256 Firebase-shaped JWT fixtures (`iss`, `aud`, `sub` = non-UUID Firebase UID, `exp`, `iat`) and test expired, wrong `aud`, wrong `iss`, `alg=none`, `HS256` spoof, and non-admin Firebase user (`403`) cases. |

---

## 3. Authentication Requirements Across All 18 Edge Functions

| # | Edge Function | Gateway `verify_jwt` | Required Server Auth Mechanism |
| :-: | :--- | :---: | :--- |
| 1 | `create-print-job` | `false` | Public rate-limited IP (`anonymous customer`) |
| 2 | `create-print-upload-url` | `false` | `x-draft-secret` SHA-256 hash match on `draft` job |
| 3 | `finalize-print-upload` | `false` | `x-draft-secret` SHA-256 hash match on `draft` job |
| 4 | `get-print-job-status` | `false` | `x-tracking-token` SHA-256 hash match + rate limit |
| 5 | `get-public-payment-settings` | `false` | Public rate-limited read |
| 6 | `submit-upi-payment` | `false` | `x-tracking-token` SHA-256 hash match |
| 7 | `admin-bootstrap` | `false` | `x-admin-bootstrap-secret` **AND** verified **Firebase ID Token** (`sub` -> `firebase_uid`) while `count(print_admin_accounts) = 0` |
| 8 | `admin-review-print-job` | `false` (changed from `true`) | **Firebase ID Token** (`Bearer`) + `print_admin_accounts.firebase_uid` & `is_active = TRUE` |
| 9 | `admin-verify-payment` | `false` (changed from `true`) | **Firebase ID Token** (`Bearer`) + `print_admin_accounts.firebase_uid` & `is_active = TRUE` |
| 10 | `admin-confirm-cash` | `false` (changed from `true`) | **Firebase ID Token** (`Bearer`) + `print_admin_accounts.firebase_uid` & `is_active = TRUE` |
| 11 | `admin-update-payment-settings` | `false` (changed from `true`) | **Firebase ID Token** (`Bearer`) + `print_admin_accounts.firebase_uid` & `is_active = TRUE` |
| 12 | `admin-release-print-job` | `false` (changed from `true`) | **Firebase ID Token** (`Bearer`) + `print_admin_accounts.firebase_uid` & `is_active = TRUE` |
| 13 | `admin-retry-print-job` | `false` (changed from `true`) | **Firebase ID Token** (`Bearer`) + `print_admin_accounts.firebase_uid` & `is_active = TRUE` |
| 14 | `agent-enroll` | `false` | **Firebase ID Token** (`Bearer`) + `print_admin_accounts.firebase_uid` & `is_active = TRUE` |
| 15 | `cleanup-expired-print-files` | `false` | `x-cron-secret` **OR** **Firebase ID Token** (`Bearer`) + `print_admin_accounts.firebase_uid` |
| 16 | `agent-heartbeat` | `false` | `x-device-credential` SHA-256 hash (`device_status = 'active'`) |
| 17 | `agent-claim-job` | `false` | `x-device-credential` SHA-256 hash (`device_status = 'active'`) |
| 18 | `agent-report-job-event` | `false` | `x-device-credential` SHA-256 hash (`device_status = 'active'`) |

---

## 4. Firebase ID Token Verification Method & Secrets Analysis

### Verification Mechanism (Zero Firebase Admin SDK / Zero Service-Account JSON Needed)
- **Method:** Verify Firebase ID Tokens inside Supabase Edge Functions using **`jose` (`npm:jose@5`)** with Google's official JWKS endpoint:
  `https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com`
- **Mandatory Checks Enforced Server-Side:**
  1. `alg` strictly pinned to `['RS256']` (blocks `alg=none` and `HS256` key-confusion).
  2. Signature verified against cached Google public RSA key matching JWT header `kid`.
  3. `issuer`: strictly `https://securetoken.google.com/<FIREBASE_PROJECT_ID>`.
  4. `audience`: strictly `<FIREBASE_PROJECT_ID>`.
  5. `exp` > now, `iat` <= now, `auth_time` <= now.
  6. `sub` non-empty string (`1..128` chars) -> authoritative `firebaseUid`.
  7. Database check: `SELECT * FROM public.print_admin_accounts WHERE firebase_uid = $1 AND is_active = TRUE`. Any other Firebase user receives `403 FORBIDDEN`.
- **Do We Need Firebase Admin SDK?** **No** for Phase 2 backend ID token verification, because Google's public JWKS validates ID tokens without needing a Firebase service-account private key. *(A Firebase service account would only be needed later if server-side FCM HTTP v1 push sending or server-side Firebase user management is explicitly requested.)*

### Required Backend Secrets After Migration
| Secret Name | Required? | Where Configured | Purpose |
| :--- | :---: | :--- | :--- |
| `SUPABASE_URL` | Auto | Supabase Edge Runtime | Supabase API endpoint |
| `SUPABASE_SERVICE_ROLE_KEY` | Auto | Supabase Edge Runtime | Server-only DB & Storage operations |
| `FIREBASE_PROJECT_ID` | **Required (New)** | Supabase Edge Functions -> Secrets | Pins expected `iss` & `aud` during Firebase ID token verification (safe non-secret ID, stored server-side) |
| `ADMIN_BOOTSTRAP_SECRET` | **Required** | Supabase Edge Functions -> Secrets | Authorizes one-time Admin bootstrap |
| `CRON_SECRET` | Optional (Cron) | Supabase Edge Functions -> Secrets | Authorizes scheduled retention cleanup |
| `ALLOWED_ORIGINS` | Recommended | Supabase Edge Functions -> Secrets | Restricts CORS to Firebase Hosting Admin domain + Customer Portal domain |

---

## 5. Key Security Risks & Mitigations
1. **Gateway Rejection vs Double Verification:** Setting `verify_jwt = false` in `supabase/config.toml` is mandatory for Firebase tokens, so every Admin handler MUST fail closed if `requireMvpAdmin` misses or `FIREBASE_PROJECT_ID` is unset (`500`/`401`).
2. **Algorithm & Audience Confusion:** Always pin `algorithms: ['RS256']`, `issuer`, and `audience` to `FIREBASE_PROJECT_ID` so tokens from unrelated Firebase projects or forged `HS256` tokens are rejected.
3. **Public Sign-Up in Firebase Console:** Because Firebase Auth is client-facing, the owner MUST disable **User sign-ups / Create** (or block unauthorized creation in Firebase Auth Console / Identity Platform) AND remember that even if someone obtained a Firebase UID, `print_admin_accounts` enforces `singleton_guard` so non-matching UIDs are permanently rejected with `403`.
4. **Revocation / Disabled Admin:** Check `is_active = TRUE` in `print_admin_accounts` on every request; optionally check `auth_time` or token revocation if needed.
5. **Customer Isolation:** Customer portal endpoints must never invoke Firebase Auth, never send/accept Firebase ID tokens, and never access Admin endpoints.

---

## 6. Ordered Migration, Testing & Rollback Plan
1. **Migration Prep (Backup/Snapshot):** Keep existing Phase 2 migrations untouched until additive migration `202611200004_scan2print_firebase_auth_admin.sql` is authored (`firebase_uid TEXT UNIQUE`, nullable legacy `user_id`, updated RLS comment/guards).
2. **Backend Verification Layer:** Add `supabase/functions/_shared/firebaseAuth.ts` (RS256 JWKS verifier using `jose` + `FIREBASE_PROJECT_ID`), update `supabaseAdapter.ts`, `handlers.ts` (`requireMvpAdmin`, `handleAdminBootstrap`), and `supabase/config.toml` (`verify_jwt = false` for Admin endpoints).
3. **Security & Negative Tests:** Extend `tests/phase2/` with real RS256 signed test JWTs covering valid Admin token, non-admin Firebase UID (`403`), wrong `aud`/`iss`, expired token, `alg=none`, `HS256` spoof, and single-admin bootstrap lock.
4. **Supabase Secret & Firebase Console Setup:** Add `FIREBASE_PROJECT_ID` to Supabase Edge Function Secrets; create the single Admin email/password account in Firebase Console -> Authentication (disable self-signup).
5. **Frontend Admin Login Migration (Next Approved Step):** Wire `firebase/auth` Email/Password login in Admin Dashboard (`AuthScreen`/`AdminContext`), pass `await user.getIdToken()` as `Authorization: Bearer <token>` to Admin Edge Functions, and verify Firebase Hosting build.
6. **Rollback Sequence:** Keep `user_id` column and previous migration snapshot intact; redeploy prior Edge Function bundle & restore `verify_jwt = true` in `supabase/config.toml` if rollback to Supabase Auth were ever required.
