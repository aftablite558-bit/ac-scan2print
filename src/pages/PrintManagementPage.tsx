import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Banknote,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Copy,
  Download,
  Edit3,
  ExternalLink,
  FileText,
  IndianRupee,
  Laptop,
  ListOrdered,
  PauseCircle,
  PlayCircle,
  Plus,
  Printer,
  QrCode,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldOff,
  Sliders,
  Upload,
  Volume2,
  VolumeX,
  X,
  XCircle,
} from 'lucide-react';
import { TabsNav } from '../components/AnimatedControls';
import {
  ConfirmActionDialog,
  type ConfirmDialogConfig,
} from '../components/print-management/ConfirmActionDialog';
import { BatchArchivePanel } from '../components/print-management/BatchArchivePanel';
import { CounterOpsPanel } from '../components/print-management/CounterOpsPanel';
import { PilotLaunchPanel } from '../components/print-management/PilotLaunchPanel';
import { PrintJobDetailModal } from '../components/print-management/PrintJobDetailModal';
import { ShopQrPosterModal } from '../components/print-management/ShopQrPosterModal';
import { ShopToolsPanel } from '../components/print-management/ShopToolsPanel';
import { WalkinPosPanel } from '../components/print-management/WalkinPosPanel';
import { useAdmin } from '../context/AdminContext';
import { dur, gsap, popIcon, reducedMotion, revealCards, revealText } from '../utils/animations';
import {
  detectQueueNotifications,
  loadSoundAlertsEnabled,
  playCounterChime,
  saveSoundAlertsEnabled,
  type QueueAlertSnapshot,
} from '../utils/counterAlerts';
import {
  DEVICE_STATUS_META,
  JOB_STATUS_META,
  PAYMENT_STATUS_META,
  canAdminApproveCashJob,
  canAdminReleaseJobToQueue,
  canAdminRetryOrReconcileJob,
  createEmptyPricingRuleDraft,
  buildJobsLedgerCsv,
  formatCurrencyInr,
  formatDateTime,
  getDeviceStatusMeta,
  getEligiblePrinters,
  getJobStatusMeta,
  getPaymentStatusMeta,
  isValidUpiHandle,
  pricingRuleToDraft,
  triggerTextDownload,
  validatePricingRuleDraft,
  type AdminCleanupLog,
  type AdminDeviceSummary,
  type AdminJobDetailResponse,
  type AdminPaymentVerificationItem,
  type AdminPilotSummary,
  type AdminPrintDashboardMetrics,
  type AdminPrintEvent,
  type AdminPrintJobSummary,
  type AdminPrintPaymentSettings,
  type AdminPrintPricingRule,
  type AdminPrinterSummary,
  type AdminQueueItem,
  type AdminSystemSettings,
  type DailyFinancialReconciliation,
  type PaperSize,
  type PrintMode,
  type PrintSides,
  type PricingRuleFormDraft,
  type PricingUnit,
} from '../utils/printManagement';

interface AdminPrintJobsListResponse {
  jobs?: AdminPrintJobSummary[];
  pagination?: { page: number; pageSize: number; totalItems: number; totalPages: number };
  metrics?: AdminPrintDashboardMetrics;
  dailyReconciliation?: DailyFinancialReconciliation;
  queue?: AdminQueueItem[];
  paymentVerifications?: AdminPaymentVerificationItem[];
  cashPendingJobs?: AdminPrintJobSummary[];
  printers?: AdminPrinterSummary[];
  devices?: AdminDeviceSummary[];
  pricingRules?: AdminPrintPricingRule[];
  paymentSettings?: AdminPrintPaymentSettings;
  upiQrSignedUrl?: string | null;
  systemSettings?: AdminSystemSettings;
  pilotSummary?: AdminPilotSummary;
  recentPilotEvents?: AdminPrintEvent[];
  recentEvents?: AdminPrintEvent[];
  cleanupLogs?: AdminCleanupLog[];
  serverNowIso?: string;
}

const EMPTY_METRICS: AdminPrintDashboardMetrics = {
  totalJobs: 0,
  pendingJobs: 0,
  approvedJobs: 0,
  queuedJobs: 0,
  processingJobs: 0,
  completedJobs: 0,
  failedJobs: 0,
  needsReviewJobs: 0,
  cancelledJobs: 0,
  rejectedJobs: 0,
  expiredJobs: 0,
  draftJobs: 0,
  todayJobs: 0,
  todayCompletedJobs: 0,
  totalPhysicalSheets: 0,
  completedPhysicalSheets: 0,
  totalConfirmedRevenue: 0,
  todayRevenue: 0,
  revenueByMethod: { upi: 0, cash: 0 },
  pendingVerificationPayments: 0,
};

type PrintTabId = 'overview' | 'jobs' | 'queue' | 'payments' | 'pricing' | 'upi' | 'counter-ops' | 'walkin-pos' | 'shop-tools' | 'batch-archive' | 'pilot' | 'devices';

