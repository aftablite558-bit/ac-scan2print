// AC Scan2Print — Phase C Automated Frontend Authentication, Edge Client & Hosting Readiness Tests
// Verifies end-to-end integration between frontend protected Edge clients and Phase A/B backend handlers.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { SignJWT, exportJWK, generateKeyPair, type JSONWebKeySet } from 'jose';

import {
  handleAdminBootstrap,
  handleAdminUpdatePaymentSettings,
} from '../../supabase/functions/_shared/handlers.ts';
import type { RuntimeEnv } from '../../supabase/functions/_shared/types.ts';
import {
  ProtectedEdgeApiError,
  canAccessAdminRoute,
  createAdminSessionFromBackend,
  invokeProtectedEdgeFunction,
  verifyAdminAccessWithBackend,
} from '../../src/lib/scan2printAdmin.ts';
import { mapFirebaseAuthError } from '../../src/lib/firebase.ts';
import {
  LIQUID_METAL_RIPPLE_DURATION,
  MERCURY_AUTH_HALF_HEIGHT,
  MERCURY_AUTH_HALF_WIDTH,
  MERCURY_CANCEL_HALF_HEIGHT,
  MERCURY_CANCEL_HALF_WIDTH,
  MERCURY_CLOSE_DURATION,
  MERCURY_FIELD_GAP,
  MERCURY_SNAP_DURATION,
  computeActionPillHalfSize,
  computeButtonPillHalfSize,
  computeErrorFlushEnvelope,
  computeLoadingKeyLightX,
  computeMercuryGeometry,
  shouldRenderIdleButton,
  shouldShowCredentialsForm,
  shouldUseWebglLiquidMetal,
} from '../../src/lib/liquidMetal.ts';
import { TestSupabaseSimulator } from '../phase2/mockBackendAdapter.ts';

const FIREBASE_PROJECT_ID = 'ac-scan2print-phasec';
const AUTHORIZED_ADMIN_UID = 'firebase_uid_aman_single_admin';
const UNAUTHORIZED_UID = 'firebase_uid_intruder_999';
const TEST_KID = 'phasec-rsa-kid-1';

const primaryKeyPairPromise = generateKeyPair('RS256');
const attackerKeyPairPromise = generateKeyPair('RS256');

async function buildTestJwks(): Promise<JSONWebKeySet> {
  const { publicKey } = await primaryKeyPairPromise;
  const jwk = await exportJWK(publicKey);
  return {
    keys: [{ ...jwk, kid: TEST_KID, alg: 'RS256', use: 'sig' }],
  };
}

async function signFirebaseIdToken(opts: {
  uid?: string;
  email?: string;
  nowMs?: number;
  expiresInSeconds?: number;
  useAttackerKey?: boolean;
}): Promise<string> {
  const nowSec = Math.floor((opts.nowMs ?? Date.now()) / 1000);
  const expSec = nowSec + (opts.expiresInSeconds ?? 3600);
  const kp = opts.useAttackerKey ? await attackerKeyPairPromise : await primaryKeyPairPromise;
  const uid = opts.uid ?? AUTHORIZED_ADMIN_UID;
  const email = opts.email ?? 'admin@amancomputer.in';

  return new SignJWT({
    email,
    email_verified: true,
    user_id: uid,
    auth_time: nowSec - 15,
  })
    .setProtectedHeader({ alg: 'RS256', kid: TEST_KID })
    .setIssuer(`https://securetoken.google.com/${FIREBASE_PROJECT_ID}`)
    .setAudience(FIREBASE_PROJECT_ID)
    .setSubject(uid)
    .setIssuedAt(nowSec)
    .setExpirationTime(expSec)
    .sign(kp.privateKey);
}

const TEST_SUPABASE_CONFIG = {
  url: 'https://test-scan2print.supabase.co',
  anonKey: 'sb_publishable_test_anon_key',
};

const TEST_ENV: RuntimeEnv = {
  ADMIN_BOOTSTRAP_SECRET: 'super_secret_bootstrap_32_bytes_min',
  FIREBASE_PROJECT_ID,
};

