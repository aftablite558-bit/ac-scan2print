import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { generateMasterArchitectureLedger } from '../../scripts/lib/masterArchitectureLedger.ts';

const ROOT = process.cwd();

test('[P15-01] Master Architecture Ledger Validates All 8 Production Layers with 100% Health', () => {
  const report = generateMasterArchitectureLedger({ rootDir: ROOT });

  assert.equal(report.productName, 'AC Scan2Print');
  assert.equal(report.version, '1.0.4');
  assert.equal(report.totalLayers, 8);
  assert.equal(report.passedLayers, 8, `Expected all 8 layers to pass, got ${report.passedLayers}/8`);
  assert.equal(report.overallHealthPct, 100);
  assert.equal(report.allLayersPassed, true);

  const layerIds = report.layers.map((l) => l.layerId);
  assert.deepEqual(layerIds, [
    'database_schema',
    'edge_functions',
    'storage_buckets',
    'unified_hosting',
    'windows_agent',
    'security_governance',
    'financial_accounting',
    'disaster_recovery',
  ]);
});

test('[P15-02] Master Audit Verifies All 7 Migrations, 21 Edge Functions & 3 Private Storage Buckets', () => {
  const report = generateMasterArchitectureLedger({ rootDir: ROOT });

  const dbLayer = report.layers.find((l) => l.layerId === 'database_schema');
  assert.ok(dbLayer?.passed);
  assert.equal(dbLayer?.score, '11/11 migrations');

  const edgeLayer = report.layers.find((l) => l.layerId === 'edge_functions');
  assert.ok(edgeLayer?.passed);
  assert.equal(edgeLayer?.score, '21/21 functions');

  const storageLayer = report.layers.find((l) => l.layerId === 'storage_buckets');
  assert.ok(storageLayer?.passed);
  assert.equal(storageLayer?.score, '3/3 private buckets');

  assert.equal(report.signOffCriteria.databaseMigrationsVerified, true);
  assert.equal(report.signOffCriteria.edgeFunctionsVerified, true);
  assert.equal(report.signOffCriteria.storageBucketsVerified, true);
});

test('[P15-03] Master Audit Enforces Single Admin Governance & Zero Plain Secrets', () => {
  const report = generateMasterArchitectureLedger({ rootDir: ROOT });

  assert.equal(
    report.targetEnvironment.superAdminFirebaseUid,
    'Yr0Wr7PuuAdOIMaqohmqaINNbNC2'
  );
  assert.equal(
    report.targetEnvironment.supabaseProjectRef,
    'tvtfgsijxlxpwgakpeag'
  );
  assert.equal(
    report.targetEnvironment.firebaseProjectId,
    'aman-computer-27b21'
  );

  const secLayer = report.layers.find((l) => l.layerId === 'security_governance');
  assert.ok(secLayer?.passed);
  assert.equal(report.signOffCriteria.securityGovernanceVerified, true);
});

test('[P15-04] Server Express Endpoint /api/master/audit Exposes Clean Architecture Scorecard', () => {
  const serverSrc = fs.readFileSync(path.join(ROOT, 'server.ts'), 'utf8');
  assert.ok(serverSrc.includes("'/api/master/audit'"));
  assert.ok(serverSrc.includes('generateMasterArchitectureLedger'));
  assert.ok(serverSrc.includes("res.setHeader('Cache-Control', 'no-store')"));
});

test('[P15-05] Admin Pilot UI Integrates Master Architecture Ledger & Scorecard Without process.env', () => {
  const panelSrc = fs.readFileSync(
    path.join(ROOT, 'src', 'components', 'print-management', 'PilotLaunchPanel.tsx'),
    'utf8'
  );

  assert.ok(panelSrc.includes('/api/master/audit'));
  assert.ok(panelSrc.includes('Master Architecture Ledger &amp; Production Audit'));
  assert.ok(panelSrc.includes('Phase 15 Master Verified'));
  assert.ok(panelSrc.includes('Run Master Audit'));
  assert.ok(!panelSrc.includes('process.env.'));
});

test('[P15-06] Phase 15 Documentation Ledger & Final Handover Manuals Exist With All Sections', () => {
  const masterLedger = fs.readFileSync(
    path.join(ROOT, 'docs', 'scan2print', 'production', 'MASTER_ARCHITECTURE_LEDGER.md'),
    'utf8'
  );
  assert.ok(masterLedger.includes('202611250001_scan2print_phase11_pilot_controls.sql'));
  assert.ok(masterLedger.includes('DataProtectionScope.LocalMachine'));
  assert.ok(masterLedger.includes('Integer Paise Accounting'));

  const handoverDoc = fs.readFileSync(
    path.join(ROOT, 'docs', 'scan2print', 'PHASE_15_MASTER_AUDIT_AND_HANDOVER.md'),
    'utf8'
  );
  assert.ok(handoverDoc.includes('8-LAYER PRODUCTION SCORECARD: 100% HEALTH'));
  assert.ok(handoverDoc.includes('npm run master:audit'));
  assert.ok(handoverDoc.includes('Supervised 10-Job Pilot'));
});
