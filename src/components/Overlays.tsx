import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, Check, Search, X } from 'lucide-react';
import { useAdmin } from '../context/AdminContext';
import { clipInset, dur, gsap, reducedMotion } from '../utils/animations';

export const Overlays: React.FC = () => {
  const { modal, setModal, toast, dismissToast } = useAdmin();

  return (
    <>
      {modal?.type === 'search' && <SearchModal onClose={() => setModal(null)} />}
      {modal?.type === 'shortcuts' && <ShortcutsModal onClose={() => setModal(null)} />}

      {toast && (
        <AnimatedToast
          key={toast.id}
          text={toast.text}
          tone={toast.tone}
          onUndo={toast.onUndo}
          onDismiss={dismissToast}
        />
      )}
    </>
  );
};

const AnimatedToast: React.FC<{
  text: string;
  tone?: 'good' | 'bad';
  onUndo?: () => void;
  onDismiss: () => void;
}> = ({ text, tone = 'good', onUndo, onDismiss }) => {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current || reducedMotion()) return;
    gsap.fromTo(
      ref.current,
      { y: 90, scale: 0.94, opacity: 0 },
      {
        y: 0,
        scale: 1,
        opacity: 1,
        duration: 0.55,
        ease: 'back.out(1.6)',
        clearProps: 'transform,opacity',
      }
    );
  }, []);

  return (
    <div
      ref={ref}
      role="status"
      aria-live="polite"
      className="fixed bottom-20 md:bottom-5 left-1/2 -translate-x-1/2 z-[60] glass-solid rounded-full px-4 py-2.5 flex items-center gap-3 text-[13.5px] font-medium shadow-xl max-w-[92vw]"
    >
      {tone === 'bad' ? (
        <AlertCircle size={15} className="text-[var(--bad)] shrink-0" />
      ) : (
        <Check size={15} className="text-[var(--good)] shrink-0" />
      )}
      <span className="truncate">{text}</span>
      {onUndo && (
        <button
          type="button"
          onClick={() => {
            onUndo();
            onDismiss();
          }}
          className="px-2.5 py-0.5 rounded-full bg-[var(--accent-soft)] text-[var(--accent-text)] text-[12px] font-semibold cursor-pointer"
        >
          Undo
        </button>
      )}
      <button
        type="button"
        aria-label="Dismiss"
        onClick={onDismiss}
        className="text-[var(--muted)] hover:text-[var(--ink)] cursor-pointer shrink-0"
      >
        <X size={14} />
      </button>
    </div>
  );
};

