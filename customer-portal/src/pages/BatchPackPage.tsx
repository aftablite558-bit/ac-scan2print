import React, { useEffect, useState } from 'react';
import { ArrowRight, Bookmark, CheckCircle2, Layers, Upload } from 'lucide-react';
import { usePortal } from '../context/PortalContext';
import type { FinishingServiceId, PagesPerSheet, PaperSize, PrintMode, PrintSides } from '../types/portal';

interface PublicTemplateItem {
  id: string;
  templateName: string;
  category: string;
  description: string;
  defaultSets: number;
  items: Array<{
    title: string;
    pageCount: number;
    paperSize: PaperSize;
    printMode: PrintMode;
    printSides: PrintSides;
    pagesPerSheet: PagesPerSheet;
    finishingService: FinishingServiceId;
  }>;
}

interface PublicBatchQuote {
  totalPhysicalSheets: number;
  volumeTier: { label: string; discountPct: number };
  rawPrintSubtotalPaise: number;
  discountPaise: number;
  finishingTotalPaise: number;
  grossTotalInr: number;
}

export const BatchPackPage: React.FC = () => {
  const { updatePreferences, navigate } = usePortal();

  const [templates, setTemplates] = useState<PublicTemplateItem[]>([]);
  const [selectedTplId, setSelectedTplId] = useState<string>('tpl-coaching-notes-2up');
  const [pageCount, setPageCount] = useState<number>(80);
  const [studentSets, setStudentSets] = useState<number>(15);
  const [printMode, setPrintMode] = useState<PrintMode>('bw');
  const [printSides, setPrintSides] = useState<PrintSides>('duplex');
  const [pagesPerSheet, setPagesPerSheet] = useState<PagesPerSheet>(2);
  const [finishingService, setFinishingService] = useState<FinishingServiceId>('spiral_binding');
  const [quote, setQuote] = useState<PublicBatchQuote | null>(null);

  useEffect(() => {
    let active = true;
    fetch('/api/batch-archive/public-presets')
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { templates?: PublicTemplateItem[] } | null) => {
        if (!active || !data?.templates) return;
        setTemplates(data.templates);
      })
      .catch(() => {
        // silent fallback if offline
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/batch-archive/quote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        batchTitle: 'Student Notes Batch',
        studentSets: Math.max(1, studentSets),
        items: [
          {
            title: 'Uploaded Coaching Booklet',
            pageCount: Math.max(1, pageCount),
            paperSize: 'A4',
            printMode,
            printSides,
            pagesPerSheet,
            finishingService,
          },
        ],
      }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { quote?: PublicBatchQuote } | null) => {
        if (!cancelled && data?.quote) {
          setQuote(data.quote);
        }
      })
      .catch(() => {
        // ignore network hiccup
      });
    return () => {
      cancelled = true;
    };
  }, [pageCount, studentSets, printMode, printSides, pagesPerSheet, finishingService]);

  const applyTemplatePreset = (tpl: PublicTemplateItem) => {
    setSelectedTplId(tpl.id);
    setStudentSets(tpl.defaultSets);
    const primary = tpl.items[0];
    if (primary) {
      setPageCount(primary.pageCount);
      setPrintMode(primary.printMode);
      setPrintSides(primary.printSides);
      setPagesPerSheet(primary.pagesPerSheet);
      setFinishingService(primary.finishingService);
    }
  };

  const handleProceedToUpload = () => {
    updatePreferences({
      paperSize: 'A4',
      printMode,
      printSides,
      pagesPerSheet,
      finishingService,
      copies: Math.max(1, Math.min(50, studentSets)),
    });
    navigate('/quick-print/upload');
  };

  return (
    <div className="space-y-5">
      <section className="portal-card p-5 space-y-4">
        <div>
          <div className="text-[12px] font-bold uppercase tracking-[0.05em] text-[var(--color-accent)] inline-flex items-center gap-1.5">
            <Layers size={14} />
            <span>Student Notes &amp; Coaching Batch Estimator</span>
          </div>
          <h1 className="text-[22px] sm:text-[26px] font-bold mt-1">
            Bulk Booklet Estimator &amp; Shop Presets
          </h1>
          <p className="text-[13.5px] text-[var(--color-text-muted)] mt-1">
            Pick a preset pack or adjust booklet pages and copies to unlock 10%–25% automatic slab savings at Aman Computer.
          </p>
        </div>

        {templates.length > 0 && (
          <div className="space-y-2">
            <div className="text-[12px] font-bold text-[var(--color-text-secondary)] inline-flex items-center gap-1.5">
              <Bookmark size={13} />
              <span>Ready Counter Packet Presets</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {templates.slice(0, 4).map((tpl) => {
                const active = tpl.id === selectedTplId;
                return (
                  <button
                    key={tpl.id}
                    type="button"
                    onClick={() => applyTemplatePreset(tpl)}
                    className={`p-3 rounded-[14px] text-left border cursor-pointer transition-colors ${
                      active
                        ? 'border-[var(--color-accent)] bg-[var(--ac-cyan-soft)]'
                        : 'border-[var(--color-border)] bg-[var(--color-surface-subtle)]'
                    }`}
                  >
                    <div className="text-[13px] font-bold text-[var(--color-text-primary)]">
                      {tpl.templateName}
                    </div>
                    <div className="text-[11.5px] text-[var(--color-text-muted)] mt-0.5">
                      {tpl.defaultSets} sets · {tpl.description}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1">
          <div>
            <label htmlFor="cp-pages" className="block text-[11.5px] font-semibold mb-1">
              Pages per Booklet
            </label>
            <input
              id="cp-pages"
              type="number"
              min={1}
              max={2000}
              value={pageCount}
              onChange={(e) => setPageCount(Math.max(1, Number(e.target.value) || 1))}
              className="w-full rounded-[10px] border border-[var(--color-border)] bg-[var(--color-surface-subtle)] px-3 py-2 text-[13px] tabular-nums"
            />
          </div>
          <div>
            <label htmlFor="cp-sets" className="block text-[11.5px] font-semibold mb-1">
              Total Sets (Copies)
            </label>
            <input
              id="cp-sets"
              type="number"
              min={1}
              max={500}
              value={studentSets}
              onChange={(e) => setStudentSets(Math.max(1, Number(e.target.value) || 1))}
              className="w-full rounded-[10px] border border-[var(--color-border)] bg-[var(--color-surface-subtle)] px-3 py-2 text-[13px] tabular-nums"
            />
          </div>
          <div>
            <label htmlFor="cp-nup" className="block text-[11.5px] font-semibold mb-1">
              Layout &amp; Sides
            </label>
            <select
              id="cp-nup"
              value={`${printSides}:${pagesPerSheet}`}
              onChange={(e) => {
                const [s, n] = e.target.value.split(':');
                setPrintSides(s as PrintSides);
                setPagesPerSheet(Number(n) as PagesPerSheet);
              }}
              className="w-full rounded-[10px] border border-[var(--color-border)] bg-[var(--color-surface-subtle)] px-2.5 py-2 text-[13px]"
            >
              <option value="duplex:2">Duplex 2-in-1</option>
              <option value="duplex:1">Duplex Normal</option>
              <option value="single:1">Single-Sided</option>
              <option value="duplex:4">Duplex 4-in-1</option>
            </select>
          </div>
          <div>
            <label htmlFor="cp-finishing" className="block text-[11.5px] font-semibold mb-1">
              Binding Add-On
            </label>
            <select
              id="cp-finishing"
              value={finishingService}
              onChange={(e) => setFinishingService(e.target.value as FinishingServiceId)}
              className="w-full rounded-[10px] border border-[var(--color-border)] bg-[var(--color-surface-subtle)] px-2.5 py-2 text-[13px]"
            >
              <option value="none">Loose Pages</option>
              <option value="staple_corner">Corner Staple</option>
              <option value="spiral_binding">Spiral Bind</option>
              <option value="thermal_lamination">A4 Lamination</option>
              <option value="heavy_cover_bind">Cover Bind</option>
            </select>
          </div>
        </div>
      </section>

      <section className="portal-card p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="inline-flex items-center gap-2 text-[14px] font-bold">
            <CheckCircle2 size={17} className="text-[var(--good)]" />
            <span>
              {quote
                ? `${quote.totalPhysicalSheets} physical sheets · ${quote.volumeTier.discountPct}% slab discount`
                : 'Live Batch Estimate'}
            </span>
          </div>
          <div className="font-mono text-[18px] font-bold text-[var(--color-accent)] tabular-nums">
            ₹{quote ? quote.grossTotalInr.toFixed(2) : '—'}
          </div>
        </div>

        {quote && (
          <div className="portal-card-subtle p-3.5 text-[12.5px] space-y-1">
            <div className="flex justify-between">
              <span className="text-[var(--color-text-muted)]">Applied Slab</span>
              <span className="font-semibold">{quote.volumeTier.label}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--color-text-muted)]">Slab Savings</span>
              <span className="font-semibold text-[var(--good)] tabular-nums">
                -₹{(quote.discountPaise / 100).toFixed(2)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--color-text-muted)]">Binding / Finishing</span>
              <span className="tabular-nums">₹{(quote.finishingTotalPaise / 100).toFixed(2)}</span>
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={handleProceedToUpload}
          className="portal-btn-primary w-full py-3 px-5 text-[14.5px] inline-flex items-center justify-center gap-2 cursor-pointer"
        >
          <Upload size={16} />
          <span>Apply Preset &amp; Upload Booklet PDF</span>
          <ArrowRight size={15} />
        </button>
      </section>
    </div>
  );
};
