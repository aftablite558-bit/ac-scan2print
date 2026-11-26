// AC Scan2Print — Phase 18: Finishing Add-Ons, Paper/Toner Stock, Shift Cash Tally & Client Khata Panel
import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  Banknote,
  BookOpen,
  CheckCircle2,
  Download,
  Layers,
  Package,
  Plus,
  Printer,
  Receipt,
  RefreshCw,
} from 'lucide-react';
import { apiRequest } from '../../lib/api';
import { getCurrentFirebaseIdToken } from '../../lib/firebase';

export interface CounterInventoryItemView {
  id: string;
  itemName: string;
  category: 'paper' | 'toner_ink' | 'finishing_supply';
  unitLabel: string;
  packSize: number;
  currentQty: number;
  minThreshold: number;
  unitCostPaise: number;
  wholePacksRemaining: number;
  alertLevel: 'healthy' | 'low_stock' | 'critical_low';
  stockValueInr: number;
  updatedAt: string;
}

export interface CounterMovementView {
  id: string;
  item_id: string;
  item_name: string;
  unit_label: string;
  movement_type: string;
  delta_qty: number;
  resulting_qty: number;
  job_number: string | null;
  reason: string;
  created_at: string;
}

export interface ShiftTallyView {
  id: string;
  shiftLabel: string;
  operatorName: string;
  openingFloatPaise: number;
  cashSalesPaise: number;
  upiSalesPaise: number;
  expensesPaise: number;
  expectedPaise: number;
  countedPaise: number;
  variancePaise: number;
  status: string;
  zReportLines: string[];
  closedAt: string;
}

export interface KhataAccountView {
  id: string;
  clientName: string;
  clientType: 'coaching' | 'student' | 'office' | 'walkin_regular';
  contactPhone: string;
  creditLimitPaise: number;
  balanceDuePaise: number;
  updatedAt: string;
}

export interface KhataTxView {
  id: string;
  accountId: string;
  clientName?: string;
  entryType: 'debit_print' | 'credit_payment';
  amountPaise: number;
  paymentMode: 'khata' | 'cash' | 'upi';
  referenceNote: string;
  createdAt: string;
}

export interface CounterOpsStatePayload {
  checkedAtIso: string;
  inventory: CounterInventoryItemView[];
  lowStockAlerts: CounterInventoryItemView[];
  movements: CounterMovementView[];
  shiftTallies: ShiftTallyView[];
  khataAccounts: KhataAccountView[];
  khataTransactions: KhataTxView[];
  totalKhataReceivableInr: number;
}

type CounterSubView = 'inventory' | 'cash_tally' | 'khata';

