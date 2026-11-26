// AC Scan2Print — Phase 21: Bulk Coaching Batch Estimator, Saved Shop Templates
// & Unified Single-Shop Print History Search Archive

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Archive,
  Bookmark,
  CheckCircle2,
  Download,
  Layers,
  Plus,
  Printer,
  RefreshCw,
  Search,
  Trash2,
} from 'lucide-react';
import { apiRequest } from '../../lib/api';
import { getCurrentFirebaseIdToken } from '../../lib/firebase';

type PaperSize = 'A4' | 'A3' | 'Legal';
type PrintMode = 'bw' | 'colour';
type PrintSides = 'single' | 'duplex';
type PagesPerSheet = 1 | 2 | 4;
type FinishingServiceId =
  | 'none'
  | 'staple_corner'
  | 'spiral_binding'
  | 'thermal_lamination'
  | 'heavy_cover_bind';

interface BatchDocumentLineDraft {
  title: string;
  pageCount: number;
  paperSize: PaperSize;
  printMode: PrintMode;
  printSides: PrintSides;
  pagesPerSheet: PagesPerSheet;
  finishingService: FinishingServiceId;
}

interface BatchVolumeTierView {
  id: string;
  label: string;
  minSheets: number;
  discountPct: number;
}

interface ShopJobTemplateView {
  id: string;
  templateName: string;
  category: 'exam_packet' | 'coaching_notes' | 'office_combo' | 'custom';
  description: string;
  defaultSets: number;
  items: BatchDocumentLineDraft[];
  isSystem: boolean;
  createdAt: string;
}

interface CommittedBatchView {
  id: string;
  batchRef: string;
  batchTitle: string;
  customerName: string;
  paymentMethod: 'cash' | 'upi' | 'khata';
  studentSets: number;
  totalPhysicalSheets: number;
  volumeTierId: string;
  discountPct: number;
  grossTotalPaise: number;
  grossTotalInr: number;
  jobCardLines: string[];
  createdAt: string;
}

interface UnifiedArchiveEntryView {
  id: string;
  sourceType: 'walkin' | 'batch' | 'wastage';
  refCode: string;
  titleOrCustomer: string;
  paymentMethod: string;
  physicalSheets: number;
  amountPaise: number;
  summaryNote: string;
  createdAt: string;
}

interface BatchQuoteView {
  batchRef: string;
  studentSets: number;
  totalPhysicalSheets: number;
  volumeTier: BatchVolumeTierView;
  rawPrintSubtotalPaise: number;
  discountPaise: number;
  finishingTotalPaise: number;
  grossTotalPaise: number;
  grossTotalInr: number;
  gstTaxableInr: number;
  cgstInr: number;
  sgstInr: number;
  jobCardLines: string[];
}

interface BatchArchiveStatePayload {
  checkedAtIso: string;
  volumeTiers: BatchVolumeTierView[];
  templates: ShopJobTemplateView[];
  recentBatches: CommittedBatchView[];
  archiveEntries: UnifiedArchiveEntryView[];
  archiveSummary: {
    matchedCount: number;
    totalSheets: number;
    netSalesPaise: number;
    wastageLossPaise: number;
  };
}

interface KhataOptionView {
  id: string;
  clientName: string;
  balanceDueInr: number;
}

type SubTab = 'estimator' | 'templates' | 'archive';

