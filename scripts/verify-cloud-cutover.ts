// AC Scan2Print — Phase 13 Cloud Provisioning & Cutover Verification CLI
// Run: npm run cloud:preflight
// Security: Read-only probes; never logs keys, tokens, or secrets.

import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import { runCloudCutoverPreflight } from './lib/cloudCutoverPreflight.ts';

function loadEnvFiles(): void {
  const cwd = process.cwd();
  const orderedFiles = ['.env', '.env.local'];
  for (const file of orderedFiles) {
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
  const skipNetworkProbes = process.argv.includes('--offline');
  const report = await runCloudCutoverPreflight({ skipNetworkProbes });

  console.log('=== AC Scan2Print Phase 13 Cloud Cutover Preflight ===');
  console.log(`Checked At        : ${report.checkedAtIso}`);
  console.log(`Supabase Ref      : ${report.supabaseProjectRef ?? 'UNSET'}`);
  console.log(`Firebase Project  : ${report.firebaseProjectId ?? 'UNSET'}`);
  console.log(`Portal Target URL : ${report.expectedCustomerPortalUrl}`);
  console.log(`SQL Migrations    : ${report.migrationsFound.length}`);
  console.log(`Edge Functions    : ${report.edgeFunctionsFound.length}`);
  console.log('');

  for (const chk of report.checks) {
    const badge = chk.passed ? '[PASS]' : '[FAIL]';
    console.log(`${badge} ${chk.label}`);
    console.log(`       ${chk.detail}`);
  }

  if (report.liveEdgeProbes.length > 0) {
    console.log('\nLive Supabase Edge Probes:');
    for (const p of report.liveEdgeProbes) {
      console.log(`  - ${p.fnName}: ${p.detail}`);
    }
  }

  if (report.readyForLiveCutover) {
    console.log('\nSTATUS: READY FOR LIVE COUNTER CUTOVER');
  } else {
    console.log(`\nSTATUS: PENDING CUTOVER ACTIONS (${report.blockingReasons.length} item(s))`);
    console.log('\n--- Next Operator Commands ---');
    console.log(report.playbookCommands.supabaseSecretsAndDb);
    console.log('\n--- Deploy All 21 Edge Functions ---');
    console.log(report.playbookCommands.supabaseDeployAllFunctions);
    console.log('\n--- Unified Firebase Hosting Deploy ---');
    console.log(report.playbookCommands.firebaseHostingDeploy);
  }
}

void main();
