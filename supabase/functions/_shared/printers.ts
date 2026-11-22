// AC Scan2Print — Phase 0 Pure Printer Validation & Hardware Audit Classification Logic
// Zero fabricated printer defaults: unknown capabilities remain explicitly null ('unknown').

import {
  AppError,
  type PrintDevice,
  type PrintPrinter,
  type PrinterConnectionType,
  type PrinterPaperSize,
} from './types.ts';

export type TriStateCapability = 'yes' | 'no' | 'unknown';

export const ALLOWED_CONNECTION_TYPES = ['usb', 'wifi', 'lan', 'other', 'unknown'] as const;
export const ALLOWED_PAPER_SIZES = ['A4', 'A3', 'Legal', 'Photo_4x6', 'Photo_5x7'] as const;

export interface HardwareAuditChecklistItem {
  id: string;
  tier: 'software' | 'physical';
  label: string;
  detail: string;
  status: 'complete' | 'pending';
}

export interface HardwareAuditSummary {
  softwareAuditComplete: boolean;
  physicalVerificationPending: boolean;
  overallStatus: 'software_complete_physical_pending' | 'physical_verification_complete';
  overallLabel: string;
  totalRegistered: number;
  archivedCount: number;
  enabledCount: number;
  disabledCount: number;
  verifiedCount: number;
  pendingVerificationCount: number;
  assignedToDeviceCount: number;
  pendingAgentReviewCount: number;
  enrolledDevicesCount: number;
  activeDevicesCount: number;
  lastHardwareVerificationAt: string | null;
  connectionBreakdown: Record<PrinterConnectionType, number>;
  capabilityBreakdown: {
    colourYes: number;
    colourNo: number;
    colourUnknown: number;
    duplexYes: number;
    duplexNo: number;
    duplexUnknown: number;
  };
  checklist: HardwareAuditChecklistItem[];
}

export function triStateToNullableBoolean(value: unknown): boolean | null {
  if (value === true || value === 'yes' || value === 'true') return true;
  if (value === false || value === 'no' || value === 'false') return false;
  if (value === null || value === undefined || value === '' || value === 'unknown') return null;
  throw new AppError(400, 'INVALID_CAPABILITY_VALUE', 'Capability value must be yes, no, or unknown.');
}

export function nullableBooleanToTriState(value: boolean | null | undefined): TriStateCapability {
  if (value === true) return 'yes';
  if (value === false) return 'no';
  return 'unknown';
}

export function normalizeConnectionType(value: unknown): PrinterConnectionType {
  if (typeof value !== 'string' || !value.trim()) return 'unknown';
  const norm = value.trim().toLowerCase() as PrinterConnectionType;
  if (!(ALLOWED_CONNECTION_TYPES as readonly string[]).includes(norm)) {
    throw new AppError(
      400,
      'INVALID_CONNECTION_TYPE',
      `connectionType must be one of: ${ALLOWED_CONNECTION_TYPES.join(', ')}.`
    );
  }
  return norm;
}

export function normalizeSupportedPaperSizes(value: unknown): PrinterPaperSize[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    throw new AppError(400, 'INVALID_PAPER_SIZES', 'supportedPaperSizes must be an array.');
  }
  const seen = new Set<PrinterPaperSize>();
  const out: PrinterPaperSize[] = [];
  for (const raw of value) {
    if (typeof raw !== 'string') {
      throw new AppError(400, 'INVALID_PAPER_SIZES', 'Each paper size must be a string.');
    }
    const trimmed = raw.trim() as PrinterPaperSize;
    if (!(ALLOWED_PAPER_SIZES as readonly string[]).includes(trimmed)) {
      throw new AppError(
        400,
        'INVALID_PAPER_SIZE',
        `Unsupported paper size '${trimmed}'. Allowed: ${ALLOWED_PAPER_SIZES.join(', ')}.`
      );
    }
    if (!seen.has(trimmed)) {
      seen.add(trimmed);
      out.push(trimmed);
    }
  }
  return out;
}

