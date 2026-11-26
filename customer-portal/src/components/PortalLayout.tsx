import React from 'react';
import { HelpCircle, Image as ImageIcon, Moon, Printer, Search, Sun, Zap } from 'lucide-react';
import { usePortal } from '../context/PortalContext';
import type { CustomerRoute } from '../types/portal';
import { BrandMark } from './BrandMark';

interface PortalLayoutProps {
  children: React.ReactNode;
}

const NAV_ITEMS: Array<{ route: CustomerRoute; label: string; icon: React.ReactNode }> = [
  { route: '/quick-print', label: 'Print', icon: <Printer size={15} /> },
  { route: '/quick-print/photo-sheet', label: 'Photos', icon: <ImageIcon size={15} /> },
  { route: '/quick-print/track', label: 'Track', icon: <Search size={15} /> },
  { route: '/quick-print/kiosk', label: 'Kiosk', icon: <Zap size={15} /> },
  { route: '/quick-print/help', label: 'Help', icon: <HelpCircle size={15} /> },
];

export const PortalLayout: React.FC<PortalLayoutProps> = ({ children }) => {
  const { route, navigate, resolvedTheme, toggleTheme, isMockMode } = usePortal();

  const isPrintActive = (itemRoute: CustomerRoute) => {
    if (itemRoute === '/quick-print') {
      return (
        route === '/quick-print' ||
        route === '/quick-print/upload' ||
        route === '/quick-print/options' ||
        route === '/quick-print/success' ||
        route === '/quick-print/batch-pack'
      );
    }
    if (itemRoute === '/quick-print/photo-sheet') {
      return route === '/quick-print/photo-sheet' || route === '/quick-print/exam-prep';
    }
    return route === itemRoute;
  };

  return (
    <div className="min-h-screen flex flex-col">
      <header className="portal-topbar sticky top-0 z-30">
        <div className="max-w-[680px] mx-auto px-2.5 sm:px-4 h-16 flex items-center justify-between gap-1 sm:gap-2">
          <a
            href="/quick-print"
            onClick={(e) => {
              e.preventDefault();
              navigate('/quick-print');
            }}
            aria-label="AC Scan2Print Home"
            className="min-h-[44px] flex items-center rounded-[10px] shrink-0"
          >
            <BrandMark />
          </a>

          <nav aria-label="Customer portal navigation" className="flex items-center gap-0.5 sm:gap-1 shrink-0">
            {NAV_ITEMS.map((item) => {
              const active = isPrintActive(item.route);
              return (
                <a
                  key={item.route}
                  href={item.route}
                  aria-current={active ? 'page' : undefined}
                  onClick={(e) => {
                    e.preventDefault();
                    navigate(item.route);
                  }}
                  className={`min-h-[44px] px-1.5 sm:px-3 py-1 sm:py-0 rounded-[10px] text-[10px] sm:text-[13px] font-semibold inline-flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-1.5 border ${
                    active
                      ? 'bg-[var(--ac-cyan-soft)] text-[var(--color-accent)] border-[var(--ac-cyan-border)]'
                      : 'border-transparent text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)]'
                  }`}
                >
                  {item.icon}
                  <span className="leading-none sm:leading-normal">{item.label}</span>
                </a>
              );
            })}

            <button
              type="button"
              onClick={toggleTheme}
              aria-label={resolvedTheme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              className="min-w-[36px] sm:min-w-[44px] min-h-[44px] rounded-[10px] inline-flex items-center justify-center text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)] cursor-pointer shrink-0"
            >
              {resolvedTheme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
            </button>
          </nav>
        </div>
      </header>

      {isMockMode && (
        <div
          role="status"
          className="bg-[var(--color-surface-subtle)] border-b border-[var(--color-border)] px-4 py-1.5 text-center text-[11.5px] font-medium text-[var(--color-text-muted)]"
        >
          Preview Mode · Local session & sample configuration active (live shop connection not configured)
        </div>
      )}

      <main className="flex-1 w-full max-w-[680px] mx-auto px-4 py-5 sm:py-7">
        {children}
      </main>

      <footer className="border-t border-[var(--color-border)] py-4 px-4 text-center text-[12px] text-[var(--color-text-muted)]">
        <div className="max-w-[680px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>AC Scan2Print · AMAN COMPUTER</span>
          <span>Encrypted private upload · Auto-purged after completion</span>
        </div>
      </footer>
    </div>
  );
};
