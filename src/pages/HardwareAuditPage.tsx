import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Archive,
  CheckCircle2,
  Clock,
  Cpu,
  Edit3,
  Laptop,
  Layers,
  Plus,
  Power,
  Printer,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Wifi,
  X,
} from 'lucide-react';
import { SegControl, TabsNav } from '../components/AnimatedControls';
import { useAdmin } from '../context/AdminContext';
import { dur, gsap, popIcon, reducedMotion, revealCards, revealText } from '../utils/animations';
import {
  CONNECTION_OPTIONS,
  PAPER_SIZE_OPTIONS,
  computeClientHardwareAuditSummary,
  createEmptyPrinterDraft,
  formatConnectionLabel,
  formatTriStateLabel,
  isPrinterVerificationPending,
  printerToFormDraft,
  validatePrinterFormDraft,
  type HardwareAuditSummary,
  type PrintDeviceRecord,
  type PrinterAuditEvent,
  type PrinterConnectionType,
  type PrinterFormDraft,
  type PrinterPaperSize,
  type PrinterRecord,
  type TriStateCapability,
} from '../utils/hardwareAudit';

type PrinterListResponse = {
  printers?: PrinterRecord[];
  devices?: PrintDeviceRecord[];
  auditSummary?: HardwareAuditSummary;
  recentEvents?: PrinterAuditEvent[];
};

type RegistryFilter = 'active' | 'enabled' | 'pending' | 'archived';

const STATUS_STYLES: Record<
  PrinterRecord['printer_status'],
  { label: string; colorVar: string; bgVar: string }
> = {
  online: { label: 'Online', colorVar: 'var(--good)', bgVar: 'var(--good-soft)' },
  offline: { label: 'Offline', colorVar: 'var(--warn)', bgVar: 'var(--warn-soft)' },
  error: { label: 'Error', colorVar: 'var(--bad)', bgVar: 'var(--bad-soft)' },
  paused: { label: 'Paused', colorVar: 'var(--warn)', bgVar: 'var(--warn-soft)' },
  disabled: { label: 'Disabled', colorVar: 'var(--muted)', bgVar: 'var(--card-2)' },
  unknown: { label: 'Unknown', colorVar: 'var(--info)', bgVar: 'var(--info-soft)' },
};