export const CounterOpsPanel: React.FC<{
  onToast?: (message: string, tone?: 'good' | 'bad' | 'info') => void;
}> = ({ onToast }) => {
  const [subView, setSubView] = useState<CounterSubView>('inventory');
  const [state, setState] = useState<CounterOpsStatePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Job stock deduction quick-entry state
  const [jobPaperSize, setJobPaperSize] = useState<'A4' | 'Legal' | 'Photo_4x6'>('A4');
  const [jobPrintMode, setJobPrintMode] = useState<'bw' | 'colour'>('bw');
  const [jobSheets, setJobSheets] = useState('25');
  const [jobFinishing, setJobFinishing] = useState<
    'none' | 'staple_corner' | 'spiral_binding' | 'thermal_lamination' | 'heavy_cover_bind'
  >('spiral_binding');
  const [jobCopies, setJobCopies] = useState('2');

  // Cash Drawer tally state
  const [shiftLabel, setShiftLabel] = useState('Evening Shift Close');
  const [operatorName, setOperatorName] = useState('Aman Kumar');
  const [openingFloat, setOpeningFloat] = useState('500');
  const [cashSales, setCashSales] = useState('840');
  const [upiSales, setUpiSales] = useState('1120');
  const [expenses, setExpenses] = useState('60');
  const [n500, setN500] = useState('1');
  const [n200, setN200] = useState('2');
  const [n100, setN100] = useState('3');
  const [n50, setN50] = useState('1');
  const [n20, setN20] = useState('1');
  const [n10, setN10] = useState('1');
  const [coinsInr, setCoinsInr] = useState('0');
  const [activeZReport, setActiveZReport] = useState<string[] | null>(null);

  // Khata state
  const [newClientName, setNewClientName] = useState('');
  const [newClientType, setNewClientType] = useState<'coaching' | 'student' | 'office' | 'walkin_regular'>('coaching');
  const [newClientPhone, setNewClientPhone] = useState('');
  const [newClientLimit, setNewClientLimit] = useState('2500');

  const [txAccountId, setTxAccountId] = useState('');
  const [txEntryType, setTxEntryType] = useState<'debit_print' | 'credit_payment'>('debit_print');
  const [txAmount, setTxAmount] = useState('120');
  const [txPaymentMode, setTxPaymentMode] = useState<'cash' | 'upi'>('cash');
  const [txNote, setTxNote] = useState('');

  const loadState = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const data = await apiRequest<CounterOpsStatePayload>('/counter/state');
      setState(data);
      if (data.khataAccounts.length > 0) {
        setTxAccountId((prev) => prev || data.khataAccounts[0].id);
      }
      if (data.shiftTallies.length > 0) {
        setActiveZReport((prev) => prev || data.shiftTallies[0].zReportLines);
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to load counter operations state.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadState();
  }, [loadState]);

  const handleRestock = async (itemId: string, addQty: number, itemLabel: string) => {
    setBusy(true);
    setErrorMsg(null);
    try {
      const res = await apiRequest<{ state: CounterOpsStatePayload }>('/counter/inventory/restock', {
        method: 'POST',
        body: JSON.stringify({
          itemId,
          addQty,
          reason: `Counter refill (+${addQty}) for ${itemLabel}`,
        }),
      });
      setState(res.state);
      onToast?.(`Restocked ${itemLabel} (+${addQty})`, 'good');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to restock item.';
      setErrorMsg(msg);
      onToast?.(msg, 'bad');
    } finally {
      setBusy(false);
    }
  };

  const handleDeductJobStock = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErrorMsg(null);
    try {
      const sheets = Math.max(1, Number(jobSheets) || 1);
      const copies = Math.max(1, Number(jobCopies) || 1);
      const res = await apiRequest<{ jobNumber: string; state: CounterOpsStatePayload }>(
        '/counter/inventory/deduct-job',
        {
          method: 'POST',
          body: JSON.stringify({
            jobNumber: `POS-${Date.now().toString().slice(-6)}`,
            paperSize: jobPaperSize,
            printMode: jobPrintMode,
            physicalSheetsTotal: sheets,
            impressionsTotal: sheets * 2,
            copies,
            finishingService: jobFinishing,
          }),
        }
      );
      setState(res.state);
      onToast?.(`Logged paper/toner/finishing deduction for ${res.jobNumber}`, 'good');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to deduct stock.';
      setErrorMsg(msg);
      onToast?.(msg, 'bad');
    } finally {
      setBusy(false);
    }
  };

  const liveCountedInr =
    (Number(n500) || 0) * 500 +
    (Number(n200) || 0) * 200 +
    (Number(n100) || 0) * 100 +
    (Number(n50) || 0) * 50 +
    (Number(n20) || 0) * 20 +
    (Number(n10) || 0) * 10 +
    (Number(coinsInr) || 0);
  const liveExpectedInr =
    (Number(openingFloat) || 0) + (Number(cashSales) || 0) - (Number(expenses) || 0);
  const liveVarianceInr = Number((liveCountedInr - liveExpectedInr).toFixed(2));

  const handleSaveCashTally = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErrorMsg(null);
    try {
      const res = await apiRequest<{
        tally: { zReportLines: string[]; status: string };
        state: CounterOpsStatePayload;
      }>('/counter/cash-tally', {
        method: 'POST',
        body: JSON.stringify({
          shiftLabel,
          operatorName,
          openingFloatInr: Number(openingFloat) || 0,
          cashSalesInr: Number(cashSales) || 0,
          upiSalesInr: Number(upiSales) || 0,
          counterExpensesInr: Number(expenses) || 0,
          denominations: {
            n500: Number(n500) || 0,
            n200: Number(n200) || 0,
            n100: Number(n100) || 0,
            n50: Number(n50) || 0,
            n20: Number(n20) || 0,
            n10: Number(n10) || 0,
            coinsInr: Number(coinsInr) || 0,
          },
        }),
      });
      setState(res.state);
      setActiveZReport(res.tally.zReportLines);
      onToast?.(`Shift cash close saved (${res.tally.status.toUpperCase()})`, 'good');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to save cash drawer tally.';
      setErrorMsg(msg);
      onToast?.(msg, 'bad');
    } finally {
      setBusy(false);
    }
  };

  const handleAddKhataClient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newClientName.trim()) return;
    setBusy(true);
    setErrorMsg(null);
    try {
      const res = await apiRequest<{ id: string; state: CounterOpsStatePayload }>('/counter/khata/accounts', {
        method: 'POST',
        body: JSON.stringify({
          clientName: newClientName.trim(),
          clientType: newClientType,
          contactPhone: newClientPhone.trim(),
          creditLimitInr: Number(newClientLimit) || 2000,
        }),
      });
      setState(res.state);
      setTxAccountId(res.id);
      setNewClientName('');
      setNewClientPhone('');
      onToast?.('New Khata client account added', 'good');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to create Khata account.';
      setErrorMsg(msg);
      onToast?.(msg, 'bad');
    } finally {
      setBusy(false);
    }
  };

  const handleRecordKhataTx = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!txAccountId) return;
    setBusy(true);
    setErrorMsg(null);
    try {
      const res = await apiRequest<{ resultingBalanceInr: number; state: CounterOpsStatePayload }>(
        '/counter/khata/transactions',
        {
          method: 'POST',
          body: JSON.stringify({
            accountId: txAccountId,
            entryType: txEntryType,
            amountInr: Number(txAmount) || 0,
            paymentMode: txEntryType === 'credit_payment' ? txPaymentMode : 'khata',
            referenceNote: txNote.trim(),
          }),
        }
      );
      setState(res.state);
      setTxNote('');
      onToast?.(`Khata updated — current balance ₹${res.resultingBalanceInr.toFixed(2)}`, 'good');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to record Khata entry.';
      setErrorMsg(msg);
      onToast?.(msg, 'bad');
    } finally {
      setBusy(false);
    }
  };

  const handleProtectedCsvDownload = async (apiPath: string, filename: string) => {
    try {
      const token = await getCurrentFirebaseIdToken().catch(() => null);
      const res = await fetch(apiPath, {
        credentials: 'include',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) {
        onToast?.('Unable to download CSV report.', 'bad');
        return;
      }
      const text = await res.text();
      const blob = new Blob([text], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch {
      onToast?.('CSV download failed.', 'bad');
    }
  };

  const a4Item = state?.inventory.find((i) => i.id === 'paper-a4-75gsm');
  const lowAlertsCount = state?.lowStockAlerts.length ?? 0;
  const latestClose = state?.shiftTallies[0] ?? null;

  return (
    <div className="space-y-5">
      {/* Header & Top Metrics Strip */}
      <section className="glass-pane rounded-[20px] p-5 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-[18px] font-bold flex items-center gap-2 text-[var(--ink)]">
              <Layers size={18} className="text-[var(--accent-text)]" />
              <span>Phase 18: Shop Paper Stock, Shift Cash Tally &amp; Client Khata</span>
            </h2>
            <p className="text-[12.5px] text-[var(--muted)] mt-1">
              Single-shop inventory control, finishing add-on supplies, drawer denomination reconciliation, and regular coaching/office Khata balances.
            </p>
          </div>
          <button
            type="button"
            disabled={loading || busy}
            onClick={() => void loadState()}
            className="btn-ghost px-3 py-1.5 rounded-[10px] text-[12px] font-semibold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            <span>{loading ? 'Loading...' : 'Refresh Ledger'}</span>
          </button>
        </div>

        {/* 4 Single-Elevation KPI Tiles */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="rounded-[12px] p-3.5 bg-[var(--card-2)] border border-[var(--line)]">
            <div className="text-[11px] font-semibold text-[var(--muted)]">A4 75 GSM Stock</div>
            <div className="text-[20px] font-bold text-[var(--ink)] tabular-nums mt-0.5">
              {a4Item ? `${a4Item.currentQty.toLocaleString('en-IN')} sheets` : '—'}
            </div>
            <div className="text-[11.5px] text-[var(--muted)] tabular-nums">
              {a4Item ? `${a4Item.wholePacksRemaining} reams (500/pack)` : 'Loading stock...'}
            </div>
          </div>

          <div className="rounded-[12px] p-3.5 bg-[var(--card-2)] border border-[var(--line)]">
            <div className="text-[11px] font-semibold text-[var(--muted)]">Low-Stock Alerts</div>
            <div
              className="text-[20px] font-bold tabular-nums mt-0.5"
              style={{ color: lowAlertsCount > 0 ? 'var(--warn)' : 'var(--good)' }}
            >
              {lowAlertsCount} {lowAlertsCount === 1 ? 'Item' : 'Items'}
            </div>
            <div className="text-[11.5px] text-[var(--muted)]">
              {lowAlertsCount > 0 ? 'Refill recommended before rush' : 'All supplies above minimum'}
            </div>
          </div>

          <div className="rounded-[12px] p-3.5 bg-[var(--card-2)] border border-[var(--line)]">
            <div className="text-[11px] font-semibold text-[var(--muted)]">Last Shift Drawer</div>
            <div className="text-[20px] font-bold text-[var(--good)] tabular-nums mt-0.5">
              {latestClose ? `₹${(latestClose.countedPaise / 100).toFixed(2)}` : 'Not closed yet'}
            </div>
            <div className="text-[11.5px] text-[var(--muted)] tabular-nums">
              {latestClose
                ? `${latestClose.shiftLabel} · ${latestClose.status.toUpperCase()}`
                : 'Complete evening note tally below'}
            </div>
          </div>

          <div className="rounded-[12px] p-3.5 bg-[var(--card-2)] border border-[var(--line)]">
            <div className="text-[11px] font-semibold text-[var(--muted)]">Total Khata Receivable</div>
            <div className="text-[20px] font-bold text-[var(--accent-text)] tabular-nums mt-0.5">
              ₹{(state?.totalKhataReceivableInr ?? 0).toFixed(2)}
            </div>
            <div className="text-[11.5px] text-[var(--muted)] tabular-nums">
              {state?.khataAccounts.length ?? 0} active regular accounts
            </div>
          </div>
        </div>

        {/* Segmented Sub-Navigation */}
        <div className="flex flex-wrap gap-1.5 p-1 rounded-[12px] bg-[var(--card-2)] border border-[var(--line)] w-fit">
          {([
            { id: 'inventory', label: 'Paper & Toner Stock', icon: Package },
            { id: 'cash_tally', label: 'Shift Cash Drawer', icon: Banknote },
            { id: 'khata', label: 'Client Khata Ledger', icon: BookOpen },
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

      {/* SUBVIEW 1: INVENTORY & JOB DEDUCTION */}
      {subView === 'inventory' && state && (
        <section className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          <div className="xl:col-span-2 glass-pane rounded-[20px] p-5 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-[15.5px] font-bold text-[var(--ink)]">
                Consumables &amp; Finishing Supplies Ledger
              </h3>
              <span className="text-[11.5px] text-[var(--muted)]">
                Auto-deducted per print &amp; binding order
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-[12.5px]">
                <thead>
                  <tr className="border-b border-[var(--line)] text-[11px] text-[var(--muted)] uppercase">
                    <th className="py-2 pr-3 font-semibold">Supply Item</th>
                    <th className="py-2 px-2 font-semibold text-right">Stock Remaining</th>
                    <th className="py-2 px-2 font-semibold text-right">Min Alert</th>
                    <th className="py-2 px-2 font-semibold">Status</th>
                    <th className="py-2 pl-2 font-semibold text-right">Quick Refill</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--line)]">
                  {state.inventory.map((item) => {
                    const refillQty = item.category === 'paper' ? 500 : item.category === 'toner_ink' ? 1000 : 25;
                    const refillLabel =
                      item.category === 'paper' ? '+1 Ream (500)' : `+${refillQty}`;
                    return (
                      <tr key={item.id} className="hover:bg-[var(--card-2)]/60">
                        <td className="py-2.5 pr-3">
                          <div className="font-semibold text-[var(--ink)]">{item.itemName}</div>
                          <div className="text-[11px] text-[var(--muted)] tabular-nums">
                            {item.wholePacksRemaining} packs · Value ₹{item.stockValueInr.toFixed(0)}
                          </div>
                        </td>
                        <td className="py-2.5 px-2 text-right font-mono font-semibold tabular-nums">
                          {item.currentQty.toLocaleString('en-IN')} {item.unitLabel}
                        </td>
                        <td className="py-2.5 px-2 text-right font-mono text-[var(--muted)] tabular-nums">
                          {item.minThreshold}
                        </td>
                        <td className="py-2.5 px-2">
                          <span
                            className="inline-flex items-center gap-1 text-[11.5px] font-semibold"
                            style={{
                              color:
                                item.alertLevel === 'critical_low'
                                  ? 'var(--bad)'
                                  : item.alertLevel === 'low_stock'
                                    ? 'var(--warn)'
                                    : 'var(--good)',
                            }}
                          >
                            {item.alertLevel === 'healthy' ? (
                              <CheckCircle2 size={13} />
                            ) : (
                              <AlertTriangle size={13} />
                            )}
                            <span>
                              {item.alertLevel === 'critical_low'
                                ? 'Critical Low'
                                : item.alertLevel === 'low_stock'
                                  ? 'Reorder Soon'
                                  : 'Healthy'}
                            </span>
                          </span>
                        </td>
                        <td className="py-2.5 pl-2 text-right">
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void handleRestock(item.id, refillQty, item.itemName)}
                            className="btn-ghost px-2.5 py-1 rounded-[8px] text-[11.5px] font-semibold inline-flex items-center gap-1 cursor-pointer disabled:opacity-50"
                          >
                            <Plus size={12} />
                            <span>{refillLabel}</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Right Column: Counter Job Stock Deduction Logger + Recent Audit Movements */}
          <div className="glass-pane rounded-[20px] p-5 space-y-4">
            <div>
              <h3 className="text-[15.5px] font-bold text-[var(--ink)] flex items-center gap-1.5">
                <Printer size={16} className="text-[var(--accent-text)]" />
                <span>Log Counter Print &amp; Finishing Deduction</span>
              </h3>
              <p className="text-[11.5px] text-[var(--muted)] mt-0.5">
                Deducts paper sheets, laser/ink yield, and spiral/lamination stock atomically.
              </p>
            </div>

            <form onSubmit={handleDeductJobStock} className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label htmlFor="deduct-paper" className="block text-[11.5px] font-semibold mb-1">
                    Paper Size
                  </label>
                  <select
                    id="deduct-paper"
                    value={jobPaperSize}
                    onChange={(e) => setJobPaperSize(e.target.value as 'A4' | 'Legal' | 'Photo_4x6')}
                    className="w-full rounded-[10px] bg-[var(--card-2)] border border-[var(--line)] px-2.5 py-2 text-[12px]"
                  >
                    <option value="A4">A4 75 GSM</option>
                    <option value="Legal">Legal 80 GSM</option>
                    <option value="Photo_4x6">Glossy 4x6</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="deduct-mode" className="block text-[11.5px] font-semibold mb-1">
                    Ink / Toner
                  </label>
                  <select
                    id="deduct-mode"
                    value={jobPrintMode}
                    onChange={(e) => setJobPrintMode(e.target.value as 'bw' | 'colour')}
                    className="w-full rounded-[10px] bg-[var(--card-2)] border border-[var(--line)] px-2.5 py-2 text-[12px]"
                  >
                    <option value="bw">HP Laser (B&amp;W)</option>
                    <option value="colour">Epson EcoTank (Colour)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label htmlFor="deduct-sheets" className="block text-[11.5px] font-semibold mb-1">
                    Physical Sheets
                  </label>
                  <input
                    id="deduct-sheets"
                    type="number"
                    min={1}
                    max={5000}
                    value={jobSheets}
                    onChange={(e) => setJobSheets(e.target.value)}
                    className="w-full rounded-[10px] bg-[var(--card-2)] border border-[var(--line)] px-2.5 py-2 text-[12px] tabular-nums"
                  />
                </div>
                <div>
                  <label htmlFor="deduct-copies" className="block text-[11.5px] font-semibold mb-1">
                    Copies
                  </label>
                  <input
                    id="deduct-copies"
                    type="number"
                    min={1}
                    max={200}
                    value={jobCopies}
                    onChange={(e) => setJobCopies(e.target.value)}
                    className="w-full rounded-[10px] bg-[var(--card-2)] border border-[var(--line)] px-2.5 py-2 text-[12px] tabular-nums"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="deduct-finishing" className="block text-[11.5px] font-semibold mb-1">
                  Finishing Supply Used
                </label>
                <select
                  id="deduct-finishing"
                  value={jobFinishing}
                  onChange={(e) =>
                    setJobFinishing(
                      e.target.value as
                        | 'none'
                        | 'staple_corner'
                        | 'spiral_binding'
                        | 'thermal_lamination'
                        | 'heavy_cover_bind'
                    )
                  }
                  className="w-full rounded-[10px] bg-[var(--card-2)] border border-[var(--line)] px-2.5 py-2 text-[12px]"
                >
                  <option value="none">Standard Print Only</option>
                  <option value="staple_corner">Corner Stapling</option>
                  <option value="spiral_binding">Spiral Binding (Coil)</option>
                  <option value="thermal_lamination">A4 Thermal Lamination (Pouch)</option>
                  <option value="heavy_cover_bind">Project Cover &amp; Spine Tape</option>
                </select>
              </div>

              <button
                type="submit"
                disabled={busy}
                className="btn-primary w-full py-2.5 rounded-[11px] text-[12.5px] font-semibold cursor-pointer disabled:opacity-50"
              >
                Apply Stock Deduction
              </button>
            </form>

            <div className="pt-3 border-t border-[var(--line)] space-y-2">
              <div className="text-[11.5px] font-semibold text-[var(--muted)]">
                Recent Stock Movements ({state.movements.length})
              </div>
              {state.movements.length === 0 ? (
                <div className="text-[12px] text-[var(--muted)]">No restock or print deductions logged yet.</div>
              ) : (
                <ul className="space-y-1.5 max-h-[190px] overflow-y-auto pr-1 text-[11.5px]">
                  {state.movements.slice(0, 8).map((mv) => (
                    <li
                      key={mv.id}
                      className="rounded-[9px] px-2.5 py-2 bg-[var(--card-2)] border border-[var(--line)] flex items-center justify-between gap-2"
                    >
                      <span className="truncate text-[var(--ink-2)]">{mv.reason}</span>
                      <span
                        className="font-mono font-bold tabular-nums shrink-0"
                        style={{ color: mv.delta_qty >= 0 ? 'var(--good)' : 'var(--warn)' }}
                      >
                        {mv.delta_qty >= 0 ? `+${mv.delta_qty}` : mv.delta_qty}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </section>
      )}

      {/* SUBVIEW 2: SHIFT CASH DRAWER DENOMINATION TALLY */}
      {subView === 'cash_tally' && state && (
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <form onSubmit={handleSaveCashTally} className="glass-pane rounded-[20px] p-5 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h3 className="text-[15.5px] font-bold text-[var(--ink)]">
                  Shift Cash Drawer Note Tally
                </h3>
                <p className="text-[11.5px] text-[var(--muted)]">
                  Verify physical cash notes against opening float, cash sales, and counter expenses.
                </p>
              </div>
              <button
                type="button"
                onClick={() =>
                  void handleProtectedCsvDownload(
                    '/api/counter/cash-tally/export',
                    'aman-computer-cash-drawer-tallies.csv'
                  )
                }
                className="btn-ghost px-3 py-1.5 rounded-[9px] text-[12px] font-semibold inline-flex items-center gap-1.5 cursor-pointer shrink-0"
              >
                <Download size={13} />
                <span>CSV</span>
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label htmlFor="cash-shift-label" className="block text-[11.5px] font-semibold mb-1">
                  Shift Label
                </label>
                <input
                  id="cash-shift-label"
                  type="text"
                  value={shiftLabel}
                  onChange={(e) => setShiftLabel(e.target.value)}
                  className="w-full rounded-[10px] bg-[var(--card-2)] border border-[var(--line)] px-2.5 py-2 text-[12.5px]"
                />
              </div>
              <div>
                <label htmlFor="cash-operator" className="block text-[11.5px] font-semibold mb-1">
                  Operator
                </label>
                <input
                  id="cash-operator"
                  type="text"
                  value={operatorName}
                  onChange={(e) => setOperatorName(e.target.value)}
                  className="w-full rounded-[10px] bg-[var(--card-2)] border border-[var(--line)] px-2.5 py-2 text-[12.5px]"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div>
                <label htmlFor="cash-open-float" className="block text-[11px] font-semibold mb-1">
                  Open Float (₹)
                </label>
                <input
                  id="cash-open-float"
                  type="number"
                  min={0}
                  value={openingFloat}
                  onChange={(e) => setOpeningFloat(e.target.value)}
                  className="w-full rounded-[9px] bg-[var(--card-2)] border border-[var(--line)] px-2.5 py-1.5 text-[12.5px] tabular-nums"
                />
              </div>
              <div>
                <label htmlFor="cash-sales" className="block text-[11px] font-semibold mb-1">
                  Cash Sales (₹)
                </label>
                <input
                  id="cash-sales"
                  type="number"
                  min={0}
                  value={cashSales}
                  onChange={(e) => setCashSales(e.target.value)}
                  className="w-full rounded-[9px] bg-[var(--card-2)] border border-[var(--line)] px-2.5 py-1.5 text-[12.5px] tabular-nums"
                />
              </div>
              <div>
                <label htmlFor="cash-upi-sales" className="block text-[11px] font-semibold mb-1">
                  UPI Settled (₹)
                </label>
                <input
                  id="cash-upi-sales"
                  type="number"
                  min={0}
                  value={upiSales}
                  onChange={(e) => setUpiSales(e.target.value)}
                  className="w-full rounded-[9px] bg-[var(--card-2)] border border-[var(--line)] px-2.5 py-1.5 text-[12.5px] tabular-nums"
                />
              </div>
              <div>
                <label htmlFor="cash-expenses" className="block text-[11px] font-semibold mb-1">
                  Paid Out (₹)
                </label>
                <input
                  id="cash-expenses"
                  type="number"
                  min={0}
                  value={expenses}
                  onChange={(e) => setExpenses(e.target.value)}
                  className="w-full rounded-[9px] bg-[var(--card-2)] border border-[var(--line)] px-2.5 py-1.5 text-[12.5px] tabular-nums"
                />
              </div>
            </div>

            <div className="pt-2 border-t border-[var(--line)]">
              <div className="text-[12px] font-semibold mb-2">Note &amp; Coin Counts</div>
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 text-[12px]">
                {[
                  { id: 'n500', label: '₹500 notes', val: n500, set: setN500 },
                  { id: 'n200', label: '₹200 notes', val: n200, set: setN200 },
                  { id: 'n100', label: '₹100 notes', val: n100, set: setN100 },
                  { id: 'n50', label: '₹50 notes', val: n50, set: setN50 },
                  { id: 'n20', label: '₹20 notes', val: n20, set: setN20 },
                  { id: 'n10', label: '₹10 notes', val: n10, set: setN10 },
                  { id: 'coins', label: 'Coins (₹)', val: coinsInr, set: setCoinsInr },
                ].map((d) => (
                  <div key={d.id}>
                    <label htmlFor={`denom-${d.id}`} className="block text-[11px] text-[var(--muted)] mb-1">
                      {d.label}
                    </label>
                    <input
                      id={`denom-${d.id}`}
                      type="number"
                      min={0}
                      value={d.val}
                      onChange={(e) => d.set(e.target.value)}
                      className="w-full rounded-[9px] bg-[var(--card-2)] border border-[var(--line)] px-2.5 py-1.5 font-mono tabular-nums"
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-[12px] p-3 bg-[var(--card-2)] border border-[var(--line)] flex flex-wrap items-center justify-between gap-2 text-[12.5px]">
              <div>
                <span className="text-[var(--muted)]">Expected: </span>
                <strong className="tabular-nums">₹{liveExpectedInr.toFixed(2)}</strong>
                <span className="text-[var(--muted)] ml-3">Counted: </span>
                <strong className="tabular-nums">₹{liveCountedInr.toFixed(2)}</strong>
              </div>
              <div
                className="font-mono font-bold tabular-nums"
                style={{
                  color:
                    liveVarianceInr === 0
                      ? 'var(--good)'
                      : liveVarianceInr > 0
                        ? 'var(--info)'
                        : 'var(--bad)',
                }}
              >
                Variance: {liveVarianceInr >= 0 ? `+₹${liveVarianceInr.toFixed(2)}` : `-₹${Math.abs(liveVarianceInr).toFixed(2)}`}
              </div>
            </div>

            <button
              type="submit"
              disabled={busy}
              className="btn-primary w-full py-2.5 rounded-[11px] text-[13px] font-semibold cursor-pointer disabled:opacity-50"
            >
              Close Shift &amp; Generate 80mm Z-Report
            </button>
          </form>

          {/* Shift Z-Report Slip & Closeout History */}
          <div className="glass-pane rounded-[20px] p-5 space-y-4">
            <h3 className="text-[15.5px] font-bold text-[var(--ink)] flex items-center gap-2">
              <Receipt size={16} className="text-[var(--accent-text)]" />
              <span>80mm Thermal Z-Report &amp; History</span>
            </h3>

            {activeZReport ? (
              <pre className="p-3.5 rounded-[12px] bg-[#111318] text-[#e6ecf5] font-mono text-[11px] leading-snug overflow-x-auto">
                {activeZReport.join('\n')}
              </pre>
            ) : (
              <div className="rounded-[12px] p-4 bg-[var(--card-2)] border border-[var(--line)] text-[12px] text-[var(--muted)]">
                Save a shift note tally on the left to generate a verified 80mm thermal Z-Report.
              </div>
            )}

            {state.shiftTallies.length > 0 && (
              <div className="space-y-2 pt-2 border-t border-[var(--line)]">
                <div className="text-[11.5px] font-semibold text-[var(--muted)]">
                  Saved Shift Closes ({state.shiftTallies.length})
                </div>
                <ul className="space-y-1.5 max-h-[180px] overflow-y-auto pr-1">
                  {state.shiftTallies.map((t) => (
                    <li
                      key={t.id}
                      className="rounded-[10px] p-2.5 bg-[var(--card-2)] border border-[var(--line)] flex items-center justify-between gap-2 text-[12px]"
                    >
                      <button
                        type="button"
                        onClick={() => setActiveZReport(t.zReportLines)}
                        className="text-left min-w-0 flex-1 cursor-pointer"
                      >
                        <div className="font-semibold text-[var(--ink)] truncate">{t.shiftLabel}</div>
                        <div className="text-[11px] text-[var(--muted)] tabular-nums">
                          Counted ₹{(t.countedPaise / 100).toFixed(2)} · UPI ₹{(t.upiSalesPaise / 100).toFixed(2)}
                        </div>
                      </button>
                      <span
                        className="text-[11px] font-mono font-bold shrink-0"
                        style={{
                          color:
                            t.status === 'balanced'
                              ? 'var(--good)'
                              : t.status === 'excess'
                                ? 'var(--info)'
                                : 'var(--bad)',
                        }}
                      >
                        {t.status.toUpperCase()}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </section>
      )}

      {/* SUBVIEW 3: REGULAR CUSTOMER KHATA LEDGER */}
      {subView === 'khata' && state && (
        <section className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          <div className="xl:col-span-2 glass-pane rounded-[20px] p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-[15.5px] font-bold text-[var(--ink)]">
                  Regular Client &amp; Coaching Khata Accounts
                </h3>
                <p className="text-[11.5px] text-[var(--muted)]">
                  Single-shop credit accounts for recurring coaching institutes and office clients.
                </p>
              </div>
              <button
                type="button"
                onClick={() =>
                  void handleProtectedCsvDownload(
                    '/api/counter/khata/export',
                    'aman-computer-khata-ledger.csv'
                  )
                }
                className="btn-ghost px-3 py-1.5 rounded-[9px] text-[12px] font-semibold inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Download size={13} />
                <span>Download Khata CSV</span>
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-[12.5px]">
                <thead>
                  <tr className="border-b border-[var(--line)] text-[11px] text-[var(--muted)] uppercase">
                    <th className="py-2 pr-3 font-semibold">Client</th>
                    <th className="py-2 px-2 font-semibold">Type</th>
                    <th className="py-2 px-2 font-semibold text-right">Credit Limit</th>
                    <th className="py-2 pl-2 font-semibold text-right">Balance Due</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--line)]">
                  {state.khataAccounts.map((acc) => (
                    <tr
                      key={acc.id}
                      onClick={() => setTxAccountId(acc.id)}
                      className={`cursor-pointer hover:bg-[var(--card-2)]/70 ${
                        txAccountId === acc.id ? 'bg-[var(--accent-soft)]/35' : ''
                      }`}
                    >
                      <td className="py-2.5 pr-3">
                        <div className="font-semibold text-[var(--ink)]">{acc.clientName}</div>
                        <div className="text-[11px] text-[var(--muted)] tabular-nums">
                          {acc.contactPhone || 'Counter account'}
                        </div>
                      </td>
                      <td className="py-2.5 px-2 capitalize text-[var(--ink-2)]">
                        {acc.clientType.replace('_', ' ')}
                      </td>
                      <td className="py-2.5 px-2 text-right font-mono tabular-nums text-[var(--muted)]">
                        ₹{(acc.creditLimitPaise / 100).toFixed(2)}
                      </td>
                      <td className="py-2.5 pl-2 text-right font-mono font-bold tabular-nums text-[var(--ink)]">
                        ₹{(acc.balanceDuePaise / 100).toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Recent Khata Entries */}
            <div className="pt-2 border-t border-[var(--line)] space-y-2">
              <div className="text-[12px] font-semibold text-[var(--muted)]">
                Recent Ledger Entries ({state.khataTransactions.length})
              </div>
              <ul className="space-y-1.5 max-h-[200px] overflow-y-auto pr-1 text-[12px]">
                {state.khataTransactions.slice(0, 10).map((tx) => (
                  <li
                    key={tx.id}
                    className="rounded-[10px] px-3 py-2 bg-[var(--card-2)] border border-[var(--line)] flex items-center justify-between gap-2"
                  >
                    <div className="min-w-0">
                      <div className="font-semibold text-[var(--ink)] truncate">
                        {tx.clientName} · {tx.referenceNote}
                      </div>
                      <div className="text-[11px] text-[var(--muted)]">
                        {tx.entryType === 'debit_print' ? 'Print Charge Added' : `Settled via ${tx.paymentMode.toUpperCase()}`}
                      </div>
                    </div>
                    <span
                      className="font-mono font-bold tabular-nums shrink-0"
                      style={{
                        color: tx.entryType === 'credit_payment' ? 'var(--good)' : 'var(--warn)',
                      }}
                    >
                      {tx.entryType === 'credit_payment' ? '-' : '+'}₹{(tx.amountPaise / 100).toFixed(2)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Right Column: Record Entry + Add New Account */}
          <div className="space-y-4">
            <form onSubmit={handleRecordKhataTx} className="glass-pane rounded-[20px] p-5 space-y-3">
              <h3 className="text-[15px] font-bold text-[var(--ink)]">Record Khata Debit / Settlement</h3>

              <div>
                <label htmlFor="khata-tx-account" className="block text-[11.5px] font-semibold mb-1">
                  Client Account
                </label>
                <select
                  id="khata-tx-account"
                  value={txAccountId}
                  onChange={(e) => setTxAccountId(e.target.value)}
                  className="w-full rounded-[10px] bg-[var(--card-2)] border border-[var(--line)] px-2.5 py-2 text-[12px]"
                >
                  {state.khataAccounts.map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.clientName} (Due ₹{(acc.balanceDuePaise / 100).toFixed(0)})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setTxEntryType('debit_print')}
                  className={`py-2 rounded-[9px] text-[12px] font-semibold border cursor-pointer ${
                    txEntryType === 'debit_print'
                      ? 'bg-[var(--warn-soft)] border-[var(--warn)] text-[var(--warn)]'
                      : 'bg-[var(--card-2)] border-[var(--line)] text-[var(--muted)]'
                  }`}
                >
                  + Add Print Charge
                </button>
                <button
                  type="button"
                  onClick={() => setTxEntryType('credit_payment')}
                  className={`py-2 rounded-[9px] text-[12px] font-semibold border cursor-pointer ${
                    txEntryType === 'credit_payment'
                      ? 'bg-[var(--good-soft)] border-[var(--good)] text-[var(--good)]'
                      : 'bg-[var(--card-2)] border-[var(--line)] text-[var(--muted)]'
                  }`}
                >
                  - Receive Payment
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label htmlFor="khata-tx-amount" className="block text-[11.5px] font-semibold mb-1">
                    Amount (₹)
                  </label>
                  <input
                    id="khata-tx-amount"
                    type="number"
                    min={1}
                    step="0.01"
                    value={txAmount}
                    onChange={(e) => setTxAmount(e.target.value)}
                    className="w-full rounded-[10px] bg-[var(--card-2)] border border-[var(--line)] px-2.5 py-2 text-[12.5px] tabular-nums"
                  />
                </div>
                {txEntryType === 'credit_payment' && (
                  <div>
                    <label htmlFor="khata-tx-mode" className="block text-[11.5px] font-semibold mb-1">
                      Received Via
                    </label>
                    <select
                      id="khata-tx-mode"
                      value={txPaymentMode}
                      onChange={(e) => setTxPaymentMode(e.target.value as 'cash' | 'upi')}
                      className="w-full rounded-[10px] bg-[var(--card-2)] border border-[var(--line)] px-2.5 py-2 text-[12px]"
                    >
                      <option value="cash">Cash Drawer</option>
                      <option value="upi">Shop UPI</option>
                    </select>
                  </div>
                )}
              </div>

              <div>
                <label htmlFor="khata-tx-note" className="block text-[11.5px] font-semibold mb-1">
                  Reference Note
                </label>
                <input
                  id="khata-tx-note"
                  type="text"
                  maxLength={120}
                  value={txNote}
                  onChange={(e) => setTxNote(e.target.value)}
                  placeholder="e.g., 40 copies spiral notes"
                  className="w-full rounded-[10px] bg-[var(--card-2)] border border-[var(--line)] px-2.5 py-2 text-[12px]"
                />
              </div>

              <button
                type="submit"
                disabled={busy || !txAccountId}
                className="btn-primary w-full py-2.5 rounded-[11px] text-[12.5px] font-semibold cursor-pointer disabled:opacity-50"
              >
                {txEntryType === 'debit_print' ? 'Record Khata Charge' : 'Post Payment Received'}
              </button>
            </form>

            <form onSubmit={handleAddKhataClient} className="glass-pane rounded-[20px] p-5 space-y-3">
              <h3 className="text-[14.5px] font-bold text-[var(--ink)]">Add Regular Khata Client</h3>
              <input
                type="text"
                placeholder="Coaching / Client Name"
                value={newClientName}
                onChange={(e) => setNewClientName(e.target.value)}
                className="w-full rounded-[10px] bg-[var(--card-2)] border border-[var(--line)] px-2.5 py-2 text-[12px]"
              />
              <div className="grid grid-cols-2 gap-2">
                <select
                  aria-label="Client type"
                  value={newClientType}
                  onChange={(e) =>
                    setNewClientType(
                      e.target.value as 'coaching' | 'student' | 'office' | 'walkin_regular'
                    )
                  }
                  className="w-full rounded-[10px] bg-[var(--card-2)] border border-[var(--line)] px-2.5 py-2 text-[12px]"
                >
                  <option value="coaching">Coaching</option>
                  <option value="office">Office</option>
                  <option value="student">Student</option>
                  <option value="walkin_regular">Regular</option>
                </select>
                <input
                  type="number"
                  min={100}
                  placeholder="Limit ₹"
                  value={newClientLimit}
                  onChange={(e) => setNewClientLimit(e.target.value)}
                  className="w-full rounded-[10px] bg-[var(--card-2)] border border-[var(--line)] px-2.5 py-2 text-[12px] tabular-nums"
                />
              </div>
              <input
                type="tel"
                placeholder="Mobile (optional)"
                value={newClientPhone}
                onChange={(e) => setNewClientPhone(e.target.value)}
                className="w-full rounded-[10px] bg-[var(--card-2)] border border-[var(--line)] px-2.5 py-2 text-[12px]"
              />
              <button
                type="submit"
                disabled={busy || newClientName.trim().length < 2}
                className="btn-ghost w-full py-2 rounded-[10px] text-[12px] font-semibold cursor-pointer disabled:opacity-50"
              >
                Create Client Account
              </button>
            </form>
          </div>
        </section>
      )}
    </div>
  );
};
