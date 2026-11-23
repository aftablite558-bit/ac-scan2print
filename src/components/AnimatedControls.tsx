import React, { useEffect, useLayoutEffect, useRef } from 'react';
import { popBadges, popIcon, slideClipPill } from '../utils/animations';

export interface TabNavItem {
  id: string;
  label: string;
  href: string;
  count?: number;
}

export const TabsNav: React.FC<{
  items: TabNavItem[];
  activeId: string;
  onNavigate: (href: string) => void;
  className?: string;
}> = ({ items, activeId, onNavigate, className = '' }) => {
  const navRef = useRef<HTMLElement>(null);
  const lineRef = useRef<HTMLSpanElement>(null);
  const itemRefs = useRef<Record<string, HTMLAnchorElement | null>>({});
  const mountedRef = useRef(false);

  const syncLine = (animate: boolean) => {
    const activeEl = itemRefs.current[activeId];
    const lineEl = lineRef.current;
    if (activeEl && lineEl) {
      slideClipPill(lineEl, activeEl, { animate, radius: 2, line: true });
    }
  };

  useLayoutEffect(() => {
    syncLine(mountedRef.current);
    const activeEl = itemRefs.current[activeId];
    if (activeEl && typeof activeEl.scrollIntoView === 'function') {
      activeEl.scrollIntoView({ behavior: 'auto', block: 'nearest', inline: 'nearest' });
    }
    mountedRef.current = true;
  }, [activeId, items.length]);

  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const badges = nav.querySelectorAll<HTMLElement>('.tab-badge');
    popBadges(badges, { delay: 0.15 });
  }, []);

  useEffect(() => {
    const onResize = () => syncLine(false);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [activeId]);

  return (
    <nav
      ref={navRef}
      aria-label="Sections"
      className={`border-b border-[var(--line)] overflow-x-auto custom-scroll ${className}`}
    >
      <div className="relative flex items-center gap-4 sm:gap-6 min-w-max pr-3">
        <span ref={lineRef} className="tabs__line" aria-hidden="true" />
        {items.map((t) => {
          const active = activeId === t.id;
          return (
            <a
              key={t.id}
              ref={(el) => {
                itemRefs.current[t.id] = el;
              }}
              href={t.href}
              onClick={(e) => {
                e.preventDefault();
                onNavigate(t.href);
              }}
              className={`relative z-10 pb-3 text-[13px] sm:text-[14px] font-semibold inline-flex items-center gap-1.5 sm:gap-2 whitespace-nowrap transition-colors ${
                active
                  ? 'text-[var(--ink)]'
                  : 'text-[var(--muted)] hover:text-[var(--ink)]'
              }`}
            >
              <span>{t.label}</span>
              {t.count !== undefined && (
                <span className="tab-badge px-2 py-0.5 rounded-full bg-[var(--card-2)] text-[11px] sm:text-[11.5px] tabular-nums">
                  {t.count}
                </span>
              )}
            </a>
          );
        })}
      </div>
    </nav>
  );
};

export interface SegOption<T extends string> {
  id: T;
  label: string;
  icon?: React.ReactNode;
}

export function SegControl<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  pill = false,
  className = '',
}: {
  options: readonly SegOption<T>[];
  value: T;
  onChange: (val: T) => void;
  ariaLabel?: string;
  pill?: boolean;
  className?: string;
}) {
  const thumbRef = useRef<HTMLSpanElement>(null);
  const btnRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const mountedRef = useRef(false);

  const syncThumb = (animate: boolean) => {
    const activeBtn = btnRefs.current[value];
    const thumb = thumbRef.current;
    if (activeBtn && thumb) {
      slideClipPill(thumb, activeBtn, {
        animate,
        radius: pill ? 99 : 9,
      });
    }
  };

  useLayoutEffect(() => {
    syncThumb(mountedRef.current);
    mountedRef.current = true;
  }, [value, options.length]);

  useEffect(() => {
    const onResize = () => syncThumb(false);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [value]);

  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={`relative inline-flex p-1 ${
        pill ? 'rounded-full' : 'rounded-[13px]'
      } bg-[var(--card-2)] border border-[var(--line)] gap-1 ${className}`}
    >
      <span
        ref={thumbRef}
        className="seg__thumb"
        style={{ borderRadius: pill ? 99 : 9 }}
        aria-hidden="true"
      />
      {options.map((opt) => {
        const active = value === opt.id;
        return (
          <button
            key={opt.id}
            ref={(el) => {
              btnRefs.current[opt.id] = el;
            }}
            type="button"
            aria-pressed={active}
            onClick={(e) => {
              popIcon(e.currentTarget);
              onChange(opt.id);
            }}
            className={`relative z-10 px-3 py-1.5 ${
              pill ? 'rounded-full' : 'rounded-[9px]'
            } text-[12.5px] font-medium inline-flex items-center gap-1.5 cursor-pointer transition-colors ${
              active
                ? 'text-[var(--ink)] font-semibold'
                : 'text-[var(--muted)] hover:text-[var(--ink)]'
            }`}
          >
            {opt.icon}
            <span>{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}