export const PrintManagementPage: React.FC = () => {
  const { route, navigate, invokeAdminEdgeFunction, showToast } = useAdmin();
  const activeTab = (route.sub as PrintTabId) || 'overview';
  const navTabId: Exclude<PrintTabId, 'devices'> = activeTab === 'devices' ? 'overview' : activeTab;

  // List & Dashboard State
  const [jobs, setJobs] = useState<AdminPrintJobSummary[]>([]);
  const [pagination, setPagination] = useState({ page: 1, pageSize: 15, totalItems: 0, totalPages: 1 });
  const [metrics, setMetrics] = useState<AdminPrintDashboardMetrics>(EMPTY_METRICS);
  const [queueItems, setQueueItems] = useState<AdminQueueItem[]>([]);
  const [paymentVerifications, setPaymentVerifications] = useState<AdminPaymentVerificationItem[]>([]);
  const [cashPendingJobs, setCashPendingJobs] = useState<AdminPrintJobSummary[]>([]);
  const [printers, setPrinters] = useState<AdminPrinterSummary[]>([]);
  const [devices, setDevices] = useState<AdminDeviceSummary[]>([]);
  const [pricingRules, setPricingRules] = useState<AdminPrintPricingRule[]>([]);
  const [paymentSettings, setPaymentSettings] = useState<AdminPrintPaymentSettings | null>(null);
  const [upiQrSignedUrl, setUpiQrSignedUrl] = useState<string | null>(null);
  const [systemSettings, setSystemSettings] = useState<AdminSystemSettings | null>(null);
  const [pilotSummary, setPilotSummary] = useState<AdminPilotSummary | null>(null);
  const [recentPilotEvents, setRecentPilotEvents] = useState<AdminPrintEvent[]>([]);
  const [cleanupLogs, setCleanupLogs] = useState<AdminCleanupLog[]>([]);
  const [dailyReconciliation, setDailyReconciliation] =
    useState<DailyFinancialReconciliation | null>(null);
  const [reconciliationDate, setReconciliationDate] = useState<string>(() =>
    new Date().toISOString().slice(0, 10)
  );
  const [exportingCsv, setExportingCsv] = useState(false);
  const [verifyPrinterChoice, setVerifyPrinterChoice] = useState<Record<string, string>>({});

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [paymentMethodFilter, setPaymentMethodFilter] = useState('all');
  const [paymentStatusFilter, setPaymentStatusFilter] = useState('all');
  const [printModeFilter, setPrintModeFilter] = useState('all');
  const [printSidesFilter, setPrintSidesFilter] = useState('all');
  const [paperSizeFilter, setPaperSizeFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');
  const [page, setPage] = useState(1);

  // Detail Modal State
  const [detailJobId, setDetailJobId] = useState<string | null>(null);
  const [detailData, setDetailData] = useState<AdminJobDetailResponse | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  // Quick release printer picker per job on Queue tab
  const [queueReleasePrinters, setQueueReleasePrinters] = useState<Record<string, string>>({});

  // Confirm Dialog State
  const [confirmConfig, setConfirmConfig] = useState<ConfirmDialogConfig | null>(null);

  // Device Enroll Modal State
  const [enrollOpen, setEnrollOpen] = useState(false);
  const [enrollDeviceName, setEnrollDeviceName] = useState('');
  const [enrollOsVersion, setEnrollOsVersion] = useState('Windows 11');
  const [enrollResult, setEnrollResult] = useState<{
    deviceId: string;
    deviceName: string;
    deviceCredential: string;
  } | null>(null);

  // Pricing Rule Form State
  const [ruleEditorOpen, setRuleEditorOpen] = useState(false);
  const [ruleDraft, setRuleDraft] = useState<PricingRuleFormDraft>(() =>
    createEmptyPricingRuleDraft()
  );

  // UPI Settings Form State
  const [upiDisplayName, setUpiDisplayName] = useState('Aman Computer');
  const [upiEnabled, setUpiEnabled] = useState(false);
  const [upiId, setUpiId] = useState('');
  const [upiInstructions, setUpiInstructions] = useState('');
  const [uploadedQrStoragePath, setUploadedQrStoragePath] = useState<string | null | undefined>(
    undefined
  );
  const [qrUploading, setQrUploading] = useState(false);
  const [qrPosterOpen, setQrPosterOpen] = useState(false);
  const [soundAlertsEnabled, setSoundAlertsEnabled] = useState<boolean>(() =>
    loadSoundAlertsEnabled()
  );

  const rootRef = useRef<HTMLDivElement>(null);
  const h1Ref = useRef<HTMLHeadingElement>(null);
  const tabPanelRef = useRef<HTMLDivElement>(null);
  const prevAlertSnapshotRef = useRef<QueueAlertSnapshot | null>(null);

  useEffect(() => {
    setDetailJobId(null);
    setDetailData(null);
    setEnrollOpen(false);
  }, [activeTab]);

  useEffect(() => {
    if (h1Ref.current) revealText(h1Ref.current, 0.04);
    if (rootRef.current) {
      revealCards(rootRef.current.querySelectorAll<HTMLElement>('.anim-card'), {
        delay: 0.04,
        stagger: 0.04,
        from: 0.35,
      });
    }
  }, []);

  useEffect(() => {
    if (!tabPanelRef.current || reducedMotion()) return;
    gsap.fromTo(
      tabPanelRef.current,
      { opacity: 0, y: 8 },
      { opacity: 1, y: 0, duration: dur(0.24), ease: 'power3.out', clearProps: 'transform,opacity' }
    );
  }, [activeTab]);

  const applySnapshot = useCallback((res: AdminPrintJobsListResponse) => {
    setJobs(Array.isArray(res.jobs) ? res.jobs : []);
    if (res.pagination) setPagination(res.pagination);
    setMetrics(res.metrics ?? EMPTY_METRICS);
    setQueueItems(Array.isArray(res.queue) ? res.queue : []);
    setPaymentVerifications(Array.isArray(res.paymentVerifications) ? res.paymentVerifications : []);
    setCashPendingJobs(Array.isArray(res.cashPendingJobs) ? res.cashPendingJobs : []);
    setPrinters(Array.isArray(res.printers) ? res.printers : []);
    setDevices(Array.isArray(res.devices) ? res.devices : []);
    setPricingRules(Array.isArray(res.pricingRules) ? res.pricingRules : []);
    if (res.paymentSettings) {
      setPaymentSettings(res.paymentSettings);
      setUpiDisplayName(res.paymentSettings.display_name || 'Aman Computer');
      setUpiEnabled(Boolean(res.paymentSettings.upi_enabled));
      setUpiId(res.paymentSettings.upi_id || '');
      setUpiInstructions(res.paymentSettings.payment_instructions || '');
      setUploadedQrStoragePath(undefined);
    }
    if (res.upiQrSignedUrl !== undefined) {
      setUpiQrSignedUrl(res.upiQrSignedUrl);
    }
    if (res.systemSettings) setSystemSettings(res.systemSettings);
    if (res.pilotSummary) setPilotSummary(res.pilotSummary);
    if (res.dailyReconciliation) setDailyReconciliation(res.dailyReconciliation);
    setRecentPilotEvents(Array.isArray(res.recentPilotEvents) ? res.recentPilotEvents : []);
    setCleanupLogs(Array.isArray(res.cleanupLogs) ? res.cleanupLogs : []);

    const nextSnapshot: QueueAlertSnapshot = {
      totalJobs: res.metrics?.totalJobs ?? 0,
      pendingPayments: Array.isArray(res.paymentVerifications) ? res.paymentVerifications.length : 0,
      attentionJobs: (res.metrics?.failedJobs ?? 0) + (res.metrics?.needsReviewJobs ?? 0),
      completedJobs: res.metrics?.completedJobs ?? 0,
    };
    const alertEvents = detectQueueNotifications(prevAlertSnapshotRef.current, nextSnapshot);
    prevAlertSnapshotRef.current = nextSnapshot;
    if (alertEvents.length > 0) {
      const topAlert = alertEvents[0];
      showToast(topAlert.title, topAlert.tone === 'bad' || topAlert.tone === 'warn' ? 'bad' : 'good');
      if (soundAlertsEnabled) {
        playCounterChime(topAlert.kind);
      }
    }

    setLoadError(null);
  }, [showToast, soundAlertsEnabled]);

  const loadWorkspace = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await invokeAdminEdgeFunction<AdminPrintJobsListResponse>('admin-print-jobs', {
        action: 'list',
        search: searchQuery.trim() || undefined,
        status: statusFilter,
        paymentMethod: paymentMethodFilter,
        paymentStatus: paymentStatusFilter,
        printMode: printModeFilter,
        printSides: printSidesFilter,
        paperSize: paperSizeFilter,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        reconciliationDate,
        sortOrder,
        page,
        pageSize: 15,
      });
      applySnapshot(res);
    } catch (err) {
      if (!silent) {
        setLoadError(err instanceof Error ? err.message : 'Unable to load Print Management workspace.');
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, [
    applySnapshot,
    dateFrom,
    dateTo,
    invokeAdminEdgeFunction,
    page,
    paperSizeFilter,
    paymentMethodFilter,
    paymentStatusFilter,
    printModeFilter,
    printSidesFilter,
    reconciliationDate,
    searchQuery,
    sortOrder,
    statusFilter,
  ]);

  useEffect(() => {
    void loadWorkspace();
  }, [loadWorkspace]);

  // Background live queue polling every 20 seconds for real-time counter alerts
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      if (actionBusy || qrPosterOpen || detailJobId || enrollOpen || ruleEditorOpen) return;
      void loadWorkspace(true);
    }, 20000);
    return () => window.clearInterval(timer);
  }, [actionBusy, detailJobId, enrollOpen, loadWorkspace, qrPosterOpen, ruleEditorOpen]);

  const loadJobDetail = useCallback(
    async (jobId: string) => {
      setDetailLoading(true);
      setDetailError(null);
      try {
        const res = await invokeAdminEdgeFunction<AdminJobDetailResponse>('admin-print-jobs', {
          action: 'detail',
          jobId,
        });
        setDetailData(res);
      } catch (err) {
        setDetailError(err instanceof Error ? err.message : 'Unable to fetch print job details.');
      } finally {
        setDetailLoading(false);
      }
    },
    [invokeAdminEdgeFunction]
  );

  const openJobDetail = (jobId: string) => {
    setDetailJobId(jobId);
    setDetailData(null);
    void loadJobDetail(jobId);
  };

  const executeProtectedAction = async (fn: () => Promise<void>) => {
    if (actionBusy) return;
    setActionBusy(true);
    try {
      await fn();
      setConfirmConfig(null);
      await loadWorkspace();
      if (detailJobId) {
        await loadJobDetail(detailJobId);
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Action failed.', 'bad');
    } finally {
      setActionBusy(false);
    }
  };

  const resetFilters = () => {
    setSearchQuery('');
    setStatusFilter('all');
    setPaymentMethodFilter('all');
    setPaymentStatusFilter('all');
    setPrintModeFilter('all');
    setPrintSidesFilter('all');
    setPaperSizeFilter('all');
    setDateFrom('');
    setDateTo('');
    setSortOrder('desc');
    setPage(1);
  };

  const handleExportLedgerCsv = async (targetDate?: string) => {
    if (exportingCsv) return;
    setExportingCsv(true);
    try {
      const fromFilter = targetDate ?? (dateFrom || undefined);
      const toFilter = targetDate ?? (dateTo || undefined);
      const res = await invokeAdminEdgeFunction<AdminPrintJobsListResponse>('admin-print-jobs', {
        action: 'list',
        search: targetDate ? undefined : searchQuery.trim() || undefined,
        status: targetDate ? 'all' : statusFilter,
        paymentMethod: targetDate ? 'all' : paymentMethodFilter,
        paymentStatus: targetDate ? 'all' : paymentStatusFilter,
        printMode: targetDate ? 'all' : printModeFilter,
        printSides: targetDate ? 'all' : printSidesFilter,
        paperSize: targetDate ? 'all' : paperSizeFilter,
        dateFrom: fromFilter,
        dateTo: toFilter,
        sortOrder: 'desc',
        page: 1,
        pageSize: 100,
      });
      const rows = Array.isArray(res.jobs) ? res.jobs : [];
      const csv = buildJobsLedgerCsv(rows);
      const suffix = targetDate || new Date().toISOString().slice(0, 10);
      triggerTextDownload(`ac-scan2print-ledger-${suffix}.csv`, csv, 'text/csv;charset=utf-8');
      showToast(`Exported ${rows.length} job row(s) to CSV ledger.`, 'good');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Unable to export CSV ledger.', 'bad');
    } finally {
      setExportingCsv(false);
    }
  };

  const eligiblePrinters = useMemo(() => getEligiblePrinters(printers), [printers]);

  // Notice any paid + approved jobs waiting for printer assignment & release
  const readyForReleaseJobs = useMemo(
    () => jobs.filter((j) => canAdminReleaseJobToQueue(j)),
    [jobs]
  );

  const hasAnyOnlineDevice = useMemo(
    () => devices.some((d) => d.onlineStatus === 'online'),
    [devices]
  );

  const handleSavePricingRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (actionBusy) return;
    const validationErr = validatePricingRuleDraft(ruleDraft);
    if (validationErr) {
      showToast(validationErr, 'bad');
      return;
    }
    await executeProtectedAction(async () => {
      await invokeAdminEdgeFunction('admin-print-jobs', {
        action: 'pricing_save',
        ruleId: ruleDraft.ruleId,
        ruleName: ruleDraft.ruleName.trim(),
        paperSize: ruleDraft.paperSize,
        printMode: ruleDraft.printMode,
        printSides: ruleDraft.printSides,
        pricingUnit: ruleDraft.printSides === 'duplex' ? 'per_physical_sheet' : ruleDraft.pricingUnit,
        rate: Number(ruleDraft.rate),
        minimumCharge: Number(ruleDraft.minimumCharge),
        validFrom: ruleDraft.validFrom.trim() ? new Date(ruleDraft.validFrom).toISOString() : undefined,
        validUntil: ruleDraft.validUntil.trim() ? new Date(ruleDraft.validUntil).toISOString() : null,
        isActive: ruleDraft.isActive,
      });
      setRuleEditorOpen(false);
      showToast('Pricing rule saved.', 'good');
    });
  };

  const handleQrFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || qrUploading) return;
    setQrUploading(true);
    try {
      const prep = await invokeAdminEdgeFunction<{
        storagePath: string;
        signedUrl: string;
      }>('admin-update-payment-settings', {
        action: 'prepare_qr_upload',
        filename: file.name,
        mimeType: file.type,
        fileSizeBytes: file.size,
      });

      const putRes = await fetch(prep.signedUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type || 'image/png' },
        body: file,
      });
      if (!putRes.ok) {
        throw new Error('Failed to upload QR image to private payment-assets storage.');
      }
      setUploadedQrStoragePath(prep.storagePath);
      showToast('QR image uploaded. Click "Save Payment Settings" to publish.', 'good');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'QR upload failed.', 'bad');
    } finally {
      setQrUploading(false);
      e.target.value = '';
    }
  };

  const handleSavePaymentSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (actionBusy) return;
    const trimmedUpi = upiId.trim();
    if (trimmedUpi && !isValidUpiHandle(trimmedUpi)) {
      showToast('Enter a valid UPI ID (example: amancounter@upi).', 'bad');
      return;
    }
    if (upiEnabled && !trimmedUpi) {
      showToast('Set a valid UPI ID before enabling UPI payments.', 'bad');
      return;
    }
    await executeProtectedAction(async () => {
      const res = await invokeAdminEdgeFunction<{
        settings: AdminPrintPaymentSettings;
        upiQrSignedUrl?: string | null;
      }>('admin-update-payment-settings', {
        action: 'update',
        displayName: upiDisplayName.trim() || 'Aman Computer',
        upiEnabled,
        upiId: trimmedUpi || null,
        paymentInstructions: upiInstructions.trim(),
        ...(uploadedQrStoragePath !== undefined ? { upiQrStoragePath: uploadedQrStoragePath } : {}),
      });
      setPaymentSettings(res.settings);
      setUpiQrSignedUrl(res.upiQrSignedUrl ?? null);
      setUploadedQrStoragePath(undefined);
      showToast('Shop UPI & payment settings saved.', 'good');
    });
  };

  const handleEnrollDevice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (actionBusy) return;
    if (enrollDeviceName.trim().length < 2) {
      showToast('Device name must be at least 2 characters.', 'bad');
      return;
    }
    await executeProtectedAction(async () => {
      const res = await invokeAdminEdgeFunction<{
        deviceId: string;
        deviceName: string;
        deviceCredential: string;
      }>('agent-enroll', {
        deviceName: enrollDeviceName.trim(),
        osVersion: enrollOsVersion.trim() || 'Windows 11',
        activateImmediately: true,
      });
      setEnrollResult(res);
      setEnrollDeviceName('');
      showToast('Print Agent device enrolled. Save the one-time credential securely.', 'good');
    });
  };

  return (
    <div ref={rootRef} className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1
            ref={h1Ref}
            className="text-[30px] sm:text-[34px] font-medium tracking-[-0.02em] leading-tight"
          >
            AC Scan2Print Operations
          </h1>
          <p className="text-[14px] text-[var(--muted)] mt-1">
            Admin print jobs verification, strict UPI/Cash approval workflow, queue control, devices, and shop rates.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => {
              const next = !soundAlertsEnabled;
              setSoundAlertsEnabled(next);
              saveSoundAlertsEnabled(next);
              if (next) playCounterChime('new_job');
              showToast(next ? 'Counter sound alerts enabled.' : 'Counter sound alerts muted.', 'good');
            }}
            className="btn-ghost px-3.5 py-2 rounded-full text-[13px] font-medium inline-flex items-center gap-2 cursor-pointer"
            aria-pressed={soundAlertsEnabled}
          >
            {soundAlertsEnabled ? (
              <Volume2 size={14} className="text-[var(--good)]" />
            ) : (
              <VolumeX size={14} className="text-[var(--muted)]" />
            )}
            <span>{soundAlertsEnabled ? 'Sound Alerts On' : 'Alerts Muted'}</span>
          </button>
          <button
            type="button"
            onClick={() => setQrPosterOpen(true)}
            className="btn-ghost px-3.5 py-2 rounded-full text-[13px] font-medium inline-flex items-center gap-2 cursor-pointer"
          >
            <QrCode size={14} className="text-[#25C7D9]" />
            <span>Shop QR Poster</span>
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={(e) => {
              popIcon(e.currentTarget);
              void loadWorkspace();
            }}
            className="btn-ghost px-3.5 py-2 rounded-full text-[13px] font-medium inline-flex items-center gap-2 cursor-pointer disabled:opacity-50"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            <span>Refresh Data</span>
          </button>
          <button
            type="button"
            onClick={() => navigate('#/hardware/printers')}
            className="btn-ghost px-3.5 py-2 rounded-full text-[13px] font-medium inline-flex items-center gap-2 cursor-pointer"
          >
            <Printer size={14} />
            <span>Printer Registry</span>
          </button>
        </div>
      </div>

      {/* Tabs */}
      <TabsNav
        activeId={navTabId}
        onNavigate={(href) => navigate(href)}
        items={[
          { id: 'overview', label: 'Overview', href: '#/print-management/overview' },
          { id: 'jobs', label: 'All Print Jobs', href: '#/print-management/jobs', count: metrics.totalJobs },
          { id: 'queue', label: 'Queue', href: '#/print-management/queue', count: queueItems.length },
          {
            id: 'payments',
            label: 'Payment Verification',
            href: '#/print-management/payments',
            count: paymentVerifications.length + cashPendingJobs.length,
          },
          { id: 'pricing', label: 'Pricing Rules', href: '#/print-management/pricing', count: pricingRules.length },
          { id: 'upi', label: 'UPI Settings', href: '#/print-management/upi' },
          { id: 'counter-ops', label: 'Counter Stock & Cash', href: '#/print-management/counter-ops' },
          { id: 'walkin-pos', label: 'Walk-In POS & Photo', href: '#/print-management/walkin-pos' },
          { id: 'shop-tools', label: 'Exam Prep, Wastage & Shift', href: '#/print-management/shop-tools' },
          { id: 'batch-archive', label: 'Batch & Archive', href: '#/print-management/batch-archive' },
          { id: 'pilot', label: 'Pilot Launch', href: '#/print-management/pilot' },
        ]}
      />

      {systemSettings?.pilot_intake_paused && (
        <div className="rounded-[16px] p-4 bg-[var(--warn-soft)] border border-[var(--warn)]/35 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-start gap-2.5 text-[13px]">
            <PauseCircle size={18} className="text-[var(--warn)] shrink-0 mt-0.5" />
            <div>
              <span className="font-bold text-[var(--ink)]">Customer Portal Intake Paused: </span>
              <span className="text-[var(--ink-2)]">
                {systemSettings.pilot_pause_reason ||
                  'New customer QR uploads are paused while counter tracking continues.'}
              </span>
            </div>
          </div>
          {activeTab !== 'pilot' && (
            <button
              type="button"
              onClick={() => navigate('#/print-management/pilot')}
              className="btn-ghost px-3 py-1.5 rounded-[10px] text-[12px] font-semibold cursor-pointer shrink-0"
            >
              Manage in Pilot Launch
            </button>
          )}
        </div>
      )}

      {loadError && (
        <div className="rounded-[16px] p-4 bg-[var(--bad-soft)] border border-[var(--bad)]/25 text-[var(--bad)] flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 text-[13.5px] font-medium">
            <ShieldAlert size={18} />
            <span>{loadError}</span>
          </div>
          <button
            type="button"
            onClick={() => void loadWorkspace()}
            className="btn-ghost px-3 py-1.5 rounded-[10px] text-[12.5px] font-semibold cursor-pointer"
          >
            Retry
          </button>
        </div>
      )}

      <div ref={tabPanelRef} className="space-y-5">
        {/* ================================================================
            TAB 1: OVERVIEW (REAL-TIME KPIs + ACTION ALERTS + AGENT DEVICES)
           ================================================================ */}
        {(activeTab === 'overview' || activeTab === 'devices') && (
          <div className="space-y-5">
            {/* Real DB KPI Metrics */}
            <section aria-label="Print Jobs Metrics" className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
              {[
                {
                  label: 'Total Print Jobs',
                  value: String(metrics.totalJobs),
                  sub: `${metrics.todayJobs} submitted today`,
                  icon: FileText,
                  tone: 'var(--ink)',
                },
                {
                  label: 'Pending Verification / Review',
                  value: String(metrics.pendingJobs),
                  sub: `${metrics.pendingVerificationPayments} UPI pending verify`,
                  icon: Clock,
                  tone: 'var(--warn)',
                },
                {
                  label: 'Approved & Ready',
                  value: String(metrics.approvedJobs),
                  sub: `${metrics.queuedJobs} queued · ${metrics.processingJobs} processing`,
                  icon: CheckCircle2,
                  tone: 'var(--accent-text)',
                },
                {
                  label: 'Completed Jobs',
                  value: String(metrics.completedJobs),
                  sub: `${metrics.todayCompletedJobs} completed today`,
                  icon: ShieldAlert,
                  tone: 'var(--good)',
                },
                {
                  label: 'Failed / Needs Review',
                  value: String(metrics.failedJobs + metrics.needsReviewJobs),
                  sub: `${metrics.failedJobs} failed · ${metrics.needsReviewJobs} needs review`,
                  icon: AlertTriangle,
                  tone: metrics.failedJobs + metrics.needsReviewJobs > 0 ? 'var(--bad)' : 'var(--muted)',
                },
                {
                  label: 'Cancelled & Rejected',
                  value: String(metrics.cancelledJobs + metrics.rejectedJobs),
                  sub: `${metrics.cancelledJobs} cancelled · ${metrics.rejectedJobs} rejected`,
                  icon: XCircle,
                  tone: 'var(--muted)',
                },
                {
                  label: 'Physical Sheets',
                  value: String(metrics.totalPhysicalSheets),
                  sub: `${metrics.completedPhysicalSheets} sheets printed & completed`,
                  icon: Printer,
                  tone: 'var(--info)',
                },
                {
                  label: 'Confirmed Revenue',
                  value: formatCurrencyInr(metrics.totalConfirmedRevenue),
                  sub: `Today ${formatCurrencyInr(metrics.todayRevenue)} · UPI ${formatCurrencyInr(
                    metrics.revenueByMethod.upi
                  )} · Cash ${formatCurrencyInr(metrics.revenueByMethod.cash)}`,
                  icon: IndianRupee,
                  tone: 'var(--good)',
                },
              ].map((kpi) => {
                const Icon = kpi.icon;
                return (
                  <div
                    key={kpi.label}
                    className="anim-card glass-pane rounded-[20px] p-4 flex flex-col justify-between gap-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[12px] font-semibold text-[var(--muted)]">
                        {kpi.label}
                      </span>
                      <Icon size={15} style={{ color: kpi.tone }} />
                    </div>
                    <div
                      className="text-[22px] sm:text-[25px] font-bold tracking-tight tabular-nums leading-none"
                      style={{ color: kpi.tone }}
                    >
                      {kpi.value}
                    </div>
                    <div className="text-[11.5px] text-[var(--muted)] leading-snug">{kpi.sub}</div>
                  </div>
                );
              })}
            </section>

            {/* Quick Operational Routing Cards */}
            <section aria-label="Operational Shortcuts" className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
              <div className="glass-pane rounded-[20px] p-4 flex flex-col justify-between gap-3">
                <div>
                  <div className="text-[13.5px] font-bold flex items-center gap-2">
                    <QrCode size={15} className="text-[var(--info)]" />
                    <span>Payment Verification Queue</span>
                  </div>
                  <p className="text-[12px] text-[var(--muted)] mt-1">
                    {paymentVerifications.length} UPI screenshot/UTR claim(s) and {cashPendingJobs.length} unpaid counter job(s) waiting.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => navigate('#/print-management/payments')}
                  className="btn-ghost px-3 py-1.5 rounded-[10px] text-[12px] font-semibold self-start cursor-pointer"
                >
                  Open Payment Verification
                </button>
              </div>

              <div className="glass-pane rounded-[20px] p-4 flex flex-col justify-between gap-3">
                <div>
                  <div className="text-[13.5px] font-bold flex items-center gap-2">
                    <ListOrdered size={15} className="text-[var(--accent-text)]" />
                    <span>Queue & Release Control</span>
                  </div>
                  <p className="text-[12px] text-[var(--muted)] mt-1">
                    {readyForReleaseJobs.length} paid & approved job(s) ready to release · {queueItems.length} in active/attention queue.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => navigate('#/print-management/queue')}
                  className="btn-ghost px-3 py-1.5 rounded-[10px] text-[12px] font-semibold self-start cursor-pointer"
                >
                  Open Print Queue
                </button>
              </div>

              <div className="glass-pane rounded-[20px] p-4 flex flex-col justify-between gap-3">
                <div>
                  <div className="text-[13.5px] font-bold flex items-center gap-2">
                    <Sliders size={15} className={pricingRules.length === 0 ? 'text-[var(--warn)]' : 'text-[var(--good)]'} />
                    <span>Pricing & UPI Readiness</span>
                  </div>
                  <p className="text-[12px] text-[var(--muted)] mt-1">
                    {pricingRules.filter((r) => r.is_active).length} active pricing rule(s) · UPI{' '}
                    {paymentSettings?.upi_enabled ? `enabled (${paymentSettings.upi_id || 'handle set'})` : 'not enabled yet'}.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => navigate('#/print-management/pricing')}
                    className="btn-ghost px-3 py-1.5 rounded-[10px] text-[12px] font-semibold cursor-pointer"
                  >
                    Pricing Rules
                  </button>
                  <button
                    type="button"
                    onClick={() => navigate('#/print-management/upi')}
                    className="btn-ghost px-3 py-1.5 rounded-[10px] text-[12px] font-semibold cursor-pointer"
                  >
                    UPI Settings
                  </button>
                  <button
                    type="button"
                    onClick={() => navigate('#/print-management/counter-ops')}
                    className="btn-ghost px-3 py-1.5 rounded-[10px] text-[12px] font-semibold cursor-pointer"
                  >
                    Stock &amp; Cash Tally
                  </button>
                  <button
                    type="button"
                    onClick={() => navigate('#/print-management/walkin-pos')}
                    className="btn-ghost px-3 py-1.5 rounded-[10px] text-[12px] font-semibold cursor-pointer"
                  >
                    Walk-In POS &amp; Photo
                  </button>
                  <button
                    type="button"
                    onClick={() => navigate('#/print-management/shop-tools')}
                    className="btn-ghost px-3 py-1.5 rounded-[10px] text-[12px] font-semibold cursor-pointer"
                  >
                    Exam Prep, Wastage &amp; Shift
                  </button>
                  <button
                    type="button"
                    onClick={() => navigate('#/print-management/batch-archive')}
                    className="btn-ghost px-3 py-1.5 rounded-[10px] text-[12px] font-semibold cursor-pointer"
                  >
                    Batch Estimator &amp; Archive
                  </button>
                </div>
              </div>
            </section>
          </div>
        )}

        {/* ================================================================
            TAB 2: ALL PRINT JOBS (SEARCH, FILTERS & PAGINATION)
           ================================================================ */}
        {activeTab === 'jobs' && (
          <>

            {/* Filters */}
            <section
              aria-label="Filter print jobs"
              className="glass-pane rounded-[22px] p-4 space-y-3"
            >
              <div className="flex flex-col md:flex-row gap-3">
                <div className="flex-1 relative">
                  <Search
                    size={15}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]"
                  />
                  <label htmlFor="jobs-search-input" className="sr-only">
                    Search print jobs by job number, UUID, customer, or UTR
                  </label>
                  <input
                    id="jobs-search-input"
                    type="text"
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      setPage(1);
                    }}
                    placeholder="Search Job #, Job UUID, customer name, phone, or UPI UTR..."
                    className="w-full rounded-[12px] bg-[var(--card-2)] border border-[var(--line)] pl-9 pr-3 py-2 text-[13px] focus:outline-none focus:border-[var(--accent)]"
                  />
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <select
                    aria-label="Filter by job status"
                    value={statusFilter}
                    onChange={(e) => {
                      setStatusFilter(e.target.value);
                      setPage(1);
                    }}
                    className="rounded-[11px] bg-[var(--card-2)] border border-[var(--line)] px-3 py-2 text-[12.5px]"
                  >
                    <option value="all">All Statuses</option>
                    <option value="pending">Pending (Submitted / Review)</option>
                    <option value="approved">Approved</option>
                    <option value="queued">Queued</option>
                    <option value="processing">Processing (Claimed / Printing)</option>
                    <option value="completed">Completed</option>
                    <option value="attention">Failed / Needs Review</option>
                    <option value="cancelled">Cancelled</option>
                    <option value="rejected">Rejected</option>
                  </select>

                  <select
                    aria-label="Filter by payment method"
                    value={paymentMethodFilter}
                    onChange={(e) => {
                      setPaymentMethodFilter(e.target.value);
                      setPage(1);
                    }}
                    className="rounded-[11px] bg-[var(--card-2)] border border-[var(--line)] px-3 py-2 text-[12.5px]"
                  >
                    <option value="all">All Methods</option>
                    <option value="upi">UPI</option>
                    <option value="cash">Cash</option>
                  </select>

                  <select
                    aria-label="Filter by payment status"
                    value={paymentStatusFilter}
                    onChange={(e) => {
                      setPaymentStatusFilter(e.target.value);
                      setPage(1);
                    }}
                    className="rounded-[11px] bg-[var(--card-2)] border border-[var(--line)] px-3 py-2 text-[12.5px]"
                  >
                    <option value="all">All Payment States</option>
                    <option value="pending_verification">UPI Pending Verify</option>
                    <option value="unpaid">Unpaid</option>
                    <option value="paid">Paid</option>
                    <option value="refunded">Refunded</option>
                  </select>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2.5 pt-1 border-t border-[var(--line)]">
                <select
                  aria-label="Filter by print mode"
                  value={printModeFilter}
                  onChange={(e) => {
                    setPrintModeFilter(e.target.value);
                    setPage(1);
                  }}
                  className="rounded-[10px] bg-[var(--card-2)] border border-[var(--line)] px-2.5 py-1.5 text-[12px]"
                >
                  <option value="all">All Colour Modes</option>
                  <option value="bw">Black & White</option>
                  <option value="colour">Colour</option>
                </select>

                <select
                  aria-label="Filter by print sides"
                  value={printSidesFilter}
                  onChange={(e) => {
                    setPrintSidesFilter(e.target.value);
                    setPage(1);
                  }}
                  className="rounded-[10px] bg-[var(--card-2)] border border-[var(--line)] px-2.5 py-1.5 text-[12px]"
                >
                  <option value="all">Single & Duplex</option>
                  <option value="single">Single-Sided</option>
                  <option value="duplex">Duplex</option>
                </select>

                <select
                  aria-label="Filter by paper size"
                  value={paperSizeFilter}
                  onChange={(e) => {
                    setPaperSizeFilter(e.target.value);
                    setPage(1);
                  }}
                  className="rounded-[10px] bg-[var(--card-2)] border border-[var(--line)] px-2.5 py-1.5 text-[12px]"
                >
                  <option value="all">All Paper Sizes</option>
                  <option value="A4">A4</option>
                  <option value="A3">A3</option>
                  <option value="Legal">Legal</option>
                </select>

                <div className="flex items-center gap-1.5 text-[12px]">
                  <label htmlFor="filter-date-from" className="text-[var(--muted)]">
                    From
                  </label>
                  <input
                    id="filter-date-from"
                    type="date"
                    value={dateFrom}
                    onChange={(e) => {
                      setDateFrom(e.target.value);
                      setPage(1);
                    }}
                    className="rounded-[10px] bg-[var(--card-2)] border border-[var(--line)] px-2 py-1 text-[12px]"
                  />
                  <label htmlFor="filter-date-to" className="text-[var(--muted)]">
                    To
                  </label>
                  <input
                    id="filter-date-to"
                    type="date"
                    value={dateTo}
                    onChange={(e) => {
                      setDateTo(e.target.value);
                      setPage(1);
                    }}
                    className="rounded-[10px] bg-[var(--card-2)] border border-[var(--line)] px-2 py-1 text-[12px]"
                  />
                </div>

                <select
                  aria-label="Sort jobs"
                  value={sortOrder}
                  onChange={(e) => {
                    setSortOrder(e.target.value === 'asc' ? 'asc' : 'desc');
                    setPage(1);
                  }}
                  className="rounded-[10px] bg-[var(--card-2)] border border-[var(--line)] px-2.5 py-1.5 text-[12px]"
                >
                  <option value="desc">Newest First</option>
                  <option value="asc">Oldest First</option>
                </select>

                <div className="flex items-center gap-2 ml-auto">
                  <button
                    type="button"
                    disabled={exportingCsv}
                    onClick={() => void handleExportLedgerCsv()}
                    className="btn-ghost px-3 py-1.5 rounded-[10px] text-[12px] font-medium inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <Download size={13} />
                    <span>{exportingCsv ? 'Exporting...' : 'Export CSV'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={resetFilters}
                    className="btn-ghost px-3 py-1.5 rounded-[10px] text-[12px] font-medium cursor-pointer"
                  >
                    Reset Filters
                  </button>
                </div>
              </div>
            </section>

            {/* Jobs List */}
            <section className="glass-pane rounded-[22px] overflow-hidden">
              {loading && jobs.length === 0 ? (
                <div className="p-10 text-center text-[13.5px] text-[var(--muted)]">
                  Loading live print jobs from Supabase...
                </div>
              ) : jobs.length === 0 ? (
                <div className="p-10 text-center space-y-2">
                  <div className="text-[15px] font-semibold">No print jobs found</div>
                  <p className="text-[13px] text-[var(--muted)] max-w-[460px] mx-auto">
                    Customer QR Portal orders will appear here in real time. Adjust filters above if you are searching historical jobs.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse min-w-[780px]">
                    <thead>
                      <tr className="border-b border-[var(--line)] text-[11.5px] uppercase tracking-[0.06em] text-[var(--muted)]">
                        <th className="py-3 px-4 font-semibold">Job & Customer</th>
                        <th className="py-3 px-4 font-semibold">Print Specs & Sheets</th>
                        <th className="py-3 px-4 font-semibold">Payment</th>
                        <th className="py-3 px-4 font-semibold">Workflow Status</th>
                        <th className="py-3 px-4 font-semibold">Created</th>
                        <th className="py-3 px-4 font-semibold text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--line)] text-[13px]">
                      {jobs.map((job) => {
                        const statusMeta = getJobStatusMeta(job.status);
                        const payMeta = getPaymentStatusMeta(job.payment_status);
                        const totalSheets =
                          (job.physical_sheet_count ?? 0) * Math.max(1, job.copies ?? 1);
                        return (
                          <tr key={job.id} className="hover:bg-[var(--glass-hi)] transition-colors">
                            <td className="py-3 px-4">
                              <div className="font-bold">{job.job_number}</div>
                              <div className="text-[12px] text-[var(--ink-2)]">
                                {job.customer_name || 'Walk-in Customer'}
                                {job.customer_phone ? ` · ${job.customer_phone}` : ''}
                              </div>
                            </td>
                            <td className="py-3 px-4">
                              <div className="font-medium">
                                {job.paper_size} · {job.print_mode === 'colour' ? 'Colour' : 'B&W'} ·{' '}
                                {job.print_sides === 'duplex' ? 'Duplex' : 'Single'}
                              </div>
                              <div className="text-[12px] text-[var(--muted)] tabular-nums">
                                {job.verified_page_count ?? '?'}p × {job.copies} copy →{' '}
                                {totalSheets || '?'} sheet(s)
                              </div>
                            </td>
                            <td className="py-3 px-4">
                              <div className="flex items-center gap-1.5 font-semibold tabular-nums">
                                <span>{formatCurrencyInr(job.final_amount)}</span>
                                {job.payment_method && (
                                  <span className="text-[11px] uppercase text-[var(--muted)]">
                                    ({job.payment_method})
                                  </span>
                                )}
                              </div>
                              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                                <span
                                  className="px-2 py-0.5 rounded-full text-[11px] font-semibold"
                                  style={{ color: payMeta.colorVar, background: payMeta.bgVar }}
                                >
                                  {payMeta.label}
                                </span>
                                {job.latest_transaction_reference && (
                                  <span className="text-[11px] font-mono text-[var(--muted)]">
                                    {job.latest_transaction_reference}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="py-3 px-4">
                              <span
                                className="inline-block px-2.5 py-0.5 rounded-full text-[11.5px] font-semibold"
                                style={{ color: statusMeta.colorVar, background: statusMeta.bgVar }}
                              >
                                {statusMeta.label}
                              </span>
                              {job.assigned_printer_name && (
                                <div className="text-[11.5px] text-[var(--muted)] mt-1">
                                  Printer: {job.assigned_printer_name}
                                </div>
                              )}
                            </td>
                            <td className="py-3 px-4 text-[12px] text-[var(--muted)] whitespace-nowrap">
                              {formatDateTime(job.submitted_at ?? job.created_at)}
                            </td>
                            <td className="py-3 px-4 text-right">
                              <button
                                type="button"
                                onClick={() => openJobDetail(job.id)}
                                className="btn-primary px-3 py-1.5 rounded-[10px] text-[12px] font-semibold cursor-pointer"
                              >
                                Inspect & Manage
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Pagination */}
              <div className="px-4 py-3 border-t border-[var(--line)] flex flex-wrap items-center justify-between gap-3 text-[12.5px]">
                <span className="text-[var(--muted)]">
                  Showing {jobs.length} of {pagination.totalItems} jobs (Page {pagination.page} of{' '}
                  {pagination.totalPages})
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={pagination.page <= 1 || loading}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    className="btn-ghost px-3 py-1.5 rounded-[10px] inline-flex items-center gap-1 cursor-pointer disabled:opacity-40"
                  >
                    <ChevronLeft size={14} />
                    <span>Previous</span>
                  </button>
                  <button
                    type="button"
                    disabled={pagination.page >= pagination.totalPages || loading}
                    onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
                    className="btn-ghost px-3 py-1.5 rounded-[10px] inline-flex items-center gap-1 cursor-pointer disabled:opacity-40"
                  >
                    <span>Next</span>
                    <ChevronRight size={14} />
                  </button>
                </div>
              </div>
            </section>
          </>
        )}

        {/* ================================================================
            TAB 2: ADMIN PRINT QUEUE MANAGEMENT
           ================================================================ */}
        {activeTab === 'queue' && (
          <div className="space-y-4">
            <div className="rounded-[18px] p-4 bg-[var(--card-2)] border border-[var(--line)] flex items-start gap-3 text-[13px]">
              <ListOrdered size={18} className="text-[var(--info)] shrink-0 mt-0.5" />
              <div className="space-y-1">
                <div className="font-bold">Print Queue Execution Policy (Phase 4)</div>
                <p className="text-[var(--ink-2)]">
                  Only <strong>Paid + Approved</strong> jobs may enter the executable Print Queue. Physical printing is executed exclusively by the installed Windows Local Print Agent (Phase 5–7) and is never simulated here.
                </p>
              </div>
            </div>

            {/* Approved + Paid Jobs awaiting Printer Assignment & Queue Release */}
            {readyForReleaseJobs.length > 0 && (
              <section className="glass-pane rounded-[22px] p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-[15px] font-bold">
                    Paid & Approved — Ready for Queue Release ({readyForReleaseJobs.length})
                  </h2>
                  {eligiblePrinters.length === 0 && (
                    <span className="text-[12px] text-[var(--warn)] font-semibold">
                      Enable at least one printer in Printer Registry before releasing
                    </span>
                  )}
                </div>
                <div className="space-y-2.5">
                  {readyForReleaseJobs.map((job) => {
                    const chosenPrinterId =
                      queueReleasePrinters[job.id] ??
                      (job.assigned_printer_id || eligiblePrinters[0]?.id || '');
                    return (
                      <div
                        key={job.id}
                        className="rounded-[14px] p-3 bg-[var(--card-2)] border border-[var(--line)] flex flex-col md:flex-row md:items-center justify-between gap-3"
                      >
                        <div>
                          <div className="font-bold text-[13.5px]">
                            {job.job_number} · {job.customer_name || 'Walk-in'}
                          </div>
                          <div className="text-[12px] text-[var(--muted)]">
                            {job.paper_size} · {job.print_mode.toUpperCase()} · {job.print_sides} ·{' '}
                            {(job.physical_sheet_count ?? 0) * job.copies} physical sheets ·{' '}
                            {formatCurrencyInr(job.final_amount)} ({job.payment_method?.toUpperCase()})
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <select
                            aria-label={`Select printer for ${job.job_number}`}
                            value={chosenPrinterId}
                            onChange={(e) =>
                              setQueueReleasePrinters((prev) => ({
                                ...prev,
                                [job.id]: e.target.value,
                              }))
                            }
                            disabled={eligiblePrinters.length === 0}
                            className="rounded-[10px] bg-[var(--card-1)] border border-[var(--line)] px-2.5 py-1.5 text-[12.5px]"
                          >
                            {eligiblePrinters.length === 0 ? (
                              <option value="">No enabled printer</option>
                            ) : (
                              eligiblePrinters.map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.printer_name} ({p.printer_status})
                                </option>
                              ))
                            )}
                          </select>
                          <button
                            type="button"
                            disabled={actionBusy || !chosenPrinterId}
                            onClick={() =>
                              setConfirmConfig({
                                title: `Release ${job.job_number} to Queue`,
                                description:
                                  'Send this paid & approved job to the active Windows Agent Print Queue.',
                                confirmLabel: 'Release to Queue',
                                tone: 'primary',
                                onConfirm: async () => {
                                  await executeProtectedAction(async () => {
                                    await invokeAdminEdgeFunction('admin-release-print-job', {
                                      jobId: job.id,
                                      printerId: chosenPrinterId,
                                    });
                                    showToast(`Job ${job.job_number} queued.`, 'good');
                                  });
                                },
                              })
                            }
                            className="btn-primary px-3 py-1.5 rounded-[10px] text-[12px] font-semibold cursor-pointer disabled:opacity-50"
                          >
                            Release to Queue
                          </button>
                          <button
                            type="button"
                            onClick={() => openJobDetail(job.id)}
                            className="btn-ghost px-3 py-1.5 rounded-[10px] text-[12px] font-medium cursor-pointer"
                          >
                            Details
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* Active Queue & Attention Table */}
            <section className="glass-pane rounded-[22px] overflow-hidden">
              {queueItems.length === 0 ? (
                <div className="p-10 text-center space-y-2">
                  <div className="text-[15px] font-semibold">Print Queue is Empty</div>
                  <p className="text-[13px] text-[var(--muted)]">
                    No jobs are currently queued, printing, failed, or pending review.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse min-w-[780px]">
                    <thead>
                      <tr className="border-b border-[var(--line)] text-[11.5px] uppercase tracking-[0.06em] text-[var(--muted)]">
                        <th className="py-3 px-4 font-semibold">Queue #</th>
                        <th className="py-3 px-4 font-semibold">Job & Customer</th>
                        <th className="py-3 px-4 font-semibold">Specs & Sheets</th>
                        <th className="py-3 px-4 font-semibold">Payment</th>
                        <th className="py-3 px-4 font-semibold">Printer & Device</th>
                        <th className="py-3 px-4 font-semibold">Status</th>
                        <th className="py-3 px-4 font-semibold text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--line)] text-[13px]">
                      {queueItems.map((item) => {
                        const statusMeta = getJobStatusMeta(item.status);
                        const payMeta = getPaymentStatusMeta(item.paymentStatus);
                        const devMeta = getDeviceStatusMeta(item.deviceOnlineStatus);
                        return (
                          <tr key={item.jobId} className="hover:bg-[var(--glass-hi)]">
                            <td className="py-3 px-4 font-bold tabular-nums">
                              {item.queuePosition !== null ? `#${item.queuePosition}` : '—'}
                            </td>
                            <td className="py-3 px-4">
                              <div className="font-bold">{item.jobNumber}</div>
                              <div className="text-[12px] text-[var(--muted)]">
                                {item.customerName || 'Walk-in'} ·{' '}
                                {formatDateTime(item.approvedAt ?? item.submittedAt ?? item.createdAt)}
                              </div>
                            </td>
                            <td className="py-3 px-4">
                              <div>
                                {item.paperSize} · {item.printMode === 'colour' ? 'Colour' : 'B&W'} ·{' '}
                                {item.printSides}
                              </div>
                              <div className="text-[12px] text-[var(--muted)] tabular-nums">
                                {item.totalPhysicalSheets} physical sheets ({item.copies} copy)
                              </div>
                            </td>
                            <td className="py-3 px-4">
                              <span
                                className="px-2 py-0.5 rounded-full text-[11px] font-semibold"
                                style={{ color: payMeta.colorVar, background: payMeta.bgVar }}
                              >
                                {payMeta.label}
                              </span>
                              <div className="text-[12px] font-semibold mt-1 tabular-nums">
                                {formatCurrencyInr(item.finalAmount)}
                              </div>
                            </td>
                            <td className="py-3 px-4">
                              <div className="font-medium">
                                {item.assignedPrinterName || 'Unassigned'}
                              </div>
                              {item.deviceName ? (
                                <span
                                  className="inline-block mt-1 px-2 py-0.5 rounded-full text-[10.5px] font-semibold"
                                  style={{ color: devMeta.colorVar, background: devMeta.bgVar }}
                                >
                                  {item.deviceName}: {devMeta.label}
                                </span>
                              ) : (
                                <div className="text-[11.5px] text-[var(--muted)]">
                                  No Windows Agent bound
                                </div>
                              )}
                            </td>
                            <td className="py-3 px-4">
                              <span
                                className="px-2.5 py-0.5 rounded-full text-[11.5px] font-semibold"
                                style={{ color: statusMeta.colorVar, background: statusMeta.bgVar }}
                              >
                                {statusMeta.label}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-right space-x-1.5 whitespace-nowrap">
                              <button
                                type="button"
                                onClick={() => openJobDetail(item.jobId)}
                                className="btn-ghost px-3 py-1.5 rounded-[10px] text-[12px] font-semibold cursor-pointer"
                              >
                                Manage
                              </button>
                              {item.status === 'queued' && (
                                <button
                                  type="button"
                                  disabled={actionBusy}
                                  onClick={() =>
                                    setConfirmConfig({
                                      title: `Cancel Queued Job ${item.jobNumber}`,
                                      description:
                                        'Remove this job from the active Print Queue before it is claimed by an agent.',
                                      confirmLabel: 'Remove & Cancel',
                                      tone: 'danger',
                                      requireReason: true,
                                      reasonLabel: 'Cancellation Reason',
                                      onConfirm: async (reason) => {
                                        await executeProtectedAction(async () => {
                                          await invokeAdminEdgeFunction('admin-review-print-job', {
                                            jobId: item.jobId,
                                            action: 'cancel',
                                            reason,
                                          });
                                          showToast(`Queued job ${item.jobNumber} cancelled.`, 'good');
                                        });
                                      },
                                    })
                                  }
                                  className="px-3 py-1.5 rounded-[10px] text-[12px] font-semibold bg-[var(--bad-soft)] text-[var(--bad)] cursor-pointer"
                                >
                                  Cancel
                                </button>
                              )}
                              {canAdminRetryOrReconcileJob({ status: item.status }) && (
                                <button
                                  type="button"
                                  disabled={actionBusy || !item.assignedPrinterId}
                                  onClick={() =>
                                    setConfirmConfig({
                                      title: `Retry Failed Job ${item.jobNumber}`,
                                      description:
                                        'Requeue this job back onto its assigned printer with an audit reason.',
                                      confirmLabel: 'Retry Job',
                                      tone: 'warn',
                                      requireReason: true,
                                      reasonLabel: 'Retry Reason',
                                      onConfirm: async (reason) => {
                                        await executeProtectedAction(async () => {
                                          await invokeAdminEdgeFunction('admin-retry-print-job', {
                                            jobId: item.jobId,
                                            action: 'retry',
                                            printerId: item.assignedPrinterId,
                                            reason,
                                          });
                                          showToast(`Job ${item.jobNumber} requeued.`, 'good');
                                        });
                                      },
                                    })
                                  }
                                  className="px-3 py-1.5 rounded-[10px] text-[12px] font-semibold bg-[var(--warn-soft)] text-[var(--warn)] cursor-pointer disabled:opacity-40"
                                >
                                  Retry
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>
        )}

        {/* ================================================================
            PRINT AGENT DEVICES & PRINTER BINDINGS (SHOWN IN OVERVIEW & /devices)
           ================================================================ */}
        {(activeTab === 'overview' || activeTab === 'devices') && (
          <div className="space-y-4 pt-1">
            {!hasAnyOnlineDevice && (
              <div className="rounded-[18px] p-4 bg-[var(--warn-soft)] border border-[var(--warn)]/30 text-[var(--warn)] flex items-start gap-3 text-[13px]">
                <AlertTriangle size={18} className="shrink-0 mt-0.5" />
                <div>
                  <div className="font-bold">Windows Local Print Agent Installation Pending</div>
                  <p className="mt-0.5">
                    No active Print Agent device has reported a live heartbeat within the last 90 seconds. Online/offline status strictly reflects real `last_heartbeat_at` telemetry and is never simulated.
                  </p>
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-[17px] font-bold">Registered Shop PCs & Print Agent Devices</h2>
                <p className="text-[12.5px] text-[var(--muted)]">
                  Manage PC credentials, heartbeat status, linked printers, and safe Pause / Revoke lifecycle controls.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setEnrollResult(null);
                    setEnrollOpen(true);
                  }}
                  className="btn-primary px-4 py-2 rounded-full text-[13px] font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Plus size={15} />
                  <span>Enroll Shop PC</span>
                </button>
                <button
                  type="button"
                  onClick={() => navigate('#/hardware/printers')}
                  className="btn-ghost px-3.5 py-2 rounded-full text-[13px] font-medium inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <ExternalLink size={14} />
                  <span>Manage Printers</span>
                </button>
              </div>
            </div>

            {devices.length === 0 ? (
              <div className="glass-pane rounded-[22px] p-10 text-center space-y-2">
                <Laptop size={28} className="mx-auto text-[var(--muted)]" />
                <div className="text-[15px] font-semibold">No Print Agent Devices Enrolled</div>
                <p className="text-[13px] text-[var(--muted)] max-w-[480px] mx-auto">
                  When ready for Phase 5–7 Windows Agent deployment, enroll your shop PC here to issue a one-time hashed device credential.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {devices.map((dev) => {
                  const statusMeta = getDeviceStatusMeta(dev.onlineStatus);
                  const boundPrinters = printers.filter(
                    (p) => p.device_id === dev.id && !p.archived_at
                  );
                  return (
                    <div
                      key={dev.id}
                      className="glass-pane rounded-[22px] p-5 space-y-3 border border-[var(--line)]"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <Laptop size={16} className="text-[var(--accent-text)] shrink-0" />
                            <h3 className="text-[15.5px] font-bold truncate">{dev.device_name}</h3>
                          </div>
                          <div className="text-[11.5px] font-mono text-[var(--muted)] mt-1 truncate">
                            Device ID: {dev.id}
                          </div>
                        </div>
                        <span
                          className="px-2.5 py-1 rounded-full text-[11px] font-semibold shrink-0"
                          style={{ color: statusMeta.colorVar, background: statusMeta.bgVar }}
                        >
                          {statusMeta.label}
                        </span>
                      </div>

                      <dl className="grid grid-cols-2 gap-y-1.5 text-[12.5px] pt-1 border-t border-[var(--line)]">
                        <dt className="text-[var(--muted)]">Last Heartbeat</dt>
                        <dd className="text-right font-medium">
                          {dev.last_heartbeat_at
                            ? formatDateTime(dev.last_heartbeat_at)
                            : 'Never connected'}
                        </dd>
                        <dt className="text-[var(--muted)]">OS / Agent Version</dt>
                        <dd className="text-right font-medium">
                          {dev.os_version || 'Unknown OS'} · {dev.agent_version || 'Pending Agent'}
                        </dd>
                        <dt className="text-[var(--muted)]">Credential Status</dt>
                        <dd className="text-right font-medium capitalize">{dev.device_status}</dd>
                      </dl>

                      <div className="rounded-[12px] p-3 bg-[var(--card-2)] border border-[var(--line)] space-y-1">
                        <div className="text-[11.5px] font-semibold uppercase tracking-[0.06em] text-[var(--muted)]">
                          Bound Printers ({boundPrinters.length})
                        </div>
                        {boundPrinters.length === 0 ? (
                          <div className="text-[12px] text-[var(--muted)]">
                            No printers assigned to this PC yet.
                          </div>
                        ) : (
                          <ul className="space-y-1 text-[12.5px]">
                            {boundPrinters.map((bp) => (
                              <li key={bp.id} className="flex items-center justify-between">
                                <span className="font-medium">{bp.printer_name}</span>
                                <span className="text-[11.5px] text-[var(--muted)]">
                                  {bp.is_enabled ? bp.printer_status : 'Disabled'}
                                </span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        {dev.device_status !== 'active' && dev.device_status !== 'revoked' && (
                          <button
                            type="button"
                            disabled={actionBusy}
                            onClick={() =>
                              setConfirmConfig({
                                title: `Activate Device "${dev.device_name}"`,
                                description:
                                  'Allow this PC credential to send heartbeats and claim queued jobs for its assigned printers.',
                                confirmLabel: 'Activate Device',
                                tone: 'primary',
                                onConfirm: async () => {
                                  await executeProtectedAction(async () => {
                                    await invokeAdminEdgeFunction('admin-print-jobs', {
                                      action: 'device_action',
                                      deviceId: dev.id,
                                      deviceAction: 'activate',
                                    });
                                    showToast(`Device "${dev.device_name}" activated.`, 'good');
                                  });
                                },
                              })
                            }
                            className="btn-primary px-3 py-1.5 rounded-[10px] text-[12px] font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                          >
                            <PlayCircle size={13} />
                            <span>Activate</span>
                          </button>
                        )}

                        {dev.device_status === 'active' && (
                          <button
                            type="button"
                            disabled={actionBusy}
                            onClick={() =>
                              setConfirmConfig({
                                title: `Pause Device "${dev.device_name}"`,
                                description:
                                  'Temporarily block this PC from claiming new print jobs until reactivated.',
                                confirmLabel: 'Pause Device',
                                tone: 'warn',
                                onConfirm: async () => {
                                  await executeProtectedAction(async () => {
                                    await invokeAdminEdgeFunction('admin-print-jobs', {
                                      action: 'device_action',
                                      deviceId: dev.id,
                                      deviceAction: 'pause',
                                    });
                                    showToast(`Device "${dev.device_name}" paused.`, 'good');
                                  });
                                },
                              })
                            }
                            className="px-3 py-1.5 rounded-[10px] text-[12px] font-semibold bg-[var(--warn-soft)] text-[var(--warn)] inline-flex items-center gap-1.5 cursor-pointer"
                          >
                            <PauseCircle size={13} />
                            <span>Pause</span>
                          </button>
                        )}

                        {dev.device_status !== 'revoked' && (
                          <button
                            type="button"
                            disabled={actionBusy}
                            onClick={() =>
                              setConfirmConfig({
                                title: `Permanently Revoke "${dev.device_name}"`,
                                description:
                                  'Revoking permanently invalidates this PC credential and cannot be undone. Enroll a new credential to reconnect later.',
                                confirmLabel: 'Revoke Credential',
                                tone: 'danger',
                                requireReason: true,
                                reasonLabel: 'Revocation Reason',
                                onConfirm: async (reason) => {
                                  await executeProtectedAction(async () => {
                                    await invokeAdminEdgeFunction('admin-print-jobs', {
                                      action: 'device_action',
                                      deviceId: dev.id,
                                      deviceAction: 'revoke',
                                      reason,
                                    });
                                    showToast(`Device "${dev.device_name}" revoked.`, 'good');
                                  });
                                },
                              })
                            }
                            className="px-3 py-1.5 rounded-[10px] text-[12px] font-semibold bg-[var(--bad-soft)] text-[var(--bad)] inline-flex items-center gap-1.5 cursor-pointer"
                          >
                            <ShieldOff size={13} />
                            <span>Revoke</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ================================================================
            TAB 4: PAYMENT VERIFICATION (UPI QUEUE & CASH COUNTER)
           ================================================================ */}
        {activeTab === 'payments' && (
          <div className="space-y-5">
            {/* Phase 12 Daily Shift Financial Closeout & Reconciliation */}
            <section className="glass-pane rounded-[22px] p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-[17px] font-bold flex items-center gap-2">
                    <IndianRupee size={17} className="text-[var(--good)]" />
                    <span>Daily Shift Financial Closeout</span>
                  </h2>
                  <p className="text-[12.5px] text-[var(--muted)]">
                    Authoritative server ledger totals across all verified UPI, Counter Cash, pending claims, and completed physical sheets for the selected date.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <label htmlFor="reconciliation-date-input" className="sr-only">
                    Reconciliation Date
                  </label>
                  <input
                    id="reconciliation-date-input"
                    type="date"
                    value={reconciliationDate}
                    onChange={(e) => {
                      if (e.target.value) setReconciliationDate(e.target.value);
                    }}
                    className="rounded-[10px] bg-[var(--card-2)] border border-[var(--line)] px-2.5 py-1.5 text-[12.5px]"
                  />
                  <button
                    type="button"
                    disabled={exportingCsv}
                    onClick={() => void handleExportLedgerCsv(reconciliationDate)}
                    className="btn-ghost px-3 py-1.5 rounded-[10px] text-[12px] font-semibold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <Download size={13} />
                    <span>{exportingCsv ? 'Exporting...' : 'Export Shift CSV'}</span>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="rounded-[14px] p-3.5 bg-[var(--card-2)] border border-[var(--line)] space-y-1">
                  <div className="text-[11.5px] font-semibold text-[var(--muted)]">
                    Confirmed Total ({dailyReconciliation?.dateIso ?? reconciliationDate})
                  </div>
                  <div className="text-[20px] font-bold text-[var(--good)] tabular-nums">
                    {formatCurrencyInr(dailyReconciliation?.confirmedTotalInr ?? 0)}
                  </div>
                  <div className="text-[11.5px] text-[var(--muted)] tabular-nums">
                    {dailyReconciliation?.confirmedPaidCount ?? 0} verified paid txn(s)
                  </div>
                </div>

                <div className="rounded-[14px] p-3.5 bg-[var(--card-2)] border border-[var(--line)] space-y-1">
                  <div className="text-[11.5px] font-semibold text-[var(--muted)]">
                    UPI vs Cash Drawer Split
                  </div>
                  <div className="text-[14px] font-bold tabular-nums">
                    UPI {formatCurrencyInr(dailyReconciliation?.upiConfirmedInr ?? 0)}
                  </div>
                  <div className="text-[13px] font-semibold text-[var(--ink-2)] tabular-nums">
                    Cash {formatCurrencyInr(dailyReconciliation?.cashConfirmedInr ?? 0)}
                  </div>
                </div>

                <div className="rounded-[14px] p-3.5 bg-[var(--card-2)] border border-[var(--line)] space-y-1">
                  <div className="text-[11.5px] font-semibold text-[var(--muted)]">
                    Pending & Counter Exposure
                  </div>
                  <div className="text-[14px] font-bold text-[var(--warn)] tabular-nums">
                    {formatCurrencyInr(
                      (dailyReconciliation?.pendingVerificationInr ?? 0) +
                        (dailyReconciliation?.unpaidCounterExposureInr ?? 0)
                    )}
                  </div>
                  <div className="text-[11.5px] text-[var(--muted)] tabular-nums">
                    {dailyReconciliation?.pendingVerificationCount ?? 0} UPI pending ·{' '}
                    {dailyReconciliation?.unpaidCounterExposureCount ?? 0} cash unpaid
                  </div>
                </div>

                <div className="rounded-[14px] p-3.5 bg-[var(--card-2)] border border-[var(--line)] space-y-1">
                  <div className="text-[11.5px] font-semibold text-[var(--muted)]">
                    Shift Output & Sheets
                  </div>
                  <div className="text-[20px] font-bold tabular-nums">
                    {dailyReconciliation?.completedPhysicalSheets ?? 0} sheets
                  </div>
                  <div className="text-[11.5px] text-[var(--muted)] tabular-nums">
                    {dailyReconciliation?.completedJobsCount ?? 0}/
                    {dailyReconciliation?.submittedJobsCount ?? 0} completed ·{' '}
                    {dailyReconciliation?.duplexJobsCount ?? 0} duplex
                  </div>
                </div>
              </div>
            </section>

            {/* Section A: Pending UPI Verifications */}
            <section className="glass-pane rounded-[22px] p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-[17px] font-bold flex items-center gap-2">
                    <QrCode size={17} className="text-[var(--info)]" />
                    <span>UPI Payment Verification Queue ({paymentVerifications.length})</span>
                  </h2>
                  <p className="text-[12.5px] text-[var(--muted)]">
                    Inspect customer UTR references & payment screenshots. Approving UPI automatically marks the job Paid and qualifies it for the Print Queue.
                  </p>
                </div>
              </div>

              {paymentVerifications.length === 0 ? (
                <div className="rounded-[16px] p-6 bg-[var(--card-2)] border border-[var(--line)] text-center space-y-1">
                  <CheckCircle2 size={22} className="mx-auto text-[var(--good)]" />
                  <div className="text-[14px] font-semibold">No Pending UPI Verifications</div>
                  <p className="text-[12.5px] text-[var(--muted)]">
                    Customer UPI claims submitted with a 12-digit UTR & payment screenshot will appear here.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {paymentVerifications.map((item) => {
                    const chosenPrinter =
                      verifyPrinterChoice[item.id] ?? (eligiblePrinters[0]?.id ?? '');
                    return (
                      <div
                        key={item.id}
                        className="rounded-[16px] p-4 bg-[var(--card-2)] border border-[var(--line)] flex flex-col lg:flex-row lg:items-center justify-between gap-4"
                      >
                        <div className="flex flex-col sm:flex-row sm:items-start gap-3.5 min-w-0">
                          {item.screenshotSignedUrl ? (
                            <a
                              href={item.screenshotSignedUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              title="Open UPI screenshot in full size"
                              className="shrink-0"
                            >
                              <img
                                src={item.screenshotSignedUrl}
                                alt={`UPI screenshot for ${item.job_number}`}
                                className="w-20 h-20 object-cover rounded-[12px] border border-[var(--line)] bg-white"
                              />
                            </a>
                          ) : (
                            <div className="w-20 h-20 rounded-[12px] border border-dashed border-[var(--line)] flex items-center justify-center text-[11px] text-[var(--muted)] shrink-0 text-center px-1">
                              No screenshot
                            </div>
                          )}

                          <div className="space-y-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-bold text-[14px]">{item.job_number}</span>
                              <span className="text-[13px] font-semibold text-[var(--accent-text)] tabular-nums">
                                {formatCurrencyInr(item.amount)}
                              </span>
                              <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-[var(--info-soft)] text-[var(--info)]">
                                UPI Pending Verify
                              </span>
                            </div>
                            <div className="text-[12.5px] text-[var(--ink-2)]">
                              {item.customer_name || 'Walk-in Customer'}
                              {item.customer_phone ? ` · ${item.customer_phone}` : ''}
                              {' · '}
                              {item.paper_size} · {item.print_mode === 'colour' ? 'Colour' : 'B&W'} ·{' '}
                              {item.print_sides === 'duplex' ? 'Duplex' : 'Single'} × {item.copies}
                            </div>
                            <div className="text-[12px] font-mono text-[var(--ink)]">
                              UTR / Ref: {item.transaction_reference || 'Not provided'}
                            </div>
                            <div className="text-[11.5px] text-[var(--muted)]">
                              Submitted {formatDateTime(item.submitted_at ?? item.created_at)}
                            </div>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 shrink-0">
                          <select
                            aria-label={`Select optional auto-release printer for ${item.job_number}`}
                            value={chosenPrinter}
                            onChange={(e) =>
                              setVerifyPrinterChoice((prev) => ({
                                ...prev,
                                [item.id]: e.target.value,
                              }))
                            }
                            disabled={actionBusy}
                            className="rounded-[10px] bg-[var(--card-1)] border border-[var(--line)] px-2.5 py-1.5 text-[12px]"
                          >
                            <option value="">Qualify only (assign printer later)</option>
                            {eligiblePrinters.map((p) => (
                              <option key={p.id} value={p.id}>
                                Auto-release: {p.printer_name}
                              </option>
                            ))}
                          </select>

                          <button
                            type="button"
                            disabled={actionBusy}
                            onClick={() =>
                              setConfirmConfig({
                                title: `Verify UPI Payment for ${item.job_number}`,
                                description: chosenPrinter
                                  ? `Confirm ${formatCurrencyInr(item.amount)} UPI receipt (UTR: ${
                                      item.transaction_reference || 'N/A'
                                    })? This will mark the job Paid, Approved, and immediately release it to the selected printer queue.`
                                  : `Confirm ${formatCurrencyInr(item.amount)} UPI receipt (UTR: ${
                                      item.transaction_reference || 'N/A'
                                    })? This will mark the job Paid and Approved.`,
                                confirmLabel: chosenPrinter ? 'Verify & Release' : 'Verify UPI',
                                tone: 'primary',
                                onConfirm: async () => {
                                  await executeProtectedAction(async () => {
                                    await invokeAdminEdgeFunction('admin-verify-payment', {
                                      paymentId: item.id,
                                      decision: 'approve',
                                      ...(chosenPrinter ? { printerId: chosenPrinter } : {}),
                                    });
                                    showToast(`UPI verified for ${item.job_number}.`, 'good');
                                  });
                                },
                              })
                            }
                            className="btn-primary px-3 py-1.5 rounded-[10px] text-[12px] font-semibold cursor-pointer disabled:opacity-50"
                          >
                            {chosenPrinter ? 'Verify & Release' : 'Verify UPI'}
                          </button>

                          <button
                            type="button"
                            disabled={actionBusy}
                            onClick={() =>
                              setConfirmConfig({
                                title: `Reject UPI Claim for ${item.job_number}`,
                                description:
                                  'Reset payment_status to unpaid so the customer can re-submit a valid UTR or pay cash at the counter.',
                                confirmLabel: 'Reject UPI',
                                tone: 'danger',
                                requireReason: true,
                                reasonLabel: 'Rejection Reason',
                                reasonPlaceholder: 'e.g., UTR not matched / blurry screenshot',
                                onConfirm: async (reason) => {
                                  await executeProtectedAction(async () => {
                                    await invokeAdminEdgeFunction('admin-verify-payment', {
                                      paymentId: item.id,
                                      decision: 'reject',
                                      reason,
                                    });
                                    showToast(`UPI claim rejected for ${item.job_number}.`, 'good');
                                  });
                                },
                              })
                            }
                            className="px-3 py-1.5 rounded-[10px] text-[12px] font-semibold bg-[var(--bad-soft)] text-[var(--bad)] cursor-pointer disabled:opacity-50"
                          >
                            Reject
                          </button>

                          <button
                            type="button"
                            onClick={() => openJobDetail(item.job_id)}
                            className="btn-ghost px-3 py-1.5 rounded-[10px] text-[12px] font-medium cursor-pointer"
                          >
                            Inspect
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            {/* Section B: Counter Cash Payment Settlement & Explicit Approval */}
            <section className="glass-pane rounded-[22px] p-5 space-y-4">
              <div>
                <h2 className="text-[17px] font-bold flex items-center gap-2">
                  <Banknote size={17} className="text-[var(--good)]" />
                  <span>Counter Cash & Unpaid Jobs ({cashPendingJobs.length})</span>
                </h2>
                <p className="text-[12.5px] text-[var(--muted)]">
                  Cash orders require explicit Admin <strong>Confirm Cash Received</strong> and explicit <strong>Approve Job</strong> before queue release.
                </p>
              </div>

              {cashPendingJobs.length === 0 ? (
                <div className="rounded-[16px] p-6 bg-[var(--card-2)] border border-[var(--line)] text-center text-[13px] text-[var(--muted)]">
                  No unpaid cash jobs waiting at the counter.
                </div>
              ) : (
                <div className="space-y-2.5">
                  {cashPendingJobs.map((job) => {
                    const statusMeta = getJobStatusMeta(job.status);
                    return (
                      <div
                        key={job.id}
                        className="rounded-[14px] p-3.5 bg-[var(--card-2)] border border-[var(--line)] flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                      >
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-bold text-[13.5px]">{job.job_number}</span>
                            <span className="font-semibold text-[13px] tabular-nums text-[var(--accent-text)]">
                              {formatCurrencyInr(job.final_amount)}
                            </span>
                            <span
                              className="px-2 py-0.5 rounded-full text-[11px] font-semibold"
                              style={{ color: statusMeta.colorVar, background: statusMeta.bgVar }}
                            >
                              {statusMeta.label}
                            </span>
                          </div>
                          <div className="text-[12px] text-[var(--muted)] mt-0.5">
                            {job.customer_name || 'Walk-in Customer'}
                            {job.customer_phone ? ` · ${job.customer_phone}` : ''}
                            {' · '}
                            {job.paper_size} · {job.print_mode === 'colour' ? 'Colour' : 'B&W'} ·{' '}
                            {job.print_sides} × {job.copies}
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 shrink-0">
                          {job.final_amount !== null && (
                            <button
                              type="button"
                              disabled={actionBusy}
                              onClick={() =>
                                setConfirmConfig({
                                  title: `Confirm Cash Received for ${job.job_number}`,
                                  description: `Record ${formatCurrencyInr(
                                    job.final_amount
                                  )} cash payment received at counter?`,
                                  confirmLabel: 'Confirm Cash Paid',
                                  tone: 'primary',
                                  onConfirm: async () => {
                                    await executeProtectedAction(async () => {
                                      await invokeAdminEdgeFunction('admin-confirm-cash', {
                                        jobId: job.id,
                                      });
                                      showToast(`Cash payment confirmed for ${job.job_number}.`, 'good');
                                    });
                                  },
                                })
                              }
                              className="btn-primary px-3 py-1.5 rounded-[10px] text-[12px] font-semibold cursor-pointer disabled:opacity-50"
                            >
                              Confirm Cash
                            </button>
                          )}

                          {canAdminApproveCashJob(job) && (
                            <button
                              type="button"
                              disabled={actionBusy}
                              onClick={() =>
                                setConfirmConfig({
                                  title: `Approve Print Job ${job.job_number}`,
                                  description:
                                    'Explicitly approve this job for queue eligibility once counter payment is verified.',
                                  confirmLabel: 'Approve Job',
                                  tone: 'primary',
                                  onConfirm: async () => {
                                    await executeProtectedAction(async () => {
                                      await invokeAdminEdgeFunction('admin-review-print-job', {
                                        jobId: job.id,
                                        action: 'approve',
                                      });
                                      showToast(`Job ${job.job_number} approved.`, 'good');
                                    });
                                  },
                                })
                              }
                              className="btn-ghost px-3 py-1.5 rounded-[10px] text-[12px] font-semibold cursor-pointer disabled:opacity-50"
                            >
                              Approve Job
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => openJobDetail(job.id)}
                            className="btn-ghost px-3 py-1.5 rounded-[10px] text-[12px] font-medium cursor-pointer"
                          >
                            Inspect
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
        )}

        {/* ================================================================
            TAB 5: PRICING RULES MANAGEMENT
           ================================================================ */}
        {activeTab === 'pricing' && (
          <section className="glass-pane rounded-[22px] p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-[17px] font-bold">Configured Print Pricing Rules</h2>
                <p className="text-[12.5px] text-[var(--muted)]">
                  Authoritative server rates. Duplex rules strictly bill <strong>per_physical_sheet</strong> (ceil(pages/2)). Only one rule may be active per Paper Size + Mode + Sides tuple.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setRuleDraft(createEmptyPricingRuleDraft());
                  setRuleEditorOpen(true);
                }}
                className="btn-primary px-3.5 py-2 rounded-full text-[12.5px] font-semibold inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Plus size={14} />
                <span>Add Pricing Rule</span>
              </button>
            </div>

            {ruleEditorOpen && (
              <form
                onSubmit={handleSavePricingRule}
                className="rounded-[18px] p-4 bg-[var(--card-2)] border border-[var(--line)] space-y-3"
              >
                <div className="flex items-center justify-between">
                  <div className="text-[14px] font-bold">
                    {ruleDraft.ruleId ? 'Edit Pricing Rule' : 'New Pricing Rule'}
                  </div>
                  <button
                    type="button"
                    onClick={() => setRuleEditorOpen(false)}
                    className="text-[var(--muted)] hover:text-[var(--ink)] cursor-pointer"
                    aria-label="Close pricing rule form"
                  >
                    <X size={16} />
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  <div className="sm:col-span-2 lg:col-span-3">
                    <label htmlFor="rule-name-input" className="block text-[12px] font-semibold mb-1">
                      Rule Name
                    </label>
                    <input
                      id="rule-name-input"
                      type="text"
                      value={ruleDraft.ruleName}
                      onChange={(e) =>
                        setRuleDraft((d) => ({ ...d, ruleName: e.target.value }))
                      }
                      placeholder="e.g., A4 B&W Duplex Standard"
                      className="w-full rounded-[11px] bg-[var(--card-1)] border border-[var(--line)] px-3 py-2 text-[13px]"
                    />
                  </div>

                  <div>
                    <label htmlFor="rule-paper-select" className="block text-[12px] font-semibold mb-1">
                      Paper Size
                    </label>
                    <select
                      id="rule-paper-select"
                      value={ruleDraft.paperSize}
                      onChange={(e) =>
                        setRuleDraft((d) => ({ ...d, paperSize: e.target.value as PaperSize }))
                      }
                      className="w-full rounded-[11px] bg-[var(--card-1)] border border-[var(--line)] px-3 py-2 text-[13px]"
                    >
                      <option value="A4">A4</option>
                      <option value="A3">A3</option>
                      <option value="Legal">Legal</option>
                    </select>
                  </div>

                  <div>
                    <label htmlFor="rule-mode-select" className="block text-[12px] font-semibold mb-1">
                      Print Mode
                    </label>
                    <select
                      id="rule-mode-select"
                      value={ruleDraft.printMode}
                      onChange={(e) =>
                        setRuleDraft((d) => ({ ...d, printMode: e.target.value as PrintMode }))
                      }
                      className="w-full rounded-[11px] bg-[var(--card-1)] border border-[var(--line)] px-3 py-2 text-[13px]"
                    >
                      <option value="bw">Black & White</option>
                      <option value="colour">Colour</option>
                    </select>
                  </div>

                  <div>
                    <label htmlFor="rule-sides-select" className="block text-[12px] font-semibold mb-1">
                      Print Sides
                    </label>
                    <select
                      id="rule-sides-select"
                      value={ruleDraft.printSides}
                      onChange={(e) => {
                        const nextSides = e.target.value as PrintSides;
                        setRuleDraft((d) => ({
                          ...d,
                          printSides: nextSides,
                          pricingUnit:
                            nextSides === 'duplex' ? 'per_physical_sheet' : d.pricingUnit,
                        }));
                      }}
                      className="w-full rounded-[11px] bg-[var(--card-1)] border border-[var(--line)] px-3 py-2 text-[13px]"
                    >
                      <option value="single">Single-Sided</option>
                      <option value="duplex">Duplex (Double-Sided)</option>
                    </select>
                  </div>

                  <div>
                    <label htmlFor="rule-unit-select" className="block text-[12px] font-semibold mb-1">
                      Billing Unit
                    </label>
                    <select
                      id="rule-unit-select"
                      value={ruleDraft.pricingUnit}
                      disabled={ruleDraft.printSides === 'duplex'}
                      onChange={(e) =>
                        setRuleDraft((d) => ({
                          ...d,
                          pricingUnit: e.target.value as PricingUnit,
                        }))
                      }
                      className="w-full rounded-[11px] bg-[var(--card-1)] border border-[var(--line)] px-3 py-2 text-[13px] disabled:opacity-65"
                    >
                      <option value="per_printed_page">Per Printed Page</option>
                      <option value="per_physical_sheet">Per Physical Sheet</option>
                    </select>
                    {ruleDraft.printSides === 'duplex' && (
                      <div className="text-[11px] text-[var(--info)] mt-1">
                        Locked to Per Physical Sheet for Duplex accuracy.
                      </div>
                    )}
                  </div>

                  <div>
                    <label htmlFor="rule-rate-input" className="block text-[12px] font-semibold mb-1">
                      Rate (₹ INR)
                    </label>
                    <input
                      id="rule-rate-input"
                      type="number"
                      min="0"
                      step="0.01"
                      value={ruleDraft.rate}
                      onChange={(e) =>
                        setRuleDraft((d) => ({ ...d, rate: e.target.value }))
                      }
                      placeholder="Set rate by shop owner"
                      className="w-full rounded-[11px] bg-[var(--card-1)] border border-[var(--line)] px-3 py-2 text-[13px]"
                    />
                  </div>

                  <div>
                    <label htmlFor="rule-min-input" className="block text-[12px] font-semibold mb-1">
                      Minimum Charge (₹ INR)
                    </label>
                    <input
                      id="rule-min-input"
                      type="number"
                      min="0"
                      step="0.01"
                      value={ruleDraft.minimumCharge}
                      onChange={(e) =>
                        setRuleDraft((d) => ({ ...d, minimumCharge: e.target.value }))
                      }
                      className="w-full rounded-[11px] bg-[var(--card-1)] border border-[var(--line)] px-3 py-2 text-[13px]"
                    />
                  </div>

                  <div>
                    <label htmlFor="rule-valid-from" className="block text-[12px] font-semibold mb-1">
                      Valid From (Optional)
                    </label>
                    <input
                      id="rule-valid-from"
                      type="datetime-local"
                      value={ruleDraft.validFrom}
                      onChange={(e) =>
                        setRuleDraft((d) => ({ ...d, validFrom: e.target.value }))
                      }
                      className="w-full rounded-[11px] bg-[var(--card-1)] border border-[var(--line)] px-3 py-2 text-[13px]"
                    />
                  </div>

                  <div>
                    <label htmlFor="rule-valid-until" className="block text-[12px] font-semibold mb-1">
                      Valid Until (Optional)
                    </label>
                    <input
                      id="rule-valid-until"
                      type="datetime-local"
                      value={ruleDraft.validUntil}
                      onChange={(e) =>
                        setRuleDraft((d) => ({ ...d, validUntil: e.target.value }))
                      }
                      className="w-full rounded-[11px] bg-[var(--card-1)] border border-[var(--line)] px-3 py-2 text-[13px]"
                    />
                  </div>
                </div>

                <label className="inline-flex items-center gap-2 text-[13px] font-medium cursor-pointer">
                  <input
                    type="checkbox"
                    checked={ruleDraft.isActive}
                    onChange={(e) =>
                      setRuleDraft((d) => ({ ...d, isActive: e.target.checked }))
                    }
                  />
                  <span>Rule Active (automatically supersedes any older active rule for this combination)</span>
                </label>

                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setRuleEditorOpen(false)}
                    className="btn-ghost px-3.5 py-1.5 rounded-[10px] text-[12.5px] cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={actionBusy}
                    className="btn-primary px-4 py-1.5 rounded-[10px] text-[12.5px] font-semibold cursor-pointer disabled:opacity-50"
                  >
                    Save Rule
                  </button>
                </div>
              </form>
            )}

            {pricingRules.length === 0 ? (
              <div className="rounded-[16px] p-6 bg-[var(--warn-soft)] border border-[var(--warn)]/25 text-center space-y-1.5">
                <Sliders size={22} className="mx-auto text-[var(--warn)]" />
                <div className="text-[14px] font-semibold">No Pricing Rules Configured</div>
                <p className="text-[12.5px] text-[var(--ink-2)] max-w-[540px] mx-auto">
                  No default prices are ever fabricated. Configure real shop prices per paper size, colour mode, and sides before customers submit jobs.
                </p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {pricingRules.map((rule) => (
                  <div
                    key={rule.id}
                    className="rounded-[14px] p-3.5 bg-[var(--card-2)] border border-[var(--line)] flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-bold text-[13.5px]">{rule.rule_name}</span>
                        <span
                          className="px-2 py-0.5 rounded-full text-[11px] font-semibold"
                          style={{
                            color: rule.is_active ? 'var(--good)' : 'var(--muted)',
                            background: rule.is_active ? 'var(--good-soft)' : 'var(--card-1)',
                          }}
                        >
                          {rule.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                      <div className="text-[12px] text-[var(--ink-2)] mt-0.5">
                        {rule.paper_size} · {rule.print_mode === 'colour' ? 'Colour' : 'B&W'} ·{' '}
                        {rule.print_sides === 'duplex' ? 'Duplex' : 'Single'} ·{' '}
                        <span className="font-semibold text-[var(--ink)]">
                          {formatCurrencyInr(rule.rate)}
                        </span>{' '}
                        /{' '}
                        {rule.pricing_unit === 'per_physical_sheet' ? 'physical sheet' : 'page'}{' '}
                        (min {formatCurrencyInr(rule.minimum_charge)})
                      </div>
                      <div className="text-[11.5px] text-[var(--muted)] mt-0.5">
                        Valid from {formatDateTime(rule.valid_from)}
                        {rule.valid_until ? ` until ${formatDateTime(rule.valid_until)}` : ' (no expiry)'}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          setRuleDraft(pricingRuleToDraft(rule));
                          setRuleEditorOpen(true);
                        }}
                        className="btn-ghost px-3 py-1.5 rounded-[10px] text-[12px] font-medium inline-flex items-center gap-1 cursor-pointer"
                      >
                        <Edit3 size={13} />
                        <span>Edit</span>
                      </button>
                      <button
                        type="button"
                        disabled={actionBusy}
                        onClick={() =>
                          void executeProtectedAction(async () => {
                            await invokeAdminEdgeFunction('admin-print-jobs', {
                              action: 'pricing_toggle',
                              ruleId: rule.id,
                              isActive: !rule.is_active,
                            });
                            showToast(
                              `Rule ${rule.is_active ? 'deactivated' : 'activated'}.`,
                              'good'
                            );
                          })
                        }
                        className="btn-ghost px-3 py-1.5 rounded-[10px] text-[12px] font-medium cursor-pointer"
                      >
                        {rule.is_active ? 'Disable' : 'Activate'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* ================================================================
            TAB 6: SHOP UPI & QR PAYMENT SETTINGS
           ================================================================ */}
        {activeTab === 'upi' && (
          <section className="glass-pane rounded-[22px] p-5 max-w-[720px] space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-[17px] font-bold">Shop UPI & QR Payment Settings</h2>
                <p className="text-[12.5px] text-[var(--muted)]">
                  Displayed to customers on the Scan2Print payment page. QR image is stored privately in Supabase `payment-assets` and served via short-lived signed URLs.
                </p>
              </div>
              <span
                className="px-2.5 py-1 rounded-full text-[11.5px] font-semibold"
                style={{
                  color: paymentSettings?.upi_enabled ? 'var(--good)' : 'var(--warn)',
                  background: paymentSettings?.upi_enabled ? 'var(--good-soft)' : 'var(--warn-soft)',
                }}
              >
                {paymentSettings?.upi_enabled ? 'UPI Enabled' : 'UPI Disabled'}
              </span>
            </div>

            <form onSubmit={handleSavePaymentSettings} className="space-y-3.5">
              <div>
                <label htmlFor="upi-display-name" className="block text-[12px] font-semibold mb-1">
                  Counter / Shop Display Name
                </label>
                <input
                  id="upi-display-name"
                  type="text"
                  value={upiDisplayName}
                  onChange={(e) => setUpiDisplayName(e.target.value)}
                  className="w-full rounded-[11px] bg-[var(--card-2)] border border-[var(--line)] px-3 py-2 text-[13px]"
                />
              </div>

              <div>
                <label htmlFor="upi-id-input" className="block text-[12px] font-semibold mb-1">
                  Shop UPI ID (VPA)
                </label>
                <input
                  id="upi-id-input"
                  type="text"
                  value={upiId}
                  onChange={(e) => setUpiId(e.target.value)}
                  placeholder="e.g., amancomputer@upi"
                  className="w-full rounded-[11px] bg-[var(--card-2)] border border-[var(--line)] px-3 py-2 text-[13px] font-mono"
                />
              </div>

              <div>
                <label htmlFor="upi-instructions-input" className="block text-[12px] font-semibold mb-1">
                  Customer Payment Instructions
                </label>
                <textarea
                  id="upi-instructions-input"
                  rows={3}
                  value={upiInstructions}
                  onChange={(e) => setUpiInstructions(e.target.value)}
                  placeholder="Pay exact total and upload screenshot + 12-digit UTR..."
                  className="w-full rounded-[11px] bg-[var(--card-2)] border border-[var(--line)] px-3 py-2 text-[13px]"
                />
              </div>

              <label className="flex items-center gap-2 text-[13px] font-medium cursor-pointer">
                <input
                  type="checkbox"
                  checked={upiEnabled}
                  onChange={(e) => setUpiEnabled(e.target.checked)}
                />
                <span>Enable Customer UPI Payments</span>
              </label>

              <div className="rounded-[14px] p-3.5 bg-[var(--card-2)] border border-[var(--line)] space-y-2.5">
                <div className="flex items-center justify-between text-[12.5px] font-semibold">
                  <span>
                    Shop UPI QR Image{' '}
                    <span className="text-[11.5px] font-normal text-[var(--muted)]">
                      ({paymentSettings?.has_qr_configured ? 'Configured' : 'Not uploaded'})
                    </span>
                  </span>
                  {paymentSettings?.has_qr_configured && (
                    <button
                      type="button"
                      onClick={() => setUploadedQrStoragePath(null)}
                      className="text-[11.5px] text-[var(--bad)] hover:underline cursor-pointer"
                    >
                      Remove QR on Save
                    </button>
                  )}
                </div>

                {upiQrSignedUrl && uploadedQrStoragePath !== null && (
                  <img
                    src={upiQrSignedUrl}
                    alt="Shop UPI QR Code"
                    className="w-40 h-40 object-contain rounded-[10px] border border-[var(--line)] bg-white p-1"
                  />
                )}

                {uploadedQrStoragePath && (
                  <div className="text-[11.5px] text-[var(--good)] font-medium">
                    New QR image uploaded and staged. Save settings to publish.
                  </div>
                )}

                <label className="btn-ghost px-3 py-2 rounded-[10px] text-[12px] font-semibold inline-flex items-center gap-1.5 cursor-pointer">
                  <Upload size={13} />
                  <span>{qrUploading ? 'Uploading QR...' : 'Upload New UPI QR (PNG/JPG)'}</span>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    disabled={qrUploading}
                    onChange={handleQrFileChange}
                    className="sr-only"
                  />
                </label>
              </div>

              <button
                type="submit"
                disabled={actionBusy || qrUploading}
                className="btn-primary w-full py-2.5 rounded-[12px] text-[13px] font-semibold cursor-pointer disabled:opacity-50"
              >
                Save Payment Settings
              </button>
            </form>
          </section>
        )}

        {/* ================================================================
            TAB 7: PHASE 18 PAPER STOCK, SHIFT CASH TALLY & CLIENT KHATA
           ================================================================ */}
        {activeTab === 'counter-ops' && (
          <CounterOpsPanel
            onToast={(msg, tone) => showToast(msg, tone === 'bad' ? 'bad' : 'good')}
          />
        )}

        {/* ================================================================
            TAB 8: PHASE 19 WALK-IN POS, 300-DPI PHOTO STUDIO & PRINTER CARE
           ================================================================ */}
        {activeTab === 'walkin-pos' && (
          <WalkinPosPanel
            onToast={(msg, tone) => showToast(msg, tone === 'bad' ? 'bad' : 'good')}
          />
        )}

        {/* ================================================================
            TAB 9: PHASE 20 EXAM KB PREP, WASTAGE LOG & DAILY SHIFT CHECKLIST
           ================================================================ */}
        {activeTab === 'shop-tools' && (
          <ShopToolsPanel
            onToast={(msg, tone) => showToast(msg, tone === 'bad' ? 'bad' : 'good')}
          />
        )}

        {/* ================================================================
            TAB 10: PHASE 21 BULK BATCH ESTIMATOR, TEMPLATES & HISTORY ARCHIVE
           ================================================================ */}
        {activeTab === 'batch-archive' && (
          <BatchArchivePanel
            onToast={(msg, tone) => showToast(msg, tone === 'bad' ? 'bad' : 'good')}
          />
        )}

        {/* ================================================================
            TAB 8: PHASE 11 CONTROLLED PILOT LAUNCH & READINESS
           ================================================================ */}
        {activeTab === 'pilot' && (
          <PilotLaunchPanel
            systemSettings={systemSettings}
            pilotSummary={pilotSummary}
            recentPilotEvents={recentPilotEvents}
            cleanupLogs={cleanupLogs}
            actionBusy={actionBusy}
            onInvokeAction={async (payload, successMsg) => {
              await executeProtectedAction(async () => {
                await invokeAdminEdgeFunction('admin-print-jobs', payload);
                showToast(successMsg, 'good');
              });
            }}
            onRequestConfirm={(cfg) => setConfirmConfig(cfg)}
            onOpenQrPoster={() => setQrPosterOpen(true)}
            onNavigateTab={(href) => navigate(href)}
          />
        )}
      </div>

      {/* Enroll Shop PC Modal */}
      {enrollOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="fixed inset-0" onClick={() => !actionBusy && setEnrollOpen(false)} />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Enroll Shop PC Print Agent"
            className="relative w-full max-w-[480px] glass-solid rounded-[24px] p-6 border border-[var(--line)] shadow-2xl space-y-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-[18px] font-bold">Enroll Shop PC (Print Agent)</h2>
                <p className="text-[12.5px] text-[var(--muted)] mt-0.5">
                  Generates a one-time hashed credential for the upcoming Windows 11 Print Agent.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEnrollOpen(false)}
                aria-label="Close enrollment dialog"
                className="w-8 h-8 rounded-[10px] btn-ghost flex items-center justify-center cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            {enrollResult ? (
              <div className="space-y-3">
                <div className="rounded-[14px] p-3.5 bg-[var(--warn-soft)] text-[var(--warn)] text-[12.5px] font-medium">
                  Copy this credential now. Only a SHA-256 hash is stored on the server — this secret cannot be viewed again.
                </div>
                <div className="rounded-[12px] p-3 bg-[var(--card-2)] border border-[var(--line)] space-y-1.5 text-[12.5px]">
                  <div>
                    <strong>Device Name:</strong> {enrollResult.deviceName}
                  </div>
                  <div>
                    <strong>Device ID:</strong> <span className="font-mono">{enrollResult.deviceId}</span>
                  </div>
                  <div className="pt-1">
                    <strong>One-Time Device Credential:</strong>
                    <div className="mt-1 flex items-center gap-2">
                      <code className="flex-1 p-2 rounded bg-[var(--card-1)] border border-[var(--line)] font-mono text-[11.5px] break-all">
                        {enrollResult.deviceCredential}
                      </code>
                      <button
                        type="button"
                        onClick={() => {
                          void navigator.clipboard?.writeText(enrollResult.deviceCredential);
                          showToast('Credential copied to clipboard.', 'good');
                        }}
                        aria-label="Copy device credential"
                        className="btn-ghost p-2 rounded-[10px] cursor-pointer"
                      >
                        <Copy size={14} />
                      </button>
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setEnrollOpen(false)}
                  className="btn-primary w-full py-2 rounded-[11px] text-[13px] font-semibold cursor-pointer"
                >
                  Done
                </button>
              </div>
            ) : (
              <form onSubmit={handleEnrollDevice} className="space-y-3.5">
                <div>
                  <label htmlFor="enroll-device-name" className="block text-[12.5px] font-semibold mb-1">
                    PC / Counter Display Name
                  </label>
                  <input
                    id="enroll-device-name"
                    type="text"
                    value={enrollDeviceName}
                    onChange={(e) => setEnrollDeviceName(e.target.value)}
                    placeholder="e.g., Counter-PC-01"
                    className="w-full rounded-[11px] bg-[var(--card-2)] border border-[var(--line)] px-3 py-2 text-[13px]"
                  />
                </div>
                <div>
                  <label htmlFor="enroll-os-version" className="block text-[12.5px] font-semibold mb-1">
                    Operating System
                  </label>
                  <input
                    id="enroll-os-version"
                    type="text"
                    value={enrollOsVersion}
                    onChange={(e) => setEnrollOsVersion(e.target.value)}
                    className="w-full rounded-[11px] bg-[var(--card-2)] border border-[var(--line)] px-3 py-2 text-[13px]"
                  />
                </div>
                <div className="flex justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setEnrollOpen(false)}
                    className="btn-ghost px-4 py-2 rounded-[11px] text-[13px] cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={actionBusy}
                    className="btn-primary px-4 py-2 rounded-[11px] text-[13px] font-semibold cursor-pointer disabled:opacity-50"
                  >
                    {actionBusy ? 'Enrolling...' : 'Enroll & Generate Credential'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Detailed Job Modal */}
      <PrintJobDetailModal
        open={Boolean(detailJobId)}
        loading={detailLoading}
        error={detailError}
        detail={detailData}
        printers={printers}
        busy={actionBusy}
        onClose={() => setDetailJobId(null)}
        onRefresh={() => detailJobId && void loadJobDetail(detailJobId)}
        onRequestConfirm={(cfg) => setConfirmConfig(cfg)}
        onExecuteAction={executeProtectedAction}
        invokeAdminEdgeFunction={invokeAdminEdgeFunction}
        showToast={showToast}
      />

      {/* Confirmation Dialog */}
      <ConfirmActionDialog
        config={confirmConfig}
        busy={actionBusy}
        onClose={() => setConfirmConfig(null)}
      />

      {/* Counter Shop QR Standee & Poster Modal */}
      <ShopQrPosterModal
        open={qrPosterOpen}
        onClose={() => setQrPosterOpen(false)}
        defaultPortalUrl={systemSettings?.customer_portal_url || undefined}
      />
    </div>
  );
};
