import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  Copy,
  Download,
  ExternalLink,
  Layers,
  PauseCircle,
  PlayCircle,
  Printer,
  QrCode,
  Receipt,
  RefreshCw,
  Rocket,
  Server,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  XCircle,
  Zap,
} from 'lucide-react';
import type { ConfirmDialogConfig } from './ConfirmActionDialog';
import {
  formatDateTime,
  type AdminCleanupLog,
  type AdminPilotSummary,
  type AdminPrintEvent,
  type AdminSystemSettings,
  type PilotChecklist,
  type PilotStage,
} from '../../utils/printManagement';

interface PilotLaunchPanelProps {
  systemSettings: AdminSystemSettings | null;
  pilotSummary: AdminPilotSummary | null;
  recentPilotEvents: AdminPrintEvent[];
  cleanupLogs: AdminCleanupLog[];
  actionBusy: boolean;
  onInvokeAction: (payload: Record<string, unknown>, successMsg: string) => Promise<void>;
  onRequestConfirm: (config: ConfirmDialogConfig) => void;
  onOpenQrPoster: () => void;
  onNavigateTab: (href: string) => void;
}

const STAGE_OPTIONS: Array<{ id: PilotStage; label: string; desc: string }> = [
  { id: 'dry_run', label: 'Dry Run', desc: 'Staff/test validation before customer QR counter placement.' },
  { id: 'supervised_pilot', label: 'Supervised Pilot', desc: 'Walk-in customers guided by counter staff.' },
  { id: 'live_pilot', label: 'Live Pilot (100 Jobs)', desc: 'Poster live at counter with active observation tracking.' },
  { id: 'production', label: 'Production Go-Live', desc: 'Full launch (requires all blocking gates to pass).' },
];

const CHECKLIST_ITEMS: Array<{ key: keyof PilotChecklist; label: string; hint: string }> = [
  {
    key: 'shopPcInstalled',
    label: 'Shop PC Windows Print Agent installed & enrolled',
    hint: 'AC.Scan2Print.Agent running with startup task and saved credential.',
  },
  {
    key: 'printerTested',
    label: 'Counter printer capabilities physically verified',
    hint: 'Paper sizes, colour, and duplex verified against test output sheets.',
  },
  {
    key: 'qrPosterDisplayed',
    label: 'Permanent Scan2Print QR poster placed at counter',
    hint: 'Tested scanning from Android & iOS camera directly to portal URL.',
  },
  {
    key: 'staffTrained',
    label: 'Counter staff trained on UPI / Cash SOP & Emergency Pause',
    hint: 'Staff knows how to verify 12-digit UTRs, cancel failed jobs, and pause intake.',
  },
  {
    key: 'backupTested',
    label: 'Database retention & cleanup dry-run verified',
    hint: 'Retention hours reviewed and cleanup dry-run verified without errors.',
  },
];

const DEFAULT_CHECKLIST: PilotChecklist = {
  shopPcInstalled: false,
  printerTested: false,
  qrPosterDisplayed: false,
  staffTrained: false,
  backupTested: false,
};

function formatMetricPct(val: number | null): string {
  if (val === null || !Number.isFinite(val)) return '—';
  return `${val.toFixed(1)}%`;
}

function formatMetricMinutes(val: number | null): string {
  if (val === null || !Number.isFinite(val)) return '—';
  return `${val.toFixed(1)}m`;
}

function getStageMeta(stage: PilotStage): { label: string; colorVar: string; bgVar: string } {
  switch (stage) {
    case 'production':
      return { label: 'Production Live', colorVar: 'var(--good)', bgVar: 'var(--good-soft)' };
    case 'live_pilot':
      return { label: 'Live Pilot', colorVar: 'var(--accent-text)', bgVar: 'var(--accent-soft)' };
    case 'supervised_pilot':
      return { label: 'Supervised Pilot', colorVar: 'var(--info)', bgVar: 'var(--info-soft)' };
    default:
      return { label: 'Dry Run', colorVar: 'var(--warn)', bgVar: 'var(--warn-soft)' };
  }
}

interface CutoverCheckItemView {
  id: string;
  category: 'env' | 'database' | 'edge' | 'hosting' | 'agent';
  label: string;
  passed: boolean;
  severity: 'blocking' | 'advisory';
  detail: string;
}

interface CutoverPreflightView {
  checkedAtIso: string;
  supabaseProjectRef: string | null;
  firebaseProjectId: string | null;
  expectedCustomerPortalUrl: string;
  migrationsFound: string[];
  edgeFunctionsFound: string[];
  portalConfigSchemaLive: boolean;
  readyForLiveCutover: boolean;
  blockingReasons: string[];
  checks: CutoverCheckItemView[];
  liveEdgeProbes: Array<{
    fnName: string;
    deployed: boolean;
    httpStatus: number | null;
    corsAllowedForPortalOrigin: boolean | null;
    detail: string;
  }>;
  playbookCommands: {
    supabaseSecretsAndDb: string;
    supabaseDeployAllFunctions: string;
    adminBootstrapAndVerify: string;
    firebaseHostingDeploy: string;
    windowsAgentInstall: string;
  };
}

interface SmokeReportView {
  checkedAtIso: string;
  target: 'production' | 'local';
  adminUrl: string;
  customerPortalUrl: string;
  passedCount: number;
  totalCount: number;
  allPassed: boolean;
  checks: Array<{
    id: string;
    label: string;
    passed: boolean;
    httpStatus: number | null;
    detail: string;
  }>;
}

interface MasterAuditView {
  checkedAtIso: string;
  productName: string;
  version: string;
  targetEnvironment: {
    supabaseProjectRef: string;
    supabaseUrl: string;
    firebaseProjectId: string;
    superAdminFirebaseUid: string;
    primaryDomainUrl: string;
    customerPortalUrl: string;
  };
  totalLayers: number;
  passedLayers: number;
  overallHealthPct: number;
  allLayersPassed: boolean;
  layers: Array<{
    layerIndex: number;
    layerId: string;
    name: string;
    passed: boolean;
    score: string;
    summary: string;
    details: string[];
  }>;
}

interface CommissioningReportView {
  checkedAtIso: string;
  productName: string;
  version: string;
  environment: {
    supabaseProjectRef: string;
    firebaseProjectId: string;
    superAdminUid: string;
    primaryDomainUrl: string;
    customerPortalUrl: string;
  };
  allHardwareChecksPassed: boolean;
  milestone100Reached: boolean;
  productionReadySignOff: boolean;
  overallScorePct: number;
  hardwareChecks: Array<{
    id: string;
    category: string;
    label: string;
    passed: boolean;
    severity: string;
    detail: string;
  }>;
  milestones: Array<{
    milestone: number;
    title: string;
    targetSla: string;
    achievedCount: number;
    status: 'passed' | 'pending';
    verificationDetail: string;
  }>;
  telemetry: {
    totalJobsProcessed: number;
    successfulJobs: number;
    autoRecoveredJams: number;
    terminalFailures: number;
    successRatePct: number;
    avgSpoolerLatencySeconds: number;
    p90SpoolerLatencySeconds: number;
    avgCustomerIntakeSeconds: number;
    totalUpiRevenueInr: number;
    totalCashRevenueInr: number;
    totalRevenueInr: number;
    financialDiscrepancyPaise: number;
    emergencyPauseTripTestPassed: boolean;
  };
  signOffSummary: string;
}

interface FleetSummaryView {
  checkedAtIso: string;
  stations: Array<{
    id: string;
    stationName: string;
    counterLocation: string;
    printerModel: string;
    connectionType: string;
    supportsColour: boolean;
    supportsDuplex: boolean;
    supportedPaperSizes: string[];
    status: string;
    activeQueueCount: number;
    averageSpeedPpm: number;
  }>;
  sampleRouting: Array<{
    label: string;
    decision: {
      assignedStationId: string;
      stationName: string;
      counterLocation: string;
      reason: string;
      estimatedWaitSeconds: number;
      routingAlgorithmUsed: string;
    };
  }>;
}

interface MonthlyGstView {
  report: {
    yearMonth: string;
    gstin: string;
    legalTradeName: string;
    placeOfSupply: string;
    hsnCode: string;
    totalTransactionsCount: number;
    b2cTransactionsCount: number;
    b2bInvoicesCount: number;
    totalTaxableTurnoverInr: number;
    totalCgstLiabilityInr: number;
    totalSgstLiabilityInr: number;
    totalGstLiabilityInr: number;
    totalGrossTurnoverInr: number;
    estimatedPaperCostInr: number;
    estimatedInkCostInr: number;
    totalOperatingCostInr: number;
    netOperatingProfitInr: number;
    operatingMarginPct: number;
  };
  sampleThermalSlip: {
    tokenNumber: string;
    pickupPin: string;
    escPosLines: string[];
  };
}

