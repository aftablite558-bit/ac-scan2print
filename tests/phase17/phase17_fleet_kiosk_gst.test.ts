import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  DEFAULT_FLEET_STATIONS,
  buildGstReturnSummaryCsv,
  computeGstTaxBreakdown,
  formatThermalReceiptSlip,
  generateMonthlyGstReport,
  routeJobToBestStation,
  sanitizeCsvValue,
} from '../../scripts/lib/fleetKioskAndGstEngine.ts';

const ROOT_DIR = process.cwd();

test('[P17-01] Multi-Counter Fleet Load Balancing Routes Colour, B&W Duplex & Kiosk Express Accurately', () => {
  assert.equal(DEFAULT_FLEET_STATIONS.length, 4, 'Expected 4 default fleet stations');

  const duplexDecision = routeJobToBestStation({
    jobNumber: 'JOB-101',
    paperSize: 'A4',
    printMode: 'bw',
    printSides: 'duplex',
    totalPages: 16,
    copies: 1,
  });
  assert.equal(duplexDecision.routingAlgorithmUsed, 'least_busy');
  assert.equal(duplexDecision.assignedStationId, 'station-3-kiosk-express', 'Should pick least busy duplex A4 station');

  const colourDecision = routeJobToBestStation({
    jobNumber: 'JOB-102',
    paperSize: 'Photo_4x6',
    printMode: 'colour',
    printSides: 'single',
    totalPages: 2,
    copies: 3,
  });
  assert.equal(colourDecision.routingAlgorithmUsed, 'capability_affinity');
  assert.equal(colourDecision.assignedStationId, 'station-2-colour-photo', 'Colour jobs must route to Epson L8050 station');

  const kioskDecision = routeJobToBestStation({
    jobNumber: 'JOB-103',
    paperSize: 'A4',
    printMode: 'bw',
    printSides: 'single',
    totalPages: 4,
    copies: 1,
    isKioskPickup: true,
  });
  assert.equal(kioskDecision.routingAlgorithmUsed, 'kiosk_express');
  assert.equal(kioskDecision.assignedStationId, 'station-3-kiosk-express');
});

test('[P17-02] GST Tax Engine Computes Exact Integer Paise CGST/SGST (HSN 9989) & Monthly P&L', () => {
  const breakdown = computeGstTaxBreakdown(118.0);
  assert.equal(breakdown.hsnCode, '9989');
  assert.equal(breakdown.grossAmountPaise, 11800);
  assert.equal(breakdown.taxableAmountPaise, 10000);
  assert.equal(breakdown.totalGstPaise, 1800);
  assert.equal(breakdown.cgstAmountPaise + breakdown.sgstAmountPaise, 1800);

  const report = generateMonthlyGstReport('2026-11');
  assert.equal(report.yearMonth, '2026-11');
  assert.equal(report.hsnCode, '9989');
  assert.equal(report.totalTransactionsCount, 100);
  assert.equal(report.totalGrossTurnoverInr, 1603);
  assert.ok(report.netOperatingProfitInr > 0, 'Operating profit must be positive');
  assert.ok(report.operatingMarginPct > 50, 'Operating margin should reflect print service margins');
});

test('[P17-03] ESC/POS 80mm Thermal Receipt Generator Formats Token, PIN, GST & QR Payload', () => {
  const slip = formatThermalReceiptSlip({
    jobNumber: 'JOB-20261125-8821',
    customerName: 'Aftab Alam',
    paperSize: 'A4',
    printMode: 'bw',
    printSides: 'duplex',
    printedPages: 8,
    copies: 1,
    physicalSheets: 4,
    finalAmountInr: 16.0,
    paymentMethod: 'upi',
    paymentStatus: 'paid',
    utrReference: '433019882201',
    pickupPin: '8821',
  });

  assert.equal(slip.tokenNumber, 'T-8821');
  assert.equal(slip.pickupPin, '8821');
  assert.equal(slip.qrPayload, 'ACSCAN2PRINT:JOB-20261125-8821:8821:16');
  const joined = slip.escPosLines.join('\n');
  assert.ok(joined.includes('GSTIN: 10AAAAA0000A1Z5'));
  assert.ok(joined.includes('PICKUP PIN    : [ 8821 ]'));
  assert.ok(joined.includes('UTR REFERENCE : 433019882201'));
});

