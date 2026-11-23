// AC Scan2Print — Super Admin Provisioning Utility & End-to-End Bootstrap Security Tests
// Verifies UID pinning (Yr0Wr7PuuAdOIMaqohmqaINNbNC2), singleton enforcement, user_id = NULL,
// is_active = true, database verification, Admin login RBAC unlocking, and zero secret logging.

import assert from 'node:assert/strict';
import test from 'node:test';
import { SignJWT, exportJWK, generateKeyPair, type JSONWebKeySet } from 'jose';

import {
  handleAdminBootstrap,
  handleAdminPrinters,
  handleAdminUpdatePaymentSettings,
} from '../../supabase/functions/_shared/handlers.ts';
import type { RuntimeEnv } from '../../supabase/functions/_shared/types.ts';
import {
  DEFAULT_FIREBASE_PROJECT_ID,
  DEFAULT_TARGET_FIREBASE_UID,
  decodeAndValidateFirebaseIdTokenClaims,
  executeAdminBootstrap,
  formatBootstrapVerificationSummary,
  redactSensitiveOutput,
  verifyAdminDatabaseRecord,
  verifyAdminLoginAuthorization,
} from '../../scripts/lib/adminBootstrapLib.ts';
import { TestSupabaseSimulator } from '../phase2/mockBackendAdapter.ts';

const TARGET_UID = DEFAULT_TARGET_FIREBASE_UID;
const PROJECT_ID = DEFAULT_FIREBASE_PROJECT_ID;
const TEST_KID = 'bootstrap-test-rsa-1';
const TEST_SUPABASE_URL = 'https://tvtfgsijxlxpwgakpeag.supabase.co';
const TEST_ANON_KEY = 'sb_publishable_test_anon_key_12345';
const TEST_SERVICE_ROLE = 'sb_secret_test_service_role_99999';
const TEST_BOOTSTRAP_SECRET = 'bootstrap_secret_min_32_chars_secure';
const ADMIN_EMAIL = 'shariqueaman77@gmail.com';

const kpPromise = generateKeyPair('RS256');

async function getJwks(): Promise<JSONWebKeySet> {
  const { publicKey } = await kpPromise;
  const jwk = await exportJWK(publicKey);
  return { keys: [{ ...jwk, kid: TEST_KID, alg: 'RS256', use: 'sig' }] };
}

async function signTargetToken(opts: {
  uid?: string;
  email?: string;
  aud?: string;
  iss?: string;
  expiresInSec?: number;
  nowMs?: number;
} = {}): Promise<string> {
  const { privateKey } = await kpPromise;
  const nowSec = Math.floor((opts.nowMs ?? Date.now()) / 1000);
  const uid = opts.uid ?? TARGET_UID;
  return new SignJWT({
    email: opts.email ?? ADMIN_EMAIL,
    email_verified: true,
    user_id: uid,
    auth_time: nowSec - 10,
  })
    .setProtectedHeader({ alg: 'RS256', kid: TEST_KID })
    .setIssuer(opts.iss ?? `https://securetoken.google.com/${PROJECT_ID}`)
    .setAudience(opts.aud ?? PROJECT_ID)
    .setSubject(uid)
    .setIssuedAt(nowSec)
    .setExpirationTime(nowSec + (opts.expiresInSec ?? 3600))
    .sign(privateKey);
}

