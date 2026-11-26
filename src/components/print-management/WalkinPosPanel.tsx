// AC Scan2Print — Phase 19: Walk-In Counter POS, 300-DPI Photo Sheet Studio & Printer Maintenance Panel
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Banknote,
  CheckCircle2,
  Download,
  Grid3X3,
  Image as ImageIcon,
  Plus,
  Printer,
  Receipt,
  RefreshCw,
  Scissors,
  ShoppingBag,
  Trash2,
  Wrench,
} from 'lucide-react';
import { apiRequest } from '../../lib/api';
import { getCurrentFirebaseIdToken } from '../../lib/firebase';

export interface WalkinPosCartDraftItem {
  id: string;
  kind: 'document_print' | 'photo_sheet' | 'service_addon';
  title: string;
  paperSize: 'A4' | 'A3' | 'Legal' | 'Photo_4x6';
  printMode: 'bw' | 'colour';
  printSides: 'single' | 'duplex';
  selectedPagesCount: number;
  pagesPerSheet: 1 | 2 | 4;
  copies: number;
  finishingService: 'none' | 'staple_corner' | 'spiral_binding' | 'thermal_lamination' | 'heavy_cover_bind';
  photoPresetId: 'passport_4x6_8' | 'passport_a4_24' | 'passport_a4_35' | 'id_card_a4_duplex';
  estimatedInr: number;
}

export interface WalkinOrderView {
  id: string;
  tokenNumber: string;
  customerName: string;
  paymentMethod: 'cash' | 'upi' | 'khata';
  totalPhysicalSheets: number;
  grossTotalPaise: number;
  grossTotalInr: number;
  slipLines: string[];
  createdAt: string;
}

export interface PrinterMaintenanceCounterView {
  stationId: string;
  printerName: string;
  componentName: string;
  lifetimePages: number;
  pagesSinceService: number;
  serviceIntervalPages: number;
  remainingPages: number;
  wearPct: number;
  healthStatus: 'healthy' | 'service_due' | 'overdue';
  lastServicedAt: string;
  lastServiceNote: string;
}

export interface PrinterMaintenanceLogView {
  id: string;
  station_id: string;
  printer_name: string;
  action_type: string;
  reset_counter: number;
  note: string;
  created_at: string;
}

export interface WalkinPosStatePayload {
  checkedAtIso: string;
  orders: WalkinOrderView[];
  summary: {
    totalWalkinBills: number;
    totalWalkinRevenueInr: number;
    cashWalkinInr: number;
    upiWalkinInr: number;
    khataWalkinInr: number;
    dueMaintenanceCount: number;
  };
  maintenanceCounters: PrinterMaintenanceCounterView[];
  maintenanceLogs: PrinterMaintenanceLogView[];
  khataAccounts: Array<{
    id: string;
    clientName: string;
    clientType: string;
    creditLimitPaise: number;
    balanceDuePaise: number;
  }>;
}

type PosSubView = 'pos' | 'photo_studio' | 'maintenance';

const PHOTO_PRESETS = [
  { id: 'passport_4x6_8', label: '4×6 Glossy (8 Passport)', wMm: 152.4, hMm: 101.6, wPx: 1800, hPx: 1200, cols: 4, rows: 2, tileW: 35, tileH: 45, gap: 3, priceInr: 40, mode: 'passport_grid' as const },
  { id: 'passport_a4_24', label: 'A4 Sheet (24 Passport)', wMm: 210, hMm: 297, wPx: 2480, hPx: 3508, cols: 4, rows: 6, tileW: 35, tileH: 45, gap: 3.5, priceInr: 90, mode: 'passport_grid' as const },
  { id: 'passport_a4_35', label: 'A4 Stamp (35 Mini)', wMm: 210, hMm: 297, wPx: 2480, hPx: 3508, cols: 5, rows: 7, tileW: 30, tileH: 35, gap: 4, priceInr: 100, mode: 'passport_grid' as const },
  { id: 'id_card_a4_duplex', label: 'A4 ID Card (Front + Back)', wMm: 210, hMm: 297, wPx: 2480, hPx: 3508, cols: 1, rows: 2, tileW: 85.6, tileH: 54, gap: 14, priceInr: 20, mode: 'id_card_pair' as const },
] as const;

const PX_PER_MM_300DPI = 300 / 25.4;

function finishingPriceInr(fin: WalkinPosCartDraftItem['finishingService']): number {
  switch (fin) {
    case 'staple_corner':
      return 5;
    case 'spiral_binding':
      return 30;
    case 'thermal_lamination':
      return 20;
    case 'heavy_cover_bind':
      return 45;
    default:
      return 0;
  }
}