test('[P17-04] Formula-Safe Monthly GST CSV Export Defends Against CSV Injection', () => {
  assert.equal(sanitizeCsvValue('=CMD()'), "'=CMD()");
  assert.equal(sanitizeCsvValue('+123'), "'+123");
  assert.equal(sanitizeCsvValue('-SUM(A1)'), "'-SUM(A1)");
  assert.equal(sanitizeCsvValue('@HYPERLINK'), "'@HYPERLINK");

  const report = generateMonthlyGstReport('2026-11');
  const csv = buildGstReturnSummaryCsv(report);
  const lines = csv.split('\r\n');
  assert.equal(lines.length, 2, 'CSV must have header + monthly summary row');
  assert.ok(lines[0].includes('HSN Code'));
  assert.ok(lines[1].includes('9989'));
  assert.ok(lines[1].includes('10AAAAA0000A1Z5'));
});

test('[P17-05] Express Server Endpoints Expose Validated Fleet Routing & Monthly GST Routes', () => {
  const serverContent = fs.readFileSync(path.join(ROOT_DIR, 'server.ts'), 'utf8');
  assert.ok(serverContent.includes("'/api/fleet/summary'"), 'Missing /api/fleet/summary route');
  assert.ok(serverContent.includes("'/api/fleet/route'"), 'Missing /api/fleet/route route');
  assert.ok(serverContent.includes("'/api/gst/monthly'"), 'Missing /api/gst/monthly route');
  assert.ok(serverContent.includes("'/api/gst/export'"), 'Missing /api/gst/export route');
});

test('[P17-06] Customer Kiosk UI, Admin Pilot UI & Phase 17 Docs Integrate Cleanly Without process.env', () => {
  const kioskPath = path.join(ROOT_DIR, 'customer-portal', 'src', 'pages', 'KioskPage.tsx');
  const portalAppPath = path.join(ROOT_DIR, 'customer-portal', 'src', 'App.tsx');
  const portalPricingPath = path.join(ROOT_DIR, 'customer-portal', 'src', 'lib', 'pricing.ts');
  const pilotPath = path.join(ROOT_DIR, 'src', 'components', 'print-management', 'PilotLaunchPanel.tsx');
  const docPath = path.join(ROOT_DIR, 'docs', 'scan2print', 'production', 'PHASE_17_MULTI_COUNTER_KIOSK_AND_GST.md');

  assert.ok(fs.existsSync(kioskPath), 'KioskPage.tsx missing');
  assert.ok(fs.existsSync(docPath), 'Phase 17 documentation missing');

  const kioskContent = fs.readFileSync(kioskPath, 'utf8');
  const appContent = fs.readFileSync(portalAppPath, 'utf8');
  const pricingContent = fs.readFileSync(portalPricingPath, 'utf8');
  const pilotContent = fs.readFileSync(pilotPath, 'utf8');

  assert.ok(!kioskContent.includes('process.env.'), 'KioskPage must never access process.env');
  assert.ok(appContent.includes("case '/quick-print/kiosk':"), 'Customer App.tsx missing /quick-print/kiosk route');
  assert.ok(pricingContent.includes("case '/quick-print/kiosk':"), 'parseCustomerRoute missing /quick-print/kiosk');
  assert.ok(pilotContent.includes('Phase 17: Multi-Counter Fleet, Kiosk Mode'), 'PilotLaunchPanel missing Phase 17 section');
  assert.ok(pilotContent.includes('/api/fleet/summary'), 'PilotLaunchPanel missing /api/fleet/summary');
  assert.ok(pilotContent.includes('/api/gst/monthly'), 'PilotLaunchPanel missing /api/gst/monthly');
});
