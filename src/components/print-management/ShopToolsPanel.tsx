// AC Scan2Print — Phase 20: Counter Exam-Form Resizer, Paper Wastage Root-Cause Log
// & Opening/Closing Daily Shift Handoff Checklist (Strictly Single-Shop)

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  Download,
  FileCheck,
  Image as ImageIcon,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { apiRequest } from '../../lib/api';
import { getCurrentFirebaseIdToken } from '../../lib/firebase';

interface ExamPresetView {
  id: 'ssc_photo' | 'ssc_signature' | 'upsc_photo' | 'rrb_bpsc_photo' | 'pan_form_scan';
  portalLabel: string;
  assetKind: 'photo' | 'signature' | 'document_scan';
  widthPx: number;
  heightPx: number;
  minKb: number;
  maxKb: number;
  recommendedDpi: number;
  defaultScanClean: boolean;
  guidance: string;
}

interface WastageLogView {
  id: string;
  stationId: string;
  paperItemId: string;
  sheetsWasted: number;
  reasonCode: string;
  estimatedLossPaise: number;
  jobNumber: string;
  note: string;
  createdAt: string;
}

interface ShiftChecklistTaskView {
  itemKey: string;
  shiftType: 'opening' | 'closing';
  label: string;
  required: boolean;
  checked: boolean;
  checkedAt: string | null;
}

interface ShiftSignoffView {
  id: string;
  shiftDate: string;
  shiftType: 'opening' | 'closing';
  operatorName: string;
  pettyCashInr: number;
  checkedCount: number;
  totalCount: number;
  notes: string;
  createdAt: string;
}

interface ShopToolsStatePayload {
  checkedAtIso: string;
  examPresets: ExamPresetView[];
  wastageReasons: Array<{ id: string; label: string; hint: string }>;
  wastageLogs: WastageLogView[];
  wastageSummary: {
    totalSpoiledSheets: number;
    totalEstimatedLossPaise: number;
    totalEstimatedLossInr: number;
    topReasonCode: string | null;
    topReasonLabel: string;
    byReason: Array<{
      reasonCode: string;
      label: string;
      sheets: number;
      lossInr: number;
      sharePct: number;
    }>;
  };
  checklistItems: ShiftChecklistTaskView[];
  openingReadiness: {
    totalCount: number;
    checkedCount: number;
    requiredRemaining: number;
    readyForSignoff: boolean;
  };
  closingReadiness: {
    totalCount: number;
    checkedCount: number;
    requiredRemaining: number;
    readyForSignoff: boolean;
  };
  signoffs: ShiftSignoffView[];
}

type SubTab = 'exam' | 'wastage' | 'shift';

function applyScanCleanFilter(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const imgData = ctx.getImageData(0, 0, w, h);
  const d = imgData.data;
  for (let i = 0; i < d.length; i += 4) {
    const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    let adj = (lum - 128) * 1.48 + 145;
    if (adj > 215) adj = 255;
    if (adj < 40) adj = Math.max(0, adj * 0.65);
    const val = Math.max(0, Math.min(255, Math.round(adj)));
    d[i] = val;
    d[i + 1] = val;
    d[i + 2] = val;
  }
  ctx.putImageData(imgData, 0, 0);
}

async function encodeJpegWithinKb(
  canvas: HTMLCanvasElement,
  minKb: number,
  maxKb: number
): Promise<{ blob: Blob; quality: number }> {
  const toBlob = (q: number) =>
    new Promise<Blob | null>((resolve) => canvas.toBlob((b) => resolve(b), 'image/jpeg', q));
  let lo = 0.28;
  let hi = 0.96;
  let bestBlob = (await toBlob(0.84)) ?? new Blob();
  let bestQ = 0.84;
  for (let i = 0; i < 7; i++) {
    const mid = Number(((lo + hi) / 2).toFixed(3));
    const b = await toBlob(mid);
    if (!b) continue;
    const kb = b.size / 1024;
    bestBlob = b;
    bestQ = mid;
    if (kb >= minKb && kb <= maxKb) break;
    if (kb > maxKb) hi = mid;
    else lo = mid;
  }
  return { blob: bestBlob, quality: bestQ };
}