export const BatchArchivePanel: React.FC<{
  onToast?: (message: string, tone?: 'good' | 'bad' | 'info') => void;
}> = ({ onToast }) => {
  const [subTab, setSubTab] = useState<SubTab>('estimator');
  const [state, setState] = useState<BatchArchiveStatePayload | null>(null);
  const [khataAccounts, setKhataAccounts] = useState<KhataOptionView[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Batch Estimator Form
  const [batchTitle, setBatchTitle] = useState('SSC Foundation Notes Pack');
  const [customerName, setCustomerName] = useState('Sharma Coaching Centre');
  const [studentSets, setStudentSets] = useState('15');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'upi' | 'khata'>('cash');
  const [khataAccountId, setKhataAccountId] = useState('');
  const [deductInventory, setDeductInventory] = useState(true);
  const [lines, setLines] = useState<BatchDocumentLineDraft[]>([
    {
      title: 'Quantitative Aptitude Chapter 1-6',
      pageCount: 64,
      paperSize: 'A4',
      printMode: 'bw',
      printSides: 'duplex',
      pagesPerSheet: 2,
      finishingService: 'spiral_binding',
    },
  ]);
  const [liveQuote, setLiveQuote] = useState<BatchQuoteView | null>(null);
  const [lastJobCard, setLastJobCard] = useState<string[] | null>(null);

  // Save as Template State
  const [newTplName, setNewTplName] = useState('');
  const [newTplDesc, setNewTplDesc] = useState('');
  const [newTplCategory, setNewTplCategory] = useState<'coaching_notes' | 'exam_packet' | 'office_combo' | 'custom'>('coaching_notes');

  // Archive Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [sourceFilter, setSourceFilter] = useState<'all' | 'walkin' | 'batch' | 'wastage'>('all');
  const [payFilter, setPayFilter] = useState<'all' | 'cash' | 'upi' | 'khata' | 'internal'>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const loadState = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const params = new URLSearchParams();
      if (searchQuery.trim()) params.set('q', searchQuery.trim());
      if (sourceFilter !== 'all') params.set('sourceType', sourceFilter);
      if (payFilter !== 'all') params.set('paymentMethod', payFilter);
      if (dateFrom) params.set('dateFrom', dateFrom);
      if (dateTo) params.set('dateTo', dateTo);

      const qs = params.toString() ? `?${params.toString()}` : '';
      const [batchData, counterData] = await Promise.all([
        apiRequest<BatchArchiveStatePayload>(`/batch-archive/state${qs}`),
        apiRequest<{ khataAccounts?: KhataOptionView[] }>('/counter-ops/state').catch(() => ({
          khataAccounts: [],
        })),
      ]);
      setState(batchData);
      const khataList = counterData.khataAccounts ?? [];
      setKhataAccounts(khataList);
      if (khataList.length > 0 && !khataAccountId) {
        setKhataAccountId(khataList[0].id);
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to load Phase 21 workspace.');
    } finally {
      setLoading(false);
    }
  }, [searchQuery, sourceFilter, payFilter, dateFrom, dateTo, khataAccountId]);

  useEffect(() => {
    void loadState();
  }, [loadState]);

  useEffect(() => {
    if (lines.length === 0) return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const res = await fetch('/api/batch-archive/quote', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            batchTitle,
            studentSets: Math.max(1, Number(studentSets) || 1),
            items: lines,
          }),
        });
        if (!res.ok) return;
        const json = (await res.json()) as { quote?: BatchQuoteView };
        if (!cancelled && json.quote) {
          setLiveQuote(json.quote);
        }
      } catch {
        // ignore transient quote error
      }
    }, 150);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [batchTitle, studentSets, lines]);

  const handleLoadTemplate = (tpl: ShopJobTemplateView) => {
    setBatchTitle(tpl.templateName);
    setStudentSets(String(tpl.defaultSets));
    setLines(tpl.items.map((it) => ({ ...it })));
    setSubTab('estimator');
    onToast?.(`Loaded template: ${tpl.templateName}`, 'good');
  };

  const handleCommitBatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || lines.length === 0) return;
    setBusy(true);
    setErrorMsg(null);
    try {
      const res = await apiRequest<{
        batchRef: string;
        quote: BatchQuoteView;
        state: BatchArchiveStatePayload;
      }>('/batch-archive/batches', {
        method: 'POST',
        body: JSON.stringify({
          batchTitle: batchTitle.trim() || 'Coaching Notes Batch',
          customerName: customerName.trim() || 'Walk-in Batch',
          studentSets: Math.max(1, Number(studentSets) || 1),
          paymentMethod,
          khataAccountId: paymentMethod === 'khata' ? khataAccountId : null,
          deductInventory,
          items: lines,
        }),
      });
      setState(res.state);
      setLastJobCard(res.quote.jobCardLines);
      onToast?.(`Batch ${res.batchRef} saved & stock synced (₹${res.quote.grossTotalInr.toFixed(2)})`, 'good');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to commit batch.';
      setErrorMsg(msg);
      onToast?.(msg, 'bad');
    } finally {
      setBusy(false);
    }
  };

  const handleSaveTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || !newTplName.trim() || lines.length === 0) return;
    setBusy(true);
    setErrorMsg(null);
    try {
      const res = await apiRequest<{ state: BatchArchiveStatePayload }>('/batch-archive/templates', {
        method: 'POST',
        body: JSON.stringify({
          templateName: newTplName.trim(),
          category: newTplCategory,
          description: newTplDesc.trim(),
          defaultSets: Math.max(1, Number(studentSets) || 1),
          items: lines,
        }),
      });
      setState(res.state);
      setNewTplName('');
      setNewTplDesc('');
      onToast?.('Saved reusable shop job template', 'good');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to save template.';
      setErrorMsg(msg);
      onToast?.(msg, 'bad');
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteTemplate = async (id: string) => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await apiRequest<{ state: BatchArchiveStatePayload }>(
        `/batch-archive/templates/${encodeURIComponent(id)}`,
        { method: 'DELETE' }
      );
      setState(res.state);
      onToast?.('Custom template deleted', 'good');
    } catch (err) {
      onToast?.(err instanceof Error ? err.message : 'Unable to delete template.', 'bad');
    } finally {
      setBusy(false);
    }
  };

  const handleExportArchiveCsv = async () => {
    try {
      const token = await getCurrentFirebaseIdToken().catch(() => null);
      const params = new URLSearchParams();
      if (searchQuery.trim()) params.set('q', searchQuery.trim());
      if (sourceFilter !== 'all') params.set('sourceType', sourceFilter);
      if (payFilter !== 'all') params.set('paymentMethod', payFilter);
      if (dateFrom) params.set('dateFrom', dateFrom);
      if (dateTo) params.set('dateTo', dateTo);
      const qs = params.toString() ? `?${params.toString()}` : '';

      const res = await fetch(`/api/batch-archive/archive/export${qs}`, {
        credentials: 'include',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) {
        onToast?.('Unable to export Print Archive CSV.', 'bad');
        return;
      }
      const csv = await res.text();
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `aman-computer-print-archive-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      onToast?.('CSV download failed.', 'bad');
    }
  };

  const netArchiveInr = useMemo(
    () => ((state?.archiveSummary.netSalesPaise ?? 0) / 100).toFixed(2),
    [state?.archiveSummary.netSalesPaise]
  );

  return (
    <div className="space-y-5">
      {/* Header + 4 KPI Cards */}
      <section className="glass-pane rounded-[20px] p-5 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-[18px] font-bold flex items-center gap-2 text-[var(--ink)]">
              <Layers size={18} className="text-[var(--accent-text)]" />
              <span>Phase 21: Bulk Notes Batch Estimator, Job Templates &amp; History Archive</span>
            </h2>
            <p className="text-[12.5px] text-[var(--muted)] mt-1">
              Volume slab pricing for coaching booklets, 1-click repeat counter packets, and unified Walk-In/Batch/Wastage search.
            </p>
          </div>
          <button
            type="button"
            disabled={loading || busy}
            onClick={() => void loadState()}
            className="btn-ghost px-3 py-1.5 rounded-[10px] text-[12px] font-semibold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            <span>{loading ? 'Syncing...' : 'Refresh'}</span>
          </button>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="rounded-[12px] p-3.5 bg-[var(--card-2)] border border-[var(--line)]">
            <div className="text-[11px] font-semibold text-[var(--muted)]">Committed Bulk Batches</div>
            <div className="text-[20px] font-bold text-[var(--ink)] tabular-nums mt-0.5">
              {state?.recentBatches.length ?? 0} batches
            </div>
            <div className="text-[11.5px] text-[var(--muted)]">Synced with stock &amp; Khata</div>
          </div>

          <div className="rounded-[12px] p-3.5 bg-[var(--card-2)] border border-[var(--line)]">
            <div className="text-[11px] font-semibold text-[var(--muted)]">Shop Packet Templates</div>
            <div className="text-[20px] font-bold text-[var(--accent-text)] tabular-nums mt-0.5">
              {state?.templates.length ?? 0} presets
            </div>
            <div className="text-[11.5px] text-[var(--muted)]">Exam, KYC &amp; Coaching sets</div>
          </div>

          <div className="rounded-[12px] p-3.5 bg-[var(--card-2)] border border-[var(--line)]">
            <div className="text-[11px] font-semibold text-[var(--muted)]">Archive Records Matched</div>
            <div className="text-[20px] font-bold text-[var(--ink)] tabular-nums mt-0.5">
              {state?.archiveSummary.matchedCount ?? 0} entries
            </div>
            <div className="text-[11.5px] text-[var(--muted)] tabular-nums">
              {state?.archiveSummary.totalSheets ?? 0} physical sheets
            </div>
          </div>

          <div className="rounded-[12px] p-3.5 bg-[var(--card-2)] border border-[var(--line)]">
            <div className="text-[11px] font-semibold text-[var(--muted)]">Archive Net Sales</div>
            <div className="text-[20px] font-bold text-[var(--good)] tabular-nums mt-0.5">
              ₹{netArchiveInr}
            </div>
            <div className="text-[11.5px] text-[var(--muted)] tabular-nums">
              Wastage: ₹{((state?.archiveSummary.wastageLossPaise ?? 0) / 100).toFixed(2)}
            </div>
          </div>
        </div>

        {/* Sub-Navigation */}
        <div className="flex flex-wrap gap-1.5 p-1 rounded-[12px] bg-[var(--card-2)] border border-[var(--line)] w-fit">
          {([
            { id: 'estimator', label: 'Bulk Batch Estimator', icon: Layers },
            { id: 'templates', label: 'Saved Job Templates', icon: Bookmark },
            { id: 'archive', label: 'Print History Archive', icon: Archive },
          ] as const).map((t) => {
            const Icon = t.icon;
            const active = subTab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setSubTab(t.id)}
                className={`px-3.5 py-2 rounded-[9px] text-[12.5px] font-semibold inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap transition-colors ${
                  active
                    ? 'bg-[var(--accent-soft)] text-[var(--accent-text)]'
                    : 'text-[var(--muted)] hover:text-[var(--ink)]'
                }`}
              >
                <Icon size={14} />
                <span>{t.label}</span>
              </button>
            );
          })}
        </div>

        {errorMsg && (
          <div
            role="alert"
            className="rounded-[12px] p-3 bg-[var(--bad-soft)] border border-[var(--bad)]/30 text-[var(--bad)] text-[12.5px] flex items-center gap-2"
          >
            <AlertTriangle size={15} className="shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}
      </section>

      {/* SUBVIEW 1: BULK COACHING BATCH ESTIMATOR & JOB CARD */}
      {subTab === 'estimator' && (
        <section className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          <form onSubmit={handleCommitBatch} className="xl:col-span-2 glass-pane rounded-[20px] p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-[15.5px] font-bold text-[var(--ink)]">
                Coaching Booklet &amp; Student Set Calculator
              </h3>
              <button
                type="button"
                onClick={() =>
                  setLines((prev) => [
                    ...prev,
                    {
                      title: `Chapter Packet ${prev.length + 1}`,
                      pageCount: 24,
                      paperSize: 'A4',
                      printMode: 'bw',
                      printSides: 'duplex',
                      pagesPerSheet: 2,
                      finishingService: 'staple_corner',
                    },
                  ])
                }
                className="btn-ghost px-3 py-1.5 rounded-[9px] text-[12px] font-semibold inline-flex items-center gap-1 cursor-pointer"
              >
                <Plus size={13} />
                <span>Add Booklet Row</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label htmlFor="batch-title" className="block text-[11.5px] font-semibold mb-1">
                  Batch Title
                </label>
                <input
                  id="batch-title"
                  type="text"
                  value={batchTitle}
                  onChange={(e) => setBatchTitle(e.target.value)}
                  className="w-full rounded-[10px] bg-[var(--card-2)] border border-[var(--line)] px-3 py-2 text-[12.5px]"
                />
              </div>
              <div>
                <label htmlFor="batch-customer" className="block text-[11.5px] font-semibold mb-1">
                  Institute / Student Name
                </label>
                <input
                  id="batch-customer"
                  type="text"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="w-full rounded-[10px] bg-[var(--card-2)] border border-[var(--line)] px-3 py-2 text-[12.5px]"
                />
              </div>
              <div>
                <label htmlFor="batch-sets" className="block text-[11.5px] font-semibold mb-1">
                  Complete Sets (Copies)
                </label>
                <input
                  id="batch-sets"
                  type="number"
                  min={1}
                  max={500}
                  value={studentSets}
                  onChange={(e) => setStudentSets(e.target.value)}
                  className="w-full rounded-[10px] bg-[var(--card-2)] border border-[var(--line)] px-3 py-2 text-[12.5px] tabular-nums"
                />
              </div>
            </div>

            <div className="space-y-2.5">
              {lines.map((line, idx) => (
                <div
                  key={idx}
                  className="rounded-[12px] p-3 bg-[var(--card-2)] border border-[var(--line)] grid grid-cols-2 sm:grid-cols-7 gap-2 items-end"
                >
                  <div className="col-span-2">
                    <label className="block text-[11px] font-semibold mb-1">Document / Chapter</label>
                    <input
                      type="text"
                      value={line.title}
                      onChange={(e) =>
                        setLines((prev) =>
                          prev.map((row, rIdx) => (rIdx === idx ? { ...row, title: e.target.value } : row))
                        )
                      }
                      className="w-full rounded-[8px] bg-[var(--card-1)] border border-[var(--line)] px-2.5 py-1.5 text-[12px]"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold mb-1">Pages</label>
                    <input
                      type="number"
                      min={1}
                      max={2000}
                      value={line.pageCount}
                      onChange={(e) =>
                        setLines((prev) =>
                          prev.map((row, rIdx) =>
                            rIdx === idx ? { ...row, pageCount: Math.max(1, Number(e.target.value) || 1) } : row
                          )
                        )
                      }
                      className="w-full rounded-[8px] bg-[var(--card-1)] border border-[var(--line)] px-2 py-1.5 text-[12px] tabular-nums"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold mb-1">Mode</label>
                    <select
                      value={line.printMode}
                      onChange={(e) =>
                        setLines((prev) =>
                          prev.map((row, rIdx) =>
                            rIdx === idx ? { ...row, printMode: e.target.value as PrintMode } : row
                          )
                        )
                      }
                      className="w-full rounded-[8px] bg-[var(--card-1)] border border-[var(--line)] px-2 py-1.5 text-[12px]"
                    >
                      <option value="bw">B&amp;W</option>
                      <option value="colour">Colour</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold mb-1">Sides / N-Up</label>
                    <select
                      value={`${line.printSides}:${line.pagesPerSheet}`}
                      onChange={(e) => {
                        const [sides, nup] = e.target.value.split(':');
                        setLines((prev) =>
                          prev.map((row, rIdx) =>
                            rIdx === idx
                              ? {
                                  ...row,
                                  printSides: sides as PrintSides,
                                  pagesPerSheet: Number(nup) as PagesPerSheet,
                                }
                              : row
                          )
                        );
                      }}
                      className="w-full rounded-[8px] bg-[var(--card-1)] border border-[var(--line)] px-2 py-1.5 text-[12px]"
                    >
                      <option value="duplex:2">Duplex 2-up</option>
                      <option value="duplex:1">Duplex 1-up</option>
                      <option value="single:1">Single 1-up</option>
                      <option value="duplex:4">Duplex 4-up</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold mb-1">Binding</label>
                    <select
                      value={line.finishingService}
                      onChange={(e) =>
                        setLines((prev) =>
                          prev.map((row, rIdx) =>
                            rIdx === idx
                              ? { ...row, finishingService: e.target.value as FinishingServiceId }
                              : row
                          )
                        )
                      }
                      className="w-full rounded-[8px] bg-[var(--card-1)] border border-[var(--line)] px-2 py-1.5 text-[12px]"
                    >
                      <option value="none">Loose</option>
                      <option value="staple_corner">Staple (₹5)</option>
                      <option value="spiral_binding">Spiral (₹30)</option>
                      <option value="thermal_lamination">Laminate (₹20)</option>
                      <option value="heavy_cover_bind">Cover Bind (₹45)</option>
                    </select>
                  </div>
                  <div className="flex justify-end">
                    <button
                      type="button"
                      disabled={lines.length <= 1}
                      onClick={() => setLines((prev) => prev.filter((_, rIdx) => rIdx !== idx))}
                      aria-label={`Remove booklet row ${idx + 1}`}
                      className="btn-ghost p-2 rounded-[8px] text-[var(--bad)] cursor-pointer disabled:opacity-40"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-[var(--line)] items-end">
              <div>
                <label htmlFor="batch-payment" className="block text-[11.5px] font-semibold mb-1">
                  Settlement Mode
                </label>
                <select
                  id="batch-payment"
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value as 'cash' | 'upi' | 'khata')}
                  className="w-full rounded-[10px] bg-[var(--card-2)] border border-[var(--line)] px-3 py-2 text-[12.5px]"
                >
                  <option value="cash">Counter Cash</option>
                  <option value="upi">Counter UPI QR</option>
                  <option value="khata">Regular Client Khata</option>
                </select>
              </div>
              {paymentMethod === 'khata' && (
                <div>
                  <label htmlFor="batch-khata" className="block text-[11.5px] font-semibold mb-1">
                    Khata Client Account
                  </label>
                  <select
                    id="batch-khata"
                    value={khataAccountId}
                    onChange={(e) => setKhataAccountId(e.target.value)}
                    className="w-full rounded-[10px] bg-[var(--card-2)] border border-[var(--line)] px-3 py-2 text-[12.5px]"
                  >
                    {khataAccounts.map((k) => (
                      <option key={k.id} value={k.id}>
                        {k.clientName} (Due ₹{k.balanceDueInr.toFixed(0)})
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <label className="inline-flex items-center gap-2 text-[12px] cursor-pointer pb-2">
                <input
                  type="checkbox"
                  checked={deductInventory}
                  onChange={(e) => setDeductInventory(e.target.checked)}
                />
                <span>Auto-deduct paper &amp; coils</span>
              </label>
            </div>

            <button
              type="submit"
              disabled={busy || !liveQuote}
              className="btn-primary w-full py-2.5 rounded-[11px] text-[13px] font-semibold inline-flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              <Printer size={15} />
              <span>
                Commit Batch Job Card{liveQuote ? ` · ₹${liveQuote.grossTotalInr.toFixed(2)}` : ''}
              </span>
            </button>
          </form>

          {/* Right Column: Live Slab Breakdown & Production Job Card */}
          <div className="glass-pane rounded-[20px] p-5 space-y-4">
            <h3 className="text-[15.5px] font-bold text-[var(--ink)]">Live Slab Quote &amp; Job Card</h3>

            {liveQuote ? (
              <div className="space-y-2.5 text-[12.5px]">
                <div className="rounded-[12px] p-3 bg-[var(--card-2)] border border-[var(--line)] space-y-1.5">
                  <div className="flex justify-between">
                    <span className="text-[var(--muted)]">Total Sheets Required</span>
                    <span className="font-bold tabular-nums">{liveQuote.totalPhysicalSheets} sheets</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[var(--muted)]">Volume Tier</span>
                    <span className="font-semibold text-[var(--accent-text)]">
                      {liveQuote.volumeTier.discountPct}% slab discount
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[var(--muted)]">Print Base Subtotal</span>
                    <span className="tabular-nums">
                      ₹{(liveQuote.rawPrintSubtotalPaise / 100).toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between text-[var(--good)]">
                    <span>Slab Savings</span>
                    <span className="tabular-nums">-₹{(liveQuote.discountPaise / 100).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[var(--muted)]">Spiral / Binding / Fin.</span>
                    <span className="tabular-nums">
                      ₹{(liveQuote.finishingTotalPaise / 100).toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between pt-1.5 border-t border-[var(--line)] text-[14px] font-bold">
                    <span>Final Batch Total</span>
                    <span className="text-[var(--good)] tabular-nums">
                      ₹{liveQuote.grossTotalInr.toFixed(2)}
                    </span>
                  </div>
                  <div className="text-[11px] text-[var(--muted)] tabular-nums">
                    GST Tax Split (Incl.): Taxable ₹{liveQuote.gstTaxableInr.toFixed(2)} · CGST ₹
                    {liveQuote.cgstInr.toFixed(2)} · SGST ₹{liveQuote.sgstInr.toFixed(2)}
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-[12px] text-[var(--muted)]">Calculating batch slab...</div>
            )}

            <div className="space-y-1.5">
              <div className="text-[12px] font-semibold text-[var(--muted)]">
                Counter Batch Job Card Preview
              </div>
              <pre className="rounded-[12px] p-3 bg-[#0f172a] text-[#e2e8f0] font-mono text-[11px] leading-relaxed overflow-x-auto">
                {(lastJobCard ?? liveQuote?.jobCardLines ?? []).join('\n')}
              </pre>
            </div>
          </div>
        </section>
      )}

      {/* SUBVIEW 2: SAVED SHOP JOB TEMPLATES */}
      {subTab === 'templates' && (
        <section className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          <div className="xl:col-span-2 glass-pane rounded-[20px] p-5 space-y-3">
            <h3 className="text-[15.5px] font-bold text-[var(--ink)]">
              Pre-Seeded &amp; Custom Shop Packet Templates
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {(state?.templates ?? []).map((tpl) => (
                <div
                  key={tpl.id}
                  className="rounded-[12px] p-4 bg-[var(--card-2)] border border-[var(--line)] flex flex-col justify-between gap-3"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <div className="text-[13.5px] font-bold text-[var(--ink)]">
                        {tpl.templateName}
                      </div>
                      {!tpl.isSystem && (
                        <button
                          type="button"
                          onClick={() => void handleDeleteTemplate(tpl.id)}
                          aria-label={`Delete ${tpl.templateName}`}
                          className="text-[var(--bad)] p-1 cursor-pointer"
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                    <div className="text-[11.5px] text-[var(--muted)] mt-1">
                      {tpl.category.replace('_', ' ')} · {tpl.defaultSets} default set(s) · {tpl.items.length} file slot(s)
                    </div>
                    <p className="text-[12px] text-[var(--muted)] mt-1.5">{tpl.description}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleLoadTemplate(tpl)}
                    className="btn-primary w-full py-2 rounded-[10px] text-[12px] font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <CheckCircle2 size={13} />
                    <span>Load into Batch Estimator</span>
                  </button>
                </div>
              ))}
            </div>
          </div>

          <form onSubmit={handleSaveTemplate} className="glass-pane rounded-[20px] p-5 space-y-3">
            <h3 className="text-[15.5px] font-bold text-[var(--ink)]">
              Save Current Estimator as Template
            </h3>
            <div>
              <label htmlFor="tpl-name" className="block text-[11.5px] font-semibold mb-1">
                Template Name
              </label>
              <input
                id="tpl-name"
                type="text"
                required
                value={newTplName}
                onChange={(e) => setNewTplName(e.target.value)}
                placeholder="e.g. BPSCGS Mains 2-Booklet Pack"
                className="w-full rounded-[10px] bg-[var(--card-2)] border border-[var(--line)] px-3 py-2 text-[12.5px]"
              />
            </div>
            <div>
              <label htmlFor="tpl-cat" className="block text-[11.5px] font-semibold mb-1">
                Packet Category
              </label>
              <select
                id="tpl-cat"
                value={newTplCategory}
                onChange={(e) =>
                  setNewTplCategory(
                    e.target.value as 'coaching_notes' | 'exam_packet' | 'office_combo' | 'custom'
                  )
                }
                className="w-full rounded-[10px] bg-[var(--card-2)] border border-[var(--line)] px-3 py-2 text-[12.5px]"
              >
                <option value="coaching_notes">Coaching Notes</option>
                <option value="exam_packet">Exam / KYC Packet</option>
                <option value="office_combo">Office / College Bind</option>
                <option value="custom">Custom Counter Pack</option>
              </select>
            </div>
            <div>
              <label htmlFor="tpl-desc" className="block text-[11.5px] font-semibold mb-1">
                Counter Instructions
              </label>
              <textarea
                id="tpl-desc"
                rows={2}
                value={newTplDesc}
                onChange={(e) => setNewTplDesc(e.target.value)}
                placeholder="Binding side, cover colour, or paper tray note..."
                className="w-full rounded-[10px] bg-[var(--card-2)] border border-[var(--line)] px-3 py-2 text-[12.5px]"
              />
            </div>
            <div className="text-[11.5px] text-[var(--muted)]">
              Saves the {lines.length} booklet line(s) and {studentSets} set(s) currently loaded in the Estimator.
            </div>
            <button
              type="submit"
              disabled={busy || !newTplName.trim()}
              className="btn-primary w-full py-2.5 rounded-[11px] text-[13px] font-semibold cursor-pointer disabled:opacity-50"
            >
              Save Reusable Shop Template
            </button>
          </form>
        </section>
      )}

      {/* SUBVIEW 3: UNIFIED PRINT HISTORY SEARCH ARCHIVE */}
      {subTab === 'archive' && (
        <section className="glass-pane rounded-[20px] p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-[15.5px] font-bold text-[var(--ink)]">
              Unified Counter Print &amp; Wastage History Search
            </h3>
            <button
              type="button"
              onClick={() => void handleExportArchiveCsv()}
              className="btn-ghost px-3 py-1.5 rounded-[9px] text-[12px] font-semibold inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Download size={13} />
              <span>Export Archive CSV</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
            <div className="lg:col-span-2 relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
              <input
                type="text"
                aria-label="Search archive by token, customer, or batch"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search Token W-101, Batch B-1001, Institute..."
                className="w-full rounded-[10px] bg-[var(--card-2)] border border-[var(--line)] pl-8 pr-3 py-2 text-[12.5px]"
              />
            </div>
            <select
              aria-label="Filter archive source"
              value={sourceFilter}
              onChange={(e) =>
                setSourceFilter(e.target.value as 'all' | 'walkin' | 'batch' | 'wastage')
              }
              className="rounded-[10px] bg-[var(--card-2)] border border-[var(--line)] px-2.5 py-2 text-[12.5px]"
            >
              <option value="all">All Sources</option>
              <option value="walkin">Walk-In POS</option>
              <option value="batch">Bulk Coaching Batches</option>
              <option value="wastage">Spoiled / Wastage</option>
            </select>
            <select
              aria-label="Filter archive payment mode"
              value={payFilter}
              onChange={(e) =>
                setPayFilter(e.target.value as 'all' | 'cash' | 'upi' | 'khata' | 'internal')
              }
              className="rounded-[10px] bg-[var(--card-2)] border border-[var(--line)] px-2.5 py-2 text-[12.5px]"
            >
              <option value="all">All Payment Modes</option>
              <option value="cash">Cash</option>
              <option value="upi">UPI</option>
              <option value="khata">Khata</option>
              <option value="internal">Internal Wastage</option>
            </select>
            <div className="flex gap-1.5">
              <input
                type="date"
                aria-label="Archive from date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="w-1/2 rounded-[10px] bg-[var(--card-2)] border border-[var(--line)] px-2 py-2 text-[11.5px]"
              />
              <input
                type="date"
                aria-label="Archive to date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="w-1/2 rounded-[10px] bg-[var(--card-2)] border border-[var(--line)] px-2 py-2 text-[11.5px]"
              />
            </div>
          </div>

          {!state || state.archiveEntries.length === 0 ? (
            <div className="rounded-[12px] p-6 bg-[var(--card-2)] border border-[var(--line)] text-center space-y-2">
              <div className="text-[13px] font-semibold text-[var(--ink)]">
                No matching archive records found
              </div>
              <p className="text-[12px] text-[var(--muted)]">
                Try clearing date/source filters or commit a Walk-In POS receipt or Bulk Batch first.
              </p>
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setSourceFilter('all');
                  setPayFilter('all');
                  setDateFrom('');
                  setDateTo('');
                }}
                className="btn-ghost px-3 py-1.5 rounded-[9px] text-[12px] font-semibold cursor-pointer"
              >
                Reset Archive Filters
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[12.5px]">
                <thead>
                  <tr className="border-b border-[var(--line)] text-[11px] text-[var(--muted)] uppercase">
                    <th className="py-2 pr-3">Reference</th>
                    <th className="py-2 pr-3">Type</th>
                    <th className="py-2 pr-3">Customer / Title</th>
                    <th className="py-2 pr-3">Payment</th>
                    <th className="py-2 pr-3 text-right">Sheets</th>
                    <th className="py-2 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--line)]">
                  {state.archiveEntries.map((row) => (
                    <tr key={row.id} className="hover:bg-[var(--card-2)]/60">
                      <td className="py-2.5 pr-3 font-mono font-semibold text-[var(--ink)] whitespace-nowrap">
                        {row.refCode}
                      </td>
                      <td className="py-2.5 pr-3 text-[var(--muted)] capitalize whitespace-nowrap">
                        {row.sourceType}
                      </td>
                      <td className="py-2.5 pr-3">
                        <div className="font-semibold text-[var(--ink)]">{row.titleOrCustomer}</div>
                        <div className="text-[11px] text-[var(--muted)]">
                          {row.summaryNote} · {row.createdAt.slice(0, 16).replace('T', ' ')}
                        </div>
                      </td>
                      <td className="py-2.5 pr-3 uppercase text-[11.5px] font-medium text-[var(--muted)]">
                        {row.paymentMethod}
                      </td>
                      <td className="py-2.5 pr-3 text-right tabular-nums">{row.physicalSheets}</td>
                      <td
                        className={`py-2.5 text-right font-mono font-bold tabular-nums ${
                          row.amountPaise < 0 ? 'text-[var(--bad)]' : 'text-[var(--good)]'
                        }`}
                      >
                        {row.amountPaise < 0 ? '-' : ''}₹{(Math.abs(row.amountPaise) / 100).toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  );
};