function createBootstrapBridge(
  sim: TestSupabaseSimulator,
  envOverrides: Partial<RuntimeEnv> = {}
): { fetchImpl: typeof fetch; capturedHeaders: Record<string, string>[] } {
  const env: RuntimeEnv = {
    FIREBASE_PROJECT_ID: PROJECT_ID,
    ADMIN_BOOTSTRAP_SECRET: TEST_BOOTSTRAP_SECRET,
    ADMIN_BOOTSTRAP_ALLOWED_UID: TARGET_UID,
    ...envOverrides,
  };
  const capturedHeaders: Record<string, string>[] = [];

  const fetchImpl: typeof fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const headersObj: Record<string, string> = {};
    new Headers(init?.headers).forEach((v, k) => {
      headersObj[k.toLowerCase()] = v;
    });
    capturedHeaders.push(headersObj);

    const req = new Request(url, {
      method: init?.method ?? 'GET',
      headers: init?.headers,
      body: init?.body,
    });

    if (url.endsWith('/functions/v1/admin-bootstrap')) {
      return handleAdminBootstrap(req, sim.asAdapter(), env);
    }
    if (url.endsWith('/functions/v1/admin-update-payment-settings')) {
      return handleAdminUpdatePaymentSettings(req, sim.asAdapter(), env);
    }
    if (url.endsWith('/functions/v1/admin-printers')) {
      return handleAdminPrinters(req, sim.asAdapter(), env);
    }
    if (url.includes('/rest/v1/print_admin_accounts')) {
      assert.equal(headersObj.apikey, TEST_SERVICE_ROLE);
      assert.equal(headersObj.authorization, `Bearer ${TEST_SERVICE_ROLE}`);
      return new Response(JSON.stringify(sim.adminAccounts), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response('Not found', { status: 404 });
  };

  return { fetchImpl, capturedHeaders };
}

test('Bootstrap utility provisions Yr0Wr7PuuAdOIMaqohmqaINNbNC2, verifies DB singleton invariants, and unlocks Admin login + RBAC', async () => {
  const sim = new TestSupabaseSimulator();
  sim.setFirebaseJwks(await getJwks());
  const { fetchImpl, capturedHeaders } = createBootstrapBridge(sim);

  const idToken = await signTargetToken({ nowMs: sim.nowMs });

  const bootstrapRes = await executeAdminBootstrap({
    supabaseUrl: TEST_SUPABASE_URL,
    supabaseAnonKey: TEST_ANON_KEY,
    bootstrapSecret: TEST_BOOTSTRAP_SECRET,
    idToken,
    fullName: 'Sharique Aman',
    email: ADMIN_EMAIL,
    fetchImpl,
  });

  assert.equal(bootstrapRes.status, 201);
  assert.equal(bootstrapRes.alreadyExists, false);
  assert.equal(bootstrapRes.admin?.firebaseUid, TARGET_UID);
  assert.equal(bootstrapRes.admin?.email, ADMIN_EMAIL);
  assert.equal(bootstrapRes.admin?.isActive, true);

  // Required headers verified
  assert.equal(capturedHeaders[0].authorization, `Bearer ${idToken}`);
  assert.equal(capturedHeaders[0].apikey, TEST_ANON_KEY);
  assert.equal(capturedHeaders[0]['x-admin-bootstrap-secret'], TEST_BOOTSTRAP_SECRET);

  // Database verification
  const dbVerification = await verifyAdminDatabaseRecord({
    supabaseUrl: TEST_SUPABASE_URL,
    serviceRoleKey: TEST_SERVICE_ROLE,
    expectedEmail: ADMIN_EMAIL,
    fetchImpl,
  });
  assert.equal(dbVerification.verified, true);
  assert.equal(dbVerification.recordCount, 1);
  assert.equal(dbVerification.record?.firebase_uid, TARGET_UID);
  assert.equal(dbVerification.record?.user_id, null);
  assert.equal(dbVerification.record?.is_active, true);
  assert.equal(dbVerification.record?.singleton_guard, true);
  assert.equal(dbVerification.record?.email, ADMIN_EMAIL);

  // Post-bootstrap Admin Login & RBAC check
  const loginVerification = await verifyAdminLoginAuthorization({
    supabaseUrl: TEST_SUPABASE_URL,
    supabaseAnonKey: TEST_ANON_KEY,
    idToken,
    fetchImpl,
  });
  assert.equal(loginVerification.authorized, true);
  assert.equal(loginVerification.admin.firebaseUid, TARGET_UID);
  assert.equal(loginVerification.roleName, 'Super Admin');
  assert.ok(loginVerification.permissionsGranted.includes('scan2print.manage'));
  assert.equal(loginVerification.printersEndpointOk, true);

  // Formatted summary leaks zero credentials
  const rawSummary = formatBootstrapVerificationSummary({
    bootstrap: bootstrapRes,
    database: dbVerification,
    login: loginVerification,
  });
  const redacted = redactSensitiveOutput(rawSummary, [
    idToken,
    TEST_BOOTSTRAP_SECRET,
    TEST_ANON_KEY,
    TEST_SERVICE_ROLE,
  ]);
  assert.equal(redacted.includes(idToken), false);
  assert.equal(redacted.includes(TEST_BOOTSTRAP_SECRET), false);
  assert.equal(redacted.includes(TEST_ANON_KEY), false);
  assert.equal(redacted.includes(TEST_SERVICE_ROLE), false);
});

test('Bootstrap utility & backend reject mismatched Firebase UID, expired tokens, wrong project ID, and second bootstrap attempts', async () => {
  const sim = new TestSupabaseSimulator();
  sim.setFirebaseJwks(await getJwks());
  const { fetchImpl } = createBootstrapBridge(sim);

  // 1. Mismatched UID rejected before network call
  const wrongUidToken = await signTargetToken({ uid: 'OtherWrongFirebaseUid999' });
  await assert.rejects(
    () =>
      executeAdminBootstrap({
        supabaseUrl: TEST_SUPABASE_URL,
        supabaseAnonKey: TEST_ANON_KEY,
        bootstrapSecret: TEST_BOOTSTRAP_SECRET,
        idToken: wrongUidToken,
        fullName: 'Intruder Admin',
        fetchImpl,
      }),
    /does not match required target UID/
  );

  // 2. Backend ADMIN_BOOTSTRAP_ALLOWED_UID rejects unauthorized UID even if invoked directly
  const directWrongUidRes = await handleAdminBootstrap(
    new Request(`${TEST_SUPABASE_URL}/functions/v1/admin-bootstrap`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${wrongUidToken}`,
        'x-admin-bootstrap-secret': TEST_BOOTSTRAP_SECRET,
      },
      body: JSON.stringify({ fullName: 'Intruder Admin', email: ADMIN_EMAIL }),
    }),
    sim.asAdapter(),
    {
      FIREBASE_PROJECT_ID: PROJECT_ID,
      ADMIN_BOOTSTRAP_SECRET: TEST_BOOTSTRAP_SECRET,
      ADMIN_BOOTSTRAP_ALLOWED_UID: TARGET_UID,
    }
  );
  assert.equal(directWrongUidRes.status, 403);
  const directErr = (await directWrongUidRes.json()) as { error: { code: string } };
  assert.equal(directErr.error.code, 'UID_NOT_AUTHORIZED');

  // 3. Wrong audience / project rejected
  const wrongAudToken = await signTargetToken({ aud: 'other-firebase-project' });
  assert.throws(
    () => decodeAndValidateFirebaseIdTokenClaims(wrongAudToken),
    /audience mismatch/
  );

  // 4. Expired token rejected
  const expiredToken = await signTargetToken({ expiresInSec: -60 });
  assert.throws(() => decodeAndValidateFirebaseIdTokenClaims(expiredToken), /expired/);

  // 5. Singleton lock: second bootstrap attempt returns 409 alreadyExists after first succeeds
  const validToken = await signTargetToken({ nowMs: sim.nowMs });
  const first = await executeAdminBootstrap({
    supabaseUrl: TEST_SUPABASE_URL,
    supabaseAnonKey: TEST_ANON_KEY,
    bootstrapSecret: TEST_BOOTSTRAP_SECRET,
    idToken: validToken,
    fullName: 'Sharique Aman',
    email: ADMIN_EMAIL,
    fetchImpl,
  });
  assert.equal(first.status, 201);

  const second = await executeAdminBootstrap({
    supabaseUrl: TEST_SUPABASE_URL,
    supabaseAnonKey: TEST_ANON_KEY,
    bootstrapSecret: TEST_BOOTSTRAP_SECRET,
    idToken: validToken,
    fullName: 'Sharique Aman',
    email: ADMIN_EMAIL,
    fetchImpl,
  });
  assert.equal(second.status, 409);
  assert.equal(second.alreadyExists, true);
});
