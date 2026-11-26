import React, { useEffect, useRef, useState } from 'react';
import { BellRing, Database, Download, ShieldCheck } from 'lucide-react';
import { TabsNav } from '../components/AnimatedControls';
import { useAdmin } from '../context/AdminContext';
import type { WallpaperId } from '../types/admin';
import { floatGain, popBadges, popIcon, revealCards, revealText } from '../utils/animations';
import {
  triggerTextDownload,
  type AdminCleanupLog,
  type AdminDeviceSummary,
  type AdminPrintDashboardMetrics,
  type AdminPrintEvent,
  type AdminPrintJobSummary,
  type AdminPrintPaymentSettings,
  type AdminPrintPricingRule,
  type AdminPrinterSummary,
  type AdminSystemSettings,
  type DailyFinancialReconciliation,
} from '../utils/printManagement';

interface Scan2PrintSnapshotPayload {
  jobs?: AdminPrintJobSummary[];
  metrics?: AdminPrintDashboardMetrics;
  dailyReconciliation?: DailyFinancialReconciliation;
  printers?: AdminPrinterSummary[];
  devices?: AdminDeviceSummary[];
  pricingRules?: AdminPrintPricingRule[];
  paymentSettings?: AdminPrintPaymentSettings;
  systemSettings?: AdminSystemSettings;
  recentEvents?: AdminPrintEvent[];
  cleanupLogs?: AdminCleanupLog[];
  serverNowIso?: string;
}

