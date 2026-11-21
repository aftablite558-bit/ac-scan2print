import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  Bell,
  Building2,
  ChevronRight,
  CircleHelp,
  Home,
  Inbox,
  Landmark,
  Layers,
  LayoutGrid,
  LogOut,
  Menu,
  MessageSquareQuote,
  Moon,
  MoreHorizontal,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Settings,
  Shield,
  Sun,
  X,
} from 'lucide-react';
import { useAdmin } from '../context/AdminContext';
import { getActiveSidebarKey } from '../utils/adminLogic';
import {
  bindMagneticAndLift,
  clipInset,
  dur,
  Flip,
  gsap,
  popBadges,
  popIcon,
  reducedMotion,
  slideClipPill,
} from '../utils/animations';

export const Shell: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const {
    currentUser,
    businessProfile,
    metrics,
    notifications,
    appearance,
    route,
    navigate,
    setModal,
    resolvedTheme,
    setTheme,
    toggleTheme,
    updateAppearance,
    markAllNotificationsRead,
    markNotificationRead,
    logout,
  } = useAdmin();

  const [notifOpen, setNotifOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const notifRef = useRef<HTMLDivElement>(null);
  const accountRef = useRef<HTMLDivElement>(null);

  // Animation refs
  const wallImgRef = useRef<HTMLImageElement>(null);
  const sideRef = useRef<HTMLElement>(null);
  const topbarRef = useRef<HTMLElement>(null);
  const tabbarRef = useRef<HTMLElement>(null);
  const snavTrackRef = useRef<HTMLDivElement>(null);
  const snavPillRef = useRef<HTMLSpanElement>(null);
  const tabbarPillRef = useRef<HTMLSpanElement>(null);
  const sideItemRefs = useRef<Record<string, HTMLAnchorElement | null>>({});
  const tabItemRefs = useRef<Record<string, HTMLAnchorElement | null>>({});

  const notifPopRef = useRef<HTMLDivElement>(null);
  const accountPopRef = useRef<HTMLDivElement>(null);
  const notifBellRef = useRef<HTMLButtonElement>(null);
  const notifBadgeRef = useRef<HTMLSpanElement>(null);
  const mobileScrimRef = useRef<HTMLDivElement>(null);
  const mobilePanelRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLElement>(null);

  const bootedRef = useRef(false);
  const prevWallRef = useRef(appearance.wallpaper);
  const prevCollapsedRef = useRef(appearance.collapsedRail);
  const activeSideKey = getActiveSidebarKey(route);
  const prevSideKeyRef = useRef(activeSideKey);
  const prevRouteMainRef = useRef(route.main);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (notifRef.current && !notifRef.current.contains(target)) setNotifOpen(false);
      if (accountRef.current && !accountRef.current.contains(target)) setAccountOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const unreadNotifs = notifications.filter((n) => !n.is_read).length;
  const isCollapsed = appearance.collapsedRail;
  const brandName = businessProfile?.business_name || 'AMAN COMPUTER';
  const brandSubtitle = businessProfile?.dashboard_subtitle || 'Admin Dashboard';

  // 1. First Boot Choreography (Preserved 100%)
  useEffect(() => {
    if (bootedRef.current) return;
    bootedRef.current = true;

    const activeSide = sideItemRefs.current[activeSideKey];
    if (snavPillRef.current && activeSide) {
      slideClipPill(snavPillRef.current, activeSide, { animate: false, radius: 14 });
    }
    const activeTab = tabItemRefs.current[route.main];
    if (tabbarPillRef.current && activeTab) {
      slideClipPill(tabbarPillRef.current, activeTab, { animate: false, radius: 14 });
    }

    if (reducedMotion()) return;

    const tl = gsap.timeline();
    if (wallImgRef.current) {
      tl.fromTo(
        wallImgRef.current,
        { scale: 1.12 },
        { scale: 1.02, duration: dur(1.8), ease: 'expo.out', clearProps: 'transform' },
        0
      );
    }
    if (sideRef.current) {
      const el = sideRef.current;
      tl.fromTo(
        el,
        { clipPath: clipInset(el, 0.85) },
        { clipPath: clipInset(el, 0, 60), duration: dur(0.9), ease: 'expo.out', clearProps: 'clipPath' },
        0.05
      );
      const links = el.querySelectorAll<HTMLElement>('.snav-item');
      if (links.length) {
        tl.fromTo(
          links,
          { opacity: 0, x: -12 },
          {
            opacity: 1,
            x: 0,
            duration: dur(0.5),
            ease: 'power3.out',
            stagger: dur(0.025),
            clearProps: 'transform,opacity',
          },
          0.2
        );
      }
      if (snavPillRef.current && activeSide && snavTrackRef.current) {
        const trackRect = snavTrackRef.current.getBoundingClientRect();
        const itemRect = activeSide.getBoundingClientRect();
        const originY = itemRect.top - trackRect.top + itemRect.height / 2;
        tl.fromTo(
          snavPillRef.current,
          { scaleY: 0.3, transformOrigin: `50% ${originY.toFixed(1)}px` },
          {
            scaleY: 1,
            duration: dur(0.5),
            ease: 'back.out(2)',
            clearProps: 'transform,transformOrigin',
          },
          0.3
        );
      }
    }
    if (topbarRef.current) {
      const el = topbarRef.current;
      tl.fromTo(
        el,
        { y: -16, clipPath: clipInset(el, 0.9) },
        {
          y: 0,
          clipPath: clipInset(el, 0, 60),
          duration: dur(0.85),
          ease: 'expo.out',
          clearProps: 'transform,clipPath',
        },
        0.12
      );
    }
    if (tabbarRef.current) {
      tl.fromTo(
        tabbarRef.current,
        { y: 100 },
        { y: 0, duration: dur(0.8), ease: 'expo.out', clearProps: 'transform' },
        0.2
      );
    }
  }, []);

  // 2. Wallpaper cross-zoom on wallpaper change
  useEffect(() => {
    if (prevWallRef.current === appearance.wallpaper) return;
    prevWallRef.current = appearance.wallpaper;
    if (!wallImgRef.current || reducedMotion()) return;
    gsap.fromTo(
      wallImgRef.current,
      { scale: 1.08, opacity: 0.82 },
      { scale: 1.02, opacity: 1, duration: 1.4, ease: 'expo.out', clearProps: 'transform,opacity' }
    );
  }, [appearance.wallpaper]);

  // 3. Sliding sidebar & mobile tabbar liquid pills on route change
  useLayoutEffect(() => {
    const sideChanged = prevSideKeyRef.current !== activeSideKey;
    prevSideKeyRef.current = activeSideKey;
    const routeChanged = prevRouteMainRef.current !== route.main;
    prevRouteMainRef.current = route.main;

    const activeSide = sideItemRefs.current[activeSideKey];
    if (snavPillRef.current && activeSide) {
      if (sideChanged) {
        gsap.killTweensOf(snavPillRef.current);
        gsap.set(snavPillRef.current, { clearProps: 'transform,transformOrigin' });
      }
      slideClipPill(snavPillRef.current, activeSide, {
        animate: sideChanged,
        radius: 14,
      });
    }
    const activeTab = tabItemRefs.current[route.main];
    if (tabbarPillRef.current && activeTab) {
      if (routeChanged) {
        gsap.killTweensOf(tabbarPillRef.current);
        gsap.set(tabbarPillRef.current, { clearProps: 'transform,transformOrigin' });
      }
      slideClipPill(tabbarPillRef.current, activeTab, {
        animate: routeChanged,
        radius: 14,
      });
    }
  }, [activeSideKey, route.main]);

  // 4. Sidebar collapse/expand Flip + staggered label/badge motion
  useLayoutEffect(() => {
    if (prevCollapsedRef.current === isCollapsed) return;
    prevCollapsedRef.current = isCollapsed;

    const aside = sideRef.current;
    if (!aside) return;

    const resyncPill = () => {
      const activeSide = sideItemRefs.current[activeSideKey];
      if (snavPillRef.current && activeSide) {
        slideClipPill(snavPillRef.current, activeSide, { animate: true, radius: 14 });
      }
    };

    if (reducedMotion()) {
      resyncPill();
      return;
    }

    const flipTargets = aside.querySelectorAll<HTMLElement>('.snav-ico, .snav-brand-tile');
    const flipState = Flip.getState(flipTargets);

    requestAnimationFrame(() => {
      Flip.from(flipState, {
        duration: 0.45,
        ease: 'power3.inOut',
        simple: true,
      });

      if (!isCollapsed) {
        const labels = aside.querySelectorAll<HTMLElement>('.snav-label');
        if (labels.length) {
          gsap.fromTo(
            labels,
            { opacity: 0, x: -10 },
            {
              opacity: 1,
              x: 0,
              duration: 0.45,
              ease: 'power3.out',
              stagger: 0.018,
              clearProps: 'transform,opacity',
            }
          );
        }
      }

      const badges = aside.querySelectorAll<HTMLElement>('.snav-badge');
      if (badges.length) {
        popBadges(badges, { from: 0, delay: 0.08, stagger: 0.03 });
      }

      window.setTimeout(resyncPill, 320);
      resyncPill();
    });
  }, [isCollapsed, activeSideKey]);

  // 5. Resize resync for sliding pills
  useEffect(() => {
    const onResize = () => {
      const activeSide = sideItemRefs.current[activeSideKey];
      if (snavPillRef.current && activeSide) {
        slideClipPill(snavPillRef.current, activeSide, { animate: false, radius: 14 });
      }
      const activeTab = tabItemRefs.current[route.main];
      if (tabbarPillRef.current && activeTab) {
        slideClipPill(tabbarPillRef.current, activeTab, { animate: false, radius: 14 });
      }
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [activeSideKey, route.main]);

  // 6. Popover entrance animations
  useEffect(() => {
    if (!accountOpen || !accountPopRef.current || reducedMotion()) return;
    const el = accountPopRef.current;
    gsap.fromTo(
      el,
      { scale: 0.94, y: 6, clipPath: clipInset(el, 0.6) },
      {
        scale: 1,
        y: 0,
        clipPath: clipInset(el, 0, 60),
        duration: 0.45,
        ease: 'expo.out',
        clearProps: 'transform,clipPath',
      }
    );
  }, [accountOpen]);

  useEffect(() => {
    if (!notifOpen || !notifPopRef.current || reducedMotion()) return;
    const el = notifPopRef.current;
    gsap.fromTo(
      el,
      { scale: 0.94, y: -6, clipPath: clipInset(el, 0.6) },
      {
        scale: 1,
        y: 0,
        clipPath: clipInset(el, 0, 60),
        duration: 0.45,
        ease: 'expo.out',
        clearProps: 'transform,clipPath',
      }
    );
    const items = el.querySelectorAll<HTMLElement>('.notif-item');
    if (items.length) {
      gsap.fromTo(
        items,
        { opacity: 0, y: 8 },
        {
          opacity: 1,
          y: 0,
          duration: 0.45,
          ease: 'power3.out',
          stagger: 0.04,
          delay: 0.06,
          clearProps: 'transform,opacity',
        }
      );
    }
  }, [notifOpen]);

  // 7. Mobile drawer entrance
  useEffect(() => {
    if (!mobileMenuOpen || reducedMotion()) return;
    if (mobileScrimRef.current) {
      gsap.fromTo(mobileScrimRef.current, { opacity: 0 }, { opacity: 1, duration: 0.25 });
    }
    if (mobilePanelRef.current) {
      gsap.fromTo(
        mobilePanelRef.current,
        { xPercent: -100 },
        { xPercent: 0, duration: 0.5, ease: 'expo.out', clearProps: 'transform' }
      );
    }
  }, [mobileMenuOpen]);

  // 8. Re-bind .magnetic & [data-lift] whenever route or layout changes
  useEffect(() => {
    let cleanup: (() => void) | undefined;
    const id = window.setTimeout(() => {
      cleanup = bindMagneticAndLift(document.body);
    }, 60);
    return () => {
      window.clearTimeout(id);
      cleanup?.();
    };
  }, [route.main, route.sub]);

  const wobbleBell = () => {
    if (reducedMotion()) return;
    if (notifBellRef.current) {
      const svg = notifBellRef.current.querySelector('svg');
      if (svg) {
        gsap.to(svg, {
          keyframes: { rotation: [0, 16, -14, 10, -6, 0] },
          duration: 0.8,
          ease: 'power2.out',
          transformOrigin: '50% 10%',
          clearProps: 'transform',
        });
      }
    }
    if (notifBadgeRef.current) {
      gsap.fromTo(
        notifBadgeRef.current,
        { scale: 0.4 },
        { scale: 1, duration: 0.6, ease: 'back.out(3)', clearProps: 'transform' }
      );
    }
  };

  const navGroups: Array<{
    label: string;
    items: Array<{ id: string; label: string; href: string; icon: React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>; badge?: number }>;
  }> = [
    {
      label: 'Workspace',
      items: [{ id: 'home', label: 'Overview', href: '#/home', icon: Home }],
    },
    {
      label: 'Website CMS',
      items: [
        { id: 'cms:business', label: 'Business & Hero', href: '#/cms/business', icon: Building2 },
        { id: 'cms:catalog', label: 'Services & Gallery', href: '#/cms/services', icon: Layers },
        {
          id: 'cms:community',
          label: 'Reviews & FAQ',
          href: '#/cms/testimonials',
          icon: MessageSquareQuote,
        },
      ],
    },
    {
      label: 'Operations',
      items: [
        {
          id: 'enquiries',
          label: 'Enquiries',
          href: '#/enquiries',
          icon: Inbox,
          badge: metrics.pendingEnquiries > 0 ? metrics.pendingEnquiries : undefined,
        },
        {
          id: 'bihar-updates',
          label: 'Bihar Updates',
          href: '#/bihar-updates',
          icon: Landmark,
          badge: metrics.pendingGovtUpdates > 0 ? metrics.pendingGovtUpdates : undefined,
        },
        { id: 'access', label: 'Access & Audit', href: '#/access', icon: Shield },
      ],
    },
  ];

  const toolItems = [
    { id: 'settings', label: 'Settings', href: '#/settings', icon: Settings },
    { id: 'help', label: 'Help', href: '#/help', icon: CircleHelp },
  ];

  const breadcrumb = (() => {
    const mapMain: Record<string, { label: string; href: string }> = {
      home: { label: 'Overview', href: '#/home' },
      cms: { label: 'CMS', href: '#/cms/business' },
      enquiries: { label: 'Enquiries', href: '#/enquiries' },
      'bihar-updates': { label: 'Bihar Updates', href: '#/bihar-updates' },
      access: { label: 'Access & Audit', href: '#/access' },
      settings: { label: 'Settings', href: '#/settings' },
      help: { label: 'Help', href: '#/help' },
    };
    const subLabels: Record<string, string> = {
      business: 'Business Profile',
      hero: 'Hero Section',
      portrait: 'Owner & AI Portrait',
      website: 'Website Settings',
      services: 'Services',
      gallery: 'Gallery',
      testimonials: 'Testimonials',
      faqs: 'FAQs',
      updates: 'Updates Queue',
      sources: 'Official Sources',
      logs: 'Fetch Logs',
      users: 'Users & Roles',
      permissions: 'Permissions',
      logins: 'Login Activity',
      audit: 'Audit Trail',
      appearance: 'Appearance',
      alerts: 'Alerts & FCM',
      data: 'Data Backup',
    };
    const mainInfo = mapMain[route.main] || mapMain.home;
    const subLabel = route.sub ? subLabels[route.sub] : undefined;
    return { mainInfo, subLabel };
  })();

  const wallSrc = `/photos/wallpapers/${appearance.wallpaper}.jpg`;
  const userInitials = (currentUser?.fullName || 'AC')
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() || '')
    .join('');

  return (
    <div className="min-h-screen relative text-[var(--ink)]">
      {/* Wallpaper backdrop */}
      <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
        <img
          ref={wallImgRef}
          src={wallSrc}
          alt=""
          className="w-full h-full object-cover scale-[1.02]"
          style={{ filter: 'var(--wall-filter)' }}
        />
        <div
          className="absolute inset-0 transition-colors duration-300"
          style={{ background: 'var(--wash)' }}
        />
      </div>

      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:px-4 focus:py-2 focus:rounded-xl btn-primary"
      >
        Skip to content
      </a>

      <div className="max-w-[1540px] mx-auto flex min-h-screen gap-4 p-3 md:p-4 pb-24 md:pb-4">
        {/* Desktop Sidebar */}
        <aside
          ref={sideRef}
          aria-label="Sidebar"
          className={`hidden md:flex flex-col shrink-0 glass-pane rounded-[24px] p-3.5 sticky top-4 h-[calc(100vh-32px)] transition-[width] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
            isCollapsed ? 'w-[84px]' : 'w-[252px]'
          }`}
        >
          {/* Brand row */}
          <div
            className={`flex items-center ${
              isCollapsed ? 'justify-center flex-col gap-2' : 'justify-between'
            } px-1 pt-0.5 pb-4`}
          >
            <a
              href="#/home"
              onClick={(e) => {
                e.preventDefault();
                navigate('#/home');
              }}
              aria-label="AMAN COMPUTER — Admin Dashboard"
              className="flex items-center gap-3 min-w-0 group"
            >
              <div className="snav-brand-tile w-10 h-10 rounded-[12px] bg-[var(--accent)] text-[var(--accent-ink)] flex items-center justify-center font-bold text-[19px] shrink-0 shadow-sm">
                A
              </div>
              {!isCollapsed && (
                <div className="min-w-0 snav-label">
                  <div className="text-[15px] font-bold leading-tight tracking-tight truncate">
                    {brandName}
                  </div>
                  <div className="text-[12px] text-[var(--muted)] truncate">{brandSubtitle}</div>
                </div>
              )}
            </a>

            <button
              type="button"
              onClick={(e) => {
                popIcon(e.currentTarget);
                updateAppearance({ collapsedRail: !isCollapsed });
              }}
              aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              title={isCollapsed ? 'Expand sidebar ([)' : 'Collapse sidebar ([)'}
              className="w-8 h-8 rounded-[10px] btn-ghost flex items-center justify-center text-[var(--muted)] hover:text-[var(--ink)] shrink-0 cursor-pointer"
            >
              {isCollapsed ? <PanelLeftOpen size={15} /> : <PanelLeftClose size={15} />}
            </button>
          </div>

          {/* Unified Navigation Track with Sliding Liquid Pill */}
          <div className="flex-1 overflow-y-auto custom-scroll px-0.5">
            <div ref={snavTrackRef} className="relative min-h-full flex flex-col">
              <span ref={snavPillRef} className="snav__pill" aria-hidden="true" />

              <nav aria-label="Main" className="relative z-10 space-y-5">
                {navGroups.map((grp) => (
                  <div key={grp.label} role="group" aria-label={grp.label}>
                    {!isCollapsed && (
                      <div className="snav-label px-3 mb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">
                        {grp.label}
                      </div>
                    )}
                    <div className="space-y-1">
                      {grp.items.map((item) => {
                        const Icon = item.icon;
                        const active = activeSideKey === item.id;
                        return (
                          <a
                            key={item.id}
                            ref={(el) => {
                              sideItemRefs.current[item.id] = el;
                            }}
                            href={item.href}
                            onClick={(e) => {
                              e.preventDefault();
                              popIcon(e.currentTarget);
                              navigate(item.href);
                            }}
                            title={isCollapsed ? item.label : undefined}
                            className={`snav-item relative flex items-center ${
                              isCollapsed ? 'justify-center px-2' : 'justify-between px-3'
                            } py-2.5 rounded-[14px] text-[14px] transition-colors duration-150 ${
                              active
                                ? 'text-[var(--accent-ink)] font-semibold'
                                : 'text-[var(--ink-2)] hover:bg-[var(--glass-hi)] hover:text-[var(--ink)] font-medium'
                            }`}
                          >
                            <span className="flex items-center gap-3 min-w-0">
                              <Icon
                                size={17}
                                strokeWidth={active ? 2.2 : 1.8}
                                className="snav-ico shrink-0"
                              />
                              {!isCollapsed && (
                                <span className="snav-label truncate">{item.label}</span>
                              )}
                            </span>
                            {!isCollapsed && item.badge !== undefined && (
                              <span
                                className={`snav-badge px-2 py-0.5 rounded-full text-[11px] font-bold tabular-nums ${
                                  active
                                    ? 'bg-black/20 text-[var(--accent-ink)]'
                                    : 'bg-[var(--accent-soft)] text-[var(--accent-text)]'
                                }`}
                              >
                                {item.badge}
                              </span>
                            )}
                          </a>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </nav>

              {/* Bottom Tools inside same liquid pill track */}
              <div className="relative z-10 mt-auto pt-3 border-t border-[var(--line)] space-y-1">
                {toolItems.map((item) => {
                  const Icon = item.icon;
                  const active = activeSideKey === item.id;
                  return (
                    <a
                      key={item.id}
                      ref={(el) => {
                        sideItemRefs.current[item.id] = el;
                      }}
                      href={item.href}
                      onClick={(e) => {
                        e.preventDefault();
                        popIcon(e.currentTarget);
                        navigate(item.href);
                      }}
                      title={isCollapsed ? item.label : undefined}
                      className={`snav-item relative flex items-center ${
                        isCollapsed ? 'justify-center px-2' : 'gap-3 px-3'
                      } py-2.5 rounded-[14px] text-[14px] transition-colors duration-150 ${
                        active
                          ? 'text-[var(--accent-ink)] font-semibold'
                          : 'text-[var(--ink-2)] hover:bg-[var(--glass-hi)] hover:text-[var(--ink)] font-medium'
                      }`}
                    >
                      <Icon
                        size={17}
                        strokeWidth={active ? 2.2 : 1.8}
                        className="snav-ico shrink-0"
                      />
                      {!isCollapsed && <span className="snav-label">{item.label}</span>}
                    </a>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Account Card */}
          <div className="relative pt-2" ref={accountRef}>
            <button
              type="button"
              onClick={() => setAccountOpen((o) => !o)}
              aria-label="AMAN COMPUTER — account menu"
              className={`w-full flex items-center ${
                isCollapsed ? 'justify-center p-1.5' : 'justify-between px-2.5 py-2'
              } rounded-[16px] bg-[var(--card-2)] hover:bg-[var(--glass-hi)] border border-[var(--line)] transition-colors cursor-pointer`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="relative w-8 h-8 rounded-full bg-[#e6dfd3] text-[#1d1a1e] flex items-center justify-center text-[11px] font-bold shrink-0">
                  {userInitials || 'AC'}
                  <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-[var(--good)] ring-2 ring-[var(--bg)]" />
                </div>
                {!isCollapsed && (
                  <div className="snav-label text-left min-w-0">
                    <div className="text-[12.5px] font-semibold leading-tight truncate">
                      {currentUser?.fullName || brandName}
                    </div>
                    <div className="text-[11px] text-[var(--muted)] truncate">
                      {currentUser?.roleName || brandSubtitle}
                    </div>
                  </div>
                )}
              </div>
              {!isCollapsed && (
                <MoreHorizontal size={16} className="text-[var(--muted)] shrink-0" />
              )}
            </button>

            {accountOpen && (
              <div
                ref={accountPopRef}
                role="menu"
                aria-label="Workspace menu"
                className="absolute bottom-full left-0 mb-2 w-[240px] glass-solid rounded-[18px] p-1.5 z-50"
              >
                <div className="px-3 py-2">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--muted)]">
                    {currentUser?.roleName}
                  </div>
                  <div className="text-[12px] text-[var(--ink-2)] truncate mt-0.5">
                    {currentUser?.email}
                  </div>
                </div>
                <div className="my-1 border-t border-[var(--line)]" />
                {(['light', 'dark', 'system'] as const).map((t) => {
                  const label =
                    t === 'light' ? 'Light' : t === 'dark' ? 'Dark' : 'Match system';
                  const isSelected = appearance.theme === t;
                  return (
                    <button
                      key={t}
                      type="button"
                      role="menuitem"
                      onClick={(e) => {
                        setTheme(t, e.currentTarget);
                        setAccountOpen(false);
                      }}
                      className="w-full flex items-center justify-between px-3 py-2 rounded-[10px] text-[13px] hover:bg-[var(--glass-hi)] cursor-pointer text-left"
                    >
                      <span>{label}</span>
                      {isSelected && <span className="text-[var(--accent)] font-bold">✓</span>}
                    </button>
                  );
                })}
                <div className="my-1 border-t border-[var(--line)]" />
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    navigate('#/cms/business');
                    setAccountOpen(false);
                  }}
                  className="w-full text-left px-3 py-2 rounded-[10px] text-[13px] hover:bg-[var(--glass-hi)] cursor-pointer"
                >
                  Business profile
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    navigate('#/settings/appearance');
                    setAccountOpen(false);
                  }}
                  className="w-full text-left px-3 py-2 rounded-[10px] text-[13px] hover:bg-[var(--glass-hi)] cursor-pointer"
                >
                  Wallpaper & glass
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setAccountOpen(false);
                    setModal({ type: 'shortcuts' });
                  }}
                  className="w-full flex items-center justify-between px-3 py-2 rounded-[10px] text-[13px] hover:bg-[var(--glass-hi)] cursor-pointer"
                >
                  <span>Keyboard shortcuts</span>
                  <kbd className="px-1.5 py-0.5 text-[11px] rounded bg-[var(--card-3)] text-[var(--muted)]">
                    ?
                  </kbd>
                </button>
                <div className="my-1 border-t border-[var(--line)]" />
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setAccountOpen(false);
                    void logout();
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-[10px] text-[13px] text-[var(--bad)] hover:bg-[var(--glass-hi)] cursor-pointer font-medium"
                >
                  <LogOut size={14} />
                  <span>Sign out</span>
                </button>
              </div>
            )}
          </div>
        </aside>

        {/* Right column: Topbar + Main */}
        <div className="flex-1 min-w-0 flex flex-col gap-5">
          {/* Topbar */}
          <header
            ref={topbarRef}
            className="glass-pane rounded-[22px] px-4 md:px-5 py-2.5 flex items-center justify-between gap-4 sticky top-3 md:top-4 z-30"
          >
            <div className="flex items-center gap-3 min-w-0">
              <button
                type="button"
                onClick={() => setMobileMenuOpen(true)}
                aria-label="Open menu"
                className="md:hidden w-9 h-9 rounded-[11px] btn-ghost flex items-center justify-center shrink-0"
              >
                <Menu size={18} />
              </button>

              <a
                href="#/home"
                onClick={(e) => {
                  e.preventDefault();
                  navigate('#/home');
                }}
                className="md:hidden w-8 h-8 rounded-[10px] bg-[var(--accent)] text-[var(--accent-ink)] flex items-center justify-center font-bold text-[15px] shrink-0"
              >
                A
              </a>

              <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-[13.5px] min-w-0">
                <span className="hidden sm:inline text-[var(--muted)] truncate">{brandName}</span>
                <ChevronRight
                  size={14}
                  className="hidden sm:inline text-[var(--muted)] shrink-0"
                />
                <a
                  href={breadcrumb.mainInfo.href}
                  onClick={(e) => {
                    e.preventDefault();
                    navigate(breadcrumb.mainInfo.href);
                  }}
                  className={`truncate hover:underline ${
                    breadcrumb.subLabel
                      ? 'text-[var(--muted)]'
                      : 'text-[var(--ink)] font-semibold'
                  }`}
                >
                  {breadcrumb.mainInfo.label}
                </a>
                {breadcrumb.subLabel && (
                  <>
                    <ChevronRight size={14} className="text-[var(--muted)] shrink-0" />
                    <span className="text-[var(--ink)] font-semibold truncate">
                      {breadcrumb.subLabel}
                    </span>
                  </>
                )}
              </nav>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                aria-label="Search"
                title="Search (⌘K)"
                onClick={(e) => {
                  popIcon(e.currentTarget);
                  setModal({ type: 'search' });
                }}
                className="w-9 h-9 rounded-[12px] btn-ghost flex items-center justify-center text-[var(--ink-2)] cursor-pointer"
              >
                <Search size={16} />
              </button>

              <button
                type="button"
                aria-label={resolvedTheme === 'dark' ? 'Switch to light' : 'Switch to dark'}
                title={resolvedTheme === 'dark' ? 'Switch to light' : 'Switch to dark'}
                onClick={(e) => {
                  popIcon(e.currentTarget);
                  toggleTheme(e.currentTarget);
                }}
                className="hidden sm:flex w-9 h-9 rounded-[12px] btn-ghost items-center justify-center text-[var(--ink-2)] cursor-pointer"
              >
                {resolvedTheme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
              </button>

              {/* Notifications */}
              <div className="relative" ref={notifRef}>
                <button
                  ref={notifBellRef}
                  type="button"
                  aria-label={`Notifications, ${unreadNotifs} unread`}
                  onClick={() => {
                    wobbleBell();
                    setNotifOpen((o) => !o);
                  }}
                  className="relative w-9 h-9 rounded-[12px] btn-ghost flex items-center justify-center text-[var(--ink-2)] cursor-pointer"
                >
                  <Bell size={16} />
                  {unreadNotifs > 0 && (
                    <span
                      ref={notifBadgeRef}
                      className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-[var(--accent)] text-[var(--accent-ink)] text-[11px] font-bold flex items-center justify-center tabular-nums"
                    >
                      {unreadNotifs}
                    </span>
                  )}
                </button>

                {notifOpen && (
                  <div
                    ref={notifPopRef}
                    role="dialog"
                    aria-label="Notifications"
                    className="absolute right-0 mt-2 w-[340px] max-w-[90vw] glass-solid rounded-[20px] p-3 z-50"
                  >
                    <div className="flex items-center justify-between px-2 pb-2 mb-1 border-b border-[var(--line)]">
                      <span className="font-semibold text-[14px]">Notifications</span>
                      <button
                        type="button"
                        onClick={() => void markAllNotificationsRead()}
                        className="text-[12px] text-[var(--accent-text)] hover:underline cursor-pointer"
                      >
                        Mark all read
                      </button>
                    </div>
                    <div className="space-y-1 max-h-[340px] overflow-y-auto custom-scroll">
                      {notifications.length === 0 ? (
                        <div className="p-3 text-[12.5px] text-[var(--muted)]">
                          No administrative notifications yet.
                        </div>
                      ) : (
                        notifications.map((n) => (
                          <button
                            key={n.id}
                            type="button"
                            onClick={() => {
                              void markNotificationRead(n.id);
                              setNotifOpen(false);
                              navigate(n.route);
                            }}
                            className="notif-item w-full text-left p-2.5 rounded-[12px] hover:bg-[var(--glass-hi)] transition-colors flex items-start gap-2.5 cursor-pointer"
                          >
                            <span
                              className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${
                                n.is_read ? 'bg-transparent' : 'bg-[var(--accent)]'
                              }`}
                            />
                            <div className="min-w-0">
                              <div className="text-[13px] font-semibold leading-snug">{n.title}</div>
                              <div className="text-[12px] text-[var(--muted)] mt-0.5 leading-snug">
                                {n.body}
                              </div>
                              <div className="text-[11px] text-[var(--muted)] mt-1">
                                {new Date(n.created_at).toLocaleString()}
                              </div>
                            </div>
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </header>

          {/* Main content */}
          <main ref={mainRef} id="main" className="flex-1 min-w-0 pb-6">
            {children}
          </main>
        </div>
      </div>

      {/* Mobile Bottom Dock with Sliding Pill */}
      <nav
        ref={tabbarRef}
        aria-label="Quick"
        className="md:hidden fixed bottom-3 inset-x-3 z-40 glass-solid rounded-[20px] p-1.5 flex items-center justify-around"
      >
        <div className="relative flex items-center justify-around w-full">
          <span ref={tabbarPillRef} className="tabbar__pill" aria-hidden="true" />
          {[
            { id: 'home', label: 'Overview', href: '#/home', icon: Home },
            { id: 'enquiries', label: 'Enquiries', href: '#/enquiries', icon: Inbox },
            { id: 'bihar-updates', label: 'Bihar', href: '#/bihar-updates', icon: Landmark },
          ].map((item) => {
            const Icon = item.icon;
            const active = route.main === item.id;
            return (
              <a
                key={item.id}
                ref={(el) => {
                  tabItemRefs.current[item.id] = el;
                }}
                href={item.href}
                onClick={(e) => {
                  e.preventDefault();
                  popIcon(e.currentTarget);
                  navigate(item.href);
                }}
                className={`relative z-10 flex flex-col items-center justify-center gap-0.5 px-3 py-1.5 rounded-[14px] text-[11px] font-medium min-w-[60px] transition-colors ${
                  active ? 'text-[var(--accent-ink)] font-semibold' : 'text-[var(--muted)]'
                }`}
              >
                <Icon size={17} />
                <span>{item.label}</span>
              </a>
            );
          })}
          <button
            type="button"
            onClick={() => setMobileMenuOpen(true)}
            className="relative z-10 flex flex-col items-center justify-center gap-0.5 px-3 py-1.5 rounded-[14px] text-[11px] font-medium text-[var(--muted)] min-w-[60px]"
          >
            <LayoutGrid size={17} />
            <span>Menu</span>
          </button>
        </div>
      </nav>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div
          ref={mobileScrimRef}
          className="md:hidden fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex"
        >
          <div
            ref={mobilePanelRef}
            className="w-[280px] max-w-[85vw] h-full glass-solid p-4 flex flex-col"
          >
            <div className="flex items-center justify-between pb-4 border-b border-[var(--line)]">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-[11px] bg-[var(--accent)] text-[var(--accent-ink)] flex items-center justify-center font-bold text-[17px]">
                  A
                </div>
                <div>
                  <div className="font-bold text-[15px]">{brandName}</div>
                  <div className="text-[12px] text-[var(--muted)]">
                    {currentUser?.roleName || brandSubtitle}
                  </div>
                </div>
              </div>
              <button
                type="button"
                aria-label="Close menu"
                onClick={() => setMobileMenuOpen(false)}
                className="w-8 h-8 rounded-[10px] btn-ghost flex items-center justify-center"
              >
                <X size={16} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto py-4 space-y-5">
              {navGroups.map((grp) => (
                <div key={grp.label}>
                  <div className="px-3 mb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">
                    {grp.label}
                  </div>
                  <div className="space-y-1">
                    {grp.items.map((item) => {
                      const Icon = item.icon;
                      const active = activeSideKey === item.id;
                      return (
                        <a
                          key={item.id}
                          href={item.href}
                          onClick={(e) => {
                            e.preventDefault();
                            navigate(item.href);
                            setMobileMenuOpen(false);
                          }}
                          className={`flex items-center justify-between px-3 py-2.5 rounded-[12px] text-[14px] ${
                            active
                              ? 'bg-[var(--accent)] text-[var(--accent-ink)] font-semibold'
                              : 'text-[var(--ink-2)]'
                          }`}
                        >
                          <span className="flex items-center gap-3">
                            <Icon size={17} />
                            <span>{item.label}</span>
                          </span>
                          {item.badge !== undefined && (
                            <span className="px-2 py-0.5 rounded-full bg-black/15 text-[11px] font-bold">
                              {item.badge}
                            </span>
                          )}
                        </a>
                      );
                    })}
                  </div>
                </div>
              ))}
              <div className="pt-3 border-t border-[var(--line)] space-y-1">
                {toolItems.map((item) => {
                  const Icon = item.icon;
                  const active = activeSideKey === item.id;
                  return (
                    <a
                      key={item.id}
                      href={item.href}
                      onClick={(e) => {
                        e.preventDefault();
                        navigate(item.href);
                        setMobileMenuOpen(false);
                      }}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-[12px] text-[14px] ${
                        active
                          ? 'bg-[var(--accent)] text-[var(--accent-ink)] font-semibold'
                          : 'text-[var(--ink-2)]'
                      }`}
                    >
                      <Icon size={17} />
                      <span>{item.label}</span>
                    </a>
                  );
                })}
              </div>
            </div>

            <div className="pt-3 border-t border-[var(--line)] flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={(e) => toggleTheme(e.currentTarget)}
                className="btn-ghost px-3 py-2 rounded-[12px] text-[13px] flex items-center gap-2 cursor-pointer"
              >
                {resolvedTheme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
                <span>{resolvedTheme === 'dark' ? 'Light' : 'Dark'}</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  void logout();
                }}
                className="btn-ghost px-3 py-2 rounded-[12px] text-[13px] text-[var(--bad)] flex items-center gap-1.5 cursor-pointer"
              >
                <LogOut size={14} />
                <span>Sign out</span>
              </button>
            </div>
          </div>
          <div className="flex-1" onClick={() => setMobileMenuOpen(false)} />
        </div>
      )}
    </div>
  );
};
