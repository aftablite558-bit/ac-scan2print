import React, { useState } from 'react';
import { QrCode } from 'lucide-react';

interface BrandMarkProps {
  compact?: boolean;
}

// Preserves AC Scan2Print brand identity cleanly without substituting Aman Computer's parent logo.
// Automatically renders the owner's official binary/SVG logo once dropped under public/assets/brand/.
export const BrandMark: React.FC<BrandMarkProps> = ({ compact = false }) => {
  const configuredLogoUrl =
    (import.meta as { env?: Record<string, string | undefined> }).env
      ?.VITE_CUSTOMER_BRAND_LOGO_URL?.trim() || '';
  const [imgFailed, setImgFailed] = useState(false);

  if (configuredLogoUrl && !imgFailed) {
    return (
      <div className="flex items-center gap-2.5 min-w-0">
        <img
          src={configuredLogoUrl}
          alt="AC Scan2Print by AMAN COMPUTER"
          className="h-8 w-auto object-contain"
          onError={() => setImgFailed(true)}
        />
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5 sm:gap-2.5 min-w-0">
      <div
        aria-hidden="true"
        className="w-7 h-7 sm:w-9 sm:h-9 rounded-[9px] sm:rounded-[10px] bg-[#111318] border border-[var(--ac-cyan-border)] flex items-center justify-center shrink-0 shadow-sm"
      >
        <QrCode size={15} className="text-[#25C7D9] sm:w-[17px] sm:h-[17px]" strokeWidth={2.1} />
      </div>
      <div className="min-w-0 leading-tight">
        <div className="text-[13px] sm:text-[15px] font-bold tracking-tight text-[var(--color-text-primary)] whitespace-nowrap">
          AC <span className="text-[var(--color-accent)]">Scan2Print</span>
        </div>
        {!compact && (
          <div className="hidden min-[440px]:block text-[10.5px] sm:text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--color-text-muted)] truncate">
            AMAN COMPUTER
          </div>
        )}
      </div>
    </div>
  );
};