function formatTimestamp(iso: string | null | undefined, fallback: string): string {
  if (!iso) return fallback;
  const parsed = Date.parse(iso);
  if (!Number.isFinite(parsed)) return fallback;
  return new Date(parsed).toLocaleString([], {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

export const HardwareAuditPage: React.FC = () => {
  const { route, navigate, invokeAdminEdgeFunction, showToast } = useAdmin();
  const activeTab = (route.sub as 'printers' | 'discovery' | 'checklist') || 'printers';

  const [printers, setPrinters] = useState<PrinterRecord[]>([]);
  const [devices, setDevices] = useState<PrintDeviceRecord[]>([]);
  const [recentEvents, setRecentEvents] = useState<PrinterAuditEvent[]>([]);
  const [serverSummary, setServerSummary] = useState<HardwareAuditSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [registryFilter, setRegistryFilter] = useState<RegistryFilter>('active');
  const [connectionFilter, setConnectionFilter] = useState<'all' | PrinterConnectionType>('all');

  // Add/Edit Modal State
  const [editorMode, setEditorMode] = useState<'create' | 'edit' | null>(null);
  const [editingPrinter, setEditingPrinter] = useState<PrinterRecord | null>(null);
  const [draft, setDraft] = useState<PrinterFormDraft>(() => createEmptyPrinterDraft());
  const [markPhysicallyVerified, setMarkPhysicallyVerified] = useState(false);

  // Archive Confirmation Modal State
  const [archiveTarget, setArchiveTarget] = useState<PrinterRecord | null>(null);

  const rootRef = useRef<HTMLDivElement>(null);
  const h1Ref = useRef<HTMLHeadingElement>(null);
  const tabPanelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (h1Ref.current) revealText(h1Ref.current, 0.04);
    if (rootRef.current) {
      revealCards(rootRef.current.querySelectorAll<HTMLElement>('.anim-card'), {
        delay: 0.04,
        stagger: 0.045,
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

  const applySnapshot = useCallback((res: PrinterListResponse) => {
    const nextPrinters = Array.isArray(res.printers) ? res.printers : [];
    const nextDevices = Array.isArray(res.devices) ? res.devices : [];
    setPrinters(nextPrinters);
    setDevices(nextDevices);
    setRecentEvents(Array.isArray(res.recentEvents) ? res.recentEvents : []);
    setServerSummary(res.auditSummary ?? null);
    setLoadError(null);
  }, []);

  const loadHardwareAudit = useCallback(async () => {
    setLoading(true);
    try {
      const res = await invokeAdminEdgeFunction<PrinterListResponse>('admin-printers', {
        action: 'list',
      });
      applySnapshot(res);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Unable to reach admin-printers Edge Function.';
      setLoadError(msg);
    } finally {
      setLoading(false);
    }
  }, [applySnapshot, invokeAdminEdgeFunction]);

  useEffect(() => {
    void loadHardwareAudit();
  }, [loadHardwareAudit]);

  const auditSummary = useMemo(
    () => serverSummary ?? computeClientHardwareAuditSummary(printers, devices),
    [serverSummary, printers, devices]
  );

  const deviceNameMap = useMemo(() => {
    const map = new Map<string, PrintDeviceRecord>();
    for (const d of devices) map.set(d.id, d);
    return map;
  }, [devices]);

  const filteredPrinters = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return printers.filter((p) => {
      const isArchived = Boolean(p.archived_at);
      if (registryFilter === 'archived' && !isArchived) return false;
      if (registryFilter !== 'archived' && isArchived) return false;
      if (registryFilter === 'enabled' && !p.is_enabled) return false;
      if (registryFilter === 'pending' && !isPrinterVerificationPending(p)) return false;

      if (connectionFilter !== 'all' && p.connection_type !== connectionFilter) return false;

      if (!q) return true;
      const devName = p.device_id ? deviceNameMap.get(p.device_id)?.device_name ?? '' : '';
      return (
        p.printer_name.toLowerCase().includes(q) ||
        (p.printer_model || '').toLowerCase().includes(q) ||
        (p.system_printer_name || '').toLowerCase().includes(q) ||
        devName.toLowerCase().includes(q)
      );
    });
  }, [printers, registryFilter, connectionFilter, searchQuery, deviceNameMap]);

  const pendingDiscoveredPrinters = useMemo(
    () =>
      printers.filter(
        (p) => !p.archived_at && p.discovery_source === 'agent' && p.approval_status === 'pending_review'
      ),
    [printers]
  );

  const openCreateModal = () => {
    setEditingPrinter(null);
    setDraft(createEmptyPrinterDraft());
    setMarkPhysicallyVerified(false);
    setEditorMode('create');
  };

  const openEditModal = (printer: PrinterRecord) => {
    setEditingPrinter(printer);
    setDraft(printerToFormDraft(printer));
    setMarkPhysicallyVerified(Boolean(printer.capabilities_verified));
    setEditorMode('edit');
  };

  const closeEditor = () => {
    if (submitting) return;
    setEditorMode(null);
    setEditingPrinter(null);
  };

  const togglePaperSize = (size: PrinterPaperSize) => {
    setDraft((prev) => {
      const exists = prev.supportedPaperSizes.includes(size);
      return {
        ...prev,
        supportedPaperSizes: exists
          ? prev.supportedPaperSizes.filter((s) => s !== size)
          : [...prev.supportedPaperSizes, size],
      };
    });
  };

  const canMarkVerifiedInModal =
    draft.connectionType !== 'unknown' &&
    draft.supportsColour !== 'unknown' &&
    draft.supportsDuplex !== 'unknown' &&
    draft.supportedPaperSizes.length > 0;

  useEffect(() => {
    if (!canMarkVerifiedInModal && markPhysicallyVerified) {
      setMarkPhysicallyVerified(false);
    }
  }, [canMarkVerifiedInModal, markPhysicallyVerified]);

  const handleSavePrinter = async (e: React.FormEvent) => {
    e.preventDefault();
    const validationErr = validatePrinterFormDraft(draft);
    if (validationErr) {
      showToast(validationErr, 'bad');
      return;
    }

    setSubmitting(true);
    try {
      if (editorMode === 'create') {
        const res = await invokeAdminEdgeFunction<PrinterListResponse>('admin-printers', {
          action: 'create',
          printerName: draft.printerName.trim(),
          printerModel: draft.printerModel.trim() || null,
          systemPrinterName: draft.systemPrinterName.trim() || null,
          connectionType: draft.connectionType,
          supportsColour: draft.supportsColour,
          supportsDuplex: draft.supportsDuplex,
          supportedPaperSizes: draft.supportedPaperSizes,
          deviceId: draft.deviceId || null,
          isEnabled: draft.isEnabled,
          auditNotes: draft.auditNotes.trim() || null,
        });
        applySnapshot(res);
        showToast('Printer added to hardware registry');
      } else if (editorMode === 'edit' && editingPrinter) {
        const res = await invokeAdminEdgeFunction<PrinterListResponse>('admin-printers', {
          action: 'update',
          printerId: editingPrinter.id,
          printerName: draft.printerName.trim(),
          printerModel: draft.printerModel.trim() || null,
          systemPrinterName: draft.systemPrinterName.trim() || null,
          connectionType: draft.connectionType,
          supportsColour: draft.supportsColour,
          supportsDuplex: draft.supportsDuplex,
          supportedPaperSizes: draft.supportedPaperSizes,
          deviceId: draft.deviceId || null,
          isEnabled: draft.isEnabled,
          auditNotes: draft.auditNotes.trim() || null,
          markPhysicallyVerified: canMarkVerifiedInModal ? markPhysicallyVerified : false,
        });
        applySnapshot(res);
        showToast('Printer hardware profile updated');
      }
      setEditorMode(null);
      setEditingPrinter(null);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to save printer', 'bad');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleEnabled = async (printer: PrinterRecord) => {
    setSubmitting(true);
    try {
      const res = await invokeAdminEdgeFunction<PrinterListResponse>('admin-printers', {
        action: 'set_enabled',
        printerId: printer.id,
        isEnabled: !printer.is_enabled,
      });
      applySnapshot(res);
      showToast(printer.is_enabled ? `${printer.printer_name} disabled` : `${printer.printer_name} enabled`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Unable to update printer status', 'bad');
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmArchive = async () => {
    if (!archiveTarget) return;
    setSubmitting(true);
    try {
      const res = await invokeAdminEdgeFunction<PrinterListResponse>('admin-printers', {
        action: 'archive',
        printerId: archiveTarget.id,
      });
      applySnapshot(res);
      showToast(`${archiveTarget.printer_name} archived safely`);
      setArchiveTarget(null);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to archive printer', 'bad');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReviewDiscovery = async (
    printer: PrinterRecord,
    decision: 'approve' | 'reject',
    enableNow = false
  ) => {
    setSubmitting(true);
    try {
      const res = await invokeAdminEdgeFunction<PrinterListResponse>('admin-printers', {
        action: 'review_discovered',
        printerId: printer.id,
        decision,
        enableNow,
      });
      applySnapshot(res);
      showToast(
        decision === 'approve'
          ? `${printer.printer_name} approved`
          : `${printer.printer_name} rejected`
      );
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Discovery review failed', 'bad');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div ref={rootRef} className="space-y-5">
      {/* Top Bar Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1
            ref={h1Ref}
            className="text-[30px] sm:text-[34px] font-bold tracking-[-0.02em] leading-tight"
          >
            Hardware & Printer Audit
          </h1>
          <p className="text-[14px] text-[var(--muted)] mt-1">
            Phase 0 Printer Registry, unverified capability tracking, and Windows Local Print Agent readiness.
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            disabled={loading || submitting}
            onClick={(e) => {
              popIcon(e.currentTarget);
              void loadHardwareAudit();
            }}
            className="btn-ghost px-3.5 py-2 rounded-[12px] text-[13.5px] font-medium inline-flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
            <span>Refresh</span>
          </button>
          <button
            type="button"
            disabled={submitting}
            onClick={(e) => {
              popIcon(e.currentTarget);
              openCreateModal();
            }}
            className="btn-primary px-4 py-2 rounded-[12px] text-[13.5px] inline-flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Plus size={16} />
            <span>Add Printer</span>
          </button>
        </div>
      </div>

      {/* Honest Two-Tier Audit Classification Banner */}
      <section
        aria-label="Phase 0 Hardware Audit Status"
        className="anim-card glass-pane rounded-[22px] p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
      >
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[8px] bg-[var(--good-soft)] text-[var(--good)] text-[12px] font-semibold">
              <CheckCircle2 size={14} />
              Software Audit Complete
            </span>
            <span
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[8px] text-[12px] font-semibold"
              style={{
                background: auditSummary.physicalVerificationPending
                  ? 'var(--warn-soft)'
                  : 'var(--good-soft)',
                color: auditSummary.physicalVerificationPending ? 'var(--warn)' : 'var(--good)',
              }}
            >
              {auditSummary.physicalVerificationPending ? (
                <Clock size={14} />
              ) : (
                <ShieldCheck size={14} />
              )}
              {auditSummary.physicalVerificationPending
                ? 'Physical Hardware Verification Pending'
                : 'Physical Hardware Verified'}
            </span>
          </div>
          <h2 className="text-[16px] font-bold">{auditSummary.overallLabel}</h2>
          <p className="text-[13px] text-[var(--muted)] max-w-[760px]">
            Manual inventory and future Windows agent workflows are active. Physical printer detection, driver capability confirmation, connectivity testing, and PDF/image test prints remain pending shop hardware inspection.
          </p>
        </div>

        <div className="shrink-0 flex flex-col sm:flex-row lg:flex-col items-start sm:items-center lg:items-end gap-1.5 border-t lg:border-t-0 lg:border-l border-[var(--line)] pt-3 lg:pt-0 lg:pl-5">
          <span className="text-[11.5px] uppercase tracking-[0.06em] font-semibold text-[var(--muted)]">
            Last Hardware Verification
          </span>
          <span className="text-[13.5px] font-semibold tabular-nums">
            {formatTimestamp(auditSummary.lastHardwareVerificationAt, 'Not yet physically verified')}
          </span>
          <button
            type="button"
            onClick={() => navigate('#/hardware/checklist')}
            className="text-[12.5px] font-semibold text-[var(--accent-text)] hover:underline cursor-pointer"
          >
            View verification checklist →
          </button>
        </div>
      </section>

      {/* Backend Connection Notice (if Edge Function or migration not yet deployed) */}
      {loadError && (
        <div
          role="alert"
          className="anim-card glass-solid rounded-[18px] p-4 border border-[var(--warn)] flex items-start gap-3"
        >
          <AlertTriangle size={18} className="text-[var(--warn)] shrink-0 mt-0.5" />
          <div className="min-w-0 text-[13px] space-y-1">
            <div className="font-bold">Live Supabase Printer Endpoint Notice</div>
            <p className="text-[var(--ink-2)]">{loadError}</p>
            <p className="text-[var(--muted)] text-[12px]">
              Ensure additive migration{' '}
              <code className="font-mono">202611210001_scan2print_phase0_printers.sql</code> and Edge Function{' '}
              <code className="font-mono">admin-printers</code> are deployed to your Supabase project after approval. No fake printer records are displayed.
            </p>
          </div>
        </div>
      )}

      {/* 4 Summary Metric Tiles */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {[
          {
            label: 'Registered Printers',
            value: `${auditSummary.totalRegistered}`,
            badge:
              auditSummary.archivedCount > 0
                ? `${auditSummary.archivedCount} archived`
                : 'Active registry',
            sub: 'Manual & agent-synced',
            bg: 'var(--tile-1)',
            icon: Printer,
          },
          {
            label: 'Enabled vs Disabled',
            value: `${auditSummary.enabledCount} / ${auditSummary.disabledCount}`,
            badge: `${auditSummary.enabledCount} enabled`,
            sub: 'Print queue eligibility',
            bg: 'var(--tile-2)',
            icon: Power,
          },
          {
            label: 'Pending Verification',
            value: `${auditSummary.pendingVerificationCount}`,
            badge: `${auditSummary.verifiedCount} verified`,
            sub: 'Unknown or unverified specs',
            bg: 'var(--tile-3)',
            icon: ShieldAlert,
          },
          {
            label: 'Agent Assignments',
            value: `${auditSummary.assignedToDeviceCount}`,
            badge: `${auditSummary.enrolledDevicesCount} agent PC(s)`,
            sub:
              auditSummary.pendingAgentReviewCount > 0
                ? `${auditSummary.pendingAgentReviewCount} awaiting review`
                : 'Windows Agent prep',
            bg: 'var(--tile-4)',
            icon: Laptop,
          },
        ].map((kpi) => {
          const Icon = kpi.icon;
          return (
            <div
              key={kpi.label}
              style={{ background: kpi.bg }}
              className="anim-card glass-tile rounded-[22px] p-5 flex flex-col justify-between min-h-[130px]"
            >
              <div className="flex items-center gap-2 text-[13px] text-[var(--ink-2)] font-medium">
                <Icon size={15} className="opacity-80" />
                <span>{kpi.label}</span>
              </div>
              <div className="text-[26px] font-semibold tracking-tight tabular-nums my-2">
                {kpi.value}
              </div>
              <div className="flex items-center justify-between gap-2 text-[12px]">
                <span className="px-2 py-0.5 rounded-[7px] bg-black/10 dark:bg-black/30 font-semibold tabular-nums">
                  {kpi.badge}
                </span>
                <span className="text-[var(--muted)] truncate">{kpi.sub}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Sub-navigation Tabs */}
      <TabsNav
        activeId={activeTab}
        onNavigate={navigate}
        items={[
          {
            id: 'printers',
            label: 'Printer Registry',
            href: '#/hardware/printers',
            count: auditSummary.totalRegistered,
          },
          {
            id: 'discovery',
            label: 'Agent Discovery Prep',
            href: '#/hardware/discovery',
            count: auditSummary.enrolledDevicesCount,
          },
          {
            id: 'checklist',
            label: 'Audit Checklist',
            href: '#/hardware/checklist',
            count: auditSummary.checklist.filter((c) => c.status === 'pending').length,
          },
        ]}
      />

      <div ref={tabPanelRef}>
        {/* TAB 1: PRINTER REGISTRY */}
        {activeTab === 'printers' && (
          <section className="glass-solid rounded-[24px] p-5 sm:p-6 space-y-4">
          {/* Search & Filters */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative w-full sm:w-[260px]">
                <Search
                  size={15}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]"
                />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search name, model, or PC..."
                  aria-label="Search printers"
                  className="admin-input w-full pl-9 pr-3 py-2 text-[13px]"
                />
              </div>

              <SegControl
                ariaLabel="Printer status filter"
                value={registryFilter}
                onChange={setRegistryFilter}
                options={[
                  { id: 'active', label: 'Active' },
                  { id: 'enabled', label: 'Enabled' },
                  { id: 'pending', label: 'Pending Check' },
                  { id: 'archived', label: 'Archived' },
                ]}
              />
            </div>

            <div className="flex items-center gap-2">
              <label
                htmlFor="conn-filter"
                className="text-[12px] font-semibold text-[var(--muted)] whitespace-nowrap"
              >
                Connection:
              </label>
              <select
                id="conn-filter"
                value={connectionFilter}
                onChange={(e) =>
                  setConnectionFilter(e.target.value as 'all' | PrinterConnectionType)
                }
                className="admin-input px-3 py-1.5 text-[13px]"
              >
                <option value="all">All Types</option>
                {CONNECTION_OPTIONS.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Loading Skeleton */}
          {loading && (
            <div className="space-y-2.5" aria-label="Loading printers">
              {[1, 2, 3].map((idx) => (
                <div
                  key={idx}
                  className="h-[52px] rounded-[12px] bg-[var(--card-2)] border border-[var(--line)] animate-pulse"
                />
              ))}
            </div>
          )}

          {/* Empty State */}
          {!loading && filteredPrinters.length === 0 && (
            <div className="rounded-[18px] border border-dashed border-[var(--line-2)] bg-[var(--card-2)] p-8 text-center space-y-3">
              <div className="w-11 h-11 rounded-[12px] bg-[var(--accent-soft)] text-[var(--accent-text)] mx-auto flex items-center justify-center">
                <Printer size={20} />
              </div>
              <div className="space-y-1 max-w-[460px] mx-auto">
                <h3 className="text-[16px] font-bold">
                  {printers.length === 0
                    ? 'No printers registered yet'
                    : 'No printers match the current filter'}
                </h3>
                <p className="text-[13px] text-[var(--muted)]">
                  {printers.length === 0
                    ? 'Aman Computer hardware details are not fabricated. Add a printer manually with known or Unknown capabilities, or wait for Windows Local Print Agent discovery.'
                    : 'Clear search or switch status filter to inspect other printer records.'}
                </p>
              </div>
              {printers.length === 0 && (
                <button
                  type="button"
                  onClick={openCreateModal}
                  className="btn-primary px-4 py-2 rounded-[12px] text-[13.5px] inline-flex items-center gap-2 cursor-pointer"
                >
                  <Plus size={15} />
                  <span>Add First Printer</span>
                </button>
              )}
            </div>
          )}

          {/* High-Contrast Printer Data Table */}
          {!loading && filteredPrinters.length > 0 && (
            <div className="overflow-x-auto custom-scroll">
              <table className="w-full border-collapse text-left min-w-[920px]">
                <thead>
                  <tr className="border-b border-[var(--line-2)] text-[11.5px] uppercase tracking-[0.06em] text-[var(--muted)]">
                    <th className="py-2.5 px-3 font-semibold">Printer & Model</th>
                    <th className="py-2.5 px-3 font-semibold">Connection</th>
                    <th className="py-2.5 px-3 font-semibold">Colour / Duplex</th>
                    <th className="py-2.5 px-3 font-semibold">Paper Sizes</th>
                    <th className="py-2.5 px-3 font-semibold">Agent PC</th>
                    <th className="py-2.5 px-3 font-semibold">Verification</th>
                    <th className="py-2.5 px-3 font-semibold">Status</th>
                    <th className="py-2.5 px-3 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--line)] text-[13px]">
                  {filteredPrinters.map((p) => {
                    const statusStyle = STATUS_STYLES[p.printer_status] ?? STATUS_STYLES.unknown;
                    const pendingVerify = isPrinterVerificationPending(p);
                    const assignedDevice = p.device_id ? deviceNameMap.get(p.device_id) : undefined;
                    const isArchived = Boolean(p.archived_at);

                    return (
                      <tr
                        key={p.id}
                        className="hover:bg-[var(--card-2)] transition-colors align-middle"
                      >
                        <td className="py-3 px-3">
                          <div className="font-semibold text-[var(--ink)]">{p.printer_name}</div>
                          <div className="text-[12px] text-[var(--muted)]">
                            {p.printer_model ? p.printer_model : 'Model unknown / not specified'}
                            {p.system_printer_name ? ` · ${p.system_printer_name}` : ''}
                          </div>
                        </td>

                        <td className="py-3 px-3 whitespace-nowrap">
                          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-[7px] bg-[var(--card-2)] border border-[var(--line)] text-[12px] font-medium">
                            <Wifi size={12} className="opacity-70" />
                            {formatConnectionLabel(p.connection_type)}
                          </span>
                        </td>

                        <td className="py-3 px-3 whitespace-nowrap text-[12.5px]">
                          <div>
                            Colour:{' '}
                            <strong
                              className={
                                p.supports_colour === null ? 'text-[var(--warn)]' : 'text-[var(--ink)]'
                              }
                            >
                              {formatTriStateLabel(p.supports_colour)}
                            </strong>
                          </div>
                          <div>
                            Duplex:{' '}
                            <strong
                              className={
                                p.supports_duplex === null ? 'text-[var(--warn)]' : 'text-[var(--ink)]'
                              }
                            >
                              {formatTriStateLabel(p.supports_duplex)}
                            </strong>
                          </div>
                        </td>

                        <td className="py-3 px-3">
                          {p.supported_paper_sizes.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {p.supported_paper_sizes.map((size) => (
                                <span
                                  key={size}
                                  className="px-1.5 py-0.5 rounded-[6px] bg-[var(--card-2)] border border-[var(--line)] text-[11.5px] font-medium"
                                >
                                  {size.replace('_', ' ')}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-[12px] text-[var(--warn)] font-medium">
                              Unknown / Pending
                            </span>
                          )}
                        </td>

                        <td className="py-3 px-3 text-[12.5px]">
                          {assignedDevice ? (
                            <div>
                              <div className="font-medium">{assignedDevice.device_name}</div>
                              <div className="text-[11.5px] text-[var(--muted)] tabular-nums">
                                Seen: {formatTimestamp(p.last_seen_at, 'Never synced')}
                              </div>
                            </div>
                          ) : (
                            <span className="text-[var(--muted)]">Unassigned (Awaiting Agent)</span>
                          )}
                        </td>

                        <td className="py-3 px-3 whitespace-nowrap">
                          {pendingVerify ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[7px] bg-[var(--warn-soft)] text-[var(--warn)] text-[11.5px] font-semibold">
                              <Clock size={12} />
                              Pending Verification
                            </span>
                          ) : (
                            <div className="space-y-0.5">
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[7px] bg-[var(--good-soft)] text-[var(--good)] text-[11.5px] font-semibold">
                                <CheckCircle2 size={12} />
                                Verified
                              </span>
                              <div className="text-[11px] text-[var(--muted)] tabular-nums">
                                {formatTimestamp(p.last_verified_at, '')}
                              </div>
                            </div>
                          )}
                        </td>

                        <td className="py-3 px-3 whitespace-nowrap">
                          <div className="flex flex-col gap-1 items-start">
                            <span
                              className="inline-flex items-center px-2 py-0.5 rounded-[7px] text-[11.5px] font-semibold"
                              style={{ background: statusStyle.bgVar, color: statusStyle.colorVar }}
                            >
                              {isArchived ? 'Archived' : statusStyle.label}
                            </span>
                            <span className="text-[11px] text-[var(--muted)]">
                              {p.is_enabled ? 'Queue Enabled' : 'Queue Disabled'}
                            </span>
                          </div>
                        </td>

                        <td className="py-3 px-3 text-right whitespace-nowrap">
                          {isArchived ? (
                            <span className="text-[11.5px] text-[var(--muted)] tabular-nums">
                              Archived {formatTimestamp(p.archived_at, '')}
                            </span>
                          ) : (
                            <div className="inline-flex items-center gap-1.5">
                              <button
                                type="button"
                                disabled={submitting}
                                onClick={() => openEditModal(p)}
                                title="Edit printer profile"
                                className="btn-ghost px-2.5 py-1.5 rounded-[9px] text-[12px] font-medium inline-flex items-center gap-1 cursor-pointer"
                              >
                                <Edit3 size={13} />
                                <span>Edit</span>
                              </button>
                              <button
                                type="button"
                                disabled={submitting || p.approval_status === 'pending_review'}
                                onClick={() => void handleToggleEnabled(p)}
                                title={p.is_enabled ? 'Disable printer' : 'Enable printer'}
                                className="btn-ghost px-2.5 py-1.5 rounded-[9px] text-[12px] font-medium inline-flex items-center gap-1 cursor-pointer disabled:opacity-50"
                              >
                                <Power size={13} />
                                <span>{p.is_enabled ? 'Disable' : 'Enable'}</span>
                              </button>
                              <button
                                type="button"
                                disabled={submitting}
                                onClick={() => setArchiveTarget(p)}
                                title="Archive printer (preserves historical print jobs)"
                                className="btn-ghost px-2.5 py-1.5 rounded-[9px] text-[12px] font-medium text-[var(--bad)] inline-flex items-center gap-1 cursor-pointer"
                              >
                                <Archive size={13} />
                                <span>Archive</span>
                              </button>
                            </div>
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
      )}

      {/* TAB 2: FUTURE WINDOWS AGENT DISCOVERY PREP */}
      {activeTab === 'discovery' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
          <section className="anim-card lg:col-span-5 glass-solid rounded-[24px] p-5 sm:p-6 space-y-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h2 className="text-[17px] font-bold flex items-center gap-2">
                  <Laptop size={17} className="text-[var(--accent)]" />
                  <span>Windows 11 Local Print Agent</span>
                </h2>
                <p className="text-[12.5px] text-[var(--muted)] mt-0.5">
                  Outbound HTTPS sync via <code className="font-mono">agent-sync-printers</code>
                </p>
              </div>
              <span className="px-2.5 py-1 rounded-[8px] bg-[var(--info-soft)] text-[var(--info)] text-[11.5px] font-semibold">
                {devices.length > 0 ? `${devices.length} Enrolled` : 'Awaiting Agent'}
              </span>
            </div>

            {devices.length === 0 ? (
              <div className="rounded-[16px] border border-dashed border-[var(--line-2)] bg-[var(--card-2)] p-5 text-[13px] space-y-2">
                <div className="font-semibold">No Windows 11 Print Agent PCs enrolled yet</div>
                <p className="text-[var(--muted)] leading-relaxed">
                  Automatic printer discovery runs only after the C# / .NET 8 Local Print Agent is installed on the shop Windows 11 PC in Phase 5–6. Until then, printers are managed manually in the Printer Registry tab.
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-[var(--line)]">
                {devices.map((dev) => (
                  <li key={dev.id} className="py-3 first:pt-0 last:pb-0 space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-[13.5px]">{dev.device_name}</span>
                      <span className="px-2 py-0.5 rounded-[7px] bg-[var(--card-2)] border border-[var(--line)] text-[11.5px] font-semibold uppercase">
                        {dev.device_status}
                      </span>
                    </div>
                    <div className="text-[12px] text-[var(--muted)] flex flex-wrap gap-x-4 gap-y-1 tabular-nums">
                      <span>OS: {dev.os_version || 'Unknown'}</span>
                      <span>Agent: {dev.agent_version || 'Unknown'}</span>
                      <span>Heartbeat: {formatTimestamp(dev.last_heartbeat_at, 'Never')}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="anim-card lg:col-span-7 glass-solid rounded-[24px] p-5 sm:p-6 space-y-4">
            <div>
              <h2 className="text-[17px] font-bold flex items-center gap-2">
                <Cpu size={17} className="text-[var(--accent)]" />
                <span>Discovered Printers Awaiting Admin Review</span>
              </h2>
              <p className="text-[12.5px] text-[var(--muted)] mt-0.5">
                Printers synced by an enrolled Windows Agent enter <code className="font-mono">pending_review</code> disabled by default until approved and verified by Admin.
              </p>
            </div>

            {pendingDiscoveredPrinters.length === 0 ? (
              <div className="rounded-[16px] border border-dashed border-[var(--line-2)] bg-[var(--card-2)] p-6 text-center space-y-1.5">
                <div className="font-semibold text-[14px]">No discovered printers pending review</div>
                <p className="text-[12.5px] text-[var(--muted)]">
                  When the shop Windows 11 agent syncs local USB, Wi-Fi, or LAN queues, new printers appear here for Admin approval and capability verification.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {pendingDiscoveredPrinters.map((p) => (
                  <div
                    key={p.id}
                    className="rounded-[16px] border border-[var(--line-2)] bg-[var(--card-2)] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="space-y-1">
                      <div className="font-bold text-[14px]">{p.printer_name}</div>
                      <div className="text-[12px] text-[var(--muted)]">
                        Spooler: {p.system_printer_name || 'Unknown'} · Connection:{' '}
                        {formatConnectionLabel(p.connection_type)} · Colour:{' '}
                        {formatTriStateLabel(p.supports_colour)} · Duplex:{' '}
                        {formatTriStateLabel(p.supports_duplex)}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      <button
                        type="button"
                        disabled={submitting}
                        onClick={() => void handleReviewDiscovery(p, 'approve', false)}
                        className="btn-primary px-3 py-1.5 rounded-[10px] text-[12.5px] cursor-pointer"
                      >
                        Approve (Disabled)
                      </button>
                      <button
                        type="button"
                        disabled={submitting}
                        onClick={() => void handleReviewDiscovery(p, 'reject')}
                        className="btn-ghost px-3 py-1.5 rounded-[10px] text-[12.5px] text-[var(--bad)] cursor-pointer"
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {/* TAB 3: TWO-TIER HARDWARE AUDIT CHECKLIST & RECENT EVENTS */}
      {activeTab === 'checklist' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Software Audit Complete */}
            <section className="anim-card glass-solid rounded-[24px] p-5 sm:p-6 space-y-4">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-[17px] font-bold">Software Audit Checklist</h2>
                <span className="px-2.5 py-1 rounded-[8px] bg-[var(--good-soft)] text-[var(--good)] text-[12px] font-semibold">
                  Complete
                </span>
              </div>
              <ul className="divide-y divide-[var(--line)]">
                {auditSummary.checklist
                  .filter((item) => item.tier === 'software')
                  .map((item) => (
                    <li key={item.id} className="py-3 first:pt-0 last:pb-0 flex items-start gap-3">
                      <CheckCircle2 size={17} className="text-[var(--good)] shrink-0 mt-0.5" />
                      <div className="space-y-0.5">
                        <div className="font-semibold text-[13.5px]">{item.label}</div>
                        <div className="text-[12.5px] text-[var(--muted)]">{item.detail}</div>
                      </div>
                    </li>
                  ))}
              </ul>
            </section>

            {/* Physical Hardware Verification Pending */}
            <section className="anim-card glass-solid rounded-[24px] p-5 sm:p-6 space-y-4">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-[17px] font-bold">Physical Hardware Verification</h2>
                <span
                  className="px-2.5 py-1 rounded-[8px] text-[12px] font-semibold"
                  style={{
                    background: auditSummary.physicalVerificationPending
                      ? 'var(--warn-soft)'
                      : 'var(--good-soft)',
                    color: auditSummary.physicalVerificationPending
                      ? 'var(--warn)'
                      : 'var(--good)',
                  }}
                >
                  {auditSummary.physicalVerificationPending ? 'Pending Shop Test' : 'Verified'}
                </span>
              </div>
              <ul className="divide-y divide-[var(--line)]">
                {auditSummary.checklist
                  .filter((item) => item.tier === 'physical')
                  .map((item) => (
                    <li key={item.id} className="py-3 first:pt-0 last:pb-0 flex items-start gap-3">
                      {item.status === 'complete' ? (
                        <CheckCircle2 size={17} className="text-[var(--good)] shrink-0 mt-0.5" />
                      ) : (
                        <Clock size={17} className="text-[var(--warn)] shrink-0 mt-0.5" />
                      )}
                      <div className="space-y-0.5">
                        <div className="font-semibold text-[13.5px]">{item.label}</div>
                        <div className="text-[12.5px] text-[var(--muted)]">{item.detail}</div>
                      </div>
                    </li>
                  ))}
              </ul>
            </section>
          </div>

          {/* Capability & Connection Breakdown + Audit Events */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            <section className="anim-card lg:col-span-5 glass-solid rounded-[24px] p-5 sm:p-6 space-y-4">
              <h2 className="text-[16px] font-bold flex items-center gap-2">
                <Layers size={16} className="text-[var(--accent)]" />
                <span>Capability & Connection Breakdown</span>
              </h2>
              <div className="grid grid-cols-2 gap-3 text-[13px]">
                <div className="p-3 rounded-[14px] bg-[var(--card-2)] border border-[var(--line)] space-y-1">
                  <div className="text-[11.5px] text-[var(--muted)] font-semibold uppercase">
                    Connections
                  </div>
                  <div className="tabular-nums">USB: {auditSummary.connectionBreakdown.usb}</div>
                  <div className="tabular-nums">Wi-Fi: {auditSummary.connectionBreakdown.wifi}</div>
                  <div className="tabular-nums">LAN: {auditSummary.connectionBreakdown.lan}</div>
                  <div className="tabular-nums">
                    Other / Unknown:{' '}
                    {auditSummary.connectionBreakdown.other +
                      auditSummary.connectionBreakdown.unknown}
                  </div>
                </div>
                <div className="p-3 rounded-[14px] bg-[var(--card-2)] border border-[var(--line)] space-y-1">
                  <div className="text-[11.5px] text-[var(--muted)] font-semibold uppercase">
                    Capabilities
                  </div>
                  <div className="tabular-nums">
                    Colour: {auditSummary.capabilityBreakdown.colourYes} Yes /{' '}
                    {auditSummary.capabilityBreakdown.colourNo} No /{' '}
                    {auditSummary.capabilityBreakdown.colourUnknown} Unknown
                  </div>
                  <div className="tabular-nums">
                    Duplex: {auditSummary.capabilityBreakdown.duplexYes} Yes /{' '}
                    {auditSummary.capabilityBreakdown.duplexNo} No /{' '}
                    {auditSummary.capabilityBreakdown.duplexUnknown} Unknown
                  </div>
                </div>
              </div>
            </section>

            <section className="anim-card lg:col-span-7 glass-solid rounded-[24px] p-5 sm:p-6 space-y-3">
              <h2 className="text-[16px] font-bold">Immutable Hardware Audit Events</h2>
              {recentEvents.length === 0 ? (
                <p className="text-[13px] text-[var(--muted)]">
                  No printer or device audit events recorded yet. Actions in Printer Registry write append-only records to <code className="font-mono">print_events</code>.
                </p>
              ) : (
                <ul className="divide-y divide-[var(--line)] text-[12.5px] max-h-[240px] overflow-y-auto custom-scroll">
                  {recentEvents.map((evt) => (
                    <li key={evt.id} className="py-2 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <span className="font-semibold font-mono">{evt.event_type}</span>
                        <span className="text-[var(--muted)] ml-2">
                          by {evt.actor_type}
                          {typeof evt.metadata?.printer_name === 'string'
                            ? ` · ${evt.metadata.printer_name}`
                            : ''}
                        </span>
                      </div>
                      <span className="text-[var(--muted)] tabular-nums shrink-0">
                        {formatTimestamp(evt.created_at, '')}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </div>
      )}
      </div>

      {/* ADD / EDIT PRINTER MODAL */}
      {editorMode && (
        <PrinterEditorModal
          mode={editorMode}
          draft={draft}
          setDraft={setDraft}
          devices={devices}
          canMarkVerified={canMarkVerifiedInModal}
          markPhysicallyVerified={markPhysicallyVerified}
          setMarkPhysicallyVerified={setMarkPhysicallyVerified}
          togglePaperSize={togglePaperSize}
          submitting={submitting}
          onClose={closeEditor}
          onSubmit={handleSavePrinter}
        />
      )}

      {/* SAFE ARCHIVE CONFIRMATION MODAL */}
      {archiveTarget && (
        <ArchiveConfirmModal
          printer={archiveTarget}
          submitting={submitting}
          onClose={() => !submitting && setArchiveTarget(null)}
          onConfirm={() => void handleConfirmArchive()}
        />
      )}
    </div>
  );
};

const PrinterEditorModal: React.FC<{
  mode: 'create' | 'edit';
  draft: PrinterFormDraft;
  setDraft: React.Dispatch<React.SetStateAction<PrinterFormDraft>>;
  devices: PrintDeviceRecord[];
  canMarkVerified: boolean;
  markPhysicallyVerified: boolean;
  setMarkPhysicallyVerified: (val: boolean) => void;
  togglePaperSize: (size: PrinterPaperSize) => void;
  submitting: boolean;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
}> = ({
  mode,
  draft,
  setDraft,
  devices,
  canMarkVerified,
  markPhysicallyVerified,
  setMarkPhysicallyVerified,
  togglePaperSize,
  submitting,
  onClose,
  onSubmit,
}) => {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!panelRef.current || reducedMotion()) return;
    gsap.fromTo(
      panelRef.current,
      { scale: 0.94, opacity: 0 },
      { scale: 1, opacity: 1, duration: dur(0.32), ease: 'expo.out', clearProps: 'transform,opacity' }
    );
  }, []);

  const triOptions: ReadonlyArray<{ id: TriStateCapability; label: string }> = [
    { id: 'unknown', label: 'Unknown' },
    { id: 'yes', label: 'Yes' },
    { id: 'no', label: 'No' },
  ];

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="fixed inset-0" onClick={onClose} />
      <div
        ref={panelRef}
        role="dialog"
        aria-label={mode === 'create' ? 'Add Printer' : 'Edit Printer'}
        className="relative w-full max-w-[620px] max-h-[90vh] overflow-y-auto custom-scroll glass-solid rounded-[24px] p-5 sm:p-6 space-y-5"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-[20px] font-bold">
              {mode === 'create' ? 'Add Printer Manually' : 'Edit Printer Profile'}
            </h2>
            <p className="text-[12.5px] text-[var(--muted)] mt-0.5">
              Leave unverified details as Unknown — never invent printer models or capabilities.
            </p>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="w-8 h-8 rounded-[10px] btn-ghost flex items-center justify-center cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <label className="block space-y-1.5">
              <span className="text-[12.5px] font-semibold">Printer Display Name *</span>
              <input
                type="text"
                required
                value={draft.printerName}
                onChange={(e) => setDraft((d) => ({ ...d, printerName: e.target.value }))}
                placeholder="e.g. Shop Counter Printer 1"
                className="admin-input w-full px-3 py-2 text-[13.5px]"
              />
            </label>

            <label className="block space-y-1.5">
              <span className="text-[12.5px] font-semibold">Printer Model (Optional)</span>
              <input
                type="text"
                value={draft.printerModel}
                onChange={(e) => setDraft((d) => ({ ...d, printerModel: e.target.value }))}
                placeholder="Leave blank if unknown"
                className="admin-input w-full px-3 py-2 text-[13.5px]"
              />
            </label>

            <label className="block space-y-1.5">
              <span className="text-[12.5px] font-semibold">Connection Type</span>
              <select
                value={draft.connectionType}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    connectionType: e.target.value as PrinterConnectionType,
                  }))
                }
                className="admin-input w-full px-3 py-2 text-[13.5px]"
              >
                {CONNECTION_OPTIONS.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block space-y-1.5">
              <span className="text-[12.5px] font-semibold">Assign Print Agent Device</span>
              <select
                value={draft.deviceId}
                onChange={(e) => setDraft((d) => ({ ...d, deviceId: e.target.value }))}
                className="admin-input w-full px-3 py-2 text-[13.5px]"
              >
                <option value="">Unassigned — Awaiting Windows Agent</option>
                {devices
                  .filter((dev) => dev.device_status !== 'revoked')
                  .map((dev) => (
                    <option key={dev.id} value={dev.id}>
                      {dev.device_name} ({dev.device_status})
                    </option>
                  ))}
              </select>
            </label>
          </div>

          <label className="block space-y-1.5">
            <span className="text-[12.5px] font-semibold">
              Windows Spooler Printer Name (Optional)
            </span>
            <input
              type="text"
              value={draft.systemPrinterName}
              onChange={(e) => setDraft((d) => ({ ...d, systemPrinterName: e.target.value }))}
              placeholder="Populated manually or via Windows Local Print Agent"
              className="admin-input w-full px-3 py-2 text-[13.5px]"
            />
          </label>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <div className="text-[12.5px] font-semibold">Colour Support</div>
              <SegControl
                ariaLabel="Colour Support"
                value={draft.supportsColour}
                onChange={(val) => setDraft((d) => ({ ...d, supportsColour: val }))}
                options={triOptions}
              />
            </div>

            <div className="space-y-1.5">
              <div className="text-[12.5px] font-semibold">Automatic Duplex Support</div>
              <SegControl
                ariaLabel="Duplex Support"
                value={draft.supportsDuplex}
                onChange={(val) => setDraft((d) => ({ ...d, supportsDuplex: val }))}
                options={triOptions}
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[12.5px] font-semibold">Supported Paper Sizes</span>
              <span className="text-[11.5px] text-[var(--muted)]">
                {draft.supportedPaperSizes.length === 0
                  ? 'None selected (marked Pending Verification)'
                  : `${draft.supportedPaperSizes.length} selected`}
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {PAPER_SIZE_OPTIONS.map((opt) => {
                const selected = draft.supportedPaperSizes.includes(opt.id);
                return (
                  <button
                    key={opt.id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => togglePaperSize(opt.id)}
                    className={`px-3 py-1.5 rounded-[10px] text-[12.5px] font-semibold border transition-colors cursor-pointer ${
                      selected
                        ? 'bg-[var(--accent)] text-[var(--accent-ink)] border-transparent'
                        : 'bg-[var(--card-2)] text-[var(--ink-2)] border-[var(--line)] hover:border-[var(--line-2)]'
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          <label className="block space-y-1.5">
            <span className="text-[12.5px] font-semibold">Audit Notes (Optional)</span>
            <textarea
              rows={2}
              value={draft.auditNotes}
              onChange={(e) => setDraft((d) => ({ ...d, auditNotes: e.target.value }))}
              placeholder="Physical tray location, cable notes, or pending driver check..."
              className="admin-input w-full px-3 py-2 text-[13px]"
            />
          </label>

          <div className="space-y-2.5 pt-1 border-t border-[var(--line)]">
            <label className="flex items-center gap-2.5 cursor-pointer text-[13px]">
              <input
                type="checkbox"
                checked={draft.isEnabled}
                onChange={(e) => setDraft((d) => ({ ...d, isEnabled: e.target.checked }))}
                className="w-4 h-4 accent-[var(--accent)]"
              />
              <span className="font-medium">
                Enable printer in Admin registry (uncheck to keep disabled while unverified)
              </span>
            </label>

            {mode === 'edit' && (
              <label
                className={`flex items-start gap-2.5 text-[13px] ${
                  canMarkVerified ? 'cursor-pointer' : 'opacity-60 cursor-not-allowed'
                }`}
              >
                <input
                  type="checkbox"
                  disabled={!canMarkVerified}
                  checked={markPhysicallyVerified}
                  onChange={(e) => setMarkPhysicallyVerified(e.target.checked)}
                  className="w-4 h-4 mt-0.5 accent-[var(--accent)]"
                />
                <span>
                  <span className="font-medium block">
                    Confirm physical hardware & driver verification completed
                  </span>
                  <span className="text-[11.5px] text-[var(--muted)]">
                    Requires known connection type, Colour, Duplex, and at least one verified paper size.
                  </span>
                </span>
              </label>
            )}
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-2">
            <button
              type="button"
              disabled={submitting}
              onClick={onClose}
              className="btn-ghost px-4 py-2 rounded-[12px] text-[13.5px] font-medium cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="btn-primary px-5 py-2 rounded-[12px] text-[13.5px] cursor-pointer"
            >
              {submitting
                ? 'Saving...'
                : mode === 'create'
                  ? 'Add Printer'
                  : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

const ArchiveConfirmModal: React.FC<{
  printer: PrinterRecord;
  submitting: boolean;
  onClose: () => void;
  onConfirm: () => void;
}> = ({ printer, submitting, onClose, onConfirm }) => (
  <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
    <div className="fixed inset-0" onClick={onClose} />
    <div
      role="dialog"
      aria-label="Archive Printer"
      className="relative w-full max-w-[460px] glass-solid rounded-[24px] p-6 space-y-4"
    >
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-[12px] bg-[var(--bad-soft)] text-[var(--bad)] flex items-center justify-center shrink-0">
          <Archive size={18} />
        </div>
        <div className="space-y-1">
          <h2 className="text-[18px] font-bold">Archive {printer.printer_name}?</h2>
          <p className="text-[13px] text-[var(--muted)] leading-relaxed">
            Archiving disables this printer immediately and moves it out of active queues without deleting any historical <code className="font-mono">print_jobs</code>, <code className="font-mono">print_job_attempts</code>, or audit events.
          </p>
        </div>
      </div>

      <div className="flex items-center justify-end gap-2.5 pt-2">
        <button
          type="button"
          disabled={submitting}
          onClick={onClose}
          className="btn-ghost px-4 py-2 rounded-[12px] text-[13.5px] font-medium cursor-pointer"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={submitting}
          onClick={onConfirm}
          className="px-4 py-2 rounded-[12px] bg-[var(--bad)] text-white font-semibold text-[13.5px] cursor-pointer disabled:opacity-60"
        >
          {submitting ? 'Archiving...' : 'Archive Printer'}
        </button>
      </div>
    </div>
  </div>
);
