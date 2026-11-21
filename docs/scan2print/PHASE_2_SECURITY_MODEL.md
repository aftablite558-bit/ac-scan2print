# AC Scan2Print — Phase 2: Security & Isolation Model

## 1. Authentication & Single MVP Admin Enforcement
- **Authoritative Provider:** Supabase Auth (`auth.users`) ONLY. Zero Firebase Auth is implemented or permitted.
- **No Public Signup:** `supabase/config.toml` sets `enable_signup = false` and `enable_anonymous_sign_ins = false`.
- **Single MVP Admin Database Lock:** `public.print_admin_accounts` contains a `singleton_guard BOOLEAN NOT NULL DEFAULT TRUE CHECK (singleton_guard = TRUE)` column with `UNIQUE (singleton_guard)`. Both `admin-bootstrap` (`409 SINGLE_ADMIN_ALREADY_EXISTS`) and PostgreSQL enforce that only **one** Admin account can exist for MVP.
- **Zero Client Trust:** Every Admin Edge Function validates the Supabase Auth JWT via `auth.getUser(jwt)` AND verifies active membership in `public.print_admin_accounts`.

## 2. Row Level Security & Key Segregation
- **100% RLS Forced:** Every `print_*` table has both `ENABLE ROW LEVEL SECURITY` and `FORCE ROW LEVEL SECURITY`.
- **`anon` Denial:** Anonymous callers have zero `SELECT/INSERT/UPDATE/DELETE` privileges on `print_*` tables; only `public_payment_settings_view` exposes safe UPI display metadata (`upi_enabled`, `upi_id` when enabled, `display_name`, `payment_instructions`, `qr_configured`).
- **Server-Only Privileged Keys:** `SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_BOOTSTRAP_SECRET`, and `CRON_SECRET` are read strictly inside server/Edge Function runtimes (`Deno.env.get(...)`) and are never imported in `src/` or emitted in Vite `dist/` bundles.

## 3. Cryptographic Tracking Tokens & Lookup Safety
- **Generation:** `crypto.getRandomValues(new Uint8Array(32))` encoded as Base64URL (256 bits of entropy).
- **Hash-Only Storage:** Only `sha256Hex(trackingToken)` is persisted in `print_jobs.tracking_token_hash`. Raw tokens are returned once upon `finalize-print-upload` and never stored in plaintext.
- **Transport Hygiene:** `get-print-job-status` and `submit-upi-payment` read `x-tracking-token` (or POST body) and explicitly reject URL query parameters (`?token=...`) to keep secrets out of access logs and browser referrer headers.
- **Constant-Time & Rate-Limited:** Verification uses constant-time comparison and `rpc_check_rate_limit` (`60` requests/60s per IP for status lookups) with uniform `401` errors to eliminate job enumeration.

## 4. Private Storage, Magic-Byte Validation & PDF Inspection
- **Private Buckets:** `print-uploads`, `payment-evidence`, and `payment-assets` are all `public = FALSE` with opaque UUID paths (`jobs/<jobId>/<uuid>.<ext>`).
- **Short-Lived Signed URLs:** Uploads receive `120s` signed upload URLs; QR/agent downloads receive `300s`/`120s` signed URLs.
- **Server Content Verification:** `finalize-print-upload` and `submit-upi-payment` download uploaded bytes from Storage, verify exact byte limits (> 0 and <= bucket ceiling), inspect magic bytes (`%PDF-`, `FF D8 FF`, `89 50 4E 47 0D 0A 1A 0A`, `RIFF....WEBP`), reject MIME spoofing, verify PDF structure & extract real page counts, and immediately delete invalid objects.

## 5. Immutable Audit Trail & Error Hygiene
- `public.print_events` rejects any `UPDATE` or `DELETE` via `BEFORE UPDATE OR DELETE` trigger (`trg_print_events_immutable`).
- HTTP responses use structured `AppError` JSON (`{ error: { code, message } }`) and strip stack traces, SQL internals, and environment secrets.
