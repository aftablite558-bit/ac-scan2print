import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  Download,
  FileCheck,
  Grid3X3,
  IdCard,
  Image as ImageIcon,
  Scissors,
  Upload,
} from 'lucide-react';
import { usePortal } from '../context/PortalContext';
import { PHOTO_SHEET_CUSTOMER_PRESETS, type CustomerPhotoPresetSpec } from '../lib/pricing';

const PX_PER_MM_300DPI = 300 / 25.4;

function drawPlaceholderPortrait(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  label: string
) {
  ctx.fillStyle = '#e8f1f8';
  ctx.fillRect(x, y, w, h);
  // Subtle silhouette
  ctx.fillStyle = '#8aa8c2';
  ctx.beginPath();
  ctx.arc(x + w / 2, y + h * 0.36, Math.min(w, h) * 0.19, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(x + w / 2, y + h * 0.8, w * 0.3, h * 0.22, 0, Math.PI, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#2c4257';
  ctx.font = `bold ${Math.max(18, Math.round(w * 0.085))}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText(label, x + w / 2, y + h - Math.max(16, h * 0.08));
}

function drawCoverImage(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  dx: number,
  dy: number,
  dw: number,
  dh: number
) {
  const srcRatio = img.width / img.height;
  const dstRatio = dw / dh;
  let sx = 0;
  let sy = 0;
  let sw = img.width;
  let sh = img.height;
  if (srcRatio > dstRatio) {
    sw = img.height * dstRatio;
    sx = (img.width - sw) / 2;
  } else {
    sh = img.width / dstRatio;
    sy = (img.height - sh) / 2;
  }
  ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
}

export const PhotoSheetPage: React.FC = () => {
  const { addFiles, updatePreferences, navigate } = usePortal();

  const [presetId, setPresetId] = useState<CustomerPhotoPresetSpec['id']>('passport_4x6_8');
  const [slotCount, setSlotCount] = useState<number>(8);
  const [showCutMarks, setShowCutMarks] = useState(true);
  const [primaryImgUrl, setPrimaryImgUrl] = useState<string | null>(null);
  const [backImgUrl, setBackImgUrl] = useState<string | null>(null);
  const [sendingToQueue, setSendingToQueue] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const preset = useMemo(
    () => PHOTO_SHEET_CUSTOMER_PRESETS.find((p) => p.id === presetId) ?? PHOTO_SHEET_CUSTOMER_PRESETS[0],
    [presetId]
  );

  useEffect(() => {
    setSlotCount(preset.maxSlots);
  }, [preset]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = preset.sheetWidthPx;
    canvas.height = preset.sheetHeightPx;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let cancelled = false;

    const loadImage = (url: string | null): Promise<HTMLImageElement | null> =>
      new Promise((resolve) => {
        if (!url) return resolve(null);
        const im = new Image();
        im.onload = () => resolve(im);
        im.onerror = () => resolve(null);
        im.src = url;
      });

    void Promise.all([loadImage(primaryImgUrl), loadImage(backImgUrl)]).then(([img1, img2]) => {
      if (cancelled) return;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Header watermark outside photo crop area
      ctx.fillStyle = '#64748b';
      ctx.font = 'bold 18px monospace';
      ctx.textAlign = 'left';
      ctx.fillText(
        `AMAN COMPUTER · ${preset.id.toUpperCase()} · 300 DPI PRINT SHEET`,
        24,
        30
      );

      const totalGridW = preset.cols * preset.tileWidthMm + (preset.cols - 1) * preset.gapMm;
      const totalGridH = preset.rows * preset.tileHeightMm + (preset.rows - 1) * preset.gapMm;
      const marginX = Math.max(0, (preset.sheetWidthMm - totalGridW) / 2);
      const marginY =
        preset.mode === 'id_card_pair'
          ? 24
          : Math.max(0, (preset.sheetHeightMm - totalGridH) / 2);

      const active = Math.min(slotCount, preset.maxSlots);
      for (let i = 0; i < active; i++) {
        const row = Math.floor(i / preset.cols);
        const col = i % preset.cols;
        const xPx = Math.round((marginX + col * (preset.tileWidthMm + preset.gapMm)) * PX_PER_MM_300DPI);
        const yPx = Math.round((marginY + row * (preset.tileHeightMm + preset.gapMm)) * PX_PER_MM_300DPI);
        const wPx = Math.round(preset.tileWidthMm * PX_PER_MM_300DPI);
        const hPx = Math.round(preset.tileHeightMm * PX_PER_MM_300DPI);

        const useImg = preset.mode === 'id_card_pair' && i === 1 ? img2 : img1;
        if (useImg) {
          drawCoverImage(ctx, useImg, xPx, yPx, wPx, hPx);
        } else {
          const placeholderText =
            preset.mode === 'id_card_pair' ? (i === 0 ? 'ID FRONT' : 'ID BACK') : `PHOTO ${i + 1}`;
          drawPlaceholderPortrait(ctx, xPx, yPx, wPx, hPx, placeholderText);
        }

        if (showCutMarks) {
          ctx.strokeStyle = '#94a3b8';
          ctx.lineWidth = 3;
          ctx.strokeRect(xPx, yPx, wPx, hPx);
        }
      }
    });

    return () => {
      cancelled = true;
    };
  }, [preset, slotCount, showCutMarks, primaryImgUrl, backImgUrl]);

  const handleFileSelect = (file: File | undefined, target: 'primary' | 'back') => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : null;
      if (target === 'primary') setPrimaryImgUrl(result);
      else setBackImgUrl(result);
    };
    reader.readAsDataURL(file);
  };

  const handleDownloadPng = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const url = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = `aman-computer-${preset.id}-300dpi.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const handleSendToUpload = async () => {
    const canvas = canvasRef.current;
    if (!canvas || sendingToQueue) return;
    setSendingToQueue(true);
    try {
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob((b) => resolve(b), 'image/png')
      );
      if (!blob) return;
      const file = new File([blob], `aman-computer-${preset.id}-300dpi.png`, {
        type: 'image/png',
      });
      updatePreferences({
        paperSize: 'A4',
        printMode: 'colour',
        printSides: 'single',
        pagesPerSheet: 1,
        copies: 1,
      });
      await addFiles([file]);
      navigate('/quick-print/options');
    } finally {
      setSendingToQueue(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Studio Mode Switcher */}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => navigate('/quick-print/photo-sheet')}
          className="portal-btn-primary px-3.5 py-2 text-[13px] font-semibold inline-flex items-center gap-1.5 cursor-pointer"
        >
          <Grid3X3 size={14} />
          <span>Passport &amp; ID Print Sheet</span>
        </button>
        <button
          type="button"
          onClick={() => navigate('/quick-print/exam-prep')}
          className="portal-btn-secondary px-3.5 py-2 text-[13px] font-semibold inline-flex items-center gap-1.5 cursor-pointer"
        >
          <FileCheck size={14} />
          <span>Exam Form Size &amp; Scan Clean</span>
        </button>
      </div>

      <section className="portal-card p-5 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[var(--ac-cyan-soft)] border border-[var(--ac-cyan-border)] text-[11px] font-bold uppercase tracking-[0.05em] text-[var(--color-accent)]">
              <Grid3X3 size={13} />
              <span>300 DPI Photo Sheet Studio</span>
            </div>
            <h1 className="text-[22px] sm:text-[26px] font-bold mt-2">
              Passport &amp; ID Card Print Sheet Maker
            </h1>
            <p className="text-[13.5px] text-[var(--color-text-muted)] mt-1">
              Arrange 8, 24, or 35 passport photos—or front + back Aadhaar/PAN cards—at exact 300 DPI print dimensions.
            </p>
          </div>
        </div>

        {/* Sheet Preset Picker */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {PHOTO_SHEET_CUSTOMER_PRESETS.map((item) => {
            const active = item.id === preset.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setPresetId(item.id)}
                className={`p-3.5 rounded-[14px] text-left border cursor-pointer transition-colors ${
                  active
                    ? 'border-[var(--color-accent)] bg-[var(--ac-cyan-soft)]'
                    : 'border-[var(--color-border)] bg-[var(--color-surface-subtle)]'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[13.5px] font-bold text-[var(--color-text-primary)]">
                    {item.label}
                  </span>
                  <span className="font-mono font-bold text-[13px] text-[var(--color-accent)] tabular-nums shrink-0">
                    ₹{item.suggestedPriceInr}
                  </span>
                </div>
                <div className="text-[12px] text-[var(--color-text-muted)] mt-0.5">{item.shortDesc}</div>
              </button>
            );
          })}
        </div>

        {/* Upload Photo Inputs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="portal-btn-secondary px-4 py-3 text-[13px] font-semibold inline-flex items-center justify-center gap-2 cursor-pointer">
            <ImageIcon size={16} />
            <span>
              {preset.mode === 'id_card_pair'
                ? primaryImgUrl
                  ? 'Change ID Front Photo'
                  : 'Upload ID Card Front'
                : primaryImgUrl
                  ? 'Change Portrait Photo'
                  : 'Upload Passport Photo'}
            </span>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(e) => handleFileSelect(e.target.files?.[0], 'primary')}
              className="sr-only"
            />
          </label>

          {preset.mode === 'id_card_pair' ? (
            <label className="portal-btn-secondary px-4 py-3 text-[13px] font-semibold inline-flex items-center justify-center gap-2 cursor-pointer">
              <IdCard size={16} />
              <span>{backImgUrl ? 'Change ID Back Photo' : 'Upload ID Card Back'}</span>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(e) => handleFileSelect(e.target.files?.[0], 'back')}
                className="sr-only"
              />
            </label>
          ) : (
            <div className="portal-card-subtle px-3.5 py-2 flex items-center justify-between gap-3">
              <label htmlFor="photo-slot-count" className="text-[12.5px] font-semibold">
                Copies on Sheet (1–{preset.maxSlots})
              </label>
              <input
                id="photo-slot-count"
                type="number"
                min={1}
                max={preset.maxSlots}
                value={slotCount}
                onChange={(e) =>
                  setSlotCount(Math.max(1, Math.min(preset.maxSlots, Number(e.target.value) || 1)))
                }
                className="w-20 rounded-[10px] border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1.5 text-center font-mono font-bold tabular-nums"
              />
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <label className="inline-flex items-center gap-2 text-[13px] font-semibold cursor-pointer">
            <input
              type="checkbox"
              checked={showCutMarks}
              onChange={(e) => setShowCutMarks(e.target.checked)}
            />
            <Scissors size={14} className="text-[var(--color-text-muted)]" />
            <span>Show hairline scissors cut-guides</span>
          </label>
          <span className="text-[12px] font-mono text-[var(--color-text-muted)] tabular-nums">
            {preset.sheetWidthPx} × {preset.sheetHeightPx} px (300 DPI)
          </span>
        </div>
      </section>

      {/* Live 300-DPI Canvas Preview */}
      <section className="portal-card p-4 sm:p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-[15px] font-bold">Live Print Sheet Preview</h2>
          <span className="text-[12px] text-[var(--color-text-muted)] tabular-nums">
            {slotCount} tile(s) · {preset.tileWidthMm}×{preset.tileHeightMm} mm
          </span>
        </div>

        <div className="rounded-[14px] border border-[var(--color-border)] bg-[#f1f5f9] p-3 flex justify-center">
          <canvas
            ref={canvasRef}
            className="max-h-[420px] w-auto max-w-full rounded-[8px] shadow-md bg-white border border-slate-200"
          />
        </div>

        <div className="flex flex-col sm:flex-row gap-2.5">
          <button
            type="button"
            disabled={sendingToQueue}
            onClick={() => void handleSendToUpload()}
            className="portal-btn-primary px-5 py-3 text-[14px] flex-1 inline-flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
          >
            <Upload size={16} />
            <span>{sendingToQueue ? 'Preparing Sheet...' : 'Send Sheet to Print Queue'}</span>
            <ArrowRight size={15} />
          </button>
          <button
            type="button"
            onClick={handleDownloadPng}
            className="portal-btn-secondary px-4 py-3 text-[13.5px] inline-flex items-center justify-center gap-2 cursor-pointer"
          >
            <Download size={16} />
            <span>Download 300-DPI PNG</span>
          </button>
        </div>
      </section>
    </div>
  );
};
