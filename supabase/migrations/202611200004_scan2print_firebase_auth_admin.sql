-- AC Scan2Print — Phase 2 Additive Migration: Firebase Authentication Single-Admin Binding
-- Preserves singleton_guard, legacy user_id (nullable for rollback safety), FORCE ROW LEVEL SECURITY,
-- and strict deny-by-default direct browser DB/Storage access.

-- 1. Add firebase_uid to public.print_admin_accounts while preserving legacy user_id for rollback
ALTER TABLE public.print_admin_accounts
  ADD COLUMN IF NOT EXISTS firebase_uid TEXT;

ALTER TABLE public.print_admin_accounts
  ALTER COLUMN user_id DROP NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_print_admin_firebase_uid
  ON public.print_admin_accounts (firebase_uid)
  WHERE firebase_uid IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_print_admin_identity_present'
      AND conrelid = 'public.print_admin_accounts'::regclass
  ) THEN
    ALTER TABLE public.print_admin_accounts
      ADD CONSTRAINT chk_print_admin_identity_present
      CHECK (firebase_uid IS NOT NULL OR user_id IS NOT NULL);
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_print_admin_firebase_uid_length'
      AND conrelid = 'public.print_admin_accounts'::regclass
  ) THEN
    ALTER TABLE public.print_admin_accounts
      ADD CONSTRAINT chk_print_admin_firebase_uid_length
      CHECK (firebase_uid IS NULL OR (char_length(firebase_uid) >= 1 AND char_length(firebase_uid) <= 128));
  END IF;
END
$$;

-- Re-assert singleton_guard constraint remains intact (strictly ONE MVP Admin row)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'uq_print_admin_single_mvp_account'
      AND conrelid = 'public.print_admin_accounts'::regclass
  ) THEN
    ALTER TABLE public.print_admin_accounts
      ADD CONSTRAINT uq_print_admin_single_mvp_account UNIQUE (singleton_guard);
  END IF;
END
$$;

-- 2. Harden is_scan2print_admin() against nullable legacy user_id.
-- Note: Direct browser PostgREST & Storage access remains LOCKED DOWN (deny-by-default)
-- because Firebase Auth sessions have auth.uid() = NULL and anon has zero table/bucket access.
-- All Admin operations execute strictly inside verified Edge Functions using service_role
-- after cryptographic RS256 Firebase ID Token verification + print_admin_accounts lookup.
CREATE OR REPLACE FUNCTION public.is_scan2print_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.print_admin_accounts a
    WHERE a.user_id IS NOT NULL
      AND a.user_id = auth.uid()
      AND a.is_active = TRUE
  );
$$;

REVOKE ALL ON FUNCTION public.is_scan2print_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_scan2print_admin() TO authenticated, service_role;

COMMENT ON COLUMN public.print_admin_accounts.firebase_uid IS
  'Authoritative Firebase Authentication UID (sub claim from verified RS256 ID token) for the single Admin account.';
COMMENT ON COLUMN public.print_admin_accounts.user_id IS
  'Legacy Supabase Auth UUID retained nullable solely for safe rollback compatibility.';
