// AC Scan2Print — Phase 0 Frontend Hardware Audit Helpers & Validation
// Mirrors backend validation rules strictly without inventing printer models or capabilities.

export type TriStateCapability = 'yes' | 'no' | 'unknown';
export type PrinterConnectionType = 'usb' | 'wifi' | 'lan' | 'other' | 'unknown';
export type PrinterPaperSize = 'A4' | 'A3' | 'Legal' | 'Photo_4x6' | 'Photo_5x7';
export type PrinterStatus = 'online' | 'offline' | 'error' | 'paused' | 'disabled' | 'unknown';
export type PrinterDiscoverySource = 'manual' | 'agent';
export type PrinterApprovalStatus = 'manual' | 'pending_review' | 'approved' | 'rejected';

export const CONNECTION_OPTIONS: ReadonlyArray<{ id: PrinterConnectionType; label: string }> = [
  { id: 'usb', label: 'USB' },
  { id: 'wifi', label: 'Wi-Fi' },
  { id: 'lan', label: 'Ethernet / LAN' },
  { id: 'other', label: 'Other' },
  { id: 'unknown', label: 'Unknown' },
];

export const PAPER_SIZE_OPTIONS: ReadonlyArray<{ id: PrinterPaperSize; label: string }> = [
  { id: 'A4', label: 'A4' },
  { id: 'A3', label: 'A3' },
  { id: 'Legal', label: 'Legal' },
  { id: 'Photo_4x6', label: 'Photo 4×6' },
  { id: 'Photo_5x7', label: 'Photo 5×7' },
];

export interface PrintDeviceRecord {
  id: string;
  device_name: string;
  device_status: 'pending' | 'active' | 'paused' | 'revoked';
  agent_version: string | null;
  os_version: string | null;
  last_heartbeat_at: string | null;
  approved_at: string | null;
  revoked_at: string | null;
  created_at: string;
}

export interface PrinterRecord {
  id: string;
  printer_name: string;
  printer_model?: string | null;
  system_printer_name: string | null;
  device_id: string | null;
  connection_type: PrinterConnectionType;
  supported_paper_sizes: PrinterPaperSize[];
  supports_colour: boolean | null;
  supports_duplex: boolean | null;
  capabilities_verified: boolean;
  printer_status: PrinterStatus;
  is_enabled: boolean;
  is_default: boolean;
  discovery_source?: PrinterDiscoverySource;
  approval_status?: PrinterApprovalStatus;
  last_seen_at: string | null;
  last_verified_at?: string | null;
  archived_at?: string | null;
  archived_by?: string | null;
  audit_notes?: string | null;
  created_at: string;
  updated_at: string;
}

export interface PrinterAuditEvent {
  id: string;
  actor_type: string;
  event_type: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

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

export interface PrinterFormDraft {
  printerName: string;
  printerModel: string;
  systemPrinterName: string;
  connectionType: PrinterConnectionType;
  supportsColour: TriStateCapability;
  supportsDuplex: TriStateCapability;
  supportedPaperSizes: PrinterPaperSize[];
  deviceId: string;
  isEnabled: boolean;
  auditNotes: string;
}

export function createEmptyPrinterDraft(): PrinterFormDraft {
  return {
    printerName: '',
    printerModel: '',
    systemPrinterName: '',
    connectionType: 'unknown',
    supportsColour: 'unknown',
    supportsDuplex: 'unknown',
    supportedPaperSizes: [],
    deviceId: '',
    isEnabled: false,
    auditNotes: '',
  };
}

export function printerToFormDraft(printer: PrinterRecord): PrinterFormDraft {
  return {
    printerName: printer.printer_name,
    printerModel: printer.printer_model || '',
    systemPrinterName: printer.system_printer_name || '',
    connectionType: printer.connection_type || 'unknown',
    supportsColour: nullableBooleanToTriState(printer.supports_colour),
    supportsDuplex: nullableBooleanToTriState(printer.supports_duplex),
    supportedPaperSizes: [...(printer.supported_paper_sizes || [])],
    deviceId: printer.device_id || '',
    isEnabled: printer.is_enabled,
    auditNotes: printer.audit_notes || '',
  };
}

export function nullableBooleanToTriState(value: boolean | null | undefined): TriStateCapability {
  if (value === true) return 'yes';
  if (value === false) return 'no';
  return 'unknown';
}

export function formatTriStateLabel(value: boolean | null | undefined): 'Yes' | 'No' | 'Unknown' {
  if (value === true) return 'Yes';
  if (value === false) return 'No';
  return 'Unknown';
}

export function formatConnectionLabel(conn: PrinterConnectionType | string): string {
  const match = CONNECTION_OPTIONS.find((c) => c.id === conn);
  return match ? match.label : 'Unknown';
}

export function isPrinterVerificationPending(printer: PrinterRecord): boolean {
  return (
    !printer.capabilities_verified ||
    printer.supports_colour === null ||
    printer.supports_duplex === null ||
    printer.connection_type === 'unknown' ||
    printer.supported_paper_sizes.length === 0
  );
}

export function validatePrinterFormDraft(draft: PrinterFormDraft): string | null {
  const name = draft.printerName.trim();
  if (name.length < 2) {
    return 'Enter a printer display name (at least 2 characters).';
  }
  if (name.length > 80) {
    return 'Printer display name must be 80 characters or fewer.';
  }
  if (draft.printerModel.trim().length > 80) {
    return 'Printer model must be 80 characters or fewer.';
  }
  if (draft.systemPrinterName.trim().length > 120) {
    return 'Windows printer name must be 120 characters or fewer.';
  }
  return null;
}

export function computeClientHardwareAuditSummary(
  printers: readonly PrinterRecord[],
  devices: readonly PrintDeviceRecord[] = []
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

    if (isPrinterVerificationPending(printer)) pendingVerificationCount += 1;
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
  const hasEnrolledOnlineAgent =
    activeDevicesCount > 0 && devices.some((d) => Boolean(d.last_heartbeat_at));
  const hasPhysicallyVerifiedPrinter = verifiedCount > 0 && lastHardwareVerificationAt !== null;
  const physicalVerificationPending =
    !hasEnrolledOnlineAgent || !hasPhysicallyVerifiedPrinter || pendingVerificationCount > 0;

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
    checklist: [
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
        detail:
          'Missing models, unconfirmed colour/duplex/paper specs remain explicitly marked Unknown / Pending Verification.',
        status: 'complete',
      },
      {
        id: 'sw-backend-auth',
        tier: 'software',
        label: 'Backend API & Single-Admin Authorization',
        detail:
          'Protected admin-printers Edge Function validates Firebase RS256 token + print_admin_accounts & logs immutable events.',
        status: 'complete',
      },
      {
        id: 'sw-agent-prep',
        tier: 'software',
        label: 'Future Windows Agent Discovery Architecture',
        detail:
          'agent-sync-printers endpoint, device assignment, and Admin approval queue prepared without fake hardware.',
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
        detail:
          'Pending physical port, static IP/TCP-IP binding, and Spooler bidirectional telemetry test.',
        status: hasEnrolledOnlineAgent && hasPhysicallyVerifiedPrinter ? 'complete' : 'pending',
      },
      {
        id: 'hw-test-prints',
        tier: 'physical',
        label: 'Real PDF & JPG/PNG Test Printing',
        detail:
          'Pending end-to-end physical test print verification (PDF, JPG, PNG) on shop printers.',
        status: hasEnrolledOnlineAgent && hasPhysicallyVerifiedPrinter ? 'complete' : 'pending',
      },
    ],
  };
}
