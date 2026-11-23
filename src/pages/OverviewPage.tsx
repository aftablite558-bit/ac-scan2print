import React, { useEffect, useRef } from 'react';
import {
  Activity,
  ArrowRight,
  Image as ImageIcon,
  Inbox,
  Landmark,
  Layers,
  Palette,
  ShieldCheck,
  Sliders,
} from 'lucide-react';
import { useAdmin } from '../context/AdminContext';
import {
  dur,
  gsap,
  popBadges,
  popIcon,
  reducedMotion,
  revealCards,
  revealRows,
  revealText,
} from '../utils/animations';
import { EMPTY_DASHBOARD_METRICS } from '../utils/workspaceState';

export const OverviewPage: React.FC = () => {
  const {
    currentUser,
    businessProfile,
    heroSection,
    metrics,
    recentActivities,
    notifications,
    integrations,
    appearance,
    navigate,
    resolvedTheme,
    toggleTheme,
    markNotificationRead,
  } = useAdmin();

  const rootRef = useRef<HTMLDivElement>(null);
  const h1Ref = useRef<HTMLHeadingElement>(null);
  const heroPhotoRef = useRef<HTMLImageElement>(null);

  const wallSrc = `/photos/wallpapers/${appearance.wallpaper}.jpg`;
  const bizName = businessProfile?.business_name || 'AMAN COMPUTER';
  const bizSub = businessProfile?.dashboard_subtitle || 'Admin Dashboard';
  const safeMetrics = metrics ?? EMPTY_DASHBOARD_METRICS;
  const safeActivities = Array.isArray(recentActivities) ? recentActivities : [];
  const safeNotifications = Array.isArray(notifications) ? notifications : [];

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const ctx = gsap.context(() => {
      if (heroPhotoRef.current && !reducedMotion()) {
        gsap.fromTo(
          heroPhotoRef.current,
          { scale: 1.14 },
          { scale: 1, duration: dur(1.6), ease: 'expo.out', clearProps: 'transform' }
        );
      }
      const cards = root.querySelectorAll<HTMLElement>('.anim-card');
      revealCards(cards, { delay: 0.08, stagger: 0.06, from: 0.72 });
      const rows = root.querySelectorAll<HTMLElement>('.overview-row');
      revealRows(rows, { delay: 0.42, stagger: 0.045 });
      const badges = root.querySelectorAll<HTMLElement>('.overview-badge');
      popBadges(badges, { delay: 0.35, stagger: 0.05 });
    }, root);
    return () => ctx.revert();
  }, []);

  useEffect(() => {
    if (h1Ref.current) revealText(h1Ref.current, 0.05);
  }, [bizSub]);

  return (
    <div ref={rootRef} className="space-y-5">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1
            key={bizSub}
            ref={h1Ref}
            className="text-[32px] sm:text-[36px] font-medium tracking-[-0.02em] leading-tight"
          >
            {bizSub}
          </h1>
          <p className="text-[14px] text-[var(--muted)] mt-1">
            {bizName} ·{' '}
            <strong className="text-[var(--ink)] font-semibold">
              {currentUser?.fullName} ({currentUser?.roleName})
            </strong>{' '}
            · Real-time CMS, Enquiries, and Door 5 Bihar Updates.
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={(e) => {
              popIcon(e.currentTarget);
              navigate('#/cms/business');
            }}
            className="btn-ghost px-4 py-2 rounded-full text-[13.5px] font-medium flex items-center gap-2 cursor-pointer"
          >
            <Sliders size={15} />
            <span>Business CMS</span>
          </button>
          <button
            type="button"
            onClick={(e) => {
              popIcon(e.currentTarget);
              navigate('#/settings/appearance');
            }}
            className="btn-ghost px-4 py-2 rounded-full text-[13.5px] font-medium flex items-center gap-2 cursor-pointer"
          >
            <Palette size={15} />
            <span>Theme</span>
          </button>
        </div>
      </div>

      {/* Hero Row: Business Identity Card + Architecture Readiness Card */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
        <section
          aria-label="AMAN COMPUTER Admin Dashboard"
          className="anim-card lg:col-span-8 relative rounded-[26px] overflow-hidden border border-[var(--line)] shadow-[var(--shadow)] min-h-[340px] flex flex-col justify-between p-5 sm:p-6"
        >
          <img
            ref={heroPhotoRef}
            src={wallSrc}
            alt=""
            className="nofade absolute inset-0 w-full h-full object-cover"
          />
          <div
            className="nofade absolute inset-0"
            style={{
              background:
                'linear-gradient(180deg, rgba(14,16,22,0.42) 0%, rgba(14,16,22,0.58) 45%, rgba(12,14,19,0.9) 100%)',
            }}
          />

          {/* Top pill row */}
          <div className="relative z-10 flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/45 backdrop-blur-md border border-white/15 text-[12px] font-medium text-white/95">
              <span className="live-dot w-2 h-2 rounded-full bg-[var(--accent)]" />
              <span>{heroSection?.badge_label || `${bizName} · Live CMS`}</span>
            </span>
            <span className="px-2.5 py-1 rounded-full bg-black/55 backdrop-blur-md text-[12px] font-semibold text-white">
              {resolvedTheme === 'dark' ? 'Dark' : 'Light'}
            </span>
          </div>

          {/* Bottom main info */}
          <div className="relative z-10 mt-6 space-y-4">
            <h2 className="text-[26px] sm:text-[32px] font-medium text-[#fffaf7] leading-tight tracking-tight">
              {heroSection?.main_headline || `${bizName} — ${bizSub}`}
            </h2>

            <p className="text-[14px] text-white/80 max-w-[580px] leading-relaxed">
              {businessProfile?.about_summary ||
                heroSection?.hero_description ||
                'Smart QR printing, hardware management, document services, and administrative control for AMAN COMPUTER.'}
            </p>

            <div className="flex flex-wrap gap-x-8 gap-y-2 pt-1">
              {[
                { val: `${safeMetrics.publishedServices}/${safeMetrics.totalServices}`, lbl: 'published services' },
                { val: `${safeMetrics.pendingEnquiries}`, lbl: 'pending enquiries' },
                { val: `${safeMetrics.publishedGovtUpdates}`, lbl: 'bihar updates live' },
                { val: `${safeMetrics.galleryImages}`, lbl: 'gallery photos' },
              ].map((s) => (
                <div key={s.lbl}>
                  <div className="text-[19px] sm:text-[21px] font-medium text-[#fffaf7] tabular-nums leading-tight">
                    {s.val}
                  </div>
                  <div className="text-[12px] text-white/75">{s.lbl}</div>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-1">
              <button
                type="button"
                onClick={() => navigate('#/cms/portrait')}
                className="magnetic px-5 py-2.5 rounded-full bg-white/95 hover:bg-white text-[#1d1a1e] font-semibold text-[13.5px] inline-flex items-center gap-2 transition-colors cursor-pointer shadow-md"
              >
                <span>Owner & AI Portrait</span>
                <ArrowRight size={15} />
              </button>
              <button
                type="button"
                onClick={() => navigate('#/bihar-updates')}
                className="px-4 py-2.5 rounded-full bg-white/12 hover:bg-white/20 backdrop-blur-md border border-white/20 text-white text-[13px] font-medium transition-colors cursor-pointer"
              >
                Door 5 Bihar Updates
              </button>
              <button
                type="button"
                onClick={(e) => toggleTheme(e.currentTarget)}
                className="px-4 py-2.5 rounded-full bg-white/12 hover:bg-white/20 backdrop-blur-md border border-white/20 text-white text-[13px] font-medium transition-colors cursor-pointer"
              >
                Switch to {resolvedTheme === 'dark' ? 'Light' : 'Dark'}
              </button>
            </div>
          </div>
        </section>

        {/* System Status & Integrations Card */}
        <section className="anim-card lg:col-span-4 glass-pane rounded-[26px] p-5 sm:p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-start justify-between gap-2">
              <div>
                <h2 className="text-[16px] font-bold">System Connections</h2>
                <p className="text-[12.5px] text-[var(--muted)] mt-0.5">
                  Database, Auth, AI & Push
                </p>
              </div>
              <span className="overview-badge inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[var(--card-2)] border border-[var(--line)] text-[12px] font-medium">
                <ShieldCheck size={13} className="text-[var(--good)]" />
                RBAC Active
              </span>
            </div>

            <ul className="mt-5 divide-y divide-[var(--line)] text-[13px]">
              {[
                {
                  label: 'Primary Database',
                  value: integrations.supabaseConfigured ? 'Supabase Postgres + SQLite' : 'Relational SQLite',
                },
                {
                  label: 'Firebase Analytics/FCM',
                  value: integrations.firebaseConfigured ? 'Configured' : 'Env Required',
                },
                {
                  label: 'BiRefNet BG Removal',
                  value: integrations.birefnetConfigured ? 'Connected' : 'Endpoint Unset',
                },
                {
                  label: 'Gemini Hindi Summary',
                  value: integrations.geminiConfigured ? 'Ready' : 'Key Unset',
                },
              ].map((item) => (
                <li key={item.label} className="overview-row py-3 flex items-center justify-between gap-3">
                  <span className="text-[var(--muted)] shrink-0">{item.label}</span>
                  <span className="font-semibold text-right truncate min-w-0">
                    {item.value}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div className="mt-5 pt-4 border-t border-[var(--line)] flex items-center justify-between gap-3">
            <span className="text-[12.5px] text-[var(--muted)] truncate">
              {businessProfile?.contact_number || 'Contact unset'}
            </span>
            <a
              href="#/access/audit"
              onClick={(e) => {
                e.preventDefault();
                navigate('#/access/audit');
              }}
              className="text-[13px] font-semibold text-[var(--accent-text)] hover:underline inline-flex items-center gap-1 shrink-0"
            >
              <span>Audit Log</span>
              <ArrowRight size={13} />
            </a>
          </div>
        </section>
      </div>

      {/* 4 Tinted Summary Tiles (Real DB Metrics) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {[
          {
            label: 'Total Services',
            value: `${safeMetrics.totalServices}`,
            badge: `${safeMetrics.publishedServices} published`,
            sub: 'Printing & cyber catalog',
            bg: 'var(--tile-1)',
            icon: Layers,
            route: '#/cms/services',
          },
          {
            label: 'Customer Enquiries',
            value: `${safeMetrics.totalEnquiries}`,
            badge: safeMetrics.pendingEnquiries > 0 ? `${safeMetrics.pendingEnquiries} pending` : 'Clear',
            sub: 'Contact · WhatsApp · Walk-in',
            bg: 'var(--tile-2)',
            icon: Inbox,
            route: '#/enquiries',
          },
          {
            label: 'Bihar Govt Updates',
            value: `${safeMetrics.publishedGovtUpdates}`,
            badge: `${safeMetrics.pendingGovtUpdates} pending`,
            sub: 'Door 5 verified portals',
            bg: 'var(--tile-3)',
            icon: Landmark,
            route: '#/bihar-updates',
          },
          {
            label: 'Gallery Images',
            value: `${safeMetrics.galleryImages}`,
            badge: 'WebP ready',
            sub: 'Shop & work showcase',
            bg: 'var(--tile-4)',
            icon: ImageIcon,
            route: '#/cms/gallery',
          },
        ].map((kpi) => {
          const Icon = kpi.icon;
          return (
            <button
              key={kpi.label}
              type="button"
              data-lift
              onClick={() => navigate(kpi.route)}
              style={{ background: kpi.bg }}
              className="anim-card glass-tile rounded-[22px] p-5 flex flex-col justify-between min-h-[136px] text-left cursor-pointer"
            >
              <div className="flex items-center gap-2 text-[13px] text-[var(--ink-2)] font-medium">
                <Icon size={15} className="opacity-75" />
                <span>{kpi.label}</span>
              </div>

              <div className="text-[26px] font-medium tracking-tight tabular-nums my-2">
                {kpi.value}
              </div>

              <div className="flex items-center justify-between gap-2 text-[12px]">
                <span className="px-2 py-0.5 rounded-full bg-black/10 dark:bg-black/30 text-[var(--good)] font-semibold tabular-nums">
                  {kpi.badge}
                </span>
                <span className="text-[var(--muted)] truncate">{kpi.sub}</span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Lower 2-Column Bento: Recent Admin Activities & Real Notifications */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        {/* Left 7 columns: Recent Admin Activities */}
        <section className="anim-card lg:col-span-7 glass-pane rounded-[24px] p-5 sm:p-6">
          <div className="flex items-center justify-between gap-3 mb-4">
            <div>
              <h2 className="text-[17px] font-bold">Recent Admin Activities</h2>
              <p className="text-[12.5px] text-[var(--muted)]">
                Audited actions across CMS, Enquiries, Door 5 & RBAC
              </p>
            </div>
            <a
              href="#/access/audit"
              onClick={(e) => {
                e.preventDefault();
                navigate('#/access/audit');
              }}
              className="text-[13px] font-medium text-[var(--ink-2)] hover:text-[var(--ink)] inline-flex items-center gap-1"
            >
              <span>Full log</span>
              <ArrowRight size={14} />
            </a>
          </div>

          {safeActivities.length === 0 ? (
            <p className="text-[13px] text-[var(--muted)]">
              No administrative changes recorded yet. Actions you perform appear here immediately.
            </p>
          ) : (
            <ul className="divide-y divide-[var(--line)]">
              {safeActivities.map((act) => (
                <li key={act.id} className="overview-row py-2.5 first:pt-0 last:pb-0 flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <span className="w-8 h-8 rounded-[10px] bg-[var(--card-2)] border border-[var(--line)] flex items-center justify-center text-[var(--accent)] shrink-0 mt-0.5">
                      <Activity size={14} />
                    </span>
                    <div className="min-w-0">
                      <div className="text-[13.5px] font-semibold truncate">{act.action}</div>
                      <div className="text-[12px] text-[var(--muted)] truncate">
                        {act.actor_email} · {act.actor_role} · {act.module}
                      </div>
                    </div>
                  </div>
                  <span className="text-[11.5px] text-[var(--muted)] shrink-0 tabular-nums">
                    {new Date(act.created_at).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Right 5 columns: Notifications */}
        <section className="anim-card lg:col-span-5 glass-pane rounded-[24px] p-5 sm:p-6">
          <div className="flex items-center justify-between gap-3 mb-3.5">
            <div>
              <h2 className="text-[17px] font-bold">Notifications</h2>
              <p className="text-[12.5px] text-[var(--muted)]">
                {safeMetrics.unreadNotifications} unread alert(s)
              </p>
            </div>
            <a
              href="#/settings/alerts"
              onClick={(e) => {
                e.preventDefault();
                navigate('#/settings/alerts');
              }}
              className="text-[13px] font-medium text-[var(--ink-2)] hover:text-[var(--ink)] inline-flex items-center gap-1"
            >
              <span>FCM Push</span>
              <ArrowRight size={14} />
            </a>
          </div>

          {safeNotifications.length === 0 ? (
            <p className="text-[13px] text-[var(--muted)]">No notifications right now.</p>
          ) : (
            <ul className="divide-y divide-[var(--line)]">
              {safeNotifications.slice(0, 6).map((n) => (
                <li key={n.id} className="overview-row py-2.5 first:pt-0 last:pb-0">
                  <button
                    type="button"
                    onClick={() => {
                      void markNotificationRead(n.id);
                      navigate(n.route);
                    }}
                    className="w-full text-left flex items-start gap-2.5 cursor-pointer group"
                  >
                    <span
                      className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${
                        n.is_read ? 'bg-[var(--line-2)]' : 'bg-[var(--accent)]'
                      }`}
                    />
                    <div className="min-w-0">
                      <div className="text-[13.5px] font-semibold group-hover:text-[var(--accent-text)] transition-colors">
                        {n.title}
                      </div>
                      <div className="text-[12px] text-[var(--muted)] mt-0.5 leading-snug">
                        {n.body}
                      </div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
};