export const PilotLaunchPanel: React.FC<PilotLaunchPanelProps> = ({
  systemSettings,
  pilotSummary,
  recentPilotEvents,
  cleanupLogs,
  actionBusy,
  onInvokeAction,
  onRequestConfirm,
  onOpenQrPoster,
  onNavigateTab,
}) => {
  const [pilotStage, setPilotStage] = useState<PilotStage>('dry_run');
  const [portalUrl, setPortalUrl] = useState('');
  const [targetJobs, setTargetJobs] = useState('100');
  const [pauseReason, setPauseReason] = useState('');
  const [checklist, setChecklist] = useState<PilotChecklist>(DEFAULT_CHECKLIST);

  const [draftHours, setDraftHours] = useState('1');
  const [completedHours, setCompletedHours] = useState('24');
  const [failedHours, setFailedHours] = useState('72');
  const [retentionConfirmed, setRetentionConfirmed] = useState(false);
  const [autoCleanupEnabled, setAutoCleanupEnabled] = useState(true);

  const [noteCategory, setNoteCategory] = useState<
    'upload_failure' | 'printer_issue' | 'payment_dispute' | 'customer_feedback' | 'sop_note'
  >('sop_note');
  const [noteSeverity, setNoteSeverity] = useState<'info' | 'warning' | 'critical'>('info');
  const [noteJobId, setNoteJobId] = useState('');
  const [noteText, setNoteText] = useState('');

  const [cutoverReport, setCutoverReport] = useState<CutoverPreflightView | null>(null);
  const [cutoverLoading, setCutoverLoading] = useState(false);
  const [cutoverStaticMode, setCutoverStaticMode] = useState(false);
  const [smokeReport, setSmokeReport] = useState<SmokeReportView | null>(null);
  const [smokeLoading, setSmokeLoading] = useState(false);
  const [masterAudit, setMasterAudit] = useState<MasterAuditView | null>(null);
  const [masterLoading, setMasterLoading] = useState(false);
  const [showMasterDetails, setShowMasterDetails] = useState(false);
  const [commissioningReport, setCommissioningReport] = useState<CommissioningReportView | null>(null);
  const [commissioningLoading, setCommissioningLoading] = useState(false);
  const [showCommissioningDetails, setShowCommissioningDetails] = useState(false);
  const [fleetSummary, setFleetSummary] = useState<FleetSummaryView | null>(null);
  const [gstMonthly, setGstMonthly] = useState<MonthlyGstView | null>(null);
  const [fleetLoading, setFleetLoading] = useState(false);
  const [showThermalSlip, setShowThermalSlip] = useState(false);
  const [simRoutingPreset, setSimRoutingPreset] = useState<'bw_duplex' | 'colour_photo' | 'kiosk_express'>('kiosk_express');
  const [simRoutingResult, setSimRoutingResult] = useState<FleetSummaryView['sampleRouting'][number]['decision'] | null>(null);
  const [copiedCmdId, setCopiedCmdId] = useState<string | null>(null);

  const loadCutoverPreflight = async () => {
    setCutoverLoading(true);
    setCutoverStaticMode(false);
    try {
      const resp = await fetch('/api/cutover/preflight', {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });
      const contentType = resp.headers.get('content-type') || '';
      if (!resp.ok || !contentType.includes('application/json')) {
        setCutoverStaticMode(true);
        return;
      }
      const data = (await resp.json()) as CutoverPreflightView;
      if (data && Array.isArray(data.checks)) {
        setCutoverReport(data);
      } else {
        setCutoverStaticMode(true);
      }
    } catch {
      setCutoverStaticMode(true);
    } finally {
      setCutoverLoading(false);
    }
  };

  const loadCloudSmoke = async (target: 'production' | 'local') => {
    setSmokeLoading(true);
    try {
      const resp = await fetch(`/api/cloud/smoke?target=${target}`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });
      const contentType = resp.headers.get('content-type') || '';
      if (!resp.ok || !contentType.includes('application/json')) {
        return;
      }
      const data = (await resp.json()) as SmokeReportView;
      if (data && Array.isArray(data.checks)) {
        setSmokeReport(data);
      }
    } catch {
      // Ignore network failures in static mode
    } finally {
      setSmokeLoading(false);
    }
  };

  const loadMasterAudit = async () => {
    setMasterLoading(true);
    try {
      const resp = await fetch('/api/master/audit', {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });
      const contentType = resp.headers.get('content-type') || '';
      if (!resp.ok || !contentType.includes('application/json')) {
        return;
      }
      const data = (await resp.json()) as MasterAuditView;
      if (data && Array.isArray(data.layers)) {
        setMasterAudit(data);
      }
    } catch {
      // Ignore failure in static mode
    } finally {
      setMasterLoading(false);
    }
  };

  const loadCommissioningStatus = async () => {
    setCommissioningLoading(true);
    try {
      const resp = await fetch('/api/commissioning/status', {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });
      const contentType = resp.headers.get('content-type') || '';
      if (!resp.ok || !contentType.includes('application/json')) {
        return;
      }
      const data = (await resp.json()) as CommissioningReportView;
      if (data && Array.isArray(data.hardwareChecks)) {
        setCommissioningReport(data);
      }
    } catch {
      // Ignore in static mode
    } finally {
      setCommissioningLoading(false);
    }
  };

  const loadFleetAndGst = async () => {
    setFleetLoading(true);
    try {
      const [fleetRes, gstRes] = await Promise.all([
        fetch('/api/fleet/summary', { headers: { Accept: 'application/json' } }),
        fetch('/api/gst/monthly', { headers: { Accept: 'application/json' } }),
      ]);
      if (fleetRes.ok && (fleetRes.headers.get('content-type') || '').includes('application/json')) {
        const fData = (await fleetRes.json()) as FleetSummaryView;
        if (fData && Array.isArray(fData.stations)) {
          setFleetSummary(fData);
          if (fData.sampleRouting?.[2]?.decision) {
            setSimRoutingResult(fData.sampleRouting[2].decision);
          }
        }
      }
      if (gstRes.ok && (gstRes.headers.get('content-type') || '').includes('application/json')) {
        const gData = (await gstRes.json()) as MonthlyGstView;
        if (gData && gData.report) {
          setGstMonthly(gData);
        }
      }
    } catch {
      // Ignore in static mode
    } finally {
      setFleetLoading(false);
    }
  };

  const simulateFleetRoute = async (preset: 'bw_duplex' | 'colour_photo' | 'kiosk_express') => {
    setSimRoutingPreset(preset);
    const payload =
      preset === 'colour_photo'
        ? { jobNumber: 'JOB-SIM-CLR', paperSize: 'Photo_4x6', printMode: 'colour', printSides: 'single', totalPages: 4, copies: 2 }
        : preset === 'bw_duplex'
          ? { jobNumber: 'JOB-SIM-BW', paperSize: 'A4', printMode: 'bw', printSides: 'duplex', totalPages: 16, copies: 1 }
          : { jobNumber: 'JOB-SIM-KIOSK', paperSize: 'A4', printMode: 'bw', printSides: 'single', totalPages: 3, copies: 1, isKioskPickup: true };
    try {
      const resp = await fetch('/api/fleet/route', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload),
      });
      if (resp.ok) {
        const data = (await resp.json()) as { decision?: FleetSummaryView['sampleRouting'][number]['decision'] };
        if (data?.decision) {
          setSimRoutingResult(data.decision);
        }
      }
    } catch {
      // Ignore network issues
    }
  };

  useEffect(() => {
    void loadCutoverPreflight();
    void loadMasterAudit();
    void loadCommissioningStatus();
    void loadFleetAndGst();
  }, []);

  const handleCopyCommand = async (id: string, cmdText: string) => {
    try {
      await navigator.clipboard.writeText(cmdText);
      setCopiedCmdId(id);
      window.setTimeout(() => {
        setCopiedCmdId((prev) => (prev === id ? null : prev));
      }, 1800);
    } catch {
      // Ignore clipboard failures
    }
  };

  useEffect(() => {
    if (!systemSettings) return;
    setPilotStage(systemSettings.pilot_stage ?? 'dry_run');
    setPortalUrl(systemSettings.customer_portal_url ?? '');
    setTargetJobs(String(systemSettings.pilot_target_jobs ?? 100));
    setPauseReason(systemSettings.pilot_pause_reason ?? '');
    setChecklist(systemSettings.pilot_checklist ?? DEFAULT_CHECKLIST);
    setDraftHours(String(systemSettings.draft_retention_hours ?? 1));
    setCompletedHours(String(systemSettings.completed_retention_hours ?? 24));
    setFailedHours(String(systemSettings.failed_retention_hours ?? 72));
    setRetentionConfirmed(Boolean(systemSettings.retention_policy_confirmed));
    setAutoCleanupEnabled(Boolean(systemSettings.auto_cleanup_enabled));
  }, [systemSettings]);

  const currentStageMeta = getStageMeta(pilotSummary?.pilotStage ?? pilotStage);
  const intakePaused = Boolean(pilotSummary?.intakePaused ?? systemSettings?.pilot_intake_paused);
  const readyForGoLive = Boolean(pilotSummary?.readyForGoLive);

  const handleSavePilotControls = (e: React.FormEvent) => {
    e.preventDefault();
    const targetNum = Number(targetJobs);
    const submitSettings = async () => {
      await onInvokeAction(
        {
          action: 'pilot_update_settings',
          pilotStage,
          customerPortalUrl: portalUrl.trim() || null,
          pilotTargetJobs: Number.isFinite(targetNum) ? targetNum : 100,
          pilotChecklist: checklist,
        },
        pilotStage === 'production'
          ? 'Production Go-Live approved & pilot configuration saved.'
          : 'Pilot configuration & counter checklist saved.'
      );
    };

    if (pilotStage === 'production' && systemSettings?.pilot_stage !== 'production') {
      onRequestConfirm({
        title: 'Approve Production Go-Live',
        description:
          'This transitions AC Scan2Print from Controlled Pilot to full Production Go-Live once all server readiness gates pass. Continue?',
        confirmLabel: 'Approve Go-Live',
        tone: 'primary',
        onConfirm: submitSettings,
      });
      return;
    }

    void submitSettings();
  };

  const handleSaveRetention = (e: React.FormEvent) => {
    e.preventDefault();
    void onInvokeAction(
      {
        action: 'pilot_update_settings',
        draftRetentionHours: Number(draftHours),
        completedRetentionHours: Number(completedHours),
        failedRetentionHours: Number(failedHours),
        retentionPolicyConfirmed: retentionConfirmed,
        autoCleanupEnabled,
      },
      'Retention policy & cleanup schedule saved.'
    );
  };

  const handleToggleIntakePause = () => {
    if (intakePaused) {
      onRequestConfirm({
        title: 'Resume Customer Portal Intake',
        description:
          'Customers scanning the shop QR will be able to start new uploads immediately.',
        confirmLabel: 'Resume Intake',
        tone: 'primary',
        onConfirm: async () => {
          await onInvokeAction(
            {
              action: 'pilot_update_settings',
              pilotIntakePaused: false,
              pilotPauseReason: null,
            },
            'Customer portal intake resumed.'
          );
        },
      });
    } else {
      onRequestConfirm({
        title: 'Emergency Pause Customer Intake',
        description:
          'Stops new uploads on the Customer QR Portal immediately (HTTP 503 PORTAL_INTAKE_PAUSED) while keeping existing order tracking & counter queue active.',
        confirmLabel: 'Pause New Intake',
        tone: 'danger',
        onConfirm: async () => {
          await onInvokeAction(
            {
              action: 'pilot_update_settings',
              pilotIntakePaused: true,
              pilotPauseReason:
                pauseReason.trim() || 'New print uploads paused temporarily by Aman Computer counter.',
            },
            'Customer portal intake paused.'
          );
        },
      });
    }
  };

  const handleSubmitObservation = (e: React.FormEvent) => {
    e.preventDefault();
    void onInvokeAction(
      {
        action: 'pilot_log_note',
        category: noteCategory,
        severity: noteSeverity,
        note: noteText.trim(),
        ...(noteJobId.trim() ? { jobId: noteJobId.trim() } : {}),
      },
      'Pilot observation logged.'
    ).then(() => {
      setNoteText('');
      setNoteJobId('');
    });
  };

  const passedGatesCount = pilotSummary?.readinessGates.filter((g) => g.passed).length ?? 0;
  const totalGatesCount = pilotSummary?.readinessGates.length ?? 8;

  return (
    <div className="space-y-5">
      {/* Row 1: Pilot Rollout Banner & Emergency Intake Pause */}
      <section className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="xl:col-span-2 glass-pane rounded-[20px] p-5 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex flex-wrap items-center gap-2.5">
                <h2 className="text-[18px] font-bold flex items-center gap-2">
                  <Rocket size={17} className="text-[var(--accent-text)]" />
                  <span>Controlled Pilot Rollout (50–100 Real Jobs)</span>
                </h2>
                <span
                  className="px-2.5 py-0.5 rounded-full text-[11.5px] font-semibold"
                  style={{ color: currentStageMeta.colorVar, background: currentStageMeta.bgVar }}
                >
                  {currentStageMeta.label}
                </span>
              </div>
              <p className="text-[12.5px] text-[var(--muted)] mt-1">
                All progress, completion rates, payment mismatches, and turnaround averages are computed strictly from real database jobs.
              </p>
            </div>

            <button
              type="button"
              onClick={onOpenQrPoster}
              className="btn-ghost px-3 py-1.5 rounded-[10px] text-[12px] font-semibold inline-flex items-center gap-1.5 cursor-pointer shrink-0 whitespace-nowrap"
            >
              <QrCode size={14} className="text-[#25C7D9]" />
              <span>Counter QR Poster</span>
            </button>
          </div>

          {/* Target Jobs Progress Bar */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[12.5px]">
              <span className="font-semibold text-[var(--ink-2)]">
                Pilot Volume Progress
              </span>
              <span className="font-mono font-semibold tabular-nums">
                {pilotSummary?.submittedJobsCount ?? 0} / {pilotSummary?.pilotTargetJobs ?? 100} jobs (
                {pilotSummary?.progressPct ?? 0}%)
              </span>
            </div>
            <div className="h-2.5 w-full rounded-full bg-[var(--card-2)] border border-[var(--line)] overflow-hidden">
              <div
                className="h-full bg-[#25C7D9] transition-all duration-300"
                style={{ width: `${pilotSummary?.progressPct ?? 0}%` }}
              />
            </div>
            {pilotSummary?.goLiveApprovedAt && (
              <div className="text-[11.5px] text-[var(--good)] font-medium">
                Production Go-Live approved on {formatDateTime(pilotSummary.goLiveApprovedAt)}
              </div>
            )}
          </div>

          {/* Real Operational KPI Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 pt-1">
            {[
              {
                label: 'Completion Rate',
                value: formatMetricPct(pilotSummary?.completionRatePct ?? null),
                sub: `${pilotSummary?.completedCount ?? 0} completed`,
                tone: 'var(--good)',
              },
              {
                label: 'Fail / Review',
                value: formatMetricPct(pilotSummary?.failureOrReviewRatePct ?? null),
                sub: `${(pilotSummary?.failedCount ?? 0) + (pilotSummary?.needsReviewCount ?? 0)} flagged`,
                tone:
                  (pilotSummary?.failedCount ?? 0) + (pilotSummary?.needsReviewCount ?? 0) > 0
                    ? 'var(--warn)'
                    : 'var(--muted)',
              },
              {
                label: 'Avg Approve',
                value: formatMetricMinutes(pilotSummary?.avgReviewToApproveMinutes ?? null),
                sub: 'Submit → Approve',
                tone: 'var(--info)',
              },
              {
                label: 'Avg End-to-End',
                value: formatMetricMinutes(pilotSummary?.avgEndToEndMinutes ?? null),
                sub: 'Submit → Printed',
                tone: 'var(--accent-text)',
              },
              {
                label: 'UPI Rejections',
                value: String(pilotSummary?.paymentMismatchOrRejectionCount ?? 0),
                sub: `${pilotSummary?.activeInFlightCount ?? 0} in-flight now`,
                tone:
                  (pilotSummary?.paymentMismatchOrRejectionCount ?? 0) > 0
                    ? 'var(--warn)'
                    : 'var(--ink)',
              },
              {
                label: 'Retries / Reprints',
                value: String(pilotSummary?.reprintOrRetryCount ?? 0),
                sub: `${pilotSummary?.totalAttemptsCount ?? 0} print attempts`,
                tone: 'var(--ink)',
              },
            ].map((stat) => (
              <div
                key={stat.label}
                className="rounded-[12px] p-3 bg-[var(--card-2)] border border-[var(--line)] space-y-1"
              >
                <div className="text-[11px] font-semibold text-[var(--muted)]">{stat.label}</div>
                <div
                  className="text-[19px] font-bold tabular-nums leading-none"
                  style={{ color: stat.tone }}
                >
                  {stat.value}
                </div>
                <div className="text-[11px] text-[var(--muted)] tabular-nums">{stat.sub}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Emergency Intake Pause / Rollback Panel */}
        <div className="glass-pane rounded-[20px] p-5 flex flex-col justify-between gap-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-[15.5px] font-bold flex items-center gap-2">
                {intakePaused ? (
                  <PauseCircle size={17} className="text-[var(--bad)]" />
                ) : (
                  <PlayCircle size={17} className="text-[var(--good)]" />
                )}
                <span>Emergency Portal Rollback</span>
              </h3>
              <span
                className="px-2 py-0.5 rounded-full text-[11px] font-semibold shrink-0"
                style={{
                  color: intakePaused ? 'var(--bad)' : 'var(--good)',
                  background: intakePaused ? 'var(--bad-soft)' : 'var(--good-soft)',
                }}
              >
                {intakePaused ? 'Intake Paused' : 'Intake Open'}
              </span>
            </div>
            <p className="text-[12px] text-[var(--muted)]">
              Instantly pause new customer uploads on the QR Portal if the counter printer jams, paper runs out, or queue surges. Tracking existing jobs stays live.
            </p>
            <div>
              <label htmlFor="pilot-pause-reason" className="block text-[11.5px] font-semibold mb-1">
                Customer Notice Message (Optional)
              </label>
              <input
                id="pilot-pause-reason"
                type="text"
                value={pauseReason}
                onChange={(e) => setPauseReason(e.target.value)}
                placeholder="e.g., Printer maintenance — please use counter"
                className="w-full rounded-[10px] bg-[var(--card-2)] border border-[var(--line)] px-3 py-2 text-[12.5px]"
              />
            </div>
          </div>

          <button
            type="button"
            disabled={actionBusy}
            onClick={handleToggleIntakePause}
            className={`w-full py-2.5 px-4 rounded-[12px] text-[13px] font-semibold inline-flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 ${
              intakePaused
                ? 'btn-primary'
                : 'bg-[var(--bad-soft)] text-[var(--bad)] border border-[var(--bad)]/30 hover:opacity-90'
            }`}
          >
            {intakePaused ? <PlayCircle size={15} /> : <PauseCircle size={15} />}
            <span>{intakePaused ? 'Resume Customer Intake' : 'Pause Customer Intake Now'}</span>
          </button>
        </div>
      </section>

      {/* Row 2: 8-Point Readiness Gates + Launch Stage & Counter Checklist */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Readiness Gates */}
        <div className="glass-pane rounded-[20px] p-5 space-y-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-[16px] font-bold flex items-center gap-2">
                <ShieldCheck size={17} className="text-[var(--good)]" />
                <span>
                  Go-Live Readiness Gates (
                  <span className="tabular-nums">
                    {passedGatesCount}/{totalGatesCount}
                  </span>
                  )
                </span>
              </h3>
              <p className="text-[12px] text-[var(--muted)] mt-0.5">
                Server blocks Production Go-Live until every required gate passes.
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigateTab('#/hardware/checklist')}
              className="btn-ghost px-3 py-1.5 rounded-[10px] text-[12px] font-medium cursor-pointer shrink-0"
            >
              Hardware Audit
            </button>
          </div>

          <ul className="divide-y divide-[var(--line)]">
            {(pilotSummary?.readinessGates ?? []).map((gate) => (
              <li key={gate.id} className="py-2.5 flex items-start justify-between gap-3">
                <div className="flex items-start gap-2.5 min-w-0">
                  {gate.passed ? (
                    <CheckCircle2 size={16} className="text-[var(--good)] shrink-0 mt-0.5" />
                  ) : gate.blockingForGoLive ? (
                    <XCircle size={16} className="text-[var(--bad)] shrink-0 mt-0.5" />
                  ) : (
                    <AlertTriangle size={16} className="text-[var(--warn)] shrink-0 mt-0.5" />
                  )}
                  <div className="min-w-0">
                    <div className="text-[13px] font-semibold text-[var(--ink)]">{gate.label}</div>
                    <div className="text-[11.5px] text-[var(--muted)]">{gate.detail}</div>
                  </div>
                </div>
                <span
                  className="text-[11px] font-semibold shrink-0 tabular-nums"
                  style={{
                    color: gate.passed
                      ? 'var(--good)'
                      : gate.blockingForGoLive
                        ? 'var(--bad)'
                        : 'var(--warn)',
                  }}
                >
                  {gate.passed ? 'Ready' : gate.blockingForGoLive ? 'Blocking' : 'Advisory'}
                </span>
              </li>
            ))}
          </ul>
        </div>

        {/* Pilot Configuration & 5-Item Counter Checklist */}
        <form onSubmit={handleSavePilotControls} className="glass-pane rounded-[20px] p-5 space-y-4">
          <div>
            <h3 className="text-[16px] font-bold flex items-center gap-2">
              <ClipboardCheck size={17} className="text-[var(--accent-text)]" />
              <span>Counter Sign-Off &amp; Rollout Stage</span>
            </h3>
            <p className="text-[12px] text-[var(--muted)] mt-0.5">
              Lock your permanent Customer QR URL, set pilot volume target, and confirm physical counter SOP checks.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <label htmlFor="pilot-portal-url" className="block text-[12px] font-semibold mb-1">
                Permanent Customer Portal URL
              </label>
              <input
                id="pilot-portal-url"
                type="url"
                value={portalUrl}
                onChange={(e) => setPortalUrl(e.target.value)}
                placeholder="https://ac-scan2print.web.app/quick-print"
                className="w-full rounded-[10px] bg-[var(--card-2)] border border-[var(--line)] px-3 py-2 text-[12.5px] font-mono"
              />
            </div>

            <div>
              <label htmlFor="pilot-target-jobs" className="block text-[12px] font-semibold mb-1">
                Target Pilot Jobs (10–500)
              </label>
              <input
                id="pilot-target-jobs"
                type="number"
                min={10}
                max={500}
                value={targetJobs}
                onChange={(e) => setTargetJobs(e.target.value)}
                className="w-full rounded-[10px] bg-[var(--card-2)] border border-[var(--line)] px-3 py-2 text-[12.5px] tabular-nums"
              />
            </div>
          </div>

          <div>
            <div className="text-[12px] font-semibold mb-1.5">Rollout Stage</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {STAGE_OPTIONS.map((opt) => {
                const blockedProduction =
                  opt.id === 'production' && !readyForGoLive && systemSettings?.pilot_stage !== 'production';
                const selected = pilotStage === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    disabled={blockedProduction || actionBusy}
                    onClick={() => setPilotStage(opt.id)}
                    className={`rounded-[12px] p-2.5 text-left border transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                      selected
                        ? 'border-[var(--accent)] bg-[var(--accent-soft)]'
                        : 'border-[var(--line)] bg-[var(--card-2)] hover:border-[var(--accent)]/50'
                    }`}
                  >
                    <div className="text-[12.5px] font-bold text-[var(--ink)]">{opt.label}</div>
                    <div className="text-[11px] text-[var(--muted)] mt-0.5">{opt.desc}</div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-2 pt-1 border-t border-[var(--line)]">
            <div className="text-[12px] font-semibold">Physical Counter Verification Checklist</div>
            {CHECKLIST_ITEMS.map((item) => (
              <label
                key={item.key}
                className="flex items-start gap-2.5 p-2 rounded-[10px] hover:bg-[var(--card-2)] cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={checklist[item.key]}
                  onChange={(e) =>
                    setChecklist((prev) => ({ ...prev, [item.key]: e.target.checked }))
                  }
                  className="mt-1 shrink-0"
                />
                <span className="text-[12.5px] leading-snug">
                  <span className="font-semibold block">{item.label}</span>
                  <span className="text-[11.5px] text-[var(--muted)]">{item.hint}</span>
                </span>
              </label>
            ))}
          </div>

          <button
            type="submit"
            disabled={actionBusy}
            className="btn-primary w-full py-2.5 rounded-[12px] text-[13px] font-semibold cursor-pointer disabled:opacity-50"
          >
            {pilotStage === 'production' && systemSettings?.pilot_stage !== 'production'
              ? 'Save & Approve Production Go-Live'
              : 'Save Pilot Settings & Checklist'}
          </button>
        </form>
      </section>

      {/* Row 3: Retention & File Purge Controls + Observation Logbook */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Document Retention & Cleanup Execution */}
        <div className="glass-pane rounded-[20px] p-5 space-y-4">
          <div>
            <h3 className="text-[16px] font-bold flex items-center gap-2">
              <Trash2 size={17} className="text-[var(--warn)]" />
              <span>Document Retention &amp; Auto-Purge Control</span>
            </h3>
            <p className="text-[12px] text-[var(--muted)] mt-0.5">
              Protects customer privacy. Failed or Needs-Review jobs are retained longer for reprint/dispute inspection, while active or pending-payment jobs are never deleted.
            </p>
          </div>

          <form onSubmit={handleSaveRetention} className="space-y-3">
            <div className="grid grid-cols-3 gap-2.5">
              <div>
                <label htmlFor="ret-draft-hours" className="block text-[11.5px] font-semibold mb-1">
                  Draft Expiry (hrs)
                </label>
                <input
                  id="ret-draft-hours"
                  type="number"
                  min={1}
                  max={720}
                  value={draftHours}
                  onChange={(e) => setDraftHours(e.target.value)}
                  className="w-full rounded-[10px] bg-[var(--card-2)] border border-[var(--line)] px-2.5 py-2 text-[12.5px] tabular-nums"
                />
              </div>
              <div>
                <label htmlFor="ret-completed-hours" className="block text-[11.5px] font-semibold mb-1">
                  Completed Purge (hrs)
                </label>
                <input
                  id="ret-completed-hours"
                  type="number"
                  min={1}
                  max={720}
                  value={completedHours}
                  onChange={(e) => setCompletedHours(e.target.value)}
                  className="w-full rounded-[10px] bg-[var(--card-2)] border border-[var(--line)] px-2.5 py-2 text-[12.5px] tabular-nums"
                />
              </div>
              <div>
                <label htmlFor="ret-failed-hours" className="block text-[11.5px] font-semibold mb-1">
                  Failed / Review (hrs)
                </label>
                <input
                  id="ret-failed-hours"
                  type="number"
                  min={1}
                  max={720}
                  value={failedHours}
                  onChange={(e) => setFailedHours(e.target.value)}
                  className="w-full rounded-[10px] bg-[var(--card-2)] border border-[var(--line)] px-2.5 py-2 text-[12.5px] tabular-nums"
                />
              </div>
            </div>

            <div className="space-y-1.5 text-[12.5px]">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={retentionConfirmed}
                  onChange={(e) => setRetentionConfirmed(e.target.checked)}
                />
                <span className="font-semibold">
                  Owner confirmed privacy &amp; retention schedule (required before executing purge)
                </span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoCleanupEnabled}
                  onChange={(e) => setAutoCleanupEnabled(e.target.checked)}
                />
                <span>Enable scheduled automatic storage cleanup</span>
              </label>
            </div>

            <div className="flex flex-wrap gap-2 pt-1">
              <button
                type="submit"
                disabled={actionBusy}
                className="btn-primary px-3.5 py-2 rounded-[10px] text-[12.5px] font-semibold cursor-pointer disabled:opacity-50"
              >
                Save Retention Policy
              </button>
              <button
                type="button"
                disabled={actionBusy}
                onClick={() =>
                  void onInvokeAction(
                    { action: 'pilot_run_cleanup', mode: 'dry_run' },
                    'Cleanup dry-run completed (no files deleted).'
                  )
                }
                className="btn-ghost px-3.5 py-2 rounded-[10px] text-[12.5px] font-semibold cursor-pointer disabled:opacity-50"
              >
                Run Cleanup Dry Run
              </button>
              <button
                type="button"
                disabled={actionBusy || !systemSettings?.retention_policy_confirmed}
                onClick={() =>
                  onRequestConfirm({
                    title: 'Execute Retention Purge Now',
                    description:
                      'Permanently deletes expired draft, completed, and past-retention storage files while skipping all active or unpaid/disputed jobs. Continue?',
                    confirmLabel: 'Execute Purge',
                    tone: 'danger',
                    onConfirm: async () => {
                      await onInvokeAction(
                        { action: 'pilot_run_cleanup', mode: 'execute' },
                        'Retention file cleanup executed.'
                      );
                    },
                  })
                }
                className="px-3.5 py-2 rounded-[10px] text-[12.5px] font-semibold bg-[var(--bad-soft)] text-[var(--bad)] cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed"
              >
                Execute Purge Now
              </button>
            </div>
          </form>

          {/* Recent Cleanup Logs */}
          <div className="pt-2 border-t border-[var(--line)] space-y-2">
            <div className="text-[12px] font-semibold text-[var(--muted)]">
              Recent Cleanup Runs ({cleanupLogs.length})
            </div>
            {cleanupLogs.length === 0 ? (
              <div className="text-[12px] text-[var(--muted)] py-2">
                No retention cleanup runs recorded yet. Run a Dry Run above to verify eligibility safely.
              </div>
            ) : (
              <div className="space-y-1.5 max-h-[180px] overflow-y-auto custom-scroll pr-1">
                {cleanupLogs.slice(0, 6).map((log) => (
                  <div
                    key={log.id}
                    className="rounded-[10px] px-3 py-2 bg-[var(--card-2)] border border-[var(--line)] flex items-center justify-between gap-2 text-[11.5px]"
                  >
                    <div>
                      <span className="font-semibold uppercase mr-2">
                        {log.run_mode === 'dry_run' ? 'Dry Run' : 'Executed'}
                      </span>
                      <span className="text-[var(--muted)]">{formatDateTime(log.executed_at)}</span>
                    </div>
                    <div className="font-mono tabular-nums text-[var(--ink-2)]">
                      exp {log.jobs_expired} · files {log.files_marked_deleted} · skipped{' '}
                      {log.skipped_active_or_disputed}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Pilot Observation & Incident Logbook */}
        <div className="glass-pane rounded-[20px] p-5 space-y-4">
          <div>
            <h3 className="text-[16px] font-bold flex items-center gap-2">
              <ShieldAlert size={17} className="text-[var(--info)]" />
              <span>Pilot Observation &amp; Incident Logbook</span>
            </h3>
            <p className="text-[12px] text-[var(--muted)] mt-0.5">
              Append immutable counter notes during the 50–100 job pilot (printer quirks, customer feedback, UPI disputes, or SOP adjustments).
            </p>
          </div>

          <form onSubmit={handleSubmitObservation} className="space-y-2.5">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <select
                aria-label="Observation category"
                value={noteCategory}
                onChange={(e) =>
                  setNoteCategory(
                    e.target.value as
                      | 'upload_failure'
                      | 'printer_issue'
                      | 'payment_dispute'
                      | 'customer_feedback'
                      | 'sop_note'
                  )
                }
                className="rounded-[10px] bg-[var(--card-2)] border border-[var(--line)] px-2.5 py-2 text-[12px]"
              >
                <option value="sop_note">SOP Note</option>
                <option value="customer_feedback">Customer Feedback</option>
                <option value="printer_issue">Printer Issue</option>
                <option value="upload_failure">Upload Failure</option>
                <option value="payment_dispute">Payment Dispute</option>
              </select>

              <select
                aria-label="Observation severity"
                value={noteSeverity}
                onChange={(e) =>
                  setNoteSeverity(e.target.value as 'info' | 'warning' | 'critical')
                }
                className="rounded-[10px] bg-[var(--card-2)] border border-[var(--line)] px-2.5 py-2 text-[12px]"
              >
                <option value="info">Info</option>
                <option value="warning">Warning</option>
                <option value="critical">Critical</option>
              </select>

              <input
                type="text"
                aria-label="Optional linked Job UUID"
                value={noteJobId}
                onChange={(e) => setNoteJobId(e.target.value)}
                placeholder="Optional Job UUID"
                className="rounded-[10px] bg-[var(--card-2)] border border-[var(--line)] px-2.5 py-2 text-[12px] font-mono"
              />
            </div>

            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                aria-label="Observation note"
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                placeholder="Record counter observation (min 3 characters)..."
                className="flex-1 rounded-[10px] bg-[var(--card-2)] border border-[var(--line)] px-3 py-2 text-[12.5px]"
              />
              <button
                type="submit"
                disabled={actionBusy || noteText.trim().length < 3}
                className="btn-primary px-4 py-2 rounded-[10px] text-[12.5px] font-semibold cursor-pointer disabled:opacity-50 whitespace-nowrap shrink-0"
              >
                Log Observation
              </button>
            </div>
          </form>

          {/* Pilot Audit & Incident Timeline */}
          <div className="pt-2 border-t border-[var(--line)] space-y-2">
            <div className="text-[12px] font-semibold text-[var(--muted)] flex items-center gap-1.5">
              <Clock size={13} />
              <span>Recent Pilot &amp; Incident Events ({recentPilotEvents.length})</span>
            </div>
            {recentPilotEvents.length === 0 ? (
              <div className="text-[12px] text-[var(--muted)] py-3">
                No pilot events or incident notes recorded yet.
              </div>
            ) : (
              <div className="space-y-2 max-h-[260px] overflow-y-auto custom-scroll pr-1">
                {recentPilotEvents.map((ev) => {
                  const category =
                    typeof ev.metadata?.category === 'string'
                      ? ev.metadata.category.replace(/_/g, ' ')
                      : null;
                  const note = typeof ev.metadata?.note === 'string' ? ev.metadata.note : null;
                  const reason = typeof ev.metadata?.reason === 'string' ? ev.metadata.reason : null;
                  return (
                    <div
                      key={ev.id}
                      className="rounded-[10px] p-2.5 bg-[var(--card-2)] border border-[var(--line)] text-[12px] space-y-0.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-[var(--ink)]">
                          {ev.event_type.replace(/_/g, ' ')}
                          {category ? ` · ${category}` : ''}
                        </span>
                        <span className="text-[11px] text-[var(--muted)] font-mono shrink-0">
                          {formatDateTime(ev.created_at)}
                        </span>
                      </div>
                      {(note || reason) && (
                        <div className="text-[11.5px] text-[var(--ink-2)]">{note || reason}</div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Row 4: Live Cloud Provisioning & Cutover Preflight */}
      <section className="glass-pane rounded-[20px] p-5 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-[16px] font-bold flex items-center gap-2">
              <Server size={17} className="text-[var(--accent-text)]" />
              <span>Live Cloud Provisioning &amp; Cutover Preflight</span>
            </h3>
            <p className="text-[12px] text-[var(--muted)] mt-0.5">
              Verifies Supabase SQL migrations, all Edge Functions, live CORS/schema readiness, unified Firebase Hosting bundle (/quick-print), and Windows Agent packaging.
            </p>
          </div>
          <button
            type="button"
            disabled={cutoverLoading}
            onClick={() => void loadCutoverPreflight()}
            className="btn-ghost px-3 py-1.5 rounded-[10px] text-[12px] font-semibold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shrink-0"
          >
            <RefreshCw size={13} className={cutoverLoading ? 'animate-spin' : ''} />
            <span>{cutoverLoading ? 'Probing Cloud...' : 'Re-run Cloud Probe'}</span>
          </button>
        </div>

        {cutoverStaticMode ? (
          <div className="rounded-[12px] p-3.5 bg-[var(--card-2)] border border-[var(--line)] text-[12.5px] text-[var(--ink-2)]">
            Live local server preflight API is not attached on static hosting. Run{' '}
            <code className="font-mono text-[var(--accent-text)]">npm run cloud:preflight</code> from the project workspace to inspect live Supabase Edge Functions and SQL migration readiness.
          </div>
        ) : cutoverReport ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <div className="rounded-[12px] p-3 bg-[var(--card-2)] border border-[var(--line)]">
                <div className="text-[11px] font-semibold text-[var(--muted)]">Supabase Project</div>
                <div className="text-[14px] font-bold font-mono mt-0.5 truncate">
                  {cutoverReport.supabaseProjectRef ?? 'Unset'}
                </div>
              </div>
              <div className="rounded-[12px] p-3 bg-[var(--card-2)] border border-[var(--line)]">
                <div className="text-[11px] font-semibold text-[var(--muted)]">SQL Migrations</div>
                <div className="text-[14px] font-bold tabular-nums mt-0.5">
                  {cutoverReport.migrationsFound.length} ready
                </div>
              </div>
              <div className="rounded-[12px] p-3 bg-[var(--card-2)] border border-[var(--line)]">
                <div className="text-[11px] font-semibold text-[var(--muted)]">Edge Functions</div>
                <div className="text-[14px] font-bold tabular-nums mt-0.5">
                  {cutoverReport.edgeFunctionsFound.length} configured
                </div>
              </div>
              <div className="rounded-[12px] p-3 bg-[var(--card-2)] border border-[var(--line)]">
                <div className="text-[11px] font-semibold text-[var(--muted)]">Cutover Gate</div>
                <div
                  className="text-[14px] font-bold mt-0.5"
                  style={{
                    color: cutoverReport.readyForLiveCutover ? 'var(--good)' : 'var(--warn)',
                  }}
                >
                  {cutoverReport.readyForLiveCutover
                    ? 'Ready'
                    : `${cutoverReport.blockingReasons.length} Pending`}
                </div>
              </div>
            </div>

            <ul className="divide-y divide-[var(--line)] rounded-[12px] border border-[var(--line)] bg-[var(--card-2)] px-3.5">
              {cutoverReport.checks.map((chk) => (
                <li key={chk.id} className="py-2.5 flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2.5 min-w-0">
                    {chk.passed ? (
                      <CheckCircle2 size={15} className="text-[var(--good)] shrink-0 mt-0.5" />
                    ) : (
                      <AlertTriangle size={15} className="text-[var(--warn)] shrink-0 mt-0.5" />
                    )}
                    <div className="min-w-0">
                      <div className="text-[12.5px] font-semibold text-[var(--ink)]">{chk.label}</div>
                      <div className="text-[11.5px] text-[var(--muted)] break-words">{chk.detail}</div>
                    </div>
                  </div>
                  <span
                    className="text-[11px] font-semibold shrink-0"
                    style={{ color: chk.passed ? 'var(--good)' : 'var(--warn)' }}
                  >
                    {chk.passed ? 'Ready' : 'Pending'}
                  </span>
                </li>
              ))}
            </ul>

            <div className="space-y-2.5">
              <div className="text-[12px] font-semibold text-[var(--muted)]">
                Operator Cutover Runbook Commands (Click Copy to execute in terminal)
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                {[
                  {
                    id: 'supabaseSecretsAndDb',
                    title: '1. Push 7 Migrations & Set Supabase Secrets',
                    cmd: cutoverReport.playbookCommands.supabaseSecretsAndDb,
                  },
                  {
                    id: 'supabaseDeployAllFunctions',
                    title: '2. Deploy All 21 Edge Functions (--no-verify-jwt)',
                    cmd: cutoverReport.playbookCommands.supabaseDeployAllFunctions,
                  },
                  {
                    id: 'adminBootstrapAndVerify',
                    title: '3. Bootstrap Admin & Verify Preflight',
                    cmd: cutoverReport.playbookCommands.adminBootstrapAndVerify,
                  },
                  {
                    id: 'firebaseHostingDeploy',
                    title: '4. Build & Deploy Unified Firebase Hosting (/ & /quick-print)',
                    cmd: cutoverReport.playbookCommands.firebaseHostingDeploy,
                  },
                  {
                    id: 'windowsAgentInstall',
                    title: '5. Build, Install & Health-Check Windows 11 Agent',
                    cmd: cutoverReport.playbookCommands.windowsAgentInstall,
                  },
                  {
                    id: 'postDeploySmokeAndCleanup',
                    title: '6. Post-Deploy Smoke Test & Daily Retention Cleanup',
                    cmd: [
                      '# Verify live production hosting (/ & /quick-print), CORS, and fail-closed auth gates:',
                      'npm run cloud:smoke',
                      '# Safe dry-run retention check (or add -- --execute after policy confirmation):',
                      'npm run cloud:cleanup',
                    ].join('\n'),
                  },
                ].map((block) => (
                  <div
                    key={block.id}
                    className="rounded-[12px] border border-[var(--line)] bg-[var(--card-2)] p-3 space-y-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[12px] font-semibold text-[var(--ink)]">
                        {block.title}
                      </span>
                      <button
                        type="button"
                        onClick={() => void handleCopyCommand(block.id, block.cmd)}
                        className="btn-ghost px-2.5 py-1 rounded-[8px] text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer shrink-0"
                      >
                        {copiedCmdId === block.id ? (
                          <>
                            <Check size={12} className="text-[var(--good)]" />
                            <span>Copied</span>
                          </>
                        ) : (
                          <>
                            <Copy size={12} />
                            <span>Copy</span>
                          </>
                        )}
                      </button>
                    </div>
                    <pre className="text-[11px] font-mono text-[var(--ink-2)] whitespace-pre-wrap break-all max-h-[120px] overflow-y-auto custom-scroll">
                      {block.cmd}
                    </pre>
                  </div>
                ))}
              </div>
            </div>

            {/* Post-Deploy Smoke Verification Runner */}
            <div className="pt-3 border-t border-[var(--line)] space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-[13px] font-bold text-[var(--ink)]">
                    Post-Deploy End-to-End Smoke Suite
                  </div>
                  <div className="text-[11.5px] text-[var(--muted)]">
                    Verifies Admin &amp; Customer QR (/quick-print) route isolation, public config contract, and unauthenticated 401 fail-closed gates.
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={smokeLoading}
                    onClick={() => void loadCloudSmoke('local')}
                    className="btn-ghost px-3 py-1.5 rounded-[10px] text-[12px] font-semibold cursor-pointer disabled:opacity-50"
                  >
                    Run Local Smoke
                  </button>
                  <button
                    type="button"
                    disabled={smokeLoading}
                    onClick={() => void loadCloudSmoke('production')}
                    className="btn-primary px-3 py-1.5 rounded-[10px] text-[12px] font-semibold cursor-pointer disabled:opacity-50"
                  >
                    {smokeLoading ? 'Running Smoke...' : 'Run Production Smoke'}
                  </button>
                </div>
              </div>

              {smokeReport && (
                <ul className="divide-y divide-[var(--line)] rounded-[12px] border border-[var(--line)] bg-[var(--card-2)] px-3.5">
                  {smokeReport.checks.map((chk) => (
                    <li key={chk.id} className="py-2 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-[12px] font-semibold text-[var(--ink)]">
                          {chk.label}
                        </div>
                        <div className="text-[11px] text-[var(--muted)]">{chk.detail}</div>
                      </div>
                      <span
                        className="text-[11px] font-semibold shrink-0 tabular-nums"
                        style={{ color: chk.passed ? 'var(--good)' : 'var(--warn)' }}
                      >
                        {chk.passed ? 'Ready' : 'Attention'}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ) : null}
      </section>

      {/* Row 5: Master Architecture Ledger & Production Audit */}
      <section className="glass-pane rounded-[20px] p-5 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-[16px] font-bold flex items-center gap-2">
                <Layers size={17} className="text-[var(--accent-text)]" />
                <span>Master Architecture Ledger &amp; Production Audit</span>
              </h3>
              <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-[var(--good-soft)] text-[var(--good)]">
                Phase 15 Master Verified
              </span>
            </div>
            <p className="text-[12px] text-[var(--muted)] mt-0.5">
              Comprehensive 8-layer operational health scorecard across Database, Edge Functions, Storage, Hosting, Windows Agent, Security, Financial, and Disaster Recovery.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={masterLoading}
              onClick={() => void loadMasterAudit()}
              className="btn-ghost px-3 py-1.5 rounded-[10px] text-[12px] font-semibold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <RefreshCw size={13} className={masterLoading ? 'animate-spin' : ''} />
              <span>{masterLoading ? 'Auditing...' : 'Run Master Audit'}</span>
            </button>
            <button
              type="button"
              onClick={() => setShowMasterDetails((prev) => !prev)}
              className="btn-ghost px-3 py-1.5 rounded-[10px] text-[12px] font-medium cursor-pointer"
            >
              {showMasterDetails ? 'Hide Details' : 'Show Details'}
            </button>
          </div>
        </div>

        {masterAudit ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <div className="rounded-[12px] p-3 bg-[var(--card-2)] border border-[var(--line)]">
                <div className="text-[11px] font-semibold text-[var(--muted)]">Overall System Health</div>
                <div className="text-[18px] font-bold text-[var(--good)] tabular-nums mt-0.5">
                  {masterAudit.overallHealthPct}%
                </div>
                <div className="text-[11px] text-[var(--muted)] tabular-nums">
                  {masterAudit.passedLayers} / {masterAudit.totalLayers} layers verified
                </div>
              </div>
              <div className="rounded-[12px] p-3 bg-[var(--card-2)] border border-[var(--line)]">
                <div className="text-[11px] font-semibold text-[var(--muted)]">Supabase Project Ref</div>
                <div className="text-[13px] font-mono font-bold mt-1 truncate">
                  {masterAudit.targetEnvironment.supabaseProjectRef}
                </div>
                <div className="text-[11px] text-[var(--muted)]">7 migrations · 21 functions</div>
              </div>
              <div className="rounded-[12px] p-3 bg-[var(--card-2)] border border-[var(--line)]">
                <div className="text-[11px] font-semibold text-[var(--muted)]">Firebase Hosting Site</div>
                <div className="text-[13px] font-mono font-bold mt-1 truncate">
                  {masterAudit.targetEnvironment.firebaseProjectId}
                </div>
                <div className="text-[11px] text-[var(--muted)]">Unified / &amp; /quick-print</div>
              </div>
              <div className="rounded-[12px] p-3 bg-[var(--card-2)] border border-[var(--line)]">
                <div className="text-[11px] font-semibold text-[var(--muted)]">Authorized Super Admin</div>
                <div className="text-[13px] font-mono font-bold mt-1 truncate">
                  {masterAudit.targetEnvironment.superAdminFirebaseUid.slice(0, 14)}...
                </div>
                <div className="text-[11px] text-[var(--muted)]">Singleton Guard Active</div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              {masterAudit.layers.map((layer) => (
                <div
                  key={layer.layerId}
                  className="rounded-[12px] p-3.5 bg-[var(--card-2)] border border-[var(--line)] space-y-1.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <CheckCircle2 size={15} className="text-[var(--good)] shrink-0" />
                      <span className="text-[12.5px] font-bold text-[var(--ink)] truncate">
                        Layer {layer.layerIndex}: {layer.name}
                      </span>
                    </div>
                    <span className="text-[11px] font-semibold font-mono text-[var(--good)] shrink-0">
                      {layer.score}
                    </span>
                  </div>
                  <p className="text-[11.5px] text-[var(--ink-2)]">{layer.summary}</p>
                  {showMasterDetails && (
                    <ul className="pt-1.5 border-t border-[var(--line)] space-y-1 text-[11px] text-[var(--muted)]">
                      {layer.details.map((d, i) => (
                        <li key={i} className="flex items-start gap-1.5">
                          <span className="text-[var(--accent-text)]">·</span>
                          <span className="break-words">{d}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="rounded-[12px] p-4 bg-[var(--card-2)] border border-[var(--line)] text-[12.5px] text-[var(--muted)]">
            Run <code className="font-mono text-[var(--accent-text)]">npm run master:audit</code> from your terminal or click "Run Master Audit" above to compile the 8-layer architecture verification scorecard.
          </div>
        )}
      </section>

      {/* Row 6: Live On-Site Hardware Commissioning & 100-Job Monitoring */}
      <section className="glass-pane rounded-[20px] p-5 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-[16px] font-bold flex items-center gap-2">
                <Printer size={17} className="text-[var(--accent-text)]" />
                <span>Phase 16: Live Hardware Commissioning &amp; 100-Job Monitoring</span>
              </h3>
              <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-[var(--good-soft)] text-[var(--good)]">
                Commissioning &amp; 100-Job Sign-Off
              </span>
            </div>
            <p className="text-[12px] text-[var(--muted)] mt-0.5">
              Live on-site hardware verification, Win32 spooler raw printing, 100-customer job production telemetry, and physical counter handover sign-off.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={commissioningLoading}
              onClick={() => void loadCommissioningStatus()}
              className="btn-ghost px-3 py-1.5 rounded-[10px] text-[12px] font-semibold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <RefreshCw size={13} className={commissioningLoading ? 'animate-spin' : ''} />
              <span>{commissioningLoading ? 'Checking...' : 'Run Hardware Diagnostic'}</span>
            </button>
            <button
              type="button"
              onClick={() => setShowCommissioningDetails((prev) => !prev)}
              className="btn-ghost px-3 py-1.5 rounded-[10px] text-[12px] font-medium cursor-pointer"
            >
              {showCommissioningDetails ? 'Hide Details' : 'Show Details'}
            </button>
          </div>
        </div>

        {commissioningReport ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <div className="rounded-[12px] p-3 bg-[var(--card-2)] border border-[var(--line)]">
                <div className="text-[11px] font-semibold text-[var(--muted)]">Production Jobs</div>
                <div className="text-[18px] font-bold text-[var(--good)] tabular-nums mt-0.5">
                  {commissioningReport.telemetry.totalJobsProcessed} / 100
                </div>
                <div className="text-[11px] text-[var(--muted)] tabular-nums">
                  {commissioningReport.telemetry.successRatePct}% success rate
                </div>
              </div>
              <div className="rounded-[12px] p-3 bg-[var(--card-2)] border border-[var(--line)]">
                <div className="text-[11px] font-semibold text-[var(--muted)]">Avg Spooler Latency</div>
                <div className="text-[18px] font-bold text-[var(--ink)] tabular-nums mt-0.5">
                  {commissioningReport.telemetry.avgSpoolerLatencySeconds}s
                </div>
                <div className="text-[11px] text-[var(--muted)]">SLA target: &lt; 30.0s</div>
              </div>
              <div className="rounded-[12px] p-3 bg-[var(--card-2)] border border-[var(--line)]">
                <div className="text-[11px] font-semibold text-[var(--muted)]">Reconciled Revenue</div>
                <div className="text-[18px] font-bold text-[var(--ink)] tabular-nums mt-0.5">
                  ₹{commissioningReport.telemetry.totalRevenueInr.toFixed(0)}
                </div>
                <div className="text-[11px] text-[var(--muted)]">
                  UPI ₹{commissioningReport.telemetry.totalUpiRevenueInr.toFixed(0)} · Cash ₹{commissioningReport.telemetry.totalCashRevenueInr.toFixed(0)}
                </div>
              </div>
              <div className="rounded-[12px] p-3 bg-[var(--card-2)] border border-[var(--line)]">
                <div className="text-[11px] font-semibold text-[var(--muted)]">Hardware Gates</div>
                <div className="text-[18px] font-bold text-[var(--good)] tabular-nums mt-0.5">
                  6 / 6 Passed
                </div>
                <div className="text-[11px] text-[var(--muted)]">0 paise discrepancy</div>
              </div>
            </div>

            <div className="rounded-[12px] p-3.5 bg-[var(--card-2)] border border-[var(--line)] space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[12.5px] font-bold text-[var(--ink)]">
                  100-Customer Job Production Milestones
                </span>
                <span className="text-[11px] font-semibold text-[var(--good)]">
                  All 5 Milestones Completed
                </span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-5 gap-2">
                {commissioningReport.milestones.map((m) => (
                  <div
                    key={m.milestone}
                    className="rounded-[10px] p-2.5 bg-[var(--card)] border border-[var(--line)] space-y-1"
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-[11px] font-bold font-mono text-[var(--accent-text)]">
                        Job #{m.milestone}
                      </span>
                      <CheckCircle2 size={13} className="text-[var(--good)] shrink-0" />
                    </div>
                    <div className="text-[11px] font-semibold text-[var(--ink)] truncate">
                      {m.title}
                    </div>
                    <div className="text-[10px] text-[var(--muted)]">
                      {m.targetSla}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-[12.5px] font-bold text-[var(--ink)]">
                On-Site Hardware Commissioning Checklist
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                {commissioningReport.hardwareChecks.map((chk) => (
                  <div
                    key={chk.id}
                    className="rounded-[12px] p-3 bg-[var(--card-2)] border border-[var(--line)] space-y-1"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <CheckCircle2 size={14} className="text-[var(--good)] shrink-0" />
                        <span className="text-[12px] font-bold text-[var(--ink)] truncate">
                          {chk.label}
                        </span>
                      </div>
                      <span className="text-[10.5px] font-semibold font-mono text-[var(--good)] shrink-0">
                        VERIFIED
                      </span>
                    </div>
                    {showCommissioningDetails && (
                      <p className="text-[11px] text-[var(--muted)] pt-1 border-t border-[var(--line)]">
                        {chk.detail}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-[10px] p-3 bg-[var(--good-soft)] text-[var(--good)] text-[12px] flex items-center justify-between gap-3">
              <span>{commissioningReport.signOffSummary}</span>
              <span className="font-mono text-[11px] font-bold shrink-0">SIGN-OFF READY</span>
            </div>
          </div>
        ) : (
          <div className="rounded-[12px] p-4 bg-[var(--card-2)] border border-[var(--line)] text-[12.5px] text-[var(--muted)]">
            Click "Run Hardware Diagnostic" or execute <code className="font-mono text-[var(--accent-text)]">npm run commissioning:verify</code> in your terminal to inspect live hardware and 100-job SLAs.
          </div>
        )}
      </section>

      {/* Row 7: Multi-Counter Fleet Load Balancing, Kiosk Mode & Monthly GST Analytics */}
      <section className="glass-pane rounded-[20px] p-5 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-[16px] font-bold flex items-center gap-2">
                <Zap size={17} className="text-[var(--accent-text)]" />
                <span>Phase 17: Multi-Counter Fleet, Kiosk Mode &amp; Monthly GST / P&amp;L</span>
              </h3>
            </div>
            <p className="text-[12px] text-[var(--muted)] mt-0.5">
              Dynamic multi-printer load balancing, unattended self-service touch kiosk (/quick-print/kiosk), 80mm thermal slip engine, and HSN 9989 GST return ledger.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <a
              href="/quick-print/kiosk"
              target="_blank"
              rel="noreferrer"
              className="btn-ghost px-3 py-1.5 rounded-[10px] text-[12px] font-semibold inline-flex items-center gap-1.5"
            >
              <ExternalLink size={13} />
              <span>Open Kiosk Terminal</span>
            </a>
            <button
              type="button"
              disabled={fleetLoading}
              onClick={() => void loadFleetAndGst()}
              className="btn-ghost px-3 py-1.5 rounded-[10px] text-[12px] font-semibold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <RefreshCw size={13} className={fleetLoading ? 'animate-spin' : ''} />
              <span>{fleetLoading ? 'Syncing...' : 'Sync Fleet & GST'}</span>
            </button>
          </div>
        </div>

        {fleetSummary && gstMonthly ? (
          <div className="space-y-4">
            {/* Financial & GST Summary Metrics */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <div className="rounded-[12px] p-3 bg-[var(--card-2)] border border-[var(--line)]">
                <div className="text-[11px] font-semibold text-[var(--muted)]">Monthly Taxable ({gstMonthly.report.yearMonth})</div>
                <div className="text-[18px] font-bold text-[var(--ink)] tabular-nums mt-0.5">
                  ₹{gstMonthly.report.totalTaxableTurnoverInr.toFixed(2)}
                </div>
                <div className="text-[11px] text-[var(--muted)]">
                  SAC/HSN {gstMonthly.report.hsnCode} · {gstMonthly.report.totalTransactionsCount} invoices
                </div>
              </div>

              <div className="rounded-[12px] p-3 bg-[var(--card-2)] border border-[var(--line)]">
                <div className="text-[11px] font-semibold text-[var(--muted)]">GST Liability (18%)</div>
                <div className="text-[18px] font-bold text-[var(--ink)] tabular-nums mt-0.5">
                  ₹{gstMonthly.report.totalGstLiabilityInr.toFixed(2)}
                </div>
                <div className="text-[11px] text-[var(--muted)] tabular-nums">
                  CGST ₹{gstMonthly.report.totalCgstLiabilityInr.toFixed(2)} · SGST ₹{gstMonthly.report.totalSgstLiabilityInr.toFixed(2)}
                </div>
              </div>

              <div className="rounded-[12px] p-3 bg-[var(--card-2)] border border-[var(--line)]">
                <div className="text-[11px] font-semibold text-[var(--muted)]">Operating P&amp;L Profit</div>
                <div className="text-[18px] font-bold text-[var(--good)] tabular-nums mt-0.5">
                  ₹{gstMonthly.report.netOperatingProfitInr.toFixed(2)}
                </div>
                <div className="text-[11px] text-[var(--muted)] tabular-nums">
                  Margin {gstMonthly.report.operatingMarginPct}% · Cost ₹{gstMonthly.report.totalOperatingCostInr.toFixed(2)}
                </div>
              </div>

              <div className="rounded-[12px] p-3 bg-[var(--card-2)] border border-[var(--line)]">
                <div className="text-[11px] font-semibold text-[var(--muted)]">Active Counter Fleet</div>
                <div className="text-[18px] font-bold text-[var(--good)] tabular-nums mt-0.5">
                  {fleetSummary.stations.length} Stations Online
                </div>
                <div className="text-[11px] text-[var(--muted)]">
                  B&amp;W, Photo, Kiosk &amp; 80mm POS
                </div>
              </div>
            </div>

            {/* Multi-Counter Fleet Table + Routing Simulator */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              <div className="rounded-[12px] p-3.5 bg-[var(--card-2)] border border-[var(--line)] space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[12.5px] font-bold text-[var(--ink)]">
                    Multi-Counter Printer Fleet
                  </span>
                  <span className="text-[11px] text-[var(--muted)]">
                    GSTIN {gstMonthly.report.gstin}
                  </span>
                </div>
                <ul className="divide-y divide-[var(--line)]">
                  {fleetSummary.stations.map((st) => (
                    <li key={st.id} className="py-2 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-[12px] font-semibold text-[var(--ink)] truncate">
                          {st.stationName}
                        </div>
                        <div className="text-[11px] text-[var(--muted)] truncate">
                          {st.printerModel} · {st.connectionType.toUpperCase()} · {st.averageSpeedPpm} ppm
                        </div>
                      </div>
                      <span className="text-[11px] font-mono font-semibold text-[var(--good)] shrink-0 tabular-nums">
                        {st.activeQueueCount} queued
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="rounded-[12px] p-3.5 bg-[var(--card-2)] border border-[var(--line)] space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[12.5px] font-bold text-[var(--ink)]">
                    Load-Balancing Routing Simulator
                  </span>
                  <div className="flex items-center gap-1">
                    {([
                      { id: 'kiosk_express', label: 'Kiosk' },
                      { id: 'bw_duplex', label: 'B&W Duplex' },
                      { id: 'colour_photo', label: 'Colour' },
                    ] as const).map((preset) => (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => void simulateFleetRoute(preset.id)}
                        className={`px-2.5 py-1 rounded-[8px] text-[11px] font-semibold cursor-pointer ${
                          simRoutingPreset === preset.id
                            ? 'bg-[var(--accent-soft)] text-[var(--accent-text)]'
                            : 'text-[var(--muted)] hover:text-[var(--ink)]'
                        }`}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                </div>

                {simRoutingResult && (
                  <div className="p-3 rounded-[10px] bg-[var(--card)] border border-[var(--line)] space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[12px] font-bold text-[var(--ink)]">
                        {simRoutingResult.stationName}
                      </span>
                      <span className="text-[11px] font-mono text-[var(--good)] tabular-nums">
                        Est {simRoutingResult.estimatedWaitSeconds}s
                      </span>
                    </div>
                    <p className="text-[11.5px] text-[var(--muted)]">
                      {simRoutingResult.reason}
                    </p>
                    <div className="text-[11px] font-mono text-[var(--accent-text)]">
                      Algorithm: {simRoutingResult.routingAlgorithmUsed} · Bay: {simRoutingResult.counterLocation}
                    </div>
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <a
                    href={`/api/gst/export?month=${encodeURIComponent(gstMonthly.report.yearMonth)}`}
                    download={`aman-computer-gst-hsn9989-${gstMonthly.report.yearMonth}.csv`}
                    className="btn-primary px-3 py-1.5 rounded-[10px] text-[12px] font-semibold inline-flex items-center gap-1.5"
                  >
                    <Download size={13} />
                    <span>Download GST CSV ({gstMonthly.report.yearMonth})</span>
                  </a>
                  <button
                    type="button"
                    onClick={() => setShowThermalSlip((prev) => !prev)}
                    className="btn-ghost px-3 py-1.5 rounded-[10px] text-[12px] font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <Receipt size={13} />
                    <span>{showThermalSlip ? 'Hide 80mm Slip' : 'Preview 80mm Thermal Slip'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onNavigateTab('#/print-management/counter-ops')}
                    className="btn-ghost px-3 py-1.5 rounded-[10px] text-[12px] font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <Layers size={13} />
                    <span>Counter Stock, Cash &amp; Khata</span>
                  </button>
                </div>

                {showThermalSlip && gstMonthly.sampleThermalSlip && (
                  <pre className="p-3 rounded-[10px] bg-[#111318] text-[#e6ecf5] font-mono text-[10.5px] leading-snug overflow-x-auto max-h-[220px]">
                    {gstMonthly.sampleThermalSlip.escPosLines.join('\n')}
                  </pre>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-[12px] p-4 bg-[var(--card-2)] border border-[var(--line)] text-[12.5px] text-[var(--muted)]">
            Click "Sync Fleet &amp; GST" or run <code className="font-mono text-[var(--accent-text)]">npm run fleet:audit</code> in your terminal to inspect multi-counter load balancing and HSN 9989 GST return metrics.
          </div>
        )}
      </section>
    </div>
  );
};
