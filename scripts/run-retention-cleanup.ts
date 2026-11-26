// AC Scan2Print — Phase 14 Scheduled Retention Cleanup Runner CLI
// Usage:
//   npm run cloud:cleanup               (Safe dry_run preview — deletes zero files)
//   npm run cloud:cleanup -- --execute  (Executes retention purge when owner confirmed)
// Security: Reads CRON_SECRET strictly from env or hidden TTY prompt; never logs secrets.

import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import dotenv from 'dotenv';
import { DEFAULT_SUPABASE_URL, redactSensitiveOutput } from './lib/adminBootstrapLib.ts';

function loadEnvFiles(): void {
  const cwd = process.cwd();
  for (const file of ['.env', '.env.local']) {
    const p = path.join(cwd, file);
    if (!fs.existsSync(p)) continue;
    const parsed = dotenv.parse(fs.readFileSync(p, 'utf8'));
    for (const [key, val] of Object.entries(parsed)) {
      const existing = process.env[key];
      if ((!existing || existing.trim() === '') || (file === '.env.local' && val.trim() !== '')) {
        if (val.trim() !== '') {
          process.env[key] = val;
        }
      }
    }
  }
}

async function promptHidden(question: string): Promise<string> {
  if (!process.stdin.isTTY) {
    throw new Error('CRON_SECRET is required in environment for non-interactive cleanup execution.');
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

export async function invokeRetentionCleanup(opts: {
  supabaseUrl: string;
  cronSecret: string;
  execute: boolean;
  fetchImpl?: typeof fetch;
}): Promise<{
  mode: 'dry_run' | 'execute';
  retentionPolicyConfirmed: boolean;
  jobsExpired: number;
  filesMarkedDeleted: number;
  storageObjectsRemoved: number;
  skippedActiveOrDisputed: number;
}> {
  const fetchFn = opts.fetchImpl ?? fetch;
  const endpoint = `${opts.supabaseUrl.replace(/\/+$/, '')}/functions/v1/cleanup-expired-print-files`;

  const resp = await fetchFn(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-cron-secret': opts.cronSecret,
    },
    body: JSON.stringify({ dryRun: !opts.execute }),
    signal: AbortSignal.timeout(20000),
  });

  const text = await resp.text();
  if (!resp.ok) {
    throw new Error(`Cleanup failed (HTTP ${resp.status}): ${text}`);
  }
  return JSON.parse(text);
}

async function main(): Promise<void> {
  if (process.argv.includes('--help')) {
    console.log('Usage: npm run cloud:cleanup [-- --execute]');
    console.log('Defaults cleanly to dry_run mode (zero deletions). Pass --execute to purge expired files.');
    return;
  }

  loadEnvFiles();
  const execute = process.argv.includes('--execute');
  const supabaseUrl = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || DEFAULT_SUPABASE_URL).trim();

  let cronSecret = (process.env.CRON_SECRET || '').trim();
  if (!cronSecret) {
    cronSecret = await promptHidden('CRON_SECRET (hidden): ');
  }

  try {
    const res = await invokeRetentionCleanup({
      supabaseUrl,
      cronSecret,
      execute,
    });
    console.log('=== AC Scan2Print Retention Cleanup Summary ===');
    console.log(`Mode                       : ${res.mode}`);
    console.log(`Retention Policy Confirmed : ${res.retentionPolicyConfirmed}`);
    console.log(`Jobs Expired               : ${res.jobsExpired}`);
    console.log(`Files Marked Deleted       : ${res.filesMarkedDeleted}`);
    console.log(`Storage Objects Removed    : ${res.storageObjectsRemoved}`);
    console.log(`Skipped Active/Disputed    : ${res.skippedActiveOrDisputed}`);
  } catch (err) {
    const rawMsg = err instanceof Error ? err.message : String(err);
    console.error(`[ERROR] ${redactSensitiveOutput(rawMsg, [cronSecret])}`);
    process.exitCode = 1;
  }
}

const isCliEntry =
  typeof process !== 'undefined' &&
  Array.isArray(process.argv) &&
  process.argv[1]?.endsWith('run-retention-cleanup.ts');

if (isCliEntry) {
  void main();
}
