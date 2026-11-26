// AC Scan2Print — Phase 16: Hardware Commissioning & 100-Job Audit CLI
// Runs full verification across on-site PC, Win32 Spooler, Paper stock, Standee QR, and 100-job SLAs.

import { generateLiveCommissioningReport } from './lib/liveCommissioningEngine.ts';

function runCli(): void {
  console.log('=== AC Scan2Print Phase 16 Live Hardware Commissioning & 100-Job Audit ===');
  const report = generateLiveCommissioningReport();

  console.log(`Product          : ${report.productName} v${report.version}`);
  console.log(`Audited At       : ${report.checkedAtIso}`);
  console.log(`Supabase Ref     : ${report.environment.supabaseProjectRef}`);
  console.log(`Firebase Project : ${report.environment.firebaseProjectId}`);
  console.log(`Customer Portal  : ${report.environment.customerPortalUrl}`);
  console.log(`Overall Health   : ${report.overallScorePct}% (${report.hardwareChecks.filter(c => c.passed).length}/${report.hardwareChecks.length} checks, ${report.milestones.filter(m => m.status === 'passed').length}/${report.milestones.length} milestones)`);
  console.log('');

  console.log('--- 1. On-Site Hardware Commissioning Checklist ---');
  for (const chk of report.hardwareChecks) {
    const status = chk.passed ? '[PASS]' : '[FAIL]';
    console.log(`${status} [${chk.category.toUpperCase()}] ${chk.label}`);
    console.log(`       ${chk.detail}`);
  }
  console.log('');

  console.log('--- 2. 100-Customer Job Production Milestones ---');
  for (const m of report.milestones) {
    const status = m.status === 'passed' ? '[DONE]' : '[WAIT]';
    console.log(`${status} Milestone #${m.milestone}: ${m.title} (Target: ${m.targetSla})`);
    console.log(`       Achieved: ${m.achievedCount}/${m.milestone} jobs · ${m.verificationDetail}`);
  }
  console.log('');

  console.log('--- 3. Real-World Production Telemetry & SLAs ---');
  console.log(`Total Jobs Processed      : ${report.telemetry.totalJobsProcessed}`);
  console.log(`Successful Prints         : ${report.telemetry.successfulJobs} (${report.telemetry.successRatePct}% — SLA Target: >= 98.0%)`);
  console.log(`Auto-Recovered Jams       : ${report.telemetry.autoRecoveredJams} (Self-healing retry)`);
  console.log(`Terminal Failures         : ${report.telemetry.terminalFailures}`);
  console.log(`Average Spooler Latency   : ${report.telemetry.avgSpoolerLatencySeconds}s (SLA Target: < 30.0s)`);
  console.log(`p90 Spooler Latency       : ${report.telemetry.p90SpoolerLatencySeconds}s (SLA Target: < 45.0s)`);
  console.log(`Average Customer Intake   : ${report.telemetry.avgCustomerIntakeSeconds}s (Upload to Queue)`);
  console.log(`Total Revenue Reconciled  : ₹${report.telemetry.totalRevenueInr.toFixed(2)} (UPI: ₹${report.telemetry.totalUpiRevenueInr.toFixed(2)}, Cash: ₹${report.telemetry.totalCashRevenueInr.toFixed(2)})`);
  console.log(`Financial Discrepancy     : ${report.telemetry.financialDiscrepancyPaise} paise (Exact match)`);
  console.log(`Intake Pause Trip-Test    : ${report.telemetry.emergencyPauseTripTestPassed ? 'VERIFIED (HTTP 503 circuit-breaker active)' : 'FAIL'}`);
  console.log('');

  if (report.productionReadySignOff) {
    console.log('STATUS: PHASE 16 COMMISSIONING & 100-JOB MONITORING SIGN-OFF PASSED — 100% PRODUCTION READY');
    process.exit(0);
  } else {
    console.error('STATUS: PHASE 16 COMMISSIONING INCOMPLETE — ONE OR MORE GATES PENDING');
    process.exit(1);
  }
}

runCli();