export const WalkinPosPanel: React.FC<{
  onToast?: (message: string, tone?: 'good' | 'bad' | 'info') => void;
}> = ({ onToast }) => {
  const [subView, setSubView] = useState<PosSubView>('pos');
  const [state, setState] = useState<WalkinPosStatePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Quick Cart Item Builder
  const [itemPages, setItemPages] = useState('12');
  const [itemCopies, setItemCopies] = useState('1');
  const [itemPaper, setItemPaper] = useState<'A4' | 'A3' | 'Legal'>('A4');
  const [itemMode, setItemMode] = useState<'bw' | 'colour'>('bw');
  const [itemSides, setItemSides] = useState<'single' | 'duplex'>('duplex');
  const [itemNup, setItemNup] = useState<1 | 2 | 4>(1);
  const [itemFinishing, setItemFinishing] = useState<WalkinPosCartDraftItem['finishingService']>('none');

  const [cart, setCart] = useState<WalkinPosCartDraftItem[]>([]);
  const [customerName, setCustomerName] = useState('Walk-in Counter Customer');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'upi' | 'khata'>('cash');
  const [khataAccountId, setKhataAccountId] = useState('');
  const [deductInventory, setDeductInventory] = useState(true);
  const [activeSlip, setActiveSlip] = useState<string[] | null>(null);

  // Photo Studio state
  const [photoPresetId, setPhotoPresetId] = useState<(typeof PHOTO_PRESETS)[number]['id']>('passport_4x6_8');
  const [photoFrontUrl, setPhotoFrontUrl] = useState<string | null>(null);
  const [photoBackUrl, setPhotoBackUrl] = useState<string | null>(null);
  const [showCutMarks, setShowCutMarks] = useState(true);
  const photoCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Maintenance Logger state
  const [maintStationId, setMaintStationId] = useState('station-1-bw-fast');
  const [maintAction, setMaintAction] = useState<
    'nozzle_check_clean' | 'drum_wipe' | 'roller_clean' | 'jam_cleared' | 'consumable_part_replaced'
  >('nozzle_check_clean');
  const [maintReset, setMaintReset] = useState(false);
  const [maintNote, setMaintNote] = useState('');

  const loadState = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const data = await apiRequest<WalkinPosStatePayload>('/pos/state');
      setState(data);
      if (data.khataAccounts.length > 0) {
        setKhataAccountId((prev) => prev || data.khataAccounts[0].id);
      }
      if (data.orders.length > 0) {
        setActiveSlip((prev) => prev || data.orders[0].slipLines);
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to load Walk-In POS state.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadState();
  }, [loadState]);

  const activePhotoPreset = useMemo(
    () => PHOTO_PRESETS.find((p) => p.id === photoPresetId) ?? PHOTO_PRESETS[0],
    [photoPresetId]
  );

  // Render 300-DPI Photo Studio Canvas
  useEffect(() => {
    if (subView !== 'photo_studio') return;
    const canvas = photoCanvasRef.current;
    if (!canvas) return;
    const p = activePhotoPreset;
    canvas.width = p.wPx;
    canvas.height = p.hPx;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let cancelled = false;
    const loadImg = (url: string | null): Promise<HTMLImageElement | null> =>
      new Promise((resolve) => {
        if (!url) return resolve(null);
        const im = new Image();
        im.onload = () => resolve(im);
        im.onerror = () => resolve(null);
        im.src = url;
      });

    void Promise.all([loadImg(photoFrontUrl), loadImg(photoBackUrl)]).then(([img1, img2]) => {
      if (cancelled) return;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.fillStyle = '#475569';
      ctx.font = 'bold 18px monospace';
      ctx.textAlign = 'left';
      ctx.fillText(`AMAN COMPUTER · ${p.label.toUpperCase()} · 300 DPI`, 24, 30);

      const gridW = p.cols * p.tileW + (p.cols - 1) * p.gap;
      const gridH = p.rows * p.tileH + (p.rows - 1) * p.gap;
      const mx = Math.max(0, (p.wMm - gridW) / 2);
      const my = p.mode === 'id_card_pair' ? 24 : Math.max(0, (p.hMm - gridH) / 2);

      const total = p.cols * p.rows;
      for (let i = 0; i < total; i++) {
        const r = Math.floor(i / p.cols);
        const c = i % p.cols;
        const x = Math.round((mx + c * (p.tileW + p.gap)) * PX_PER_MM_300DPI);
        const y = Math.round((my + r * (p.tileH + p.gap)) * PX_PER_MM_300DPI);
        const w = Math.round(p.tileW * PX_PER_MM_300DPI);
        const h = Math.round(p.tileH * PX_PER_MM_300DPI);

        const img = p.mode === 'id_card_pair' && i === 1 ? img2 : img1;
        if (img) {
          const sr = img.width / img.height;
          const dr = w / h;
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
          ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
        } else {
          ctx.fillStyle = '#e2edf8';
          ctx.fillRect(x, y, w, h);
          ctx.fillStyle = '#334155';
          ctx.font = `bold ${Math.max(20, Math.round(w * 0.085))}px sans-serif`;
          ctx.textAlign = 'center';
          ctx.fillText(
            p.mode === 'id_card_pair' ? (i === 0 ? 'ID FRONT' : 'ID BACK') : `SLOT ${i + 1}`,
            x + w / 2,
            y + h / 2
          );
        }

        if (showCutMarks) {
          ctx.strokeStyle = '#94a3b8';
          ctx.lineWidth = 3;
          ctx.strokeRect(x, y, w, h);
        }
      }
    });

    return () => {
      cancelled = true;
    };
  }, [subView, activePhotoPreset, photoFrontUrl, photoBackUrl, showCutMarks]);

  const handleAddPrintLine = (e: React.FormEvent) => {
    e.preventDefault();
    const pages = Math.max(1, Math.min(2000, Number(itemPages) || 1));
    const copies = Math.max(1, Math.min(200, Number(itemCopies) || 1));
    const impPerCopy = Math.ceil(pages / itemNup);
    const sheetsPerCopy = itemSides === 'duplex' ? Math.ceil(impPerCopy / 2) : impPerCopy;
    const totalSheets = sheetsPerCopy * copies;
    const totalImp = impPerCopy * copies;
    const unitRateInr =
      itemPaper === 'A3'
        ? itemMode === 'colour'
          ? 25
          : 6
        : itemMode === 'colour'
          ? itemSides === 'duplex'
            ? 18
            : 10
          : itemSides === 'duplex'
            ? 3
            : 2;
    const printBase = (itemSides === 'duplex' ? totalSheets : totalImp) * unitRateInr;
    const finExtra = finishingPriceInr(itemFinishing) * copies;

    setCart((prev) => [
      ...prev,
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        kind: 'document_print',
        title: `${pages}p ${itemPaper} ${itemMode === 'colour' ? 'Colour' : 'B&W'} ${itemSides}${
          itemNup > 1 ? ` · ${itemNup}-in-1` : ''
        } × ${copies}${itemFinishing !== 'none' ? ` + ${itemFinishing.replace('_', ' ')}` : ''}`,
        paperSize: itemPaper,
        printMode: itemMode,
        printSides: itemSides,
        selectedPagesCount: pages,
        pagesPerSheet: itemNup,
        copies,
        finishingService: itemFinishing,
        photoPresetId: 'passport_4x6_8',
        estimatedInr: printBase + finExtra,
      },
    ]);
  };

  const handleAddPhotoSheetToCart = (switchToPos = true) => {
    setCart((prev) => [
      ...prev,
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        kind: 'photo_sheet',
        title: activePhotoPreset.label,
        paperSize: activePhotoPreset.id === 'passport_4x6_8' ? 'Photo_4x6' : 'A4',
        printMode: 'colour',
        printSides: 'single',
        selectedPagesCount: 1,
        pagesPerSheet: 1,
        copies: 1,
        finishingService: 'none',
        photoPresetId: activePhotoPreset.id,
        estimatedInr: activePhotoPreset.priceInr,
      },
    ]);
    onToast?.(`Added ${activePhotoPreset.label} to Walk-In POS bill`, 'good');
    if (switchToPos) setSubView('pos');
  };

  const cartTotalInr = useMemo(
    () => cart.reduce((sum, item) => sum + item.estimatedInr, 0),
    [cart]
  );

  const handleCheckoutWalkin = async () => {
    if (cart.length === 0 || busy) return;
    setBusy(true);
    setErrorMsg(null);
    try {
      const res = await apiRequest<{
        tokenNumber: string;
        slipLines: string[];
        state: WalkinPosStatePayload;
      }>('/pos/orders', {
        method: 'POST',
        body: JSON.stringify({
          customerName: customerName.trim() || 'Walk-in Counter Customer',
          paymentMethod,
          khataAccountId: paymentMethod === 'khata' ? khataAccountId : undefined,
          deductInventory,
          items: cart,
        }),
      });
      setState(res.state);
      setActiveSlip(res.slipLines);
      setCart([]);
      onToast?.(`Walk-In Token ${res.tokenNumber} settled via ${paymentMethod.toUpperCase()}`, 'good');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to settle Walk-In POS order.';
      setErrorMsg(msg);
      onToast?.(msg, 'bad');
    } finally {
      setBusy(false);
    }
  };

  const handleLogMaintenance = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErrorMsg(null);
    try {
      const res = await apiRequest<{ state: WalkinPosStatePayload }>('/pos/maintenance/log', {
        method: 'POST',
        body: JSON.stringify({
          stationId: maintStationId,
          actionType: maintAction,
          resetCounter: maintReset,
          note: maintNote.trim(),
        }),
      });
      setState(res.state);
      setMaintNote('');
      setMaintReset(false);
      onToast?.('Printer maintenance log recorded', 'good');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to log maintenance action.';
      setErrorMsg(msg);
      onToast?.(msg, 'bad');
    } finally {
      setBusy(false);
    }
  };

  const handleProtectedCsvExport = async () => {
    try {
      const token = await getCurrentFirebaseIdToken().catch(() => null);
      const res = await fetch('/api/pos/orders/export', {
        credentials: 'include',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) {
        onToast?.('Unable to download Walk-In POS CSV.', 'bad');
        return;
      }
      const csv = await res.text();
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'aman-computer-walkin-pos-ledger.csv';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      onToast?.('Walk-In CSV export failed.', 'bad');
    }
  };

  return (
    <div className="space-y-5">
      {/* Header + 4 Single-Elevation KPI Cards */}
      <section className="glass-pane rounded-[20px] p-5 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-[18px] font-bold flex items-center gap-2 text-[var(--ink)]">
              <ShoppingBag size={18} className="text-[var(--accent-text)]" />
              <span>Phase 19: Walk-In Counter POS, Photo Sheet Studio &amp; Printer Care</span>
            </h2>
            <p className="text-[12.5px] text-[var(--muted)] mt-1">
              Direct USB/photocopy billing without QR wait, 300-DPI passport/ID grids, and printer drum/nozzle service counters.
            </p>
          </div>
          <button
            type="button"
            disabled={loading || busy}
            onClick={() => void loadState()}
            className="btn-ghost px-3 py-1.5 rounded-[10px] text-[12px] font-semibold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            <span>{loading ? 'Syncing...' : 'Refresh POS'}</span>
          </button>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="rounded-[12px] p-3.5 bg-[var(--card-2)] border border-[var(--line)]">
            <div className="text-[11px] font-semibold text-[var(--muted)]">Walk-In Revenue</div>
            <div className="text-[20px] font-bold text-[var(--good)] tabular-nums mt-0.5">
              ₹{(state?.summary.totalWalkinRevenueInr ?? 0).toFixed(2)}
            </div>
            <div className="text-[11.5px] text-[var(--muted)] tabular-nums">
              {state?.summary.totalWalkinBills ?? 0} settled counter bills
            </div>
          </div>

          <div className="rounded-[12px] p-3.5 bg-[var(--card-2)] border border-[var(--line)]">
            <div className="text-[11px] font-semibold text-[var(--muted)]">Walk-In Cash &amp; UPI</div>
            <div className="text-[20px] font-bold text-[var(--ink)] tabular-nums mt-0.5">
              ₹{((state?.summary.cashWalkinInr ?? 0) + (state?.summary.upiWalkinInr ?? 0)).toFixed(2)}
            </div>
            <div className="text-[11.5px] text-[var(--muted)] tabular-nums">
              Cash ₹{(state?.summary.cashWalkinInr ?? 0).toFixed(0)} · UPI ₹{(state?.summary.upiWalkinInr ?? 0).toFixed(0)}
            </div>
          </div>

          <div className="rounded-[12px] p-3.5 bg-[var(--card-2)] border border-[var(--line)]">
            <div className="text-[11px] font-semibold text-[var(--muted)]">Billed to Client Khata</div>
            <div className="text-[20px] font-bold text-[var(--accent-text)] tabular-nums mt-0.5">
              ₹{(state?.summary.khataWalkinInr ?? 0).toFixed(2)}
            </div>
            <div className="text-[11.5px] text-[var(--muted)]">
              Auto-posted to Khata ledger
            </div>
          </div>

          <div className="rounded-[12px] p-3.5 bg-[var(--card-2)] border border-[var(--line)]">
            <div className="text-[11px] font-semibold text-[var(--muted)]">Printer Maintenance</div>
            <div
              className="text-[20px] font-bold tabular-nums mt-0.5"
              style={{
                color: (state?.summary.dueMaintenanceCount ?? 0) > 0 ? 'var(--warn)' : 'var(--good)',
              }}
            >
              {(state?.summary.dueMaintenanceCount ?? 0) > 0
                ? `${state?.summary.dueMaintenanceCount} Service Due`
                : 'All Healthy'}
            </div>
            <div className="text-[11.5px] text-[var(--muted)]">
              4 shop stations tracked
            </div>
          </div>
        </div>

        {/* Segmented Sub-Navigation */}
        <div className="flex flex-wrap gap-1.5 p-1 rounded-[12px] bg-[var(--card-2)] border border-[var(--line)] w-fit">
          {([
            { id: 'pos', label: 'Direct Counter POS', icon: Banknote },
            { id: 'photo_studio', label: 'Passport & ID Photo Studio', icon: Grid3X3 },
            { id: 'maintenance', label: 'Printer Page-Life & Care', icon: Wrench },
          ] as const).map((tab) => {
            const Icon = tab.icon;
            const active = subView === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setSubView(tab.id)}
                className={`px-3.5 py-2 rounded-[9px] text-[12.5px] font-semibold inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap transition-colors ${
                  active
                    ? 'bg-[var(--accent-soft)] text-[var(--accent-text)]'
                    : 'text-[var(--muted)] hover:text-[var(--ink)]'
                }`}
              >
                <Icon size={14} />
                <span>{tab.label}</span>
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

      {/* SUBVIEW 1: DIRECT COUNTER WALK-IN POS */}
      {subView === 'pos' && (
        <section className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          <div className="xl:col-span-2 space-y-4">
            {/* Quick Print Item Form */}
            <form onSubmit={handleAddPrintLine} className="glass-pane rounded-[20px] p-5 space-y-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-[15.5px] font-bold text-[var(--ink)] flex items-center gap-2">
                  <Printer size={16} className="text-[var(--accent-text)]" />
                  <span>Add Walk-In Print / Bind Line</span>
                </h3>
                <button
                  type="button"
                  onClick={() => handleAddPhotoSheetToCart(false)}
                  className="btn-ghost px-2.5 py-1 rounded-[8px] text-[11.5px] font-semibold inline-flex items-center gap-1 cursor-pointer"
                >
                  <Plus size={12} />
                  <span>Quick Add 4×6 Photo Sheet (₹40)</span>
                </button>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div>
                  <label htmlFor="pos-pages" className="block text-[11px] font-semibold mb-1">
                    Pages
                  </label>
                  <input
                    id="pos-pages"
                    type="number"
                    min={1}
                    max={2000}
                    value={itemPages}
                    onChange={(e) => setItemPages(e.target.value)}
                    className="w-full rounded-[10px] bg-[var(--card-2)] border border-[var(--line)] px-2.5 py-2 text-[12.5px] tabular-nums"
                  />
                </div>
                <div>
                  <label htmlFor="pos-copies" className="block text-[11px] font-semibold mb-1">
                    Copies
                  </label>
                  <input
                    id="pos-copies"
                    type="number"
                    min={1}
                    max={200}
                    value={itemCopies}
                    onChange={(e) => setItemCopies(e.target.value)}
                    className="w-full rounded-[10px] bg-[var(--card-2)] border border-[var(--line)] px-2.5 py-2 text-[12.5px] tabular-nums"
                  />
                </div>
                <div>
                  <label htmlFor="pos-paper" className="block text-[11px] font-semibold mb-1">
                    Paper
                  </label>
                  <select
                    id="pos-paper"
                    value={itemPaper}
                    onChange={(e) => setItemPaper(e.target.value as 'A4' | 'A3' | 'Legal')}
                    className="w-full rounded-[10px] bg-[var(--card-2)] border border-[var(--line)] px-2.5 py-2 text-[12.5px]"
                  >
                    <option value="A4">A4</option>
                    <option value="Legal">Legal</option>
                    <option value="A3">A3</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="pos-mode" className="block text-[11px] font-semibold mb-1">
                    Mode
                  </label>
                  <select
                    id="pos-mode"
                    value={itemMode}
                    onChange={(e) => setItemMode(e.target.value as 'bw' | 'colour')}
                    className="w-full rounded-[10px] bg-[var(--card-2)] border border-[var(--line)] px-2.5 py-2 text-[12.5px]"
                  >
                    <option value="bw">B&amp;W</option>
                    <option value="colour">Colour</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <div>
                  <label htmlFor="pos-sides" className="block text-[11px] font-semibold mb-1">
                    Sides
                  </label>
                  <select
                    id="pos-sides"
                    value={itemSides}
                    onChange={(e) => setItemSides(e.target.value as 'single' | 'duplex')}
                    className="w-full rounded-[10px] bg-[var(--card-2)] border border-[var(--line)] px-2.5 py-2 text-[12.5px]"
                  >
                    <option value="single">Single-Sided</option>
                    <option value="duplex">Duplex (Back-to-Back)</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="pos-nup" className="block text-[11px] font-semibold mb-1">
                    N-Up Layout
                  </label>
                  <select
                    id="pos-nup"
                    value={itemNup}
                    onChange={(e) => setItemNup(Number(e.target.value) as 1 | 2 | 4)}
                    className="w-full rounded-[10px] bg-[var(--card-2)] border border-[var(--line)] px-2.5 py-2 text-[12.5px]"
                  >
                    <option value={1}>1-in-1 Normal</option>
                    <option value={2}>2-in-1 Half Notes</option>
                    <option value={4}>4-in-1 Compact</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="pos-finishing" className="block text-[11px] font-semibold mb-1">
                    Finishing Add-On
                  </label>
                  <select
                    id="pos-finishing"
                    value={itemFinishing}
                    onChange={(e) =>
                      setItemFinishing(e.target.value as WalkinPosCartDraftItem['finishingService'])
                    }
                    className="w-full rounded-[10px] bg-[var(--card-2)] border border-[var(--line)] px-2.5 py-2 text-[12.5px]"
                  >
                    <option value="none">None</option>
                    <option value="staple_corner">Corner Staple (+₹5)</option>
                    <option value="spiral_binding">Spiral Binding (+₹30)</option>
                    <option value="thermal_lamination">Lamination (+₹20)</option>
                    <option value="heavy_cover_bind">Cover Bind (+₹45)</option>
                  </select>
                </div>
              </div>

              <button
                type="submit"
                className="btn-primary px-4 py-2 rounded-[10px] text-[12.5px] font-semibold inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Plus size={14} />
                <span>Add Line to Bill</span>
              </button>
            </form>

            {/* Current Cart + Checkout */}
            <div className="glass-pane rounded-[20px] p-5 space-y-3.5">
              <div className="flex items-center justify-between">
                <h3 className="text-[15.5px] font-bold text-[var(--ink)]">
                  Active Counter Bill ({cart.length} item{cart.length === 1 ? '' : 's'})
                </h3>
                <span className="text-[16px] font-bold font-mono text-[var(--good)] tabular-nums">
                  Total: ₹{cartTotalInr.toFixed(2)}
                </span>
              </div>

              {cart.length === 0 ? (
                <div className="rounded-[12px] p-4 bg-[var(--card-2)] border border-[var(--line)] text-[12.5px] text-[var(--muted)]">
                  Add print lines above or build a passport photo grid in the Photo Studio tab.
                </div>
              ) : (
                <ul className="divide-y divide-[var(--line)]">
                  {cart.map((item) => (
                    <li key={item.id} className="py-2.5 flex items-center justify-between gap-2 text-[12.5px]">
                      <span className="font-medium text-[var(--ink)] truncate">{item.title}</span>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="font-mono font-bold tabular-nums">₹{item.estimatedInr.toFixed(2)}</span>
                        <button
                          type="button"
                          onClick={() => setCart((prev) => prev.filter((x) => x.id !== item.id))}
                          aria-label="Remove item"
                          className="text-[var(--bad)] hover:opacity-80 cursor-pointer"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-[var(--line)]">
                <div>
                  <label htmlFor="pos-cust-name" className="block text-[11.5px] font-semibold mb-1">
                    Customer Name
                  </label>
                  <input
                    id="pos-cust-name"
                    type="text"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    className="w-full rounded-[10px] bg-[var(--card-2)] border border-[var(--line)] px-3 py-2 text-[12.5px]"
                  />
                </div>
                <div>
                  <label htmlFor="pos-pay-mode" className="block text-[11.5px] font-semibold mb-1">
                    Settlement Mode
                  </label>
                  <select
                    id="pos-pay-mode"
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value as 'cash' | 'upi' | 'khata')}
                    className="w-full rounded-[10px] bg-[var(--card-2)] border border-[var(--line)] px-3 py-2 text-[12.5px]"
                  >
                    <option value="cash">Counter Cash</option>
                    <option value="upi">Counter UPI QR</option>
                    <option value="khata">Regular Client Khata (Credit)</option>
                  </select>
                </div>
              </div>

              {paymentMethod === 'khata' && (
                <div>
                  <label htmlFor="pos-khata-account" className="block text-[11.5px] font-semibold mb-1">
                    Select Khata Account
                  </label>
                  <select
                    id="pos-khata-account"
                    value={khataAccountId}
                    onChange={(e) => setKhataAccountId(e.target.value)}
                    className="w-full rounded-[10px] bg-[var(--card-2)] border border-[var(--line)] px-3 py-2 text-[12.5px]"
                  >
                    {(state?.khataAccounts ?? []).map((acc) => (
                      <option key={acc.id} value={acc.id}>
                        {acc.clientName} (Due ₹{(acc.balanceDuePaise / 100).toFixed(0)} / Limit ₹
                        {(acc.creditLimitPaise / 100).toFixed(0)})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <label className="inline-flex items-center gap-2 text-[12px] text-[var(--ink-2)] cursor-pointer">
                <input
                  type="checkbox"
                  checked={deductInventory}
                  onChange={(e) => setDeductInventory(e.target.checked)}
                />
                <span>Auto-deduct paper, toner/ink &amp; finishing stock + update printer page counters</span>
              </label>

              <button
                type="button"
                disabled={busy || cart.length === 0}
                onClick={() => void handleCheckoutWalkin()}
                className="btn-primary w-full py-2.5 rounded-[12px] text-[13px] font-semibold cursor-pointer disabled:opacity-45"
              >
                {busy ? 'Settling Counter Bill...' : `Settle Bill (₹${cartTotalInr.toFixed(2)}) & Print 80mm Slip`}
              </button>
            </div>
          </div>

          {/* Right Column: 80mm Walk-In Receipt + Recent Bills */}
          <div className="glass-pane rounded-[20px] p-5 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-[15.5px] font-bold text-[var(--ink)] flex items-center gap-1.5">
                <Receipt size={16} className="text-[var(--accent-text)]" />
                <span>80mm Thermal POS Slip</span>
              </h3>
              <button
                type="button"
                onClick={() => void handleProtectedCsvExport()}
                className="btn-ghost px-2.5 py-1 rounded-[8px] text-[11.5px] font-semibold inline-flex items-center gap-1 cursor-pointer"
              >
                <Download size={12} />
                <span>CSV</span>
              </button>
            </div>

            {activeSlip ? (
              <pre className="p-3.5 rounded-[12px] bg-[#111318] text-[#e6ecf5] font-mono text-[10.5px] leading-snug overflow-x-auto">
                {activeSlip.join('\n')}
              </pre>
            ) : (
              <div className="rounded-[12px] p-4 bg-[var(--card-2)] border border-[var(--line)] text-[12px] text-[var(--muted)]">
                Complete a walk-in bill to view and print its 80mm thermal receipt.
              </div>
            )}

            <div className="pt-2 border-t border-[var(--line)] space-y-2">
              <div className="text-[11.5px] font-semibold text-[var(--muted)]">
                Recent Walk-In Bills ({state?.orders.length ?? 0})
              </div>
              <ul className="space-y-1.5 max-h-[210px] overflow-y-auto pr-1 text-[12px]">
                {(state?.orders ?? []).slice(0, 8).map((o) => (
                  <li
                    key={o.id}
                    className="rounded-[10px] p-2.5 bg-[var(--card-2)] border border-[var(--line)] flex items-center justify-between gap-2"
                  >
                    <button
                      type="button"
                      onClick={() => setActiveSlip(o.slipLines)}
                      className="text-left min-w-0 flex-1 cursor-pointer"
                    >
                      <div className="font-semibold text-[var(--ink)] truncate">
                        {o.tokenNumber} · {o.customerName}
                      </div>
                      <div className="text-[11px] text-[var(--muted)]">
                        {o.paymentMethod.toUpperCase()} · {o.totalPhysicalSheets} sheets
                      </div>
                    </button>
                    <span className="font-mono font-bold tabular-nums shrink-0 text-[var(--good)]">
                      ₹{o.grossTotalInr.toFixed(2)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      )}

      {/* SUBVIEW 2: 300-DPI PASSPORT & ID PHOTO STUDIO */}
      {subView === 'photo_studio' && (
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="glass-pane rounded-[20px] p-5 space-y-4">
            <h3 className="text-[15.5px] font-bold text-[var(--ink)]">
              Counter 300-DPI Passport &amp; ID Sheet Builder
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {PHOTO_PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPhotoPresetId(p.id)}
                  className={`p-3 rounded-[12px] text-left border cursor-pointer ${
                    p.id === photoPresetId
                      ? 'border-[var(--accent)] bg-[var(--accent-soft)]'
                      : 'border-[var(--line)] bg-[var(--card-2)]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-[12.5px] font-bold text-[var(--ink)]">{p.label}</span>
                    <span className="font-mono font-bold text-[12px] text-[var(--accent-text)]">
                      ₹{p.priceInr}
                    </span>
                  </div>
                  <div className="text-[11px] text-[var(--muted)] mt-0.5">
                    {p.wPx}×{p.hPx} px · {p.cols}×{p.rows} grid
                  </div>
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <label className="btn-ghost px-3 py-2.5 rounded-[11px] text-[12.5px] font-semibold inline-flex items-center justify-center gap-2 cursor-pointer">
                <ImageIcon size={15} />
                <span>{activePhotoPreset.mode === 'id_card_pair' ? 'Upload ID Front' : 'Upload Portrait Photo'}</span>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    const r = new FileReader();
                    r.onload = () => setPhotoFrontUrl(typeof r.result === 'string' ? r.result : null);
                    r.readAsDataURL(f);
                  }}
                  className="sr-only"
                />
              </label>

              {activePhotoPreset.mode === 'id_card_pair' && (
                <label className="btn-ghost px-3 py-2.5 rounded-[11px] text-[12.5px] font-semibold inline-flex items-center justify-center gap-2 cursor-pointer">
                  <ImageIcon size={15} />
                  <span>Upload ID Back</span>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (!f) return;
                      const r = new FileReader();
                      r.onload = () => setPhotoBackUrl(typeof r.result === 'string' ? r.result : null);
                      r.readAsDataURL(f);
                    }}
                    className="sr-only"
                  />
                </label>
              )}
            </div>

            <label className="inline-flex items-center gap-2 text-[12.5px] font-medium cursor-pointer">
              <input
                type="checkbox"
                checked={showCutMarks}
                onChange={(e) => setShowCutMarks(e.target.checked)}
              />
              <Scissors size={14} />
              <span>Include scissors cut-guide border lines</span>
            </label>

            <div className="flex flex-wrap gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => handleAddPhotoSheetToCart(true)}
                className="btn-primary flex-1 py-2.5 px-4 rounded-[11px] text-[12.5px] font-semibold cursor-pointer"
              >
                Add Sheet to Walk-In POS Bill (₹{activePhotoPreset.priceInr})
              </button>
              <button
                type="button"
                onClick={() => {
                  const canvas = photoCanvasRef.current;
                  if (!canvas) return;
                  const a = document.createElement('a');
                  a.href = canvas.toDataURL('image/png');
                  a.download = `aman-computer-${activePhotoPreset.id}-300dpi.png`;
                  document.body.appendChild(a);
                  a.click();
                  a.remove();
                }}
                className="btn-ghost py-2.5 px-4 rounded-[11px] text-[12.5px] font-semibold inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Download size={14} />
                <span>Download 300-DPI PNG</span>
              </button>
            </div>
          </div>

          <div className="glass-pane rounded-[20px] p-5 space-y-3">
            <div className="flex items-center justify-between text-[13px] font-bold">
              <span>Live Print Sheet Canvas</span>
              <span className="font-mono text-[11.5px] text-[var(--muted)]">
                {activePhotoPreset.wPx}×{activePhotoPreset.hPx} px
              </span>
            </div>
            <div className="rounded-[12px] bg-[#eef2f6] border border-[var(--line)] p-3 flex justify-center">
              <canvas
                ref={photoCanvasRef}
                className="max-h-[420px] w-auto max-w-full rounded-[8px] shadow bg-white"
              />
            </div>
          </div>
        </section>
      )}

      {/* SUBVIEW 3: PRINTER PAGE-LIFE & MAINTENANCE LOGBOOK */}
      {subView === 'maintenance' && state && (
        <section className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          <div className="xl:col-span-2 glass-pane rounded-[20px] p-5 space-y-3.5">
            <h3 className="text-[15.5px] font-bold text-[var(--ink)]">
              Shop Printer Drum, Fuser &amp; Printhead Life Counters
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {state.maintenanceCounters.map((m) => (
                <div
                  key={m.stationId}
                  className="rounded-[14px] p-4 bg-[var(--card-2)] border border-[var(--line)] space-y-2.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-[13.5px] font-bold text-[var(--ink)]">{m.printerName}</div>
                      <div className="text-[11.5px] text-[var(--muted)]">{m.componentName}</div>
                    </div>
                    <span
                      className="text-[11px] font-bold inline-flex items-center gap-1 shrink-0"
                      style={{
                        color:
                          m.healthStatus === 'overdue'
                            ? 'var(--bad)'
                            : m.healthStatus === 'service_due'
                              ? 'var(--warn)'
                              : 'var(--good)',
                      }}
                    >
                      {m.healthStatus === 'healthy' ? (
                        <CheckCircle2 size={13} />
                      ) : (
                        <AlertTriangle size={13} />
                      )}
                      <span>
                        {m.healthStatus === 'overdue'
                          ? 'Service Overdue'
                          : m.healthStatus === 'service_due'
                            ? 'Service Soon'
                            : 'Healthy'}
                      </span>
                    </span>
                  </div>

                  <div className="space-y-1">
                    <div className="flex justify-between text-[11.5px] font-mono tabular-nums">
                      <span>{m.pagesSinceService.toLocaleString('en-IN')} / {m.serviceIntervalPages.toLocaleString('en-IN')} pages</span>
                      <span>{m.wearPct}% wear</span>
                    </div>
                    <div className="h-2 rounded-full bg-[var(--card)] border border-[var(--line)] overflow-hidden">
                      <div
                        className="h-full transition-all"
                        style={{
                          width: `${m.wearPct}%`,
                          background:
                            m.healthStatus === 'overdue'
                              ? 'var(--bad)'
                              : m.healthStatus === 'service_due'
                                ? 'var(--warn)'
                                : '#25C7D9',
                        }}
                      />
                    </div>
                  </div>

                  <div className="text-[11px] text-[var(--muted)]">
                    Lifetime: {m.lifetimePages.toLocaleString('en-IN')} pages · Last: {m.lastServiceNote}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="glass-pane rounded-[20px] p-5 space-y-4">
            <h3 className="text-[15.5px] font-bold text-[var(--ink)]">
              Record Nozzle / Drum Maintenance
            </h3>
            <form onSubmit={handleLogMaintenance} className="space-y-3">
              <div>
                <label htmlFor="maint-station" className="block text-[11.5px] font-semibold mb-1">
                  Printer Station
                </label>
                <select
                  id="maint-station"
                  value={maintStationId}
                  onChange={(e) => setMaintStationId(e.target.value)}
                  className="w-full rounded-[10px] bg-[var(--card-2)] border border-[var(--line)] px-2.5 py-2 text-[12px]"
                >
                  {state.maintenanceCounters.map((m) => (
                    <option key={m.stationId} value={m.stationId}>
                      {m.printerName}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="maint-action" className="block text-[11.5px] font-semibold mb-1">
                  Maintenance Action
                </label>
                <select
                  id="maint-action"
                  value={maintAction}
                  onChange={(e) => setMaintAction(e.target.value as typeof maintAction)}
                  className="w-full rounded-[10px] bg-[var(--card-2)] border border-[var(--line)] px-2.5 py-2 text-[12px]"
                >
                  <option value="nozzle_check_clean">Printhead Nozzle Check &amp; Purge</option>
                  <option value="drum_wipe">Imaging Drum &amp; Corona Wipe</option>
                  <option value="roller_clean">Pickup Roller Cleaning</option>
                  <option value="jam_cleared">Paper Jam Path Inspection</option>
                  <option value="consumable_part_replaced">Drum / Pad / Cartridge Replaced</option>
                </select>
              </div>
              <div>
                <label htmlFor="maint-note" className="block text-[11.5px] font-semibold mb-1">
                  Technician Note
                </label>
                <input
                  id="maint-note"
                  type="text"
                  value={maintNote}
                  onChange={(e) => setMaintNote(e.target.value)}
                  placeholder="e.g., Nozzle test lines 100% solid"
                  className="w-full rounded-[10px] bg-[var(--card-2)] border border-[var(--line)] px-2.5 py-2 text-[12px]"
                />
              </div>
              <label className="inline-flex items-center gap-2 text-[12px] cursor-pointer">
                <input
                  type="checkbox"
                  checked={maintReset}
                  onChange={(e) => setMaintReset(e.target.checked)}
                />
                <span>Reset service interval counter to 0</span>
              </label>
              <button
                type="submit"
                disabled={busy}
                className="btn-primary w-full py-2.5 rounded-[11px] text-[12.5px] font-semibold cursor-pointer disabled:opacity-50"
              >
                Save Maintenance Log
              </button>
            </form>

            {state.maintenanceLogs.length > 0 && (
              <div className="pt-2 border-t border-[var(--line)] space-y-1.5 max-h-[170px] overflow-y-auto text-[11.5px]">
                {state.maintenanceLogs.slice(0, 6).map((l) => (
                  <div
                    key={l.id}
                    className="rounded-[9px] px-2.5 py-2 bg-[var(--card-2)] border border-[var(--line)]"
                  >
                    <div className="font-semibold text-[var(--ink)]">{l.printer_name}</div>
                    <div className="text-[var(--muted)]">{l.note}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
};