async function createSeededAdminSim(): Promise<TestSupabaseSimulator> {
  const sim = new TestSupabaseSimulator();
  sim.setFirebaseJwks(await buildTestJwks());

  const adminToken = await signFirebaseIdToken({ uid: AUTHORIZED_ADMIN_UID, nowMs: sim.nowMs });
  const bootstrapRes = await handleAdminBootstrap(
    new Request('https://edge.local/admin-bootstrap', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-bootstrap-secret': TEST_ENV.ADMIN_BOOTSTRAP_SECRET!,
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        email: 'admin@amancomputer.in',
        fullName: 'Aman Kumar',
      }),
    }),
    sim.asAdapter(),
    TEST_ENV
  );
  assert.equal(bootstrapRes.status, 201);
  return sim;
}

function createEdgeFetchBridge(sim: TestSupabaseSimulator): typeof fetch {
  return async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const req = new Request(url, {
      method: init?.method ?? 'GET',
      headers: init?.headers,
      body: init?.body,
    });
    if (url.endsWith('/functions/v1/admin-update-payment-settings')) {
      return handleAdminUpdatePaymentSettings(req, sim.asAdapter(), TEST_ENV);
    }
    return new Response(JSON.stringify({ error: { code: 'NOT_FOUND', message: 'Unknown route' } }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  };
}

test('[PhaseC-1] Valid Firebase Admin login passes backend verification and unlocks Admin routes', async () => {
  const sim = await createSeededAdminSim();
  const validToken = await signFirebaseIdToken({ uid: AUTHORIZED_ADMIN_UID, nowMs: sim.nowMs });
  let unauthorizedTriggered = false;

  const verified = await verifyAdminAccessWithBackend({
    getIdToken: async () => validToken,
    onUnauthorized: () => {
      unauthorizedTriggered = true;
    },
    fetchImpl: createEdgeFetchBridge(sim),
    supabaseConfig: TEST_SUPABASE_CONFIG,
  });

  assert.equal(unauthorizedTriggered, false);
  assert.equal(verified.authorized, true);
  assert.equal(verified.admin.firebaseUid, AUTHORIZED_ADMIN_UID);
  assert.equal(verified.admin.email, 'admin@amancomputer.in');
  assert.equal(verified.admin.isActive, true);

  const session = createAdminSessionFromBackend(verified.admin);
  assert.equal(canAccessAdminRoute(session), true);
  assert.equal(session.roleName, 'Super Admin');
});

test('[PhaseC-2] Invalid password and Firebase Auth error codes map cleanly without leaking secrets', () => {
  assert.equal(
    mapFirebaseAuthError({ code: 'auth/wrong-password' }),
    'Invalid admin email or password.'
  );
  assert.equal(
    mapFirebaseAuthError({ code: 'auth/invalid-credential' }),
    'Invalid admin email or password.'
  );
  assert.equal(
    mapFirebaseAuthError({ code: 'auth/user-disabled' }),
    'This Firebase Admin account has been disabled.'
  );
  assert.equal(
    mapFirebaseAuthError({ code: 'auth/too-many-requests' }),
    'Too many failed sign-in attempts. Please wait a few minutes and try again.'
  );
  assert.equal(
    mapFirebaseAuthError({ code: 'auth/invalid-email' }),
    'Enter a valid admin email address.'
  );
});

test('[PhaseC-3] Logout and session restoration enforce fail-closed route gating', async () => {
  const sim = await createSeededAdminSim();
  const validToken = await signFirebaseIdToken({ uid: AUTHORIZED_ADMIN_UID, nowMs: sim.nowMs });

  // Signed-out state blocks all Admin routes
  assert.equal(canAccessAdminRoute(null), false);

  // Restored Firebase session re-verifies against Supabase backend before restoring dashboard access
  const restored = await verifyAdminAccessWithBackend({
    getIdToken: async () => validToken,
    fetchImpl: createEdgeFetchBridge(sim),
    supabaseConfig: TEST_SUPABASE_CONFIG,
  });
  const restoredSession = createAdminSessionFromBackend(restored.admin);
  assert.equal(canAccessAdminRoute(restoredSession), true);

  // Deactivated session also blocks all Admin routes
  assert.equal(canAccessAdminRoute({ ...restoredSession, isActive: false }), false);
});

test('[PhaseC-4] Expired Firebase ID token forces single refresh on 401 and succeeds with fresh token', async () => {
  const sim = await createSeededAdminSim();
  // Create expired token (2 hours old, expired 1 hour ago)
  const expiredToken = await signFirebaseIdToken({
    uid: AUTHORIZED_ADMIN_UID,
    nowMs: sim.nowMs - 7200 * 1000,
    expiresInSeconds: 3600,
  });
  const freshToken = await signFirebaseIdToken({
    uid: AUTHORIZED_ADMIN_UID,
    nowMs: sim.nowMs,
    expiresInSeconds: 3600,
  });

  const refreshCalls: boolean[] = [];
  let unauthorizedCount = 0;

  const verified = await verifyAdminAccessWithBackend({
    getIdToken: async (forceRefresh = false) => {
      refreshCalls.push(forceRefresh);
      return forceRefresh ? freshToken : expiredToken;
    },
    onUnauthorized: () => {
      unauthorizedCount += 1;
    },
    fetchImpl: createEdgeFetchBridge(sim),
    supabaseConfig: TEST_SUPABASE_CONFIG,
  });

  assert.deepEqual(refreshCalls, [false, true]);
  assert.equal(unauthorizedCount, 0);
  assert.equal(verified.admin.firebaseUid, AUTHORIZED_ADMIN_UID);
});

test('[PhaseC-5] Persistently invalid/expired Firebase ID token fails closed and triggers logout callback', async () => {
  const sim = await createSeededAdminSim();
  const forgedToken = await signFirebaseIdToken({
    uid: AUTHORIZED_ADMIN_UID,
    nowMs: sim.nowMs,
    useAttackerKey: true,
  });

  let unauthorizedStatus: number | null = null;

  await assert.rejects(
    async () => {
      await verifyAdminAccessWithBackend({
        getIdToken: async () => forgedToken,
        onUnauthorized: (err) => {
          unauthorizedStatus = err.status;
        },
        fetchImpl: createEdgeFetchBridge(sim),
        supabaseConfig: TEST_SUPABASE_CONFIG,
      });
    },
    (err: unknown) => err instanceof ProtectedEdgeApiError && err.status === 401
  );

  assert.equal(unauthorizedStatus, 401);
});

test('[PhaseC-6] Unauthorized Firebase UID and disabled Admin are rejected with 403 and forced sign-out', async () => {
  const sim = await createSeededAdminSim();
  const intruderToken = await signFirebaseIdToken({
    uid: UNAUTHORIZED_UID,
    email: 'other@example.com',
    nowMs: sim.nowMs,
  });

  let rejectedCode: string | null = null;
  await assert.rejects(
    async () => {
      await verifyAdminAccessWithBackend({
        getIdToken: async () => intruderToken,
        onUnauthorized: (err) => {
          rejectedCode = err.code;
        },
        fetchImpl: createEdgeFetchBridge(sim),
        supabaseConfig: TEST_SUPABASE_CONFIG,
      });
    },
    (err: unknown) => err instanceof ProtectedEdgeApiError && err.status === 403
  );
  assert.equal(rejectedCode, 'FORBIDDEN');

  // Now disable the legitimate Admin and verify fail-closed 403
  sim.adminAccounts[0].is_active = false;
  const adminToken = await signFirebaseIdToken({ uid: AUTHORIZED_ADMIN_UID, nowMs: sim.nowMs });
  let disabledRejected = false;
  await assert.rejects(
    async () => {
      await verifyAdminAccessWithBackend({
        getIdToken: async () => adminToken,
        onUnauthorized: () => {
          disabledRejected = true;
        },
        fetchImpl: createEdgeFetchBridge(sim),
        supabaseConfig: TEST_SUPABASE_CONFIG,
      });
    },
    (err: unknown) => err instanceof ProtectedEdgeApiError && err.status === 403
  );
  assert.equal(disabledRejected, true);
});

test('[PhaseC-7] Protected Admin Edge API mutation succeeds with valid token and fails with invalid token', async () => {
  const sim = await createSeededAdminSim();
  const validToken = await signFirebaseIdToken({ uid: AUTHORIZED_ADMIN_UID, nowMs: sim.nowMs });

  const updateRes = await invokeProtectedEdgeFunction<{ settings: { upi_enabled: boolean; upi_id: string } }>(
    'admin-update-payment-settings',
    {
      method: 'POST',
      body: {
        upiEnabled: true,
        upiId: 'amancomputer@upi',
        displayName: 'Aman Computer Center',
      },
      getIdToken: async () => validToken,
      fetchImpl: createEdgeFetchBridge(sim),
      supabaseConfig: TEST_SUPABASE_CONFIG,
    }
  );
  assert.equal(updateRes.settings.upi_enabled, true);
  assert.equal(updateRes.settings.upi_id, 'amancomputer@upi');

  // Missing token fails closed before network call
  let missingCalled = false;
  await assert.rejects(
    async () => {
      await invokeProtectedEdgeFunction('admin-update-payment-settings', {
        method: 'POST',
        body: { upiEnabled: false },
        getIdToken: async () => null,
        onUnauthorized: () => {
          missingCalled = true;
        },
        fetchImpl: createEdgeFetchBridge(sim),
        supabaseConfig: TEST_SUPABASE_CONFIG,
      });
    },
    (err: unknown) => err instanceof ProtectedEdgeApiError && err.status === 401
  );
  assert.equal(missingCalled, true);
});

test('[PhaseC-8] Frontend & Firebase Hosting config enforce single-admin security and zero public registration', () => {
  const rootDir = path.resolve(process.cwd());
  const supabaseTs = fs.readFileSync(path.join(rootDir, 'src/lib/supabase.ts'), 'utf8');
  const firebaseTs = fs.readFileSync(path.join(rootDir, 'src/lib/firebase.ts'), 'utf8');
  const authScreenTsx = fs.readFileSync(path.join(rootDir, 'src/components/AuthScreen.tsx'), 'utf8');
  const firebaseJsonRaw = fs.readFileSync(path.join(rootDir, 'firebase.json'), 'utf8');

  assert.ok(supabaseTs.includes('persistSession: false'), 'Supabase client must not persist browser auth sessions');
  assert.ok(!firebaseTs.includes('createUserWithEmailAndPassword'), 'Public Firebase user creation must not exist');
  assert.ok(!authScreenTsx.includes('createUserWithEmailAndPassword'), 'AuthScreen must not expose public signup');
  assert.ok(!authScreenTsx.includes('handleBootstrap'), 'AuthScreen must not expose public admin bootstrap signup');
  assert.ok(authScreenTsx.includes('Back to Aman Computer'), 'AuthScreen must display Back to Aman Computer link');
  assert.ok(authScreenTsx.includes('resolvePublicWebsiteUrl'), 'AuthScreen must resolve configurable VITE_PUBLIC_WEBSITE_URL');
  assert.equal(authScreenTsx.includes('target="_blank"'), false, 'Public website link must open in the same tab');
  assert.equal(fs.existsSync(path.join(rootDir, 'src/data/seedData.ts')), false, 'Deleted seedData.ts must remain deleted');

  const hostingCfg = JSON.parse(firebaseJsonRaw) as {
    hosting: { public: string; rewrites: Array<{ source: string; destination: string }> };
  };
  assert.equal(hostingCfg.hosting.public, 'dist');
  assert.ok(
    hostingCfg.hosting.rewrites.some((r) => r.source === '**' && r.destination === '/index.html')
  );
});

test('[PhaseC-9] Redesigned AuthScreen & LiquidMetalLoginStage enforce V4 morphing flow and zero demo shortcuts', () => {
  const rootDir = path.resolve(process.cwd());
  const authScreenTsx = fs.readFileSync(path.join(rootDir, 'src/components/AuthScreen.tsx'), 'utf8');
  const stageTsx = fs.readFileSync(
    path.join(rootDir, 'src/components/LiquidMetalLoginStage.tsx'),
    'utf8'
  );
  const liquidMetalButtonTsx = fs.readFileSync(
    path.join(rootDir, 'src/components/LiquidMetalButton.tsx'),
    'utf8'
  );

  // Required brand copy & morphing stage
  assert.ok(authScreenTsx.includes('AMAN COMPUTER SCAN2PRINT'));
  assert.ok(authScreenTsx.includes('AC <span className="text-[#25C7D9]">Scan2Print</span>'));
  assert.ok(authScreenTsx.includes('SMART PRINT TECHNOLOGY'));
  assert.ok(authScreenTsx.includes('Admin Control Center'));
  assert.ok(authScreenTsx.includes('Authorized administrator access only'));
  assert.ok(authScreenTsx.includes('Single Authorized Admin'));
  assert.ok(authScreenTsx.includes('LiquidMetalLoginStage'));
  assert.ok(authScreenTsx.includes('LiquidMetalButton'));
  assert.ok(stageTsx.includes('rememberSession'));
  assert.ok(stageTsx.includes('showPassword'));
  assert.ok(stageTsx.includes('shouldShowCredentialsForm'));
  assert.ok(stageTsx.includes('shouldRenderIdleButton'));

  // Never ship demo password or inline reference HTML secrets
  assert.equal(authScreenTsx.includes('Tr0ub4dor&3'), false);
  assert.equal(authScreenTsx.includes('DEMO_PASSWORD'), false);
  assert.equal(stageTsx.includes('Tr0ub4dor&3'), false);
  assert.equal(stageTsx.includes('DEMO_PASSWORD'), false);
  assert.equal(liquidMetalButtonTsx.includes('Tr0ub4dor&3'), false);
  assert.equal(liquidMetalButtonTsx.includes('DEMO_PASSWORD'), false);

  // Pure Liquid Metal state-visibility invariants: idle shows ONLY closed pill, no credential inputs
  assert.equal(shouldShowCredentialsForm('idle'), false);
  assert.equal(shouldShowCredentialsForm('loading'), false);
  assert.equal(shouldShowCredentialsForm('wrong'), false);
  assert.equal(shouldShowCredentialsForm('done'), false);
  assert.equal(shouldShowCredentialsForm('opening'), true);
  assert.equal(shouldShowCredentialsForm('open'), true);
  assert.equal(shouldShowCredentialsForm('closing'), true);

  assert.equal(shouldRenderIdleButton('idle'), true);
  assert.equal(shouldRenderIdleButton('loading'), true);
  assert.equal(shouldRenderIdleButton('wrong'), true);
  assert.equal(shouldRenderIdleButton('done'), true);
  assert.equal(shouldRenderIdleButton('opening'), false);
  assert.equal(shouldRenderIdleButton('open'), false);
  assert.equal(shouldRenderIdleButton('closing'), false);

  // Pure Liquid Metal V4 geometry stretch -> snap -> open -> close checks
  const idleGeo = computeMercuryGeometry({
    state: 'idle',
    stateElapsedSec: 0,
    mergeElapsedSec: -1,
    wrongElapsedSec: -1,
    pressAmount: 0,
  });
  assert.equal(idleGeo.rest, 1);
  assert.equal(idleGeo.gap, 0);
  assert.equal(idleGeo.field, 0);

  const stretchingGeo = computeMercuryGeometry({
    state: 'opening',
    stateElapsedSec: MERCURY_SNAP_DURATION * 0.75,
    mergeElapsedSec: -1,
    wrongElapsedSec: -1,
    pressAmount: 0,
  });
  assert.ok(stretchingGeo.gap > 120, 'Halves must stretch apart before neck snaps');
  assert.ok(stretchingGeo.waist > 0, 'Liquid neck waist must bridge halves before snap');

  const settledOpenGeo = computeMercuryGeometry({
    state: 'open',
    stateElapsedSec: MERCURY_SNAP_DURATION + 1.0,
    mergeElapsedSec: -1,
    wrongElapsedSec: -1,
    pressAmount: 0,
  });
  assert.equal(settledOpenGeo.rest, 0);
  assert.ok(Math.abs(settledOpenGeo.gap - MERCURY_FIELD_GAP) < 2);
  assert.equal(settledOpenGeo.field, 1);

  const closedGeo = computeMercuryGeometry({
    state: 'closing',
    stateElapsedSec: MERCURY_CLOSE_DURATION,
    mergeElapsedSec: -1,
    wrongElapsedSec: -1,
    pressAmount: 0,
  });
  assert.equal(closedGeo.rest, 1);
  assert.equal(closedGeo.gap, 0);
  assert.equal(closedGeo.field, 0);

  // Reduced-motion & button math checks
  assert.equal(shouldUseWebglLiquidMetal({ hasWebgl2: true, reducedMotion: false }), true);
  assert.equal(shouldUseWebglLiquidMetal({ hasWebgl2: true, reducedMotion: true }), false);
  assert.equal(shouldUseWebglLiquidMetal({ hasWebgl2: false, reducedMotion: false }), false);

  assert.equal(computeErrorFlushEnvelope(-0.1), 0);
  assert.ok(computeErrorFlushEnvelope(0.1) > 0.8);
  assert.equal(computeErrorFlushEnvelope(LIQUID_METAL_RIPPLE_DURATION + 0.5), 0);

  const sweepStart = computeLoadingKeyLightX(0);
  const sweepQuarter = computeLoadingKeyLightX(0.235);
  assert.ok(sweepQuarter > sweepStart);

  const [idleW, idleH] = computeButtonPillHalfSize({
    baseHalfWidth: 200,
    baseHalfHeight: 23,
    pressAmount: 0,
    hoverAmount: 0,
    errorElapsedSec: -1,
  });
  const [pressW, pressH] = computeButtonPillHalfSize({
    baseHalfWidth: 200,
    baseHalfHeight: 23,
    pressAmount: 1,
    hoverAmount: 1,
    errorElapsedSec: -1,
  });
  assert.ok(pressW > idleW);
  assert.ok(pressH < idleH);

  // Unified dual action pills compression & emerge geometry
  const [cancelIdleW, cancelIdleH] = computeActionPillHalfSize({
    baseHalfWidth: MERCURY_CANCEL_HALF_WIDTH,
    baseHalfHeight: MERCURY_CANCEL_HALF_HEIGHT,
    pressAmount: 0,
    hoverAmount: 0,
    appearAmount: 1,
  });
  const [cancelPressW, cancelPressH] = computeActionPillHalfSize({
    baseHalfWidth: MERCURY_CANCEL_HALF_WIDTH,
    baseHalfHeight: MERCURY_CANCEL_HALF_HEIGHT,
    pressAmount: 1,
    hoverAmount: 1,
    appearAmount: 1,
  });
  assert.ok(cancelPressW > cancelIdleW);
  assert.ok(cancelPressH < cancelIdleH);

  const [authAppearW] = computeActionPillHalfSize({
    baseHalfWidth: MERCURY_AUTH_HALF_WIDTH,
    baseHalfHeight: MERCURY_AUTH_HALF_HEIGHT,
    pressAmount: 0,
    hoverAmount: 0,
    appearAmount: 0,
  });
  assert.ok(authAppearW < MERCURY_AUTH_HALF_WIDTH);

  // Cancel clears typed password on close
  assert.ok(stageTsx.includes("onPasswordChange('')"));
});