export const ShopToolsPanel: React.FC<{
  onToast?: (message: string, tone?: 'good' | 'bad' | 'info') => void;
}> = ({ onToast }) => {
  const [subTab, setSubTab] = useState<SubTab>('exam');
  const [state, setState] = useState<ShopToolsStatePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Exam Resizer State
  const [examPresetId, setExamPresetId] = useState<ExamPresetView['id']>('ssc_photo');
  const [examImgUrl, setExamImgUrl] = useState<string | null>(null);
  const [scanClean, setScanClean] = useState(false);
  const [outputBlob, setOutputBlob] = useState<Blob | null>(null);
  const [outputKb, setOutputKb] = useState(0);
  const [outputQuality, setOutputQuality] = useState(0.85);
  const examCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Wastage Form State
  const [wasteStation, setWasteStation] = useState('station-1-bw-fast');
  const [wastePaperSku, setWastePaperSku] = useState('paper-a4-75gsm');
  const [wasteSheets, setWasteSheets] = useState('4');
  const [wasteReason, setWasteReason] = useState('paper_jam');
  const [wasteJobNum, setWasteJobNum] = useState('');
  const [wasteNote, setWasteNote] = useState('');
  const [wasteDeductStock, setWasteDeductStock] = useState(true);

  // Shift Checklist State
  const [shiftType, setShiftType] = useState<'opening' | 'closing'>('opening');
  const [operatorName, setOperatorName] = useState('Aman Counter Desk');
  const [pettyCash, setPettyCash] = useState('500');
  const [shiftNotes, setShiftNotes] = useState('');
  const [resetTasks, setResetTasks] = useState(false);

  const loadState = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const data = await apiRequest<ShopToolsStatePayload>('/shop-tools/state');
      setState(data);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to load Phase 20 Shop Tools state.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadState();
  }, [loadState]);

  const activeExamPreset = useMemo(() => {
    const list = state?.examPresets ?? [];
    return list.find((p) => p.id === examPresetId) ?? {
      id: 'ssc_photo' as const,
      portalLabel: 'SSC CGL / CHSL — Passport Photo (3.5×4.5 cm)',
      assetKind: 'photo' as const,
      widthPx: 413,
      heightPx: 531,
      minKb: 20,
      maxKb: 50,
      recommendedDpi: 300,
      defaultScanClean: false,
      guidance: 'Plain white background, eyes open, JPEG between 20 KB and 50 KB.',
    };
  }, [state?.examPresets, examPresetId]);

  useEffect(() => {
    setScanClean(activeExamPreset.defaultScanClean);
  }, [activeExamPreset]);

  useEffect(() => {
    if (subTab !== 'exam') return;
    const canvas = examCanvasRef.current;
    if (!canvas) return;
    canvas.width = activeExamPreset.widthPx;
    canvas.height = activeExamPreset.heightPx;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let cancelled = false;
    const runRender = async () => {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      if (examImgUrl) {
        const img = await new Promise<HTMLImageElement | null>((resolve) => {
          const im = new Image();
          im.onload = () => resolve(im);
          im.onerror = () => resolve(null);
          im.src = examImgUrl;
        });
        if (cancelled) return;
        if (img) {
          const sr = img.width / img.height;
          const dr = canvas.width / canvas.height;
          let sx = 0;
          let sy = 0;
          let sw = img.width;
          let sh = img.height;
          if (sr > dr) {
            sw = img.height * dr;
            sx = (img.width - sw) / 2;
          } else {
            sh = img.width / dr;
            sy = (img.height - sh) / 2;
          }
          ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
        }
      } else {
        ctx.fillStyle = '#e8eef5';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#475569';
        ctx.font = `bold ${Math.max(15, Math.round(canvas.width * 0.055))}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText(activeExamPreset.id.toUpperCase(), canvas.width / 2, canvas.height / 2);
      }

      if (scanClean) {
        applyScanCleanFilter(ctx, canvas.width, canvas.height);
      }

      const res = await encodeJpegWithinKb(canvas, activeExamPreset.minKb, activeExamPreset.maxKb);
      if (cancelled) return;
      setOutputBlob(res.blob);
      setOutputKb(Number((res.blob.size / 1024).toFixed(1)));
      setOutputQuality(res.quality);
    };

    void runRender();
    return () => {
      cancelled = true;
    };
  }, [subTab, activeExamPreset, examImgUrl, scanClean]);

  const handleLogWastage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setErrorMsg(null);
    try {
      const res = await apiRequest<{ state: ShopToolsStatePayload }>('/shop-tools/wastage', {
        method: 'POST',
        body: JSON.stringify({
          stationId: wasteStation,
          paperItemId: wastePaperSku,
          sheetsWasted: Number(wasteSheets) || 1,
          reasonCode: wasteReason,
          jobNumber: wasteJobNum.trim(),
          note: wasteNote.trim(),
          deductInventory: wasteDeductStock,
        }),
      });
      setState(res.state);
      setWasteJobNum('');
      setWasteNote('');
      onToast?.('Spoiled sheet wastage logged & stock synced', 'good');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to record wastage log.';
      setErrorMsg(msg);
      onToast?.(msg, 'bad');
    } finally {
      setBusy(false);
    }
  };

  const handleToggleChecklist = async (itemKey: string, checked: boolean) => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await apiRequest<{ state: ShopToolsStatePayload }>('/shop-tools/checklist/toggle', {
        method: 'POST',
        body: JSON.stringify({ itemKey, checked }),
      });
      setState(res.state);
    } catch (err) {
      onToast?.(err instanceof Error ? err.message : 'Unable to update checklist task.', 'bad');
    } finally {
      setBusy(false);
    }
  };

  const handleSignoffShift = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setErrorMsg(null);
    try {
      const res = await apiRequest<{ state: ShopToolsStatePayload }>('/shop-tools/checklist/signoff', {
        method: 'POST',
        body: JSON.stringify({
          shiftType,
          operatorName: operatorName.trim() || 'Counter Operator',
          pettyCashInr: Number(pettyCash) || 0,
          notes: shiftNotes.trim(),
          resetAfterSignoff: resetTasks,
        }),
      });
      setState(res.state);
      setShiftNotes('');
      onToast?.(`${shiftType.toUpperCase()} shift handoff signed off`, 'good');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to sign off shift checklist.';
      setErrorMsg(msg);
      onToast?.(msg, 'bad');
    } finally {
      setBusy(false);
    }
  };

  const handleWastageCsvDownload = async () => {
    try {
      const token = await getCurrentFirebaseIdToken().catch(() => null);
      const res = await fetch('/api/shop-tools/wastage/export', {
        credentials: 'include',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) {
        onToast?.('Unable to export wastage CSV ledger.', 'bad');
        return;
      }
      const csv = await res.text();
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `aman-computer-wastage-log-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      onToast?.('CSV download failed.', 'bad');
    }
  };

  const scopedTasks = useMemo(
    () => (state?.checklistItems ?? []).filter((t) => t.shiftType === shiftType),
    [state?.checklistItems, shiftType]
  );

  const activeReadiness =
    shiftType === 'opening' ? state?.openingReadiness : state?.closingReadiness;

  return (
    <div className="space-y-5">
      {/* Header + 4 Single-Elevation KPI Cards */}
      <section className="glass-pane rounded-[20px] p-5 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-[18px] font-bold flex items-center gap-2 text-[var(--ink)]">
              <FileCheck size={18} className="text-[var(--accent-text)]" />
              <span>Phase 20: Exam Form KB Prep, Wastage Analytics &amp; Shift Handoff</span>
            </h2>
            <p className="text-[12.5px] text-[var(--muted)] mt-1">
              Cyber-desk SSC/UPSC/BPSC size compressor, spoiled paper root-cause stock deductions, and daily counter readiness sign-off.
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
            <div className="text-[11px] font-semibold text-[var(--muted)]">Spoiled Sheets Logged</div>
            <div className="text-[20px] font-bold text-[var(--ink)] tabular-nums mt-0.5">
              {state?.wastageSummary.totalSpoiledSheets ?? 0} sheets
            </div>
            <div className="text-[11.5px] text-[var(--muted)]">
              Deducted from stock ledger
            </div>
          </div>

          <div className="rounded-[12px] p-3.5 bg-[var(--card-2)] border border-[var(--line)]">
            <div className="text-[11px] font-semibold text-[var(--muted)]">Estimated Sheet Loss</div>
            <div className="text-[20px] font-bold text-[var(--bad)] tabular-nums mt-0.5">
              ₹{(state?.wastageSummary.totalEstimatedLossInr ?? 0).toFixed(2)}
            </div>
            <div className="text-[11.5px] text-[var(--muted)]">
              Reprint &amp; feed cost impact
            </div>
          </div>

          <div className="rounded-[12px] p-3.5 bg-[var(--card-2)] border border-[var(--line)]">
            <div className="text-[11px] font-semibold text-[var(--muted)]">Top Root Cause</div>
            <div className="text-[15px] font-bold text-[var(--warn)] truncate mt-1">
              {state?.wastageSummary.topReasonLabel ?? 'No wastage logged'}
            </div>
            <div className="text-[11.5px] text-[var(--muted)]">
              Across 4 print stations
            </div>
          </div>

          <div className="rounded-[12px] p-3.5 bg-[var(--card-2)] border border-[var(--line)]">
            <div className="text-[11px] font-semibold text-[var(--muted)]">Shift Checklist Status</div>
            <div
              className="text-[17px] font-bold mt-1 tabular-nums"
              style={{
                color: state?.openingReadiness.readyForSignoff ? 'var(--good)' : 'var(--accent-text)',
              }}
            >
              {state
                ? `${state.openingReadiness.checkedCount}/${state.openingReadiness.totalCount} Opening`
                : '0/4 Opening'}
            </div>
            <div className="text-[11.5px] text-[var(--muted)] tabular-nums">
              {state
                ? `${state.closingReadiness.checkedCount}/${state.closingReadiness.totalCount} Closing ready`
                : 'Checklist loaded'}
            </div>
          </div>
        </div>

        {/* Sub-navigation */}
        <div className="flex flex-wrap gap-1.5 p-1 rounded-[12px] bg-[var(--card-2)] border border-[var(--line)] w-fit">
          {([
            { id: 'exam', label: 'Exam Form KB & Scan Clean', icon: Sparkles },
            { id: 'wastage', label: 'Paper Wastage & Reprint Log', icon: Trash2 },
            { id: 'shift', label: 'Daily Shift Handoff Checklist', icon: ClipboardCheck },
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

      {/* SUBVIEW 1: EXAM FORM SIZE OPTIMIZER */}
      {subTab === 'exam' && (
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="glass-pane rounded-[20px] p-5 space-y-4">
            <h3 className="text-[15.5px] font-bold text-[var(--ink)]">
              Counter Exam Form Resizer &amp; Scan Enhancer
            </h3>

            <div className="space-y-2">
              {(state?.examPresets ?? []).map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setExamPresetId(p.id)}
                  className={`w-full p-3 rounded-[12px] text-left border cursor-pointer ${
                    p.id === activeExamPreset.id
                      ? 'border-[var(--accent)] bg-[var(--accent-soft)]'
                      : 'border-[var(--line)] bg-[var(--card-2)]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[13px] font-bold text-[var(--ink)]">{p.portalLabel}</span>
                    <span className="font-mono text-[11.5px] font-bold text-[var(--accent-text)] shrink-0">
                      {p.minKb}–{p.maxKb} KB
                    </span>
                  </div>
                  <div className="text-[11.5px] text-[var(--muted)] mt-0.5">
                    {p.widthPx}×{p.heightPx} px · {p.guidance}
                  </div>
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <label className="btn-ghost px-3.5 py-2.5 rounded-[11px] text-[12.5px] font-semibold inline-flex items-center gap-2 cursor-pointer">
                <ImageIcon size={15} />
                <span>{examImgUrl ? 'Replace Customer Image' : 'Upload Customer Image'}</span>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    const r = new FileReader();
                    r.onload = () => setExamImgUrl(typeof r.result === 'string' ? r.result : null);
                    r.readAsDataURL(f);
                  }}
                  className="sr-only"
                />
              </label>

              <label className="inline-flex items-center gap-2 text-[12.5px] font-medium cursor-pointer">
                <input
                  type="checkbox"
                  checked={scanClean}
                  onChange={(e) => setScanClean(e.target.checked)}
                />
                <span>Apply B&amp;W Scan Contrast Clean</span>
              </label>
            </div>

            <button
              type="button"
              onClick={() => {
                if (!outputBlob) return;
                const url = URL.createObjectURL(outputBlob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `aman-computer-${activeExamPreset.id}-${activeExamPreset.widthPx}x${activeExamPreset.heightPx}.jpg`;
                document.body.appendChild(a);
                a.click();
                a.remove();
                URL.revokeObjectURL(url);
              }}
              className="btn-primary w-full py-2.5 rounded-[11px] text-[13px] font-semibold inline-flex items-center justify-center gap-2 cursor-pointer"
            >
              <Download size={15} />
              <span>Download Target JPEG ({outputKb} KB)</span>
            </button>
          </div>

          <div className="glass-pane rounded-[20px] p-5 space-y-3">
            <div className="flex items-center justify-between text-[13px] font-bold">
              <span>Live Processed JPEG Preview</span>
              <span className="font-mono text-[11.5px] text-[var(--accent-text)] tabular-nums">
                {activeExamPreset.widthPx}×{activeExamPreset.heightPx} · {outputKb} KB (Q
                {Math.round(outputQuality * 100)})
              </span>
            </div>
            <div className="rounded-[12px] bg-[#eef2f6] border border-[var(--line)] p-3 flex justify-center">
              <canvas
                ref={examCanvasRef}
                className="max-h-[380px] w-auto max-w-full rounded-[8px] shadow bg-white"
              />
            </div>
          </div>
        </section>
      )}

      {/* SUBVIEW 2: PAPER WASTAGE & REPRINT LOG */}
      {subTab === 'wastage' && (
        <section className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          <form onSubmit={handleLogWastage} className="glass-pane rounded-[20px] p-5 space-y-3">
            <h3 className="text-[15.5px] font-bold text-[var(--ink)]">Log Spoiled / Reprinted Sheets</h3>

            <div>
              <label htmlFor="waste-station" className="block text-[11.5px] font-semibold mb-1">
                Printer Station
              </label>
              <select
                id="waste-station"
                value={wasteStation}
                onChange={(e) => setWasteStation(e.target.value)}
                className="w-full rounded-[10px] bg-[var(--card-2)] border border-[var(--line)] px-3 py-2 text-[12.5px]"
              >
                <option value="station-1-bw-fast">HP Laser MFP 300 (Counter 1 · USB001)</option>
                <option value="station-2-colour-photo">HP Smart Tank 580-590 series (Colour/Photo · USB002)</option>
                <option value="station-3-kiosk-express">Canon imageCLASS LBP226dw (Kiosk)</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label htmlFor="waste-sku" className="block text-[11.5px] font-semibold mb-1">
                  Paper Stock
                </label>
                <select
                  id="waste-sku"
                  value={wastePaperSku}
                  onChange={(e) => setWastePaperSku(e.target.value)}
                  className="w-full rounded-[10px] bg-[var(--card-2)] border border-[var(--line)] px-2.5 py-2 text-[12.5px]"
                >
                  <option value="paper-a4-75gsm">A4 75 GSM</option>
                  <option value="paper-legal-80gsm">Legal 80 GSM</option>
                  <option value="paper-photo-4x6">4×6 Glossy Photo</option>
                </select>
              </div>
              <div>
                <label htmlFor="waste-sheets" className="block text-[11.5px] font-semibold mb-1">
                  Sheets Wasted
                </label>
                <input
                  id="waste-sheets"
                  type="number"
                  min={1}
                  max={500}
                  value={wasteSheets}
                  onChange={(e) => setWasteSheets(e.target.value)}
                  className="w-full rounded-[10px] bg-[var(--card-2)] border border-[var(--line)] px-2.5 py-2 text-[12.5px] tabular-nums"
                />
              </div>
            </div>

            <div>
              <label htmlFor="waste-reason" className="block text-[11.5px] font-semibold mb-1">
                Root Cause
              </label>
              <select
                id="waste-reason"
                value={wasteReason}
                onChange={(e) => setWasteReason(e.target.value)}
                className="w-full rounded-[10px] bg-[var(--card-2)] border border-[var(--line)] px-3 py-2 text-[12.5px]"
              >
                {(state?.wastageReasons ?? []).map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="waste-job" className="block text-[11.5px] font-semibold mb-1">
                Job / Token Ref (optional)
              </label>
              <input
                id="waste-job"
                type="text"
                value={wasteJobNum}
                onChange={(e) => setWasteJobNum(e.target.value)}
                placeholder="e.g. JOB-20261126-0041"
                className="w-full rounded-[10px] bg-[var(--card-2)] border border-[var(--line)] px-3 py-2 text-[12.5px]"
              />
            </div>

            <div>
              <label htmlFor="waste-note" className="block text-[11.5px] font-semibold mb-1">
                Counter Note
              </label>
              <input
                id="waste-note"
                type="text"
                value={wasteNote}
                onChange={(e) => setWasteNote(e.target.value)}
                placeholder="Reason details..."
                className="w-full rounded-[10px] bg-[var(--card-2)] border border-[var(--line)] px-3 py-2 text-[12.5px]"
              />
            </div>

            <label className="inline-flex items-center gap-2 text-[12px] cursor-pointer">
              <input
                type="checkbox"
                checked={wasteDeductStock}
                onChange={(e) => setWasteDeductStock(e.target.checked)}
              />
              <span>Auto-deduct spoiled sheets from Phase 18 stock</span>
            </label>

            <button
              type="submit"
              disabled={busy}
              className="btn-primary w-full py-2.5 rounded-[11px] text-[13px] font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <Plus size={14} />
              <span>Record Wastage Entry</span>
            </button>
          </form>

          <div className="xl:col-span-2 glass-pane rounded-[20px] p-5 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-[15.5px] font-bold text-[var(--ink)]">
                Root-Cause Breakdown &amp; Wastage History
              </h3>
              <button
                type="button"
                onClick={() => void handleWastageCsvDownload()}
                className="btn-ghost px-3 py-1.5 rounded-[9px] text-[12px] font-semibold inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Download size={13} />
                <span>Export Wastage CSV</span>
              </button>
            </div>

            <div className="space-y-2">
              {(state?.wastageSummary.byReason ?? []).map((b) => (
                <div key={b.reasonCode} className="space-y-1 text-[12px]">
                  <div className="flex justify-between">
                    <span className="font-semibold text-[var(--ink)]">{b.label}</span>
                    <span className="font-mono text-[var(--muted)] tabular-nums">
                      {b.sheets} sheets · ₹{b.lossInr.toFixed(2)} ({b.sharePct}%)
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-[var(--card-2)] border border-[var(--line)] overflow-hidden">
                    <div
                      className="h-full bg-[var(--warn)]"
                      style={{ width: `${Math.max(b.sheets > 0 ? 4 : 0, b.sharePct)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="pt-2 border-t border-[var(--line)] space-y-2">
              <div className="text-[12px] font-semibold text-[var(--muted)]">
                Recent Wastage Entries ({state?.wastageLogs.length ?? 0})
              </div>
              {(!state || state.wastageLogs.length === 0) ? (
                <div className="rounded-[12px] p-4 bg-[var(--card-2)] border border-[var(--line)] text-[12px] text-[var(--muted)]">
                  No spoiled sheets recorded yet. Any misprints or paper jams logged at left appear here.
                </div>
              ) : (
                <ul className="space-y-1.5 max-h-[220px] overflow-y-auto pr-1 text-[12px]">
                  {state.wastageLogs.map((l) => (
                    <li
                      key={l.id}
                      className="rounded-[10px] p-2.5 bg-[var(--card-2)] border border-[var(--line)] flex items-center justify-between gap-2"
                    >
                      <div className="min-w-0">
                        <div className="font-semibold text-[var(--ink)] truncate">
                          {l.sheetsWasted} sheets · {l.paperItemId} · {l.reasonCode.replace('_', ' ')}
                        </div>
                        <div className="text-[11px] text-[var(--muted)] truncate">
                          {l.stationId} {l.jobNumber ? `· ${l.jobNumber}` : ''} {l.note ? `· ${l.note}` : ''}
                        </div>
                      </div>
                      <span className="font-mono font-bold text-[var(--bad)] shrink-0 tabular-nums">
                        -₹{(l.estimatedLossPaise / 100).toFixed(2)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </section>
      )}

      {/* SUBVIEW 3: DAILY OPENING & CLOSING SHIFT CHECKLIST */}
      {subTab === 'shift' && (
        <section className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          <div className="xl:col-span-2 glass-pane rounded-[20px] p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-[15.5px] font-bold text-[var(--ink)]">
                Daily Single-Shop Readiness Tasks
              </h3>
              <div className="flex gap-1.5">
                {(['opening', 'closing'] as const).map((st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setShiftType(st)}
                    className={`px-3 py-1.5 rounded-[9px] text-[12px] font-semibold capitalize cursor-pointer border ${
                      shiftType === st
                        ? 'bg-[var(--accent-soft)] border-[var(--accent)] text-[var(--accent-text)]'
                        : 'bg-[var(--card-2)] border-[var(--line)] text-[var(--muted)]'
                    }`}
                  >
                    {st} Shift
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              {scopedTasks.map((task) => (
                <label
                  key={task.itemKey}
                  className={`rounded-[12px] p-3 border flex items-center justify-between gap-3 cursor-pointer ${
                    task.checked
                      ? 'bg-[var(--good-soft)]/40 border-[var(--good)]/35'
                      : 'bg-[var(--card-2)] border-[var(--line)]'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <input
                      type="checkbox"
                      checked={task.checked}
                      disabled={busy}
                      onChange={(e) => void handleToggleChecklist(task.itemKey, e.target.checked)}
                    />
                    <div>
                      <div className="text-[13px] font-semibold text-[var(--ink)]">{task.label}</div>
                      <div className="text-[11px] text-[var(--muted)]">
                        {task.required ? 'Required for handoff sign-off' : 'Optional audit item'}
                        {task.checkedAt ? ` · Checked ${task.checkedAt.slice(11, 16)}` : ''}
                      </div>
                    </div>
                  </div>
                  {task.checked && <CheckCircle2 size={16} className="text-[var(--good)] shrink-0" />}
                </label>
              ))}
            </div>
          </div>

          <div className="glass-pane rounded-[20px] p-5 space-y-4">
            <h3 className="text-[15.5px] font-bold text-[var(--ink)] capitalize">
              Sign Off {shiftType} Shift
            </h3>
            <form onSubmit={handleSignoffShift} className="space-y-3">
              <div>
                <label htmlFor="shift-op" className="block text-[11.5px] font-semibold mb-1">
                  Counter Operator Name
                </label>
                <input
                  id="shift-op"
                  type="text"
                  value={operatorName}
                  onChange={(e) => setOperatorName(e.target.value)}
                  className="w-full rounded-[10px] bg-[var(--card-2)] border border-[var(--line)] px-3 py-2 text-[12.5px]"
                />
              </div>

              <div>
                <label htmlFor="shift-cash" className="block text-[11.5px] font-semibold mb-1">
                  Petty Cash Float Verified (INR)
                </label>
                <input
                  id="shift-cash"
                  type="number"
                  min={0}
                  step="1"
                  value={pettyCash}
                  onChange={(e) => setPettyCash(e.target.value)}
                  className="w-full rounded-[10px] bg-[var(--card-2)] border border-[var(--line)] px-3 py-2 text-[12.5px] tabular-nums"
                />
              </div>

              <div>
                <label htmlFor="shift-notes" className="block text-[11.5px] font-semibold mb-1">
                  Handover Notes
                </label>
                <textarea
                  id="shift-notes"
                  rows={2}
                  value={shiftNotes}
                  onChange={(e) => setShiftNotes(e.target.value)}
                  placeholder="Pending binds, low tray notes, or customer pickups..."
                  className="w-full rounded-[10px] bg-[var(--card-2)] border border-[var(--line)] px-3 py-2 text-[12.5px]"
                />
              </div>

              <label className="inline-flex items-center gap-2 text-[12px] cursor-pointer">
                <input
                  type="checkbox"
                  checked={resetTasks}
                  onChange={(e) => setResetTasks(e.target.checked)}
                />
                <span>Reset checkboxes for next day after sign-off</span>
              </label>

              <button
                type="submit"
                disabled={busy || !activeReadiness?.readyForSignoff}
                className="btn-primary w-full py-2.5 rounded-[11px] text-[13px] font-semibold cursor-pointer disabled:opacity-45"
              >
                {activeReadiness?.readyForSignoff
                  ? `Complete ${shiftType.toUpperCase()} Sign-Off`
                  : `${activeReadiness?.requiredRemaining ?? 1} Required Task(s) Left`}
              </button>
            </form>

            <div className="pt-2 border-t border-[var(--line)] space-y-1.5">
              <div className="text-[11.5px] font-semibold text-[var(--muted)]">
                Recent Shift Sign-Offs ({state?.signoffs.length ?? 0})
              </div>
              {(state?.signoffs ?? []).slice(0, 5).map((s) => (
                <div
                  key={s.id}
                  className="rounded-[10px] p-2.5 bg-[var(--card-2)] border border-[var(--line)] text-[11.5px]"
                >
                  <div className="flex justify-between font-semibold">
                    <span className="capitalize">
                      {s.shiftType} · {s.operatorName}
                    </span>
                    <span className="font-mono text-[var(--good)]">₹{s.pettyCashInr.toFixed(0)}</span>
                  </div>
                  <div className="text-[var(--muted)] mt-0.5">
                    {s.shiftDate} · {s.checkedCount}/{s.totalCount} checked {s.notes ? `· ${s.notes}` : ''}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}
    </div>
  );
};
