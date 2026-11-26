// AC Scan2Print — Phase 14 Post-Deploy Live Smoke Verification CLI
// Usage:
//   npm run cloud:smoke           (verifies https://ac-scan2print.web.app + live Supabase)
//   npm run cloud:smoke -- --local (verifies http://127.0.0.1:3000 dual-surface + Supabase)
// Security: Read-only/fail-closed probes; never logs keys or secrets.

import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import { runLiveCloudSmokeSuite } from './lib/liveCloudSmoke.ts';

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

async function main(): Promise<void> {
  loadEnvFiles();
  const isLocal = process.argv.includes('--local');
  const report = await runLiveCloudSmokeSuite({
    target: isLocal ? 'local' : 'production',
  });

  console.log('=== AC Scan2Print Phase 14 Live Smoke Suite ===');
  console.log(`Checked At       : ${report.checkedAtIso}`);
  console.log(`Target           : ${report.target}`);
  console.log(`Admin URL        : ${report.adminUrl}`);
  console.log(`Customer QR URL  : ${report.customerPortalUrl}`);
  console.log(`Supabase Ref     : ${report.supabaseProjectRef ?? 'UNSET'}`);
  console.log('');

  for (const chk of report.checks) {
    console.log(`${chk.passed ? '[PASS]' : '[FAIL]'} ${chk.label}`);
    console.log(`       ${chk.detail}`);
  }

  console.log(`\nSUMMARY: ${report.passedCount}/${report.totalCount} smoke checks passed.`);
  if (!report.allPassed) {
    process.exitCode = 1;
  }
}

void main();