export const SettingsPage: React.FC = () => {
  const {
    route,
    navigate,
    can,
    appearance,
    integrations,
    fcmStatus,
    metrics,
    updateAppearance,
    registerFcm,
    exportDatabaseJson,
    invokeAdminEdgeFunction,
    showToast,
  } = useAdmin();

  const activeTab =
    (route.sub as 'appearance' | 'alerts' | 'data') || 'appearance';

  const rootRef = useRef<HTMLDivElement>(null);
  const h1Ref = useRef<HTMLHeadingElement>(null);

  const [scanSnapshot, setScanSnapshot] = useState<Scan2PrintSnapshotPayload | null>(null);
  const [exportingScanJson, setExportingScanJson] = useState(false);

  useEffect(() => {
    if (h1Ref.current) revealText(h1Ref.current, 0.04);
  }, []);

  useEffect(() => {
    if (activeTab !== 'data' || !integrations.supabaseConfigured) return;
    let active = true;
    void invokeAdminEdgeFunction<Scan2PrintSnapshotPayload>('admin-print-jobs', {
      action: 'list',
      page: 1,
      pageSize: 15,
    })
      .then((res) => {
        if (active) setScanSnapshot(res);
      })
      .catch(() => {
        // Silent in case Firebase session/Supabase config isn't active yet
      });
    return () => {
      active = false;
    };
  }, [activeTab, integrations.supabaseConfigured, invokeAdminEdgeFunction]);

  useEffect(() => {
    if (!rootRef.current) return;
    revealCards(rootRef.current.querySelectorAll<HTMLElement>('.anim-card'), {
      delay: 0.04,
      stagger: 0.06,
    });
    if (activeTab === 'data') {
      popBadges(rootRef.current.querySelectorAll<HTMLElement>('.data-tile'), {
        from: 0.85,
        delay: 0.12,
        stagger: 0.04,
      });
    }
  }, [activeTab]);

  const canReadAudit = can('audit.read');

  const handleExportScan2PrintSnapshot = async () => {
    if (exportingScanJson) return;
    setExportingScanJson(true);
    try {
      const res = await invokeAdminEdgeFunction<Scan2PrintSnapshotPayload>('admin-print-jobs', {
        action: 'list',
        page: 1,
        pageSize: 100,
      });
      const safeSnapshot = {
        exportedAt: new Date().toISOString(),
        serverNowIso: res.serverNowIso ?? null,
        metrics: res.metrics ?? null,
        dailyReconciliation: res.dailyReconciliation ?? null,
        systemSettings: res.systemSettings ?? null,
        paymentSettings: res.paymentSettings ?? null,
        pricingRules: res.pricingRules ?? [],
        printers: res.printers ?? [],
        devices: res.devices ?? [],
        recentJobs: res.jobs ?? [],
        cleanupLogs: res.cleanupLogs ?? [],
        recentEvents: res.recentEvents ?? [],
      };
      triggerTextDownload(
        `aman-scan2print-snapshot-${new Date().toISOString().slice(0, 10)}.json`,
        JSON.stringify(safeSnapshot, null, 2),
        'application/json'
      );
      setScanSnapshot(res);
      showToast('Scan2Print operational JSON snapshot exported.', 'good');
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Unable to export Scan2Print snapshot.',
        'bad'
      );
    } finally {
      setExportingScanJson(false);
    }
  };

  return (
    <div ref={rootRef} className="space-y-5">
      <div>
        <h1
          ref={h1Ref}
          className="text-[30px] sm:text-[34px] font-bold tracking-tight leading-tight"
        >
          Settings
        </h1>
        <p className="text-[14px] text-[var(--muted)] mt-1">
          Display preferences, Firebase Cloud Messaging alerts, and database export.
        </p>
      </div>

      <TabsNav
        activeId={activeTab}
        onNavigate={navigate}
        items={[
          { id: 'appearance', label: 'Appearance', href: '#/settings/appearance' },
          { id: 'alerts', label: 'Alerts & FCM', href: '#/settings/alerts' },
          { id: 'data', label: 'Data Backup', href: '#/settings/data' },
        ]}
      />

      {/* Appearance Tab */}
      {activeTab === 'appearance' && (
        <div className="space-y-4 max-w-[820px]">
          <section className="anim-card glass-pane rounded-[24px] p-5 sm:p-6 space-y-5">
            <div>
              <h2 className="text-[17px] font-bold">Theme</h2>
              <p className="text-[12.5px] text-[var(--muted)]">Saved on this device</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {(
                [
                  { id: 'light', label: 'Light', bg: '#ebe8e3', card: '#ffffff', accent: '#f07a2e' },
                  { id: 'dark', label: 'Dark', bg: '#0d1117', card: '#1b202b', accent: '#ff8c42' },
                  {
                    id: 'system',
                    label: 'Match system',
                    bg: 'linear-gradient(135deg, #ebe8e3 50%, #0d1117 50%)',
                    card: '#8c8a8e',
                    accent: '#ff8c42',
                  },
                ] as const
              ).map((t) => {
                const active = appearance.theme === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    data-lift
                    onClick={(e) => updateAppearance({ theme: t.id }, e.currentTarget)}
                    className={`rounded-[18px] p-3 text-left border transition-all cursor-pointer ${
                      active
                        ? 'border-[var(--accent)] ring-2 ring-[var(--accent-soft)]'
                        : 'border-[var(--line)] hover:border-[var(--line-2)]'
                    }`}
                  >
                    <div
                      className="h-20 rounded-[12px] p-2.5 flex flex-col justify-between mb-2.5"
                      style={{ background: t.bg }}
                    >
                      <span
                        className="w-6 h-2 rounded-full"
                        style={{ background: t.accent }}
                      />
                      <span
                        className="w-full h-5 rounded-md opacity-80"
                        style={{ background: t.card }}
                      />
                    </div>
                    <div className="font-semibold text-[13.5px]">{t.label}</div>
                  </button>
                );
              })}
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-[var(--line)]">
              <div>
                <div className="font-semibold text-[14px]">Collapsed sidebar</div>
                <div className="text-[12.5px] text-[var(--muted)]">
                  Icons only, names on hover. Shortcut: [
                </div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={appearance.collapsedRail}
                onClick={(e) => {
                  popIcon(e.currentTarget);
                  updateAppearance({ collapsedRail: !appearance.collapsedRail });
                }}
                className={`w-11 h-6 rounded-full p-0.5 transition-colors cursor-pointer ${
                  appearance.collapsedRail ? 'bg-[var(--accent)]' : 'bg-[var(--card-3)]'
                }`}
              >
                <span
                  className={`block w-5 h-5 rounded-full bg-white shadow-sm transition-transform ${
                    appearance.collapsedRail ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          </section>

          <section className="anim-card glass-pane rounded-[24px] p-5 sm:p-6 space-y-5">
            <div>
              <h2 className="text-[17px] font-bold">Wallpaper & glass</h2>
              <p className="text-[12.5px] text-[var(--muted)]">
                The backdrop every pane sits on, and how frosted the panes are
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {(
                [
                  { id: 'wall-dusk', label: 'Dusk horizon' },
                  { id: 'wall-street', label: 'Warm stone' },
                  { id: 'wall-room', label: 'Golden studio' },
                ] as { id: WallpaperId; label: string }[]
              ).map((w) => {
                const active = appearance.wallpaper === w.id;
                return (
                  <button
                    key={w.id}
                    type="button"
                    data-lift
                    onClick={() => updateAppearance({ wallpaper: w.id })}
                    className={`rounded-[18px] overflow-hidden border text-left transition-all cursor-pointer ${
                      active
                        ? 'border-[var(--accent)] ring-2 ring-[var(--accent-soft)]'
                        : 'border-[var(--line)] hover:border-[var(--line-2)]'
                    }`}
                  >
                    <div className="aspect-[16/10] overflow-hidden">
                      <img
                        src={`/photos/wallpapers/${w.id}.jpg`}
                        alt={w.label}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="px-3 py-2 text-[13px] font-semibold">{w.label}</div>
                  </button>
                );
              })}
            </div>

            <div className="pt-2 space-y-2">
              <div className="flex items-center justify-between text-[13.5px]">
                <label htmlFor="frost-slider" className="font-semibold">
                  Frost
                </label>
                <span className="font-bold tabular-nums">{appearance.frost}%</span>
              </div>
              <input
                id="frost-slider"
                type="range"
                min={20}
                max={95}
                value={appearance.frost}
                onChange={(e) =>
                  updateAppearance({ frost: Number(e.target.value) })
                }
                className="w-full accent-[var(--accent)] cursor-pointer"
              />
              <p className="text-[12px] text-[var(--muted)]">
                Less frost lets more of the backdrop through; more makes panes quieter and easier to read.
              </p>
            </div>
          </section>
        </div>
      )}

      {/* Alerts & Firebase FCM */}
      {activeTab === 'alerts' && (
        <section className="anim-card glass-pane rounded-[24px] p-5 sm:p-6 max-w-[820px] space-y-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-[17px] font-bold">Firebase Cloud Messaging (FCM) Alerts</h2>
              <p className="text-[12.5px] text-[var(--muted)] mt-0.5">
                Receive push notifications when customer enquiries arrive or Bihar Government fetches complete.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void registerFcm()}
              className="btn-primary px-4 py-2 rounded-full text-[13px] inline-flex items-center gap-1.5 cursor-pointer"
            >
              <BellRing size={14} />
              <span>{fcmStatus.registered ? 'Subscribed' : 'Enable Browser Push'}</span>
            </button>
          </div>

          {fcmStatus.message && (
            <div className="rounded-[14px] bg-[var(--card-2)] border border-[var(--line)] p-3 text-[12.5px]">
              {fcmStatus.message}
            </div>
          )}

          <div className="divide-y divide-[var(--line)] text-[13px]">
            {[
              {
                label: 'Firebase Client SDK (Analytics & Performance)',
                status: integrations.firebaseConfigured ? 'Configured' : 'VITE_FIREBASE_* unset',
              },
              {
                label: 'FCM Server Push Dispatcher',
                status: integrations.fcmServerConfigured ? 'Configured' : 'FIREBASE_SERVER_KEY unset',
              },
              {
                label: 'In-App Administrative Notification Bell',
                status: 'Active',
              },
            ].map((row) => (
              <div key={row.label} className="py-3 flex items-center justify-between gap-3">
                <span className="font-medium">{row.label}</span>
                <span className="px-2.5 py-0.5 rounded-full bg-[var(--card-2)] border border-[var(--line)] text-[12px] font-semibold">
                  {row.status}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Data Backup Tab */}
      {activeTab === 'data' && (
        <div className="space-y-4 max-w-[820px]">
          <section className="anim-card glass-pane rounded-[24px] p-5 sm:p-6 space-y-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-[17px] font-bold">Scan2Print Live Cloud Snapshot</h2>
                <p className="text-[12.5px] text-[var(--muted)]">
                  Authoritative Supabase print jobs, pricing rules, counter printers, enrolled PCs, and audit logs
                </p>
              </div>
              <Database size={18} className="text-[#25C7D9]" />
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { count: scanSnapshot?.metrics?.totalJobs ?? 0, label: 'Print Jobs' },
                { count: scanSnapshot?.pricingRules?.length ?? 0, label: 'Pricing Rules' },
                { count: scanSnapshot?.printers?.length ?? 0, label: 'Printers' },
                { count: scanSnapshot?.recentEvents?.length ?? 0, label: 'Audit Events' },
              ].map((item) => (
                <div
                  key={item.label}
                  className="data-tile rounded-[16px] bg-[var(--card-2)] border border-[var(--line)] p-3.5 text-center"
                >
                  <div className="text-[22px] font-bold tabular-nums">{item.count}</div>
                  <div className="text-[12px] text-[var(--muted)] mt-0.5">{item.label}</div>
                </div>
              ))}
            </div>

            <div className="pt-4 border-t border-[var(--line)] flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="font-semibold text-[14px]">Export Scan2Print operational JSON</div>
                <div className="text-[12.5px] text-[var(--muted)]">
                  Downloads sanitized Scan2Print settings, pricing rules, printers, devices, recent jobs, and audit logs (zero secret credentials).
                </div>
              </div>
              <button
                type="button"
                disabled={!canReadAudit || exportingScanJson || !integrations.supabaseConfigured}
                onClick={(e) => {
                  popIcon(e.currentTarget);
                  floatGain(e.currentTarget, '.json', 'good');
                  void handleExportScan2PrintSnapshot();
                }}
                className="btn-primary px-4 py-2 rounded-full text-[13px] font-medium inline-flex items-center gap-2 disabled:opacity-45 cursor-pointer"
              >
                <Download size={14} />
                <span>{exportingScanJson ? 'Exporting...' : 'Export Scan2Print JSON'}</span>
              </button>
            </div>
          </section>

          <section className="anim-card glass-pane rounded-[24px] p-5 sm:p-6 space-y-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-[17px] font-bold">CMS Workspace Database Export</h2>
                <p className="text-[12.5px] text-[var(--muted)]">
                  Live record counts stored on the Express CMS SQLite database
                </p>
              </div>
              <ShieldCheck size={18} className="text-[var(--good)]" />
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { count: metrics.totalServices, label: 'Services' },
                { count: metrics.galleryImages, label: 'Gallery Photos' },
                { count: metrics.totalEnquiries, label: 'Enquiries' },
                { count: metrics.publishedGovtUpdates + metrics.pendingGovtUpdates, label: 'Bihar Updates' },
              ].map((item) => (
                <div
                  key={item.label}
                  className="data-tile rounded-[16px] bg-[var(--card-2)] border border-[var(--line)] p-3.5 text-center"
                >
                  <div className="text-[22px] font-bold tabular-nums">{item.count}</div>
                  <div className="text-[12px] text-[var(--muted)] mt-0.5">{item.label}</div>
                </div>
              ))}
            </div>

            <div className="pt-4 border-t border-[var(--line)] flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="font-semibold text-[14px]">Export CMS workspace JSON</div>
                <div className="text-[12.5px] text-[var(--muted)]">
                  Downloads Business Profile, Hero, Owner, Services, Gallery, Testimonials, FAQs, and Bihar Updates (requires local Express server).
                </div>
              </div>
              <button
                type="button"
                disabled={!canReadAudit}
                onClick={(e) => {
                  popIcon(e.currentTarget);
                  floatGain(e.currentTarget, '.json', 'good');
                  void exportDatabaseJson().catch((err) =>
                    showToast(err instanceof Error ? err.message : 'CMS export unavailable on static hosting', 'bad')
                  );
                }}
                className="btn-ghost px-4 py-2 rounded-full text-[13px] font-medium inline-flex items-center gap-2 disabled:opacity-45 cursor-pointer"
              >
                <Download size={14} />
                <span>Export CMS JSON</span>
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
};

