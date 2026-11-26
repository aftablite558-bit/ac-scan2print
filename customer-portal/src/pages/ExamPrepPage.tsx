import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  Download,
  FileCheck,
  Grid3X3,
  Image as ImageIcon,
  Sparkles,
  Upload,
} from 'lucide-react';
import { usePortal } from '../context/PortalContext';
import { EXAM_FORM_CUSTOMER_PRESETS, type CustomerExamPresetSpec } from '../lib/pricing';

function applyScanCleanFilter(ctx: CanvasRenderingContext2D, width: number, height: number) {
  const imgData = ctx.getImageData(0, 0, width, height);
  const d = imgData.data;
  for (let i = 0; i < d.length; i += 4) {
    // Luminance grayscale + high contrast white paper floor
    const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    let adjusted = (lum - 128) * 1.48 + 145;
    if (adjusted > 215) adjusted = 255;
    if (adjusted < 40) adjusted = Math.max(0, adjusted * 0.65);
    const val = Math.max(0, Math.min(255, Math.round(adjusted)));
    d[i] = val;
    d[i + 1] = val;
    d[i + 2] = val;
  }
  ctx.putImageData(imgData, 0, 0);
}

async function encodeJpegWithinRange(
  canvas: HTMLCanvasElement,
  minKb: number,
  maxKb: number
): Promise<{ blob: Blob; quality: number }> {
  const toBlob = (q: number) =>
    new Promise<Blob | null>((resolve) => canvas.toBlob((b) => resolve(b), 'image/jpeg', q));

  // Binary search JPEG quality up to 1.0 so small target photos can satisfy minKb cleanly
  let lo = 0.28;
  let hi = 1.0;
  let bestBlob = (await toBlob(0.85)) ?? new Blob();
  let bestQuality = 0.85;

  for (let step = 0; step < 8; step++) {
    const mid = Number(((lo + hi) / 2).toFixed(3));
    const b = await toBlob(mid);
    if (!b) continue;
    const kb = b.size / 1024;
    bestBlob = b;
    bestQuality = mid;
    if (kb >= minKb && kb <= maxKb) {
      break;
    }
    if (kb > maxKb) {
      hi = mid;
    } else {
      lo = mid;
    }
  }
  return { blob: bestBlob, quality: bestQuality };
}