/* --- Search Command Palette --- */
const SearchModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { navigate, setModal, toggleTheme, logout } = useAdmin();
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const scrimRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const closingRef = useRef(false);

  useEffect(() => {
    if (reducedMotion()) return;
    if (scrimRef.current) {
      gsap.fromTo(scrimRef.current, { opacity: 0 }, { opacity: 1, duration: 0.25 });
    }
    if (panelRef.current) {
      const el = panelRef.current;
      gsap.fromTo(
        el,
        { y: -18, scale: 0.97, clipPath: clipInset(el, 0.6) },
        {
          y: 0,
          scale: 1,
          clipPath: clipInset(el, 0, 60),
          duration: 0.5,
          ease: 'expo.out',
          clearProps: 'transform,clipPath',
        }
      );
    }
  }, []);

  useEffect(() => {
    if (!listRef.current || reducedMotion()) return;
    const items = listRef.current.querySelectorAll<HTMLElement>('.finder__item');
    if (items.length) {
      gsap.fromTo(
        items,
        { opacity: 0, y: 6 },
        {
          opacity: 1,
          y: 0,
          duration: dur(0.32),
          ease: 'power2.out',
          stagger: dur(0.02),
          clearProps: 'transform,opacity',
        }
      );
    }
  }, [query]);

  const handleClose = () => {
    if (closingRef.current) return;
    closingRef.current = true;
    if (reducedMotion() || !panelRef.current) {
      onClose();
      return;
    }
    const el = panelRef.current;
    const tl = gsap.timeline({ onComplete: onClose });
    if (scrimRef.current) tl.to(scrimRef.current, { opacity: 0, duration: 0.18 }, 0);
    tl.to(
      el,
      {
        y: -10,
        scale: 0.97,
        clipPath: clipInset(el, 0.5),
        duration: 0.18,
        ease: 'power2.in',
      },
      0
    );
  };

  const pages = useMemo(
    () =>
      [
        { label: 'Overview', sub: 'Admin Dashboard', route: '#/home' },
        { label: 'Hardware & Printers', sub: 'Operations › Printer Registry', route: '#/hardware/printers' },
        { label: 'Agent Discovery Prep', sub: 'Hardware › Windows Agent', route: '#/hardware/discovery' },
        { label: 'Hardware Audit Checklist', sub: 'Hardware › Verification', route: '#/hardware/checklist' },
        { label: 'Business profile', sub: 'CMS › Business', route: '#/cms/business' },
        { label: 'Hero section CMS', sub: 'CMS › Hero', route: '#/cms/hero' },
        { label: 'Owner & AI Portrait', sub: 'CMS › BiRefNet Portrait', route: '#/cms/portrait' },
        { label: 'Website & SEO settings', sub: 'CMS › Website', route: '#/cms/website' },
        { label: 'Services management', sub: 'Catalog › Services', route: '#/cms/services' },
        { label: 'Gallery management', sub: 'Catalog › Gallery', route: '#/cms/gallery' },
        { label: 'Testimonials', sub: 'Community › Reviews', route: '#/cms/testimonials' },
        { label: 'FAQ management', sub: 'Community › FAQs', route: '#/cms/faqs' },
        { label: 'Customer enquiries', sub: 'Operations › Enquiries', route: '#/enquiries' },
        { label: 'Door 5: Bihar Govt updates', sub: 'Operations › Updates', route: '#/bihar-updates/updates' },
        { label: 'Verified Bihar portals', sub: 'Operations › Sources', route: '#/bihar-updates/sources' },
        { label: 'Users & RBAC roles', sub: 'Access › Users', route: '#/access/users' },
        { label: 'Audit & login logs', sub: 'Access › Audit', route: '#/access/audit' },
        { label: 'Appearance & glass', sub: 'Settings › Appearance', route: '#/settings/appearance' },
        { label: 'Alerts & FCM push', sub: 'Settings › Alerts', route: '#/settings/alerts' },
        { label: 'Data JSON backup', sub: 'Settings › Data', route: '#/settings/data' },
        { label: 'Help & documentation', sub: 'Page', route: '#/help' },
      ].filter(
        (p) => !q || p.label.toLowerCase().includes(q) || p.sub.toLowerCase().includes(q)
      ),
    [q]
  );

  const actions = useMemo(
    () =>
      [
        {
          label: 'Switch light / dark theme',
          action: () => {
            handleClose();
            toggleTheme();
          },
        },
        {
          label: 'Keyboard shortcuts',
          action: () => setModal({ type: 'shortcuts' }),
        },
        {
          label: 'Sign out of Admin Dashboard',
          action: () => {
            handleClose();
            void logout();
          },
        },
      ].filter((a) => !q || a.label.toLowerCase().includes(q)),
    [q]
  );

  return (
    <div
      ref={scrimRef}
      className="fixed inset-0 z-50 bg-black/55 backdrop-blur-sm flex items-start justify-center pt-16 px-4"
    >
      <div className="fixed inset-0" onClick={handleClose} />
      <div
        ref={panelRef}
        role="dialog"
        aria-label="Search"
        className="relative w-full max-w-[580px] glass-solid rounded-[22px] overflow-hidden"
      >
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-[var(--line)]">
          <Search size={17} className="text-[var(--muted)] shrink-0" />
          <input
            type="text"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search CMS modules, enquiries, Bihar updates, or actions..."
            className="flex-1 bg-transparent text-[14.5px] focus:outline-none placeholder:text-[var(--muted)]"
          />
          <button
            type="button"
            onClick={handleClose}
            className="px-2 py-0.5 rounded-md bg-[var(--card-3)] text-[11px] text-[var(--muted)] cursor-pointer"
          >
            esc
          </button>
        </div>

        <div ref={listRef} className="max-h-[420px] overflow-y-auto custom-scroll p-2.5 space-y-4">
          {pages.length > 0 && (
            <div>
              <div className="px-2.5 pb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">
                Go to
              </div>
              {pages.map((pg) => (
                <button
                  key={pg.route}
                  type="button"
                  onClick={() => {
                    handleClose();
                    navigate(pg.route);
                  }}
                  className="finder__item w-full flex items-center justify-between px-3 py-2 rounded-[11px] hover:bg-[var(--glass-hi)] text-left cursor-pointer"
                >
                  <span className="font-medium text-[13.5px]">{pg.label}</span>
                  <span className="text-[12px] text-[var(--muted)]">{pg.sub}</span>
                </button>
              ))}
            </div>
          )}

          {actions.length > 0 && (
            <div>
              <div className="px-2.5 pb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">
                Actions
              </div>
              {actions.map((act) => (
                <button
                  key={act.label}
                  type="button"
                  onClick={act.action}
                  className="finder__item w-full flex items-center justify-between px-3 py-2 rounded-[11px] hover:bg-[var(--glass-hi)] text-left cursor-pointer"
                >
                  <span className="font-medium text-[13.5px]">{act.label}</span>
                  <span className="text-[12px] text-[var(--muted)]">Action</span>
                </button>
              ))}
            </div>
          )}

          {pages.length === 0 && actions.length === 0 && (
            <div className="px-3 py-6 text-center text-[13.5px] text-[var(--muted)]">
              No matching modules or actions
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

/* --- Modal Shell Helper --- */
const DialogWrap: React.FC<{
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
}> = ({ title, subtitle, onClose, children }) => {
  const scrimRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const closingRef = useRef(false);

  useEffect(() => {
    if (reducedMotion()) return;
    if (scrimRef.current) {
      gsap.fromTo(scrimRef.current, { opacity: 0 }, { opacity: 1, duration: 0.25 });
    }
    if (panelRef.current) {
      const el = panelRef.current;
      gsap.fromTo(
        el,
        { scale: 0.9, clipPath: clipInset(el, 0.55) },
        {
          scale: 1,
          clipPath: clipInset(el, 0, 60),
          duration: 0.55,
          ease: 'expo.out',
          clearProps: 'transform,clipPath',
        }
      );
    }
  }, []);

  const handleClose = () => {
    if (closingRef.current) return;
    closingRef.current = true;
    if (reducedMotion() || !panelRef.current) {
      onClose();
      return;
    }
    const el = panelRef.current;
    const tl = gsap.timeline({ onComplete: onClose });
    if (scrimRef.current) tl.to(scrimRef.current, { opacity: 0, duration: 0.2 }, 0);
    tl.to(
      el,
      {
        scale: 0.92,
        clipPath: clipInset(el, 0.6),
        duration: 0.2,
        ease: 'power2.in',
      },
      0
    );
  };

  return (
    <div
      ref={scrimRef}
      className="fixed inset-0 z-50 bg-black/55 backdrop-blur-sm flex items-center justify-center p-4"
    >
      <div className="fixed inset-0" onClick={handleClose} />
      <div
        ref={panelRef}
        role="dialog"
        aria-label={title}
        className="relative w-full max-w-[460px] glass-solid rounded-[24px] p-6"
      >
        <div className="flex items-start justify-between gap-4 mb-5">
          <div>
            <h2 className="text-[20px] font-bold">{title}</h2>
            {subtitle && <p className="text-[13px] text-[var(--muted)] mt-0.5">{subtitle}</p>}
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={handleClose}
            className="w-8 h-8 rounded-[10px] btn-ghost flex items-center justify-center cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
};

const ShortcutsModal: React.FC<{ onClose: () => void }> = ({ onClose }) => (
  <DialogWrap
    title="Keyboard shortcuts"
    subtitle="Navigate AMAN COMPUTER Admin Dashboard quickly"
    onClose={onClose}
  >
    <div className="space-y-2.5 text-[13.5px]">
      {[
        { keys: '⌘ K', desc: 'Open search & module switcher' },
        { keys: '[', desc: 'Collapse or expand the sidebar' },
        { keys: '?', desc: 'Show keyboard shortcuts' },
        { keys: 'Esc', desc: 'Close any open dialog' },
      ].map((s) => (
        <div
          key={s.keys}
          className="flex items-center justify-between py-2 border-b border-[var(--line)] last:border-none"
        >
          <span className="text-[var(--ink-2)]">{s.desc}</span>
          <kbd className="px-2.5 py-1 rounded-lg bg-[var(--card-2)] border border-[var(--line)] text-[12px] font-semibold tabular-nums">
            {s.keys}
          </kbd>
        </div>
      ))}
    </div>
  </DialogWrap>
);
