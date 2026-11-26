import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Check, Copy, Download, Printer, QrCode, X } from 'lucide-react';

interface ShopQrPosterModalProps {
  open: boolean;
  onClose: () => void;
  defaultPortalUrl?: string;
}

const DEFAULT_PORTAL_URL = 'https://ac-scan2print.web.app/quick-print';

export const ShopQrPosterModal: React.FC<ShopQrPosterModalProps> = ({
  open,
  onClose,
  defaultPortalUrl = DEFAULT_PORTAL_URL,
}) => {
  const [portalUrl, setPortalUrl] = useState(defaultPortalUrl);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setPortalUrl(defaultPortalUrl);
  }, [defaultPortalUrl]);

  useEffect(() => {
    if (!open) return;
    let active = true;
    const cleanUrl = portalUrl.trim() || DEFAULT_PORTAL_URL;
    void QRCode.toDataURL(cleanUrl, {
      width: 320,
      margin: 2,
      errorCorrectionLevel: 'H',
      color: {
        dark: '#111318',
        light: '#FFFFFF',
      },
    })
      .then((url) => {
        if (active) setQrDataUrl(url);
      })
      .catch(() => {
        if (active) setQrDataUrl('');
      });

    return () => {
      active = false;
    };
  }, [open, portalUrl]);

  if (!open) return null;

  const cleanUrl = portalUrl.trim() || DEFAULT_PORTAL_URL;

  const handleCopyUrl = async () => {
    try {
      await navigator.clipboard.writeText(cleanUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Ignore clipboard failures
    }
  };

  const handleDownloadSvg = async () => {
    try {
      const qrSvg = await QRCode.toString(cleanUrl, {
        type: 'svg',
        margin: 2,
        errorCorrectionLevel: 'H',
        color: {
          dark: '#111318',
          light: '#FFFFFF',
        },
      });
      const blob = new Blob([qrSvg], { type: 'image/svg+xml;charset=utf-8' });
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = 'ac-scan2print-shop-qr.svg';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(blobUrl);
    } catch {
      // Ignore download failure
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/65 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="AC Scan2Print Shop Counter QR Poster"
    >
      <div className="glass-solid rounded-[24px] w-full max-w-2xl max-h-[92vh] overflow-y-auto border border-[var(--line)] shadow-2xl p-5 sm:p-6 space-y-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-[19px] font-bold flex items-center gap-2">
              <QrCode size={18} className="text-[#25C7D9]" />
              <span>Counter QR Standee &amp; Poster</span>
            </h2>
            <p className="text-[12.5px] text-[var(--muted)] mt-0.5">
              Permanent customer QR link for Aman Computer counter display. Zero app install required.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Shop QR Poster"
            className="btn-ghost p-2 rounded-full cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        {/* Target URL Bar */}
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            type="url"
            value={portalUrl}
            onChange={(e) => setPortalUrl(e.target.value)}
            aria-label="Customer QR Portal URL"
            className="flex-1 px-3 py-2 rounded-[10px] border border-[var(--line)] bg-[var(--card)] text-[13px] font-mono"
          />
          <button
            type="button"
            onClick={() => void handleCopyUrl()}
            className="btn-ghost px-3.5 py-2 rounded-[10px] text-[12.5px] font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer"
          >
            {copied ? <Check size={14} className="text-[var(--good)]" /> : <Copy size={14} />}
            <span>{copied ? 'Copied URL' : 'Copy Link'}</span>
          </button>
        </div>

        {/* Printable AC Scan2Print Standee Card */}
        <div
          id="ac-shop-qr-poster"
          className="rounded-[20px] overflow-hidden border border-[#25C7D9]/40 bg-[#111318] text-white p-6 text-center space-y-4"
        >
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#25C7D9]/15 border border-[#25C7D9]/40 text-[#25C7D9] text-[11px] font-bold tracking-wider uppercase">
            AMAN COMPUTER · SMART QR PRINT
          </div>

          <div className="space-y-1">
            <h3 className="text-[24px] font-extrabold tracking-tight text-white">
              AC <span className="text-[#25C7D9]">Scan2Print</span>
            </h3>
            <p className="text-[13px] text-[#CBD5E1]">
              Scan to print PDF or photos directly from your phone — no WhatsApp or USB needed.
            </p>
          </div>

          <div className="inline-flex p-3.5 rounded-[18px] bg-white shadow-lg">
            {qrDataUrl ? (
              <img
                src={qrDataUrl}
                alt={`QR Code for ${cleanUrl}`}
                referrerPolicy="no-referrer"
                className="w-52 h-52 object-contain"
              />
            ) : (
              <div className="w-52 h-52 flex items-center justify-center text-[#111318] text-[12px] font-semibold">
                Generating QR...
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-left pt-1">
            {[
              { step: '1. Scan QR', desc: 'Open with phone camera' },
              { step: '2. Upload', desc: 'PDF, JPG, PNG (max 20MB)' },
              { step: '3. Pay', desc: 'UPI UTR or Counter Cash' },
              { step: '4. Collect', desc: 'Track live & pick up' },
            ].map((item) => (
              <div
                key={item.step}
                className="rounded-[10px] bg-white/5 border border-white/10 px-2.5 py-2"
              >
                <div className="text-[11.5px] font-bold text-[#25C7D9]">{item.step}</div>
                <div className="text-[10.5px] text-[#CBD5E1]">{item.desc}</div>
              </div>
            ))}
          </div>

          <div className="text-[11px] text-[#94A3B8] pt-1 border-t border-white/10">
            Private encrypted upload · Files automatically purged after completion · {cleanUrl}
          </div>
        </div>

        {/* Export Actions */}
        <div className="flex flex-wrap items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={() => void handleDownloadSvg()}
            className="btn-ghost px-4 py-2 rounded-[12px] text-[13px] font-semibold inline-flex items-center gap-1.5 cursor-pointer"
          >
            <Download size={14} />
            <span>Download Vector QR (SVG)</span>
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="px-4 py-2 rounded-[12px] text-[13px] font-bold bg-[#25C7D9] text-[#111318] hover:opacity-90 inline-flex items-center gap-1.5 cursor-pointer"
          >
            <Printer size={14} />
            <span>Print Counter Poster</span>
          </button>
        </div>
      </div>
    </div>
  );
};
