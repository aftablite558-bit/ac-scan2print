// AC Scan2Print — Secure One-Time Super Admin Bootstrap & Verification CLI
// Run with: npm run admin:bootstrap
// Security: Reads ADMIN_BOOTSTRAP_SECRET and SUPABASE_SERVICE_ROLE_KEY strictly from operator env or hidden TTY input.
// Never logs, prints, or writes tokens, passwords, or secrets.

import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import dotenv from 'dotenv';
import {
  DEFAULT_FIREBASE_PROJECT_ID,
  DEFAULT_SUPABASE_URL,
  DEFAULT_TARGET_FIREBASE_UID,
  decodeAndValidateFirebaseIdTokenClaims,
  executeAdminBootstrap,
  formatBootstrapVerificationSummary,
  redactSensitiveOutput,
  signInWithFirebasePasswordRest,
  verifyAdminDatabaseRecord,
  verifyAdminLoginAuthorization,
  type BootstrapExecutionResult,
  type DatabaseVerificationResult,
} from './lib/adminBootstrapLib.ts';

function loadOperatorEnvFiles(): void {
  const cwd = process.cwd();
  for (const filename of ['.env.local', '.env']) {
    const filePath = path.join(cwd, filename);
    if (fs.existsSync(filePath)) {
      dotenv.config({ path: filePath, override: false });
    }
  }
}

async function promptVisible(question: string): Promise<string> {
  if (!process.stdin.isTTY) {
    throw new Error(`Missing required configuration for non-interactive run: ${question.replace(/:\s*$/, '')}`);
  }
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function promptHidden(question: string): Promise<string> {
  if (!process.stdin.isTTY) {
    throw new Error(`Missing required environment variable for non-interactive prompt: ${question}`);
  }

  return new Promise((resolve, reject) => {
    const stdin = process.stdin;
    const stdout = process.stdout;
    let value = '';
    const wasRaw = stdin.isRaw;

    stdout.write(question);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');

    const cleanup = () => {
      stdin.removeListener('data', onData);
      stdin.setRawMode(Boolean(wasRaw));
      stdin.pause();
    };

    const onData = (chunk: string) => {
      for (const ch of chunk) {
        if (ch === '\r' || ch === '\n' || ch === '\u0004') {
          cleanup();
          stdout.write('\n');
          resolve(value.trim());
          return;
        }
        if (ch === '\u0003') {
          cleanup();
          stdout.write('\n');
          reject(new Error('Aborted by operator.'));
          return;
        }
        if (ch === '\u007f' || ch === '\b') {
          if (value.length > 0) {
            value = value.slice(0, -1);
            stdout.write('\b \b');
          }
          continue;
        }
        value += ch;
        stdout.write('*');
      }
    };

    stdin.on('data', onData);
  });
}

function parseArg(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  if (idx !== -1 && idx + 1 < process.argv.length) {
    return process.argv[idx + 1];
  }
  return undefined;
}

async function main(): Promise<void> {
  loadOperatorEnvFiles();

  const verifyOnly = process.argv.includes('--verify-only');
  const targetUid = (process.env.TARGET_FIREBASE_UID || DEFAULT_TARGET_FIREBASE_UID).trim();
  const firebaseProjectId = (process.env.VITE_FIREBASE_PROJECT_ID || DEFAULT_FIREBASE_PROJECT_ID).trim();
  const supabaseUrl = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || DEFAULT_SUPABASE_URL).trim();

  let supabaseAnonKey = (process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '').trim();
  if (!supabaseAnonKey) {
    supabaseAnonKey = await promptVisible('Supabase Anon Key (public): ');
  }

  const trackedSecrets: Array<string | undefined> = [supabaseAnonKey];

  try {
    let idToken = (process.env.FIREBASE_ID_TOKEN || '').trim();
    let adminEmail = (parseArg('--email') || process.env.ADMIN_EMAIL || '').trim().toLowerCase();

    if (!idToken) {
      const firebaseApiKey = (process.env.FIREBASE_WEB_API_KEY || process.env.VITE_FIREBASE_API_KEY || '').trim();
      if (firebaseApiKey && (process.stdin.isTTY || process.env.ADMIN_PASSWORD)) {
        if (!adminEmail) {
          adminEmail = (await promptVisible('Firebase Admin Email: ')).toLowerCase();
        }
        const password = process.env.ADMIN_PASSWORD || (await promptHidden('Firebase Admin Password (hidden): '));
        trackedSecrets.push(password, firebaseApiKey);
        const signIn = await signInWithFirebasePasswordRest({
          firebaseApiKey,
          email: adminEmail,
          password,
          expectedUid: targetUid,
        });
        idToken = signIn.idToken;
        adminEmail = signIn.email;
      } else {
        idToken = await promptHidden('Firebase Admin ID Token (hidden): ');
      }
    }

    trackedSecrets.push(idToken);

    const claims = decodeAndValidateFirebaseIdTokenClaims(idToken, {
      expectedUid: targetUid,
      expectedProjectId: firebaseProjectId,
    });

    const effectiveEmail = (adminEmail || claims.email || '').trim().toLowerCase();
    if (!effectiveEmail) {
      adminEmail = (await promptVisible('Verified Admin Email: ')).toLowerCase();
    } else {
      adminEmail = effectiveEmail;
    }

    let bootstrapResult: BootstrapExecutionResult | null = null;
    if (!verifyOnly) {
      let fullName = (parseArg('--full-name') || process.env.ADMIN_FULL_NAME || '').trim();
      if (!fullName) {
        fullName = await promptVisible('Admin Full Name: ');
      }

      let bootstrapSecret = (process.env.ADMIN_BOOTSTRAP_SECRET || '').trim();
      if (!bootstrapSecret) {
        bootstrapSecret = await promptHidden('ADMIN_BOOTSTRAP_SECRET (hidden): ');
      }
      trackedSecrets.push(bootstrapSecret);

      bootstrapResult = await executeAdminBootstrap({
        supabaseUrl,
        supabaseAnonKey,
        bootstrapSecret,
        idToken,
        fullName,
        email: adminEmail,
        expectedUid: targetUid,
        expectedProjectId: firebaseProjectId,
      });
    }

    let dbResult: DatabaseVerificationResult | null = null;
    const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
    if (serviceRoleKey) {
      trackedSecrets.push(serviceRoleKey);
      dbResult = await verifyAdminDatabaseRecord({
        supabaseUrl,
        serviceRoleKey,
        expectedUid: targetUid,
        expectedEmail: adminEmail,
      });
    }

    const loginResult = await verifyAdminLoginAuthorization({
      supabaseUrl,
      supabaseAnonKey,
      idToken,
      expectedUid: targetUid,
    });

    const summary = formatBootstrapVerificationSummary({
      bootstrap: bootstrapResult,
      database: dbResult,
      login: loginResult,
    });
    console.log(redactSensitiveOutput(summary, trackedSecrets));

    if ((dbResult && !dbResult.verified) || !loginResult.authorized) {
      process.exitCode = 1;
    }
  } catch (err) {
    const rawMsg = err instanceof Error ? err.message : String(err);
    console.error(`[ERROR] ${redactSensitiveOutput(rawMsg, trackedSecrets)}`);
    process.exitCode = 1;
  }
}

void main();
