// AC Scan2Print — Phase 15 Master Architecture Ledger & Production Audit CLI
// Usage: npm run master:audit
// Security: Read-only; audits static code, migrations & configs; never logs secrets.

import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import { generateMasterArchitectureLedger } from './lib/masterArchitectureLedger.ts';

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
  const report = generateMasterArchitectureLedger();

  console.log('=== AC Scan2Print Phase 15 Master Architecture Audit ===');
  console.log(`Product          : ${report.productName} v${report.version}`);
  console.log(`Audited At       : ${report.checkedAtIso}`);
  console.log(`Supabase Ref     : ${report.targetEnvironment.supabaseProjectRef}`);
  console.log(`Firebase Project : ${report.targetEnvironment.firebaseProjectId}`);
  console.log(`Super Admin UID  : ${report.targetEnvironment.superAdminFirebaseUid}`);
  console.log(`Primary Domain   : ${report.targetEnvironment.primaryDomainUrl}`);
  console.log(`Customer Portal  : ${report.targetEnvironment.customerPortalUrl}`);
  console.log(`Overall Health   : ${report.overallHealthPct}% (${report.passedLayers}/${report.totalLayers} layers verified)`);
  console.log('');

  for (const layer of report.layers) {
    const badge = layer.passed ? '[PASS]' : '[FAIL]';
    console.log(`${badge} Layer ${layer.layerIndex}: ${layer.name} (${layer.score})`);
    console.log(`       ${layer.summary}`);
    for (const detail of layer.details) {
      console.log(`       · ${detail}`);
    }
    console.log('');
  }

  if (report.allLayersPassed) {
    console.log('STATUS: MASTER ARCHITECTURE AUDIT PASSED — 100% PRODUCTION READY');
  } else {
    console.log('STATUS: MASTER AUDIT ATTENTION REQUIRED');
    process.exitCode = 1;
  }
}

void main();
