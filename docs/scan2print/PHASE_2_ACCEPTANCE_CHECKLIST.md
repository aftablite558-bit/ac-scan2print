# AC Scan2Print — Phase 2: Verification & Acceptance Checklist

**Verification Policy:** Items tested via local Node `tsx --test` against the real Edge Function handlers + stateful PostgreSQL/Storage simulator are marked `PASS` with exact scope; live external Supabase/Firebase execution is honestly marked `BLOCKED` until project credentials & CLI access are supplied.

| ID | Verification Item | Status | Evidence / Notes |
| :---: | :--- | :---: | :--- |
| **P2-01** | Pre-implementation audit completed (`PHASE_2_PRE_IMPLEMENTATION_AUDIT.md`) | **PASS** | Inspected repo, env, binaries, and existing SQLite/React preservation scope. |
| **P2-02** | `supabase/config.toml` configured (`enable_signup = false`, `enable_anonymous_sign_ins = false`, per-function `verify_jwt`) | **PASS** | File created & inspected. |
| **P2-03** | Versioned SQL migrations cover 13 `print_*` tables, constraints, triggers, RLS, 3 private buckets & 3 atomic RPCs | **PASS** | Static SQL assertions pass in `npm run test:phase2`. |
| **P2-04** | Single MVP Admin enforcement (`singleton_guard` UNIQUE + `409 SINGLE_ADMIN_ALREADY_EXISTS`) | **PASS** | Verified in `[NEG-03]` & SQL migration checks. |
| **P2-05** | Server pricing engine (`per_physical_sheet` duplex, `ceil(pages/2)`, integer paise, `PRICING_NOT_CONFIGURED`) | **PASS** | Verified in pricing unit test & `[NEG-11]`. |
| **P2-06** | Zero hardcoded INR prices, UPI IDs, QR images, credentials, or production domain URLs | **PASS** | Verified across SQL migrations, `_shared/`, and `.env.example`. |
| **P2-07** | Cryptographic 256-bit `tracking_token` stored solely as SHA-256 hash, constant-time verify, rate-limited | **PASS** | Verified in E2E test, `[NEG-04]`, and rate-limit test. |
| **P2-08** | Magic-byte + MIME spoofing inspection & PDF page extraction (`finalize-print-upload` + `submit-upi-payment`) | **PASS** | Verified in E2E test, `[NEG-07]`, `[NEG-08]`, `[NEG-09]`, `[NEG-10]`. |
| **P2-09** | Manual UPI & Cash workflows + mandatory Admin payment & approval gates before `queued` | **PASS** | Verified in E2E, `[NEG-13]`, `[NEG-14]`, `[NEG-15]`, `[NEG-16]`. |
| **P2-10** | Atomic agent job claiming, `needs_review` no-auto-retry, and active/disputed retention protection | **PASS** | Verified in `[NEG-17]`, `[NEG-18]`, `[NEG-19]`, `[NEG-20]`. |
| **P2-11** | All 20 mandatory negative tests executed & passing (`npm run test:phase2`) | **PASS** | `23/23` tests pass via `tsx --test tests/phase2/*.test.ts`. |
| **P2-12** | Existing Aman Computer dashboard build, TypeScript lint & `adminLogic.test.ts` preserved intact | **PASS** | `compile_applet`, `lint_applet`, and `adminLogic.test.ts` verified. |
| **P2-13** | Live remote `supabase db push` & hosted PostgreSQL RLS policy execution against real Supabase project | **BLOCKED** | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `supabase` CLI are not present in workspace/container. |
| **P2-14** | Live Edge Function deployment (`supabase functions deploy`) & Deno runtime execution against hosted Supabase | **BLOCKED** | `supabase` CLI and `deno` binary are not installed; credentials unset. |
| **P2-15** | Live Firebase project hosting / FCM Web Push binding (`VITE_FIREBASE_*`) | **BLOCKED** | External Firebase config keys not yet supplied to workspace `.env`. |