export function sanitizeOptionalText(value: unknown, maxLen: number): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') {
    throw new AppError(400, 'INVALID_TEXT_FIELD', 'Expected string or null.');
  }
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLen);
}

export function validatePrinterName(value: unknown): string {
  if (typeof value !== 'string') {
    throw new AppError(400, 'INVALID_PRINTER_NAME', 'printerName is required.');
  }
  const trimmed = value.trim();
  if (trimmed.length < 2 || trimmed.length > 80) {
    throw new AppError(
      400,
      'INVALID_PRINTER_NAME',
      'printerName must be between 2 and 80 characters.'
    );
  }
  return trimmed;
}

export function isPrinterCapabilityPending(printer: PrintPrinter): boolean {
  return (
    !printer.capabilities_verified ||
    printer.supports_colour === null ||
    printer.supports_duplex === null ||
    printer.connection_type === 'unknown' ||
    printer.supported_paper_sizes.length === 0
  );
}

export function computeHardwareAuditSummary(
  printers: readonly PrintPrinter[],
  devices: readonly PrintDevice[] = []
): HardwareAuditSummary {
  const activePrinters = printers.filter((p) => !p.archived_at);
  const archivedCount = printers.length - activePrinters.length;

  const connectionBreakdown: Record<PrinterConnectionType, number> = {
    usb: 0,
    wifi: 0,
    lan: 0,
    other: 0,
    unknown: 0,
  };

  let enabledCount = 0;
  let disabledCount = 0;
  let verifiedCount = 0;
  let pendingVerificationCount = 0;
  let assignedToDeviceCount = 0;
  let pendingAgentReviewCount = 0;
  let agentDiscoveredCount = 0;
  let lastVerifiedMs = 0;
  let lastHardwareVerificationAt: string | null = null;

  const capabilityBreakdown = {
    colourYes: 0,
    colourNo: 0,
    colourUnknown: 0,
    duplexYes: 0,
    duplexNo: 0,
    duplexUnknown: 0,
  };

  for (const printer of activePrinters) {
    if (printer.is_enabled) enabledCount += 1;
    else disabledCount += 1;

    if (isPrinterCapabilityPending(printer)) pendingVerificationCount += 1;
    else verifiedCount += 1;

    if (printer.device_id) assignedToDeviceCount += 1;
    if (printer.discovery_source === 'agent') {
      agentDiscoveredCount += 1;
      if (printer.approval_status === 'pending_review') {
        pendingAgentReviewCount += 1;
      }
    }

    const conn = printer.connection_type || 'unknown';
    connectionBreakdown[conn] = (connectionBreakdown[conn] ?? 0) + 1;

    if (printer.supports_colour === true) capabilityBreakdown.colourYes += 1;
    else if (printer.supports_colour === false) capabilityBreakdown.colourNo += 1;
    else capabilityBreakdown.colourUnknown += 1;

    if (printer.supports_duplex === true) capabilityBreakdown.duplexYes += 1;
    else if (printer.supports_duplex === false) capabilityBreakdown.duplexNo += 1;
    else capabilityBreakdown.duplexUnknown += 1;

    if (printer.last_verified_at) {
      const parsed = Date.parse(printer.last_verified_at);
      if (Number.isFinite(parsed) && parsed > lastVerifiedMs) {
        lastVerifiedMs = parsed;
        lastHardwareVerificationAt = printer.last_verified_at;
      }
    }
  }

  const activeDevicesCount = devices.filter((d) => d.device_status === 'active').length;

  // Physical hardware verification remains strictly pending unless real Windows Agent discovery,
  // verified hardware capabilities, and physical test timestamps exist.
  const hasEnrolledOnlineAgent = activeDevicesCount > 0 && devices.some((d) => Boolean(d.last_heartbeat_at));
  const hasPhysicallyVerifiedPrinter = verifiedCount > 0 && lastHardwareVerificationAt !== null;
  const physicalVerificationPending = !hasEnrolledOnlineAgent || !hasPhysicallyVerifiedPrinter || pendingVerificationCount > 0;

  const checklist: HardwareAuditChecklistItem[] = [
    {
      id: 'sw-ui',
      tier: 'software',
      label: 'Admin Printer Management UI',
      detail: 'Manual add, edit, enable/disable, and safe archive workflow built inside Admin Dashboard.',
      status: 'complete',
    },
    {
      id: 'sw-unknowns',
      tier: 'software',
      label: 'Explicit Unknown Hardware Handling',
      detail: 'Missing models, unconfirmed colour/duplex/paper specs remain explicitly marked Unknown / Pending Verification.',
      status: 'complete',
    },
    {
      id: 'sw-backend-auth',
      tier: 'software',
      label: 'Backend API & Single-Admin Authorization',
      detail: 'Protected admin-printers Edge Function validates Firebase RS256 token + print_admin_accounts & logs immutable events.',
      status: 'complete',
    },
    {
      id: 'sw-agent-prep',
      tier: 'software',
      label: 'Future Windows Agent Discovery Architecture',
      detail: 'agent-sync-printers endpoint, device assignment, and Admin approval queue prepared without fake hardware.',
      status: 'complete',
    },
    {
      id: 'hw-detection',
      tier: 'physical',
      label: 'Actual Physical Printer Detection (Windows 11)',
      detail:
        hasEnrolledOnlineAgent && agentDiscoveredCount > 0
          ? `${agentDiscoveredCount} printer(s) reported by Windows Local Print Agent.`
          : 'Pending Windows 11 Local Print Agent installation & physical printer enumeration.',
      status: hasEnrolledOnlineAgent && agentDiscoveredCount > 0 ? 'complete' : 'pending',
    },
    {
      id: 'hw-driver-capabilities',
      tier: 'physical',
      label: 'Driver Colour, Duplex & Paper Tray Verification',
      detail:
        hasPhysicallyVerifiedPrinter && pendingVerificationCount === 0
          ? `${verifiedCount} active printer(s) physically verified.`
          : 'Pending driver capability check on actual shop printer hardware.',
      status: hasPhysicallyVerifiedPrinter && pendingVerificationCount === 0 ? 'complete' : 'pending',
    },
    {
      id: 'hw-connectivity',
      tier: 'physical',
      label: 'USB / Wi-Fi / LAN Stability Check',
      detail: 'Pending physical port, static IP/TCP-IP binding, and Spooler bidirectional telemetry test.',
      status: hasEnrolledOnlineAgent && hasPhysicallyVerifiedPrinter ? 'complete' : 'pending',
    },
    {
      id: 'hw-test-prints',
      tier: 'physical',
      label: 'Real PDF & JPG/PNG Test Printing',
      detail: 'Pending end-to-end physical test print verification (PDF, JPG, PNG) on shop printers.',
      status: hasEnrolledOnlineAgent && hasPhysicallyVerifiedPrinter ? 'complete' : 'pending',
    },
  ];

  return {
    softwareAuditComplete: true,
    physicalVerificationPending,
    overallStatus: physicalVerificationPending
      ? 'software_complete_physical_pending'
      : 'physical_verification_complete',
    overallLabel: physicalVerificationPending
      ? 'Software Audit Complete — Physical Hardware Verification Pending'
      : 'Software & Physical Hardware Audit Verified',
    totalRegistered: activePrinters.length,
    archivedCount,
    enabledCount,
    disabledCount,
    verifiedCount,
    pendingVerificationCount,
    assignedToDeviceCount,
    pendingAgentReviewCount,
    enrolledDevicesCount: devices.length,
    activeDevicesCount,
    lastHardwareVerificationAt,
    connectionBreakdown,
    capabilityBreakdown,
    checklist,
  };
}
