import type {
  AdminUserSession,
  BiharCategory,
  HelpFaqItem,
  MainRoute,
} from '../types/admin';

export interface ParsedRoute {
  main: MainRoute;
  sub?: string;
}

export const BIHAR_CATEGORIES: readonly BiharCategory[] = [
  'Government Schemes',
  'Latest Government Jobs',
  'Admit Cards',
  'Results',
  'Education',
  'Scholarships',
  'Government Notifications',
  'Government Orders',
  'Agriculture',
  'Important Announcements',
] as const;

const VALID_MAINS: MainRoute[] = [
  'home',
  'print-management',
  'hardware',
  'cms',
  'enquiries',
  'bihar-updates',
  'access',
  'settings',
  'help',
];

export function parseHash(hash: string): ParsedRoute {
  const clean = hash.replace(/^#\/?/, '').trim();
  if (!clean || clean === 'home') return { main: 'home' };
  const parts = clean.split('/').filter(Boolean);
  const rawFirst = parts[0];

  if (rawFirst === 'print-jobs') return { main: 'print-management', sub: 'jobs' };
  if (rawFirst === 'print-queue') return { main: 'print-management', sub: 'queue' };
  if (rawFirst === 'print-agents') return { main: 'print-management', sub: 'devices' };
  if (rawFirst === 'pricing') return { main: 'print-management', sub: 'pricing' };
  if (rawFirst === 'payments') return { main: 'print-management', sub: 'payments' };
  if (rawFirst === 'upi') return { main: 'print-management', sub: 'upi' };
  if (rawFirst === 'pilot') return { main: 'print-management', sub: 'pilot' };

  const first = rawFirst as MainRoute;
  if (!VALID_MAINS.includes(first)) return { main: 'home' };
  const rawSub = parts[1];
  const sub = rawSub === 'catalog' ? 'services' : rawSub;

  if (first === 'print-management') {
    const validPrintTabs = ['overview', 'jobs', 'queue', 'payments', 'pricing', 'upi', 'pilot', 'devices'];
    return {
      main: 'print-management',
      sub: sub && validPrintTabs.includes(sub) ? sub : 'overview',
    };
  }
  if (first === 'hardware') {
    const validHardware = ['printers', 'discovery', 'checklist'];
    return { main: 'hardware', sub: sub && validHardware.includes(sub) ? sub : 'printers' };
  }
  if (first === 'cms') {
    const validCms = [
      'business',
      'hero',
      'portrait',
      'website',
      'services',
      'gallery',
      'testimonials',
      'faqs',
    ];
    return { main: 'cms', sub: sub && validCms.includes(sub) ? sub : 'business' };
  }
  if (first === 'bihar-updates') {
    const validGov = ['updates', 'sources', 'logs'];
    return { main: 'bihar-updates', sub: sub && validGov.includes(sub) ? sub : 'updates' };
  }
  if (first === 'access') {
    const validAcc = ['users', 'permissions', 'logins', 'audit'];
    return { main: 'access', sub: sub && validAcc.includes(sub) ? sub : 'users' };
  }
  if (first === 'settings') {
    const validSet = ['appearance', 'alerts', 'data'];
    return { main: 'settings', sub: sub && validSet.includes(sub) ? sub : 'appearance' };
  }
  return { main: first, sub };
}

export function getActiveSidebarKey(route: ParsedRoute): string {
  if (route.main !== 'cms') return route.main;
  if (route.sub === 'services' || route.sub === 'gallery') return 'cms:catalog';
  if (route.sub === 'testimonials' || route.sub === 'faqs') return 'cms:community';
  return 'cms:business';
}

export function getPageTitle(route: ParsedRoute): string {
  switch (route.main) {
    case 'home':
      return 'Admin Dashboard — AMAN COMPUTER';
    case 'print-management':
      return 'Print Management — AMAN COMPUTER';
    case 'hardware':
      return 'Hardware & Printers — AMAN COMPUTER';
    case 'cms':
      return 'CMS & Business — AMAN COMPUTER';
    case 'enquiries':
      return 'Enquiries — AMAN COMPUTER';
    case 'bihar-updates':
      return 'Bihar Govt Updates — AMAN COMPUTER';
    case 'access':
      return 'Access & Audit — AMAN COMPUTER';
    case 'settings':
      return 'Settings — AMAN COMPUTER';
    case 'help':
      return 'Help — AMAN COMPUTER';
  }
}

export function hasPermission(user: AdminUserSession | null, code: string): boolean {
  if (!user || !user.isActive) return false;
  return user.permissions.includes(code);
}

export function filterFaqs(faqs: HelpFaqItem[], query: string): HelpFaqItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return faqs;
  return faqs.filter(
    (f) =>
      f.question.toLowerCase().includes(q) ||
      f.answer.toLowerCase().includes(q) ||
      f.topic.toLowerCase().includes(q)
  );
}

export function isPortraitReadyForApproval(portrait: {
  bg_removal_enabled: number | boolean;
  processing_status: string;
  processed_url: string | null;
}): boolean {
  if (!portrait.bg_removal_enabled) return true;
  return portrait.processing_status === 'succeeded' && Boolean(portrait.processed_url);
}

export const DEFAULT_APPEARANCE = {
  theme: 'light' as const,
  wallpaper: 'wall-dusk' as const,
  frost: 68,
  collapsedRail: false,
};

export const HELP_FAQS: HelpFaqItem[] = [
  {
    id: 'faq-birefnet',
    topic: 'Portrait Studio',
    question: 'How does BiRefNet portrait cutout processing work?',
    answer:
      'Owner portraits can optionally use server-side BiRefNet background removal before publishing.',
  },
  {
    id: 'faq-bihar',
    topic: 'Door 5 Bihar Updates',
    question: 'How are Bihar government updates refreshed?',
    answer:
      'Approved official Bihar sources are fetched via server routes and queued for review before publishing.',
  },
  {
    id: 'faq-scan2print',
    topic: 'AC Scan2Print',
    question: 'How does single-admin verification work?',
    answer:
      'Protected Admin Edge Functions verify the Firebase RS256 ID token against print_admin_accounts.',
  },
];

