// AC Scan2Print — Cryptographic Firebase ID Token Verifier (RS256 + Google Official JWKS)
// Verifies Firebase Auth ID tokens strictly server-side using jose.
// Never requires Firebase Admin SDK or Firebase service-account private keys.

import {
  createLocalJWKSet,
  createRemoteJWKSet,
  decodeProtectedHeader,
  jwtVerify,
  type JSONWebKeySet,
} from 'jose';
import { AppError } from './types.ts';

export const FIREBASE_SECURETOKEN_JWKS_URL =
  'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';

const MAX_FIREBASE_JWT_LENGTH = 8192;
const CLOCK_TOLERANCE_SECONDS = 30;

let cachedRemoteJwks: ReturnType<typeof createRemoteJWKSet> | null = null;

function getRemoteFirebaseJwks(): ReturnType<typeof createRemoteJWKSet> {
  if (!cachedRemoteJwks) {
    cachedRemoteJwks = createRemoteJWKSet(new URL(FIREBASE_SECURETOKEN_JWKS_URL));
  }
  return cachedRemoteJwks;
}

export interface VerifiedFirebaseToken {
  firebaseUid: string;
  email: string | null;
  emailVerified: boolean;
  authTime: number;
  issuedAt: number;
  expiresAt: number;
}

export interface VerifyFirebaseTokenOptions {
  /** Optional local JWKS for deterministic offline automated security verification tests. */
  localJwks?: JSONWebKeySet;
  /** Optional deterministic current time (Date or epoch seconds) for test expiration verification. */
  currentDate?: Date;
}

/**
 * Cryptographically verifies a Firebase Authentication ID Token according to Google's Firebase ID Token contract:
 * 1. Fails closed (500 SERVER_MISCONFIGURED) if FIREBASE_PROJECT_ID is missing.
 * 2. Pins JWS algorithm strictly to ['RS256'] (rejects alg=none, HS256 key-confusion, etc.) and requires kid.
 * 3. Validates RS256 signature against Google's official Secure Token JWKS.
 * 4. Validates iss === `https://securetoken.google.com/${projectId}` and aud === projectId.
 * 5. Validates exp > now, iat <= now, auth_time <= now, and sub is a non-empty string <= 128 chars.
 */
export async function verifyFirebaseIdToken(
  idToken: string,
  firebaseProjectId: string,
  options: VerifyFirebaseTokenOptions = {}
): Promise<VerifiedFirebaseToken | null> {
  const projectId = firebaseProjectId.trim();
  if (!projectId) {
    throw new AppError(
      500,
      'SERVER_MISCONFIGURED',
      'FIREBASE_PROJECT_ID is not configured on the backend.'
    );
  }

  if (typeof idToken !== 'string') {
    return null;
  }
  const token = idToken.trim();
  if (!token || token.length > MAX_FIREBASE_JWT_LENGTH) {
    return null;
  }

  // Must be compact 3-part JWS
  const segments = token.split('.');
  if (segments.length !== 3 || !segments[0] || !segments[1] || !segments[2]) {
    return null;
  }

  try {
    const header = decodeProtectedHeader(token);
    if (header.alg !== 'RS256') {
      return null;
    }
    if (typeof header.kid !== 'string' || !header.kid.trim()) {
      return null;
    }

    const keyResolver = options.localJwks
      ? createLocalJWKSet(options.localJwks)
      : getRemoteFirebaseJwks();

    const expectedIssuer = `https://securetoken.google.com/${projectId}`;
    const currentDate = options.currentDate ?? new Date();
    const nowSec = Math.floor(currentDate.getTime() / 1000);

    const { payload } = await jwtVerify(token, keyResolver, {
      algorithms: ['RS256'],
      issuer: expectedIssuer,
      audience: projectId,
      currentDate,
      clockTolerance: CLOCK_TOLERANCE_SECONDS,
    });

    // Firebase UID (`sub`) must be a non-empty string up to 128 characters
    if (typeof payload.sub !== 'string' || payload.sub.length < 1 || payload.sub.length > 128) {
      return null;
    }

    // Standard Firebase ID token numeric claims
    if (
      typeof payload.exp !== 'number' ||
      !Number.isFinite(payload.exp) ||
      typeof payload.iat !== 'number' ||
      !Number.isFinite(payload.iat) ||
      payload.iat > nowSec + CLOCK_TOLERANCE_SECONDS
    ) {
      return null;
    }

    const authTime = payload.auth_time;
    if (
      typeof authTime !== 'number' ||
      !Number.isFinite(authTime) ||
      authTime <= 0 ||
      authTime > nowSec + CLOCK_TOLERANCE_SECONDS
    ) {
      return null;
    }

    const rawEmail = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : null;
    const emailVerified = payload.email_verified === true;

    return {
      firebaseUid: payload.sub,
      email: rawEmail || null,
      emailVerified,
      authTime,
      issuedAt: payload.iat,
      expiresAt: payload.exp,
    };
  } catch {
    return null;
  }
}
