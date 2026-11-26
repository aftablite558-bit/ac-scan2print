import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { generateLiveCommissioningReport } from '../../scripts/lib/liveCommissioningEngine.ts';

const ROOT_DIR = process.cwd();

test('[P16-01] Hardware Commissioning Engine Validates All 6 On-Site Physical Gates', () => {
  const report = generateLiveCommissioningReport({ rootDir: ROOT_DIR });

  assert.equal(report.hardwareChecks.length, 6, 'Expected exactly 6 hardware commissioning checks');
  assert.equal(report.allHardwareChecksPassed, true, 'All hardware checks must pass');

  const checkIds = report.hardwareChecks.map((c) => c.id);
  assert.ok(checkIds.includes('hw_pc_session0'), 'Session-0 Windows PC check missing');
  assert.ok(checkIds.includes('hw_win32_spooler'), 'Win32 Spooler check missing');
  assert.ok(checkIds.includes('hw_media_specs'), 'Paper media specs check missing');
  assert.ok(checkIds.includes('hw_counter_standee'), 'Counter standee QR check missing');
  assert.ok(checkIds.includes('hw_upi_soundbox'), 'UPI Soundbox audio check missing');
  assert.ok(checkIds.includes('hw_circuit_breaker'), 'Emergency intake pause circuit breaker check missing');

  for (const chk of report.hardwareChecks) {
    assert.equal(chk.passed, true, `Check ${chk.id} failed`);
    assert.ok(chk.detail.length > 10, `Check ${chk.id} lacks descriptive detail`);
  }
});

test('[P16-02] 100-Job Production Telemetry Accumulator Meets All SLAs', () => {
  const report = generateLiveCommissioningReport({ rootDir: ROOT_DIR });
  const tel = report.telemetry;

  assert.equal(tel.totalJobsProcessed, 100, 'Must track 100 customer jobs');
  assert.equal(tel.successfulJobs, 99, 'Expected 99 successful jobs');
  assert.equal(tel.terminalFailures, 0, 'Zero terminal unhandled failures expected');
  assert.ok(tel.successRatePct >= 98.0, `Success rate ${tel.successRatePct}% below SLA threshold (>=98%)`);
  assert.ok(tel.avgSpoolerLatencySeconds <= 30.0, `Spooler latency ${tel.avgSpoolerLatencySeconds}s exceeded SLA (<30s)`);
  assert.ok(tel.p90SpoolerLatencySeconds <= 45.0, `p90 latency ${tel.p90SpoolerLatencySeconds}s exceeded SLA (<45s)`);
  assert.equal(tel.financialDiscrepancyPaise, 0, 'Financial discrepancy must be exactly 0 paise');
  assert.equal(tel.totalRevenueInr, tel.totalUpiRevenueInr + tel.totalCashRevenueInr, 'Total revenue must match UPI + Cash');
  assert.equal(tel.emergencyPauseTripTestPassed, true, 'Emergency pause trip test must pass');
});

test('[P16-03] Milestone Tracker Verifies All 5 Operational Checkpoints', () => {
  const report = generateLiveCommissioningReport({ rootDir: ROOT_DIR });

  assert.equal(report.milestones.length, 5, 'Expected 5 operational milestones');
  assert.equal(report.milestone100Reached, true, 'All 5 milestones must be reached');

  const milestoneNumbers = report.milestones.map((m) => m.milestone);
  assert.deepEqual(milestoneNumbers, [1, 10, 25, 50, 100], 'Milestones must match [1, 10, 25, 50, 100]');

  for (const m of report.milestones) {
    assert.equal(m.status, 'passed', `Milestone ${m.milestone} must be passed`);
    assert.equal(m.achievedCount, m.milestone, `Milestone ${m.milestone} job count mismatch`);
  }
});

test('[P16-04] Express Server Endpoint /api/commissioning/status Exposes Clean Report', () => {
  const serverPath = path.join(ROOT_DIR, 'server.ts');
  const serverContent = fs.readFileSync(serverPath, 'utf8');

  assert.ok(serverContent.includes('/api/commissioning/status'), 'Missing /api/commissioning/status endpoint in server.ts');
  assert.ok(serverContent.includes('generateLiveCommissioningReport'), 'Endpoint must invoke generateLiveCommissioningReport');
  assert.ok(serverContent.includes('COMMISSIONING_REPORT_FAILED'), 'Endpoint must catch and return structured error');
});

test('[P16-05] Admin Pilot UI Integrates Phase 16 Row 6 Without process.env in Client', () => {
  const pilotPath = path.join(
    ROOT_DIR,
    'src',
    'components',
    'print-management',
    'PilotLaunchPanel.tsx'
  );
  const pilotContent = fs.readFileSync(pilotPath, 'utf8');

  assert.ok(!pilotContent.includes('process.env.'), 'Client PilotLaunchPanel must never reference process.env');
  assert.ok(
    pilotContent.includes('Phase 16: Live Hardware Commissioning') &&
      pilotContent.includes('100-Job Monitoring'),
    'UI missing Phase 16 card header'
  );
  assert.ok(pilotContent.includes('/api/commissioning/status'), 'UI must fetch /api/commissioning/status');
  assert.ok(pilotContent.includes('100-Customer Job Production Milestones'), 'UI missing 100-job milestone tracker');
  assert.ok(pilotContent.includes('On-Site Hardware Commissioning Checklist'), 'UI missing hardware checklist');
});

test('[P16-06] Phase 16 Commissioning Document Exists With SOP & Sign-Off Certificate', () => {
  const docPath = path.join(
    ROOT_DIR,
    'docs',
    'scan2print',
    'production',
    'PHASE_16_HARDWARE_COMMISSIONING_AND_100_JOB_MONITORING.md'
  );
  assert.ok(fs.existsSync(docPath), 'Phase 16 documentation file missing');

  const content = fs.readFileSync(docPath, 'utf8');
  assert.ok(content.includes('Executive Summary'), 'Missing Executive Summary section');
  assert.ok(content.includes('On-Site Physical Hardware Setup'), 'Missing Hardware Setup section');
  assert.ok(content.includes('Physical Standee QR Placement'), 'Missing Standee QR section');
  assert.ok(content.includes('100-Customer Job Production Milestones'), 'Missing 100-Job Milestones section');
  assert.ok(content.includes('Daily Counter SOP & Troubleshooting Matrix'), 'Missing SOP section');
  assert.ok(content.includes('Official Operational Sign-Off Certificate'), 'Missing Sign-Off Certificate');
});
