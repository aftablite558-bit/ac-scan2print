import assert from 'node:assert/strict';
import test from 'node:test';

import { getPageTitle, parseHash } from './adminLogic.ts';
import {
  computeClientHardwareAuditSummary,
  createEmptyPrinterDraft,
  formatTriStateLabel,
  isPrinterVerificationPending,
  validatePrinterFormDraft,
  type PrintDeviceRecord,
  type PrinterRecord,
} from './hardwareAudit.ts';

function makePrinter(overrides: Partial<PrinterRecord> = {}): PrinterRecord {
  return {
    id: crypto.randomUUID(),
    printer_name: 'Counter Printer 1',
    printer_model: null,
    system_printer_name: null,
    device_id: null,
    connection_type: 'unknown',
    supported_paper_sizes: [],
    supports_colour: null,
    supports_duplex: null,
    capabilities_verified: false,
    printer_status: 'disabled',
    is_enabled: false,
    is_default: false,
    discovery_source: 'manual',
    approval_status: 'manual',
    last_seen_at: null,
    last_verified_at: null,
    archived_at: null,
    archived_by: null,
    audit_notes: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

test('parseHash and getPageTitle handle #/hardware subroutes', () => {
  assert.deepEqual(parseHash('#/hardware'), { main: 'hardware', sub: 'printers' });
  assert.deepEqual(parseHash('#/hardware/discovery'), { main: 'hardware', sub: 'discovery' });
  assert.deepEqual(parseHash('#/hardware/checklist'), { main: 'hardware', sub: 'checklist' });
  assert.deepEqual(parseHash('#/hardware/unknown-tab'), { main: 'hardware', sub: 'printers' });
  assert.equal(getPageTitle({ main: 'hardware', sub: 'printers' }), 'Hardware & Printers — AMAN COMPUTER');
});

test('tri-state unknown capabilities and form validation work without fabricated defaults', () => {
  const empty = createEmptyPrinterDraft();
  assert.equal(empty.connectionType, 'unknown');
  assert.equal(empty.supportsColour, 'unknown');
  assert.equal(empty.supportsDuplex, 'unknown');
  assert.deepEqual(empty.supportedPaperSizes, []);
  assert.equal(empty.printerModel, '');
  assert.equal(empty.isEnabled, false);

  assert.equal(formatTriStateLabel(null), 'Unknown');
  assert.equal(formatTriStateLabel(true), 'Yes');
  assert.equal(formatTriStateLabel(false), 'No');

  assert.ok(validatePrinterFormDraft(empty));
  assert.equal(
    validatePrinterFormDraft({
      ...empty,
      printerName: 'Counter Unit A',
    }),
    null
  );
});

test('hardware audit summary separates Software Audit Complete from Physical Hardware Verification Pending', () => {
  const unknownPrinter = makePrinter();
  assert.equal(isPrinterVerificationPending(unknownPrinter), true);

  const summary = computeClientHardwareAuditSummary([unknownPrinter], []);
  assert.equal(summary.softwareAuditComplete, true);
  assert.equal(summary.physicalVerificationPending, true);
  assert.equal(summary.overallStatus, 'software_complete_physical_pending');
  assert.equal(summary.totalRegistered, 1);
  assert.equal(summary.pendingVerificationCount, 1);
  assert.equal(summary.capabilityBreakdown.colourUnknown, 1);
  assert.equal(summary.capabilityBreakdown.duplexUnknown, 1);
  assert.equal(summary.lastHardwareVerificationAt, null);

  // Even when a printer is verified manually without an active Windows agent heartbeat, physical verification stays pending
  const verifiedManual = makePrinter({
    connection_type: 'usb',
    supports_colour: true,
    supports_duplex: false,
    supported_paper_sizes: ['A4'],
    capabilities_verified: true,
    last_verified_at: '2026-11-21T10:00:00.000Z',
  });
  const summaryNoAgent = computeClientHardwareAuditSummary([verifiedManual], []);
  assert.equal(summaryNoAgent.physicalVerificationPending, true);

  // When an active agent device has heartbeat AND agent-discovered verified printer exists
  const activeDevice: PrintDeviceRecord = {
    id: 'dev-1',
    device_name: 'Shop Counter PC',
    device_status: 'active',
    agent_version: '1.0.0',
    os_version: 'Windows 11 Pro 24H2',
    last_heartbeat_at: '2026-11-21T10:05:00.000Z',
    approved_at: '2026-11-21T09:00:00.000Z',
    revoked_at: null,
    created_at: '2026-11-21T09:00:00.000Z',
  };
  const verifiedAgentPrinter = makePrinter({
    device_id: 'dev-1',
    connection_type: 'usb',
    supports_colour: true,
    supports_duplex: false,
    supported_paper_sizes: ['A4'],
    capabilities_verified: true,
    discovery_source: 'agent',
    approval_status: 'approved',
    last_verified_at: '2026-11-21T10:06:00.000Z',
  });
  const fullSummary = computeClientHardwareAuditSummary([verifiedAgentPrinter], [activeDevice]);
  assert.equal(fullSummary.physicalVerificationPending, false);
  assert.equal(fullSummary.overallStatus, 'physical_verification_complete');
  assert.equal(fullSummary.lastHardwareVerificationAt, '2026-11-21T10:06:00.000Z');
});
