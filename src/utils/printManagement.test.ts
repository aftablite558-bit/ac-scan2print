import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculatePhysicalSheetsPerCopy,
  canAdminApproveCashJob,
  canAdminCancelJob,
  canAdminReleaseJobToQueue,
  canAdminRetryOrReconcileJob,
  computeDeviceOnlineStatus,
  formatCurrencyInr,
  getEligiblePrinters,
  isValidUpiHandle,
  validatePricingRuleDraft,
  createEmptyPricingRuleDraft,
} from './printManagement';
import { getPageTitle, parseHash } from './adminLogic';

test('parseHash and getPageTitle resolve Phase 4 Print Management routes and aliases', () => {
  assert.deepEqual(parseHash('#/print-management'), { main: 'print-management', sub: 'overview' });
  assert.deepEqual(parseHash('#/print-management/overview'), { main: 'print-management', sub: 'overview' });
  assert.deepEqual(parseHash('#/print-management/jobs'), { main: 'print-management', sub: 'jobs' });
  assert.deepEqual(parseHash('#/print-management/queue'), { main: 'print-management', sub: 'queue' });
  assert.deepEqual(parseHash('#/print-management/payments'), { main: 'print-management', sub: 'payments' });
  assert.deepEqual(parseHash('#/print-management/devices'), { main: 'print-management', sub: 'devices' });
  assert.deepEqual(parseHash('#/print-management/pricing'), { main: 'print-management', sub: 'pricing' });
  assert.deepEqual(parseHash('#/print-management/upi'), { main: 'print-management', sub: 'upi' });
  assert.deepEqual(parseHash('#/print-jobs'), { main: 'print-management', sub: 'jobs' });
  assert.deepEqual(parseHash('#/print-queue'), { main: 'print-management', sub: 'queue' });
  assert.deepEqual(parseHash('#/print-agents'), { main: 'print-management', sub: 'devices' });
  assert.deepEqual(parseHash('#/pricing'), { main: 'print-management', sub: 'pricing' });
  assert.deepEqual(parseHash('#/payments'), { main: 'print-management', sub: 'payments' });
  assert.deepEqual(parseHash('#/upi'), { main: 'print-management', sub: 'upi' });
  assert.equal(getPageTitle({ main: 'print-management', sub: 'jobs' }), 'Print Management — AMAN COMPUTER');
});

test('calculatePhysicalSheetsPerCopy calculates duplex ceil(pages/2) accurately', () => {
  assert.equal(calculatePhysicalSheetsPerCopy(10, 'duplex'), 5);
  assert.equal(calculatePhysicalSheetsPerCopy(11, 'duplex'), 6);
  assert.equal(calculatePhysicalSheetsPerCopy(1, 'duplex'), 1);
  assert.equal(calculatePhysicalSheetsPerCopy(11, 'single'), 11);
  assert.equal(calculatePhysicalSheetsPerCopy(0, 'duplex'), 0);
});

test('computeDeviceOnlineStatus never fakes online status without fresh heartbeat', () => {
  const nowMs = Date.parse('2026-11-23T12:00:00.000Z');
  assert.equal(computeDeviceOnlineStatus({ device_status: 'active', last_heartbeat_at: null }, nowMs), 'offline');
  assert.equal(
    computeDeviceOnlineStatus({ device_status: 'active', last_heartbeat_at: '2026-11-23T11:55:00.000Z' }, nowMs),
    'offline'
  );
  assert.equal(
    computeDeviceOnlineStatus({ device_status: 'active', last_heartbeat_at: '2026-11-23T11:59:10.000Z' }, nowMs),
    'online'
  );
  assert.equal(
    computeDeviceOnlineStatus({ device_status: 'paused', last_heartbeat_at: '2026-11-23T11:59:55.000Z' }, nowMs),
    'paused'
  );
  assert.equal(
    computeDeviceOnlineStatus({ device_status: 'revoked', last_heartbeat_at: '2026-11-23T11:59:55.000Z' }, nowMs),
    'revoked'
  );
});

test('Admin approval, queue release, retry, and cancel UI workflow guards enforce strict UPI vs Cash rules', () => {
  assert.equal(canAdminApproveCashJob({ status: 'submitted', payment_method: 'cash' }), true);
  assert.equal(canAdminApproveCashJob({ status: 'submitted', payment_method: 'upi' }), false);
  assert.equal(canAdminReleaseJobToQueue({ status: 'approved', payment_status: 'paid' }), true);
  assert.equal(canAdminReleaseJobToQueue({ status: 'approved', payment_status: 'unpaid' }), false);
  assert.equal(canAdminRetryOrReconcileJob({ status: 'failed' }), true);
  assert.equal(canAdminRetryOrReconcileJob({ status: 'needs_review' }), true);
  assert.equal(canAdminRetryOrReconcileJob({ status: 'completed' }), false);
  assert.equal(canAdminCancelJob({ status: 'queued' }), true);
  assert.equal(canAdminCancelJob({ status: 'completed' }), false);
});

test('Pricing rule validation rejects non-physical-sheet duplex, negative numbers, and invalid validity windows', () => {
  const draft = createEmptyPricingRuleDraft();
  draft.ruleName = 'A4 Duplex B&W';
  draft.printSides = 'duplex';
  draft.pricingUnit = 'per_printed_page';
  draft.rate = '3';
  assert.match(validatePricingRuleDraft(draft) ?? '', /per_physical_sheet/);

  draft.pricingUnit = 'per_physical_sheet';
  assert.equal(validatePricingRuleDraft(draft), null);

  draft.validFrom = '2026-11-25T10:00';
  draft.validUntil = '2026-11-25T09:00';
  assert.match(validatePricingRuleDraft(draft) ?? '', /Valid Until/);

  draft.validUntil = '2026-11-30T10:00';
  assert.equal(validatePricingRuleDraft(draft), null);

  draft.rate = '-2';
  assert.match(validatePricingRuleDraft(draft) ?? '', /non-negative/);

  assert.equal(isValidUpiHandle('amancomputer@upi'), true);
  assert.equal(isValidUpiHandle('invalid-upi'), false);
  assert.equal(formatCurrencyInr(12.5), '₹12.50');
  assert.equal(formatCurrencyInr(null), '—');

  const printers = getEligiblePrinters([
    {
      id: 'p1',
      printer_name: 'Enabled',
      system_printer_name: 'SYS1',
      device_id: null,
      connection_type: 'usb',
      supported_paper_sizes: ['A4'],
      supports_colour: false,
      supports_duplex: true,
      printer_status: 'online',
      is_enabled: true,
      archived_at: null,
      approval_status: 'manual',
    },
    {
      id: 'p2',
      printer_name: 'Pending Discovery',
      system_printer_name: 'SYS2',
      device_id: null,
      connection_type: 'usb',
      supported_paper_sizes: ['A4'],
      supports_colour: false,
      supports_duplex: true,
      printer_status: 'unknown',
      is_enabled: true,
      archived_at: null,
      approval_status: 'pending_review',
    },
  ]);
  assert.equal(printers.length, 1);
  assert.equal(printers[0].id, 'p1');
});