export const ExamPrepPage: React.FC = () => {
  const { addFiles, updatePreferences, navigate } = usePortal();

  const [presetId, setPresetId] = useState<CustomerExamPresetSpec['id']>('ssc_photo');
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [scanClean, setScanClean] = useState<boolean>(false);
  const [outputBlob, setOutputBlob] = useState<Blob | null>(null);
  const [outputKb, setOutputKb] = useState<number>(0);
  const [jpegQuality, setJpegQuality] = useState<number>(0.85);
  const [sending, setSending] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const preset = useMemo(
    () => EXAM_FORM_CUSTOMER_PRESETS.find((p) => p.id === presetId) ?? EXAM_FORM_CUSTOMER_PRESETS[0],
    [presetId]
  );

  useEffect(() => {
    setScanClean(preset.defaultScanClean);
  }, [preset]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = preset.widthPx;
    canvas.height = preset.heightPx;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let cancelled = false;
    const renderAndEncode = async () => {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      if (sourceUrl) {
        const img = await new Promise<HTMLImageElement | null>((resolve) => {
          const im = new Image();
          im.onload = () => resolve(im);
          im.onerror = () => resolve(null);
          im.src = sourceUrl;
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
        // Sample studio backdrop + portrait/signature preview
        const grad = ctx.createRadialGradient(
          canvas.width / 2,
          canvas.height * 0.38,
          12,
          canvas.width / 2,
          canvas.height * 0.5,
          canvas.width * 0.72
        );
        grad.addColorStop(0, '#f8fafc');
        grad.addColorStop(1, '#dbeafe');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.strokeStyle = 'rgba(15, 23, 42, 0.08)';
        ctx.lineWidth = 1;
        for (let y = 16; y < canvas.height; y += 18) {
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(canvas.width, y);
          ctx.stroke();
        }
        if (preset.id === 'ssc_signature') {
          ctx.strokeStyle = '#0f172a';
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.moveTo(canvas.width * 0.16, canvas.height * 0.65);
          ctx.bezierCurveTo(
            canvas.width * 0.3,
            canvas.height * 0.25,
            canvas.width * 0.55,
            canvas.height * 0.85,
            canvas.width * 0.82,
            canvas.height * 0.42
          );
          ctx.stroke();
        } else {
          ctx.fillStyle = '#475569';
          ctx.beginPath();
          ctx.arc(canvas.width / 2, canvas.height * 0.36, Math.min(canvas.width, canvas.height) * 0.18, 0, Math.PI * 2);
          ctx.fill();
          ctx.beginPath();
          ctx.ellipse(canvas.width / 2, canvas.height * 0.78, canvas.width * 0.28, canvas.height * 0.2, 0, Math.PI, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = '#0f172a';
        ctx.font = `bold ${Math.max(14, Math.round(canvas.width * 0.05))}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText(preset.label.toUpperCase(), canvas.width / 2, canvas.height - 20);
      }

      if (scanClean) {
        applyScanCleanFilter(ctx, canvas.width, canvas.height);
      }

      const encoded = await encodeJpegWithinRange(canvas, preset.minKb, preset.maxKb);
      if (cancelled) return;
      setOutputBlob(encoded.blob);
      setOutputKb(Number((encoded.blob.size / 1024).toFixed(1)));
      setJpegQuality(encoded.quality);
    };

    void renderAndEncode();
    return () => {
      cancelled = true;
    };
  }, [preset, sourceUrl, scanClean]);

  const inSpec = outputKb >= preset.minKb && outputKb <= preset.maxKb;

  const handleDownloadJpg = () => {
    if (!outputBlob) return;
    const url = URL.createObjectURL(outputBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `aman-computer-${preset.id}-${preset.widthPx}x${preset.heightPx}.jpg`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const handleSendToPrint = async () => {
    if (!outputBlob || sending) return;
    setSending(true);
    try {
      const file = new File([outputBlob], `aman-computer-${preset.id}.jpg`, {
        type: 'image/jpeg',
      });
      updatePreferences({
        paperSize: 'A4',
        printMode: scanClean ? 'bw' : 'colour',
        printSides: 'single',
        pagesPerSheet: 1,
        copies: 1,
      });
      await addFiles([file]);
      navigate('/quick-print/options');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Studio Mode Switcher */}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => navigate('/quick-print/photo-sheet')}
          className="portal-btn-secondary px-3.5 py-2 text-[13px] font-semibold inline-flex items-center gap-1.5 cursor-pointer"
        >
          <Grid3X3 size={14} />
          <span>Passport &amp; ID Print Sheet</span>
        </button>
        <button
          type="button"
          onClick={() => navigate('/quick-print/exam-prep')}
          className="portal-btn-primary px-3.5 py-2 text-[13px] font-semibold inline-flex items-center gap-1.5 cursor-pointer"
        >
          <FileCheck size={14} />
          <span>Exam Form Size &amp; Scan Clean</span>
        </button>
      </div>

      <section className="portal-card p-5 space-y-4">
        <div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[var(--ac-cyan-soft)] border border-[var(--ac-cyan-border)] text-[11px] font-bold uppercase tracking-[0.05em] text-[var(--color-accent)]">
            <Sparkles size={13} />
            <span>Offline Exam Portal Size Optimizer</span>
          </div>
          <h1 className="text-[22px] sm:text-[26px] font-bold mt-2">
            Exam Form Photo, Signature &amp; Scan Prep
          </h1>
          <p className="text-[13.5px] text-[var(--color-text-muted)] mt-1">
            Auto-crop, clean shadows, and target exact KB limits for SSC, UPSC, BPSC, Railway &amp; PAN forms right in your browser.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {EXAM_FORM_CUSTOMER_PRESETS.map((item) => {
            const active = item.id === preset.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setPresetId(item.id)}
                className={`p-3 rounded-[14px] text-left border cursor-pointer transition-colors ${
                  active
                    ? 'border-[var(--color-accent)] bg-[var(--ac-cyan-soft)]'
                    : 'border-[var(--color-border)] bg-[var(--color-surface-subtle)]'
                }`}
              >
                <div className="text-[13.5px] font-bold text-[var(--color-text-primary)]">{item.label}</div>
                <div className="text-[12px] text-[var(--color-text-muted)] mt-0.5 tabular-nums">
                  {item.shortDesc}
                </div>
              </button>
            );
          })}
        </div>

        <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
          <label className="portal-btn-secondary px-4 py-3 text-[13px] font-semibold inline-flex items-center justify-center gap-2 cursor-pointer flex-1">
            <ImageIcon size={16} />
            <span>{sourceUrl ? 'Replace Uploaded Image' : 'Upload Photo / Signature / Scan'}</span>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = () => setSourceUrl(typeof reader.result === 'string' ? reader.result : null);
                reader.readAsDataURL(file);
              }}
              className="sr-only"
            />
          </label>

          <label className="portal-card-subtle px-3.5 py-2.5 inline-flex items-center gap-2 text-[13px] font-semibold cursor-pointer">
            <input
              type="checkbox"
              checked={scanClean}
              onChange={(e) => setScanClean(e.target.checked)}
            />
            <span>Clean Dark Shadows (B&amp;W Scan Boost)</span>
          </label>
        </div>
      </section>

      <section className="portal-card p-4 sm:p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <CheckCircle2
              size={17}
              style={{ color: inSpec ? 'var(--good)' : 'var(--warn)' }}
            />
            <span className="text-[14px] font-bold">
              {inSpec ? 'Portal Spec Met' : 'Size Closest Fit'} · {preset.widthPx}×{preset.heightPx} px
            </span>
          </div>
          <span className="font-mono text-[12.5px] font-bold tabular-nums text-[var(--color-accent)]">
            {outputKb} KB (Target {preset.minKb}–{preset.maxKb} KB · Q{Math.round(jpegQuality * 100)})
          </span>
        </div>

        <div className="rounded-[14px] border border-[var(--color-border)] bg-[#f1f5f9] p-3 flex justify-center">
          <canvas
            ref={canvasRef}
            className="max-h-[260px] w-auto max-w-full rounded-[8px] shadow bg-white border border-slate-200"
          />
        </div>

        <div className="flex flex-col sm:flex-row gap-2.5">
          <button
            type="button"
            onClick={handleDownloadJpg}
            className="portal-btn-primary px-5 py-3 text-[14px] flex-1 inline-flex items-center justify-center gap-2 cursor-pointer"
          >
            <Download size={16} />
            <span>Download Ready JPEG ({outputKb} KB)</span>
          </button>
          <button
            type="button"
            disabled={sending}
            onClick={() => void handleSendToPrint()}
            className="portal-btn-secondary px-4 py-3 text-[13.5px] inline-flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
          >
            <Upload size={15} />
            <span>{sending ? 'Sending...' : 'Send to Print Queue'}</span>
            <ArrowRight size={14} />
          </button>
        </div>
      </section>
    </div>
  );
};
