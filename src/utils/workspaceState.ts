import type { AccessStateSnapshot } from '../context/AdminContext';
import type {
  ActivityLogEntry,
  AdminNotification,
  AdminUserRecord,
  AppearanceSettings,
  BusinessProfile,
  DashboardMetrics,
  EnquiryItem,
  FaqItem,
  GalleryItem,
  GovtFetchLog,
  GovtSource,
  GovtUpdateItem,
  HeroSection,
  LoginLogEntry,
  OwnerProfile,
  PermissionRecord,
  ReferencePortrait,
  RolePermissionMapping,
  RoleRecord,
  ServiceCategory,
  ServiceItem,
  TestimonialItem,
  ThemeMode,
  WallpaperId,
  WebsiteSettings,
} from '../types/admin';
import { DEFAULT_APPEARANCE, parseHash, type ParsedRoute } from './adminLogic';

export const EMPTY_DASHBOARD_METRICS: DashboardMetrics = {
  totalServices: 0,
  publishedServices: 0,
  totalEnquiries: 0,
  pendingEnquiries: 0,
  publishedGovtUpdates: 0,
  pendingGovtUpdates: 0,
  galleryImages: 0,
  unreadNotifications: 0,
};

export const EMPTY_ACCESS_STATE: AccessStateSnapshot = {
  roles: [],
  permissions: [],
  rolePermissions: [],
  users: [],
  loginLogs: [],
  auditLogs: [],
};

const VALID_THEMES = new Set<ThemeMode>(['light', 'dark', 'system']);
const VALID_WALLPAPERS = new Set<WallpaperId>(['wall-dusk', 'wall-street', 'wall-room']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asNonNegativeInt(value: unknown, fallback = 0): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.max(0, Math.trunc(value));
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

/**
 * Sanitizes error messages before displaying in UI or console logs.
 * Strips raw HTML documents (e.g., SPA fallback HTML) and redacts Bearer/JWT tokens.
 */
export function sanitizeErrorMessage(
  err: unknown,
  fallback = 'An unexpected error occurred.'
): string {
  const raw =
    err instanceof Error
      ? err.message
      : typeof err === 'string'
        ? err
        : err && typeof err === 'object' && 'message' in err && typeof err.message === 'string'
          ? err.message
          : '';

  const trimmed = raw.trim();
  if (!trimmed) return fallback;

  // Never dump raw HTML pages (e.g. Firebase Hosting index.html rewrites) into UI cards
  if (/^<!doctype\s+html/i.test(trimmed) || /<html[\s>]/i.test(trimmed)) {
    return 'Received an HTML page instead of JSON from the backend endpoint.';
  }

  // Redact JWTs, Bearer tokens, and URL query keys/secrets
  const redacted = trimmed
    .replace(/Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi, 'Bearer [REDACTED]')
    .replace(/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]*\b/g, '[REDACTED_JWT]')
    .replace(/([?&](?:apikey|key|token|secret)=)[^&\s]+/gi, '$1[REDACTED]');

  return redacted.length > 320 ? `${redacted.slice(0, 317)}...` : redacted;
}

export function parseAppearanceSettings(rawJson: string | null | undefined): AppearanceSettings {
  if (!rawJson) return { ...DEFAULT_APPEARANCE };
  try {
    const parsed = JSON.parse(rawJson) as unknown;
    if (!isRecord(parsed)) return { ...DEFAULT_APPEARANCE };

    const theme = VALID_THEMES.has(parsed.theme as ThemeMode)
      ? (parsed.theme as ThemeMode)
      : DEFAULT_APPEARANCE.theme;

    const wallpaper = VALID_WALLPAPERS.has(parsed.wallpaper as WallpaperId)
      ? (parsed.wallpaper as WallpaperId)
      : DEFAULT_APPEARANCE.wallpaper;

    const frostRaw = parsed.frost;
    const frost =
      typeof frostRaw === 'number' && Number.isFinite(frostRaw)
        ? Math.min(95, Math.max(20, Math.round(frostRaw)))
        : DEFAULT_APPEARANCE.frost;

    const collapsedRail =
      typeof parsed.collapsedRail === 'boolean'
        ? parsed.collapsedRail
        : DEFAULT_APPEARANCE.collapsedRail;

    return { theme, wallpaper, frost, collapsedRail };
  } catch {
    return { ...DEFAULT_APPEARANCE };
  }
}

export function normalizeDashboardMetrics(raw: unknown): DashboardMetrics {
  if (!isRecord(raw)) return { ...EMPTY_DASHBOARD_METRICS };
  return {
    totalServices: asNonNegativeInt(raw.totalServices),
    publishedServices: asNonNegativeInt(raw.publishedServices),
    totalEnquiries: asNonNegativeInt(raw.totalEnquiries),
    pendingEnquiries: asNonNegativeInt(raw.pendingEnquiries),
    publishedGovtUpdates: asNonNegativeInt(raw.publishedGovtUpdates),
    pendingGovtUpdates: asNonNegativeInt(raw.pendingGovtUpdates),
    galleryImages: asNonNegativeInt(raw.galleryImages),
    unreadNotifications: asNonNegativeInt(raw.unreadNotifications),
  };
}

export function normalizeDashboardOverviewPayload(raw: unknown): {
  metrics: DashboardMetrics;
  recentActivities: ActivityLogEntry[];
} {
  if (!isRecord(raw)) {
    return {
      metrics: { ...EMPTY_DASHBOARD_METRICS },
      recentActivities: [],
    };
  }
  return {
    metrics: normalizeDashboardMetrics(raw.metrics),
    recentActivities: asArray<ActivityLogEntry>(raw.recentActivities).filter(isRecord) as unknown as ActivityLogEntry[],
  };
}

export interface NormalizedCmsState {
  businessProfile: BusinessProfile | null;
  heroSection: HeroSection | null;
  ownerProfile: OwnerProfile | null;
  websiteSettings: WebsiteSettings | null;
  serviceCategories: ServiceCategory[];
  services: ServiceItem[];
  galleryItems: GalleryItem[];
  testimonials: TestimonialItem[];
  faqs: FaqItem[];
  referencePortraits: ReferencePortrait[];
  notifications: AdminNotification[];
}

export function normalizeCmsStatePayload(raw: unknown): NormalizedCmsState {
  if (!isRecord(raw)) {
    return {
      businessProfile: null,
      heroSection: null,
      ownerProfile: null,
      websiteSettings: null,
      serviceCategories: [],
      services: [],
      galleryItems: [],
      testimonials: [],
      faqs: [],
      referencePortraits: [],
      notifications: [],
    };
  }

  return {
    businessProfile: isRecord(raw.businessProfile)
      ? (raw.businessProfile as unknown as BusinessProfile)
      : null,
    heroSection: isRecord(raw.heroSection) ? (raw.heroSection as unknown as HeroSection) : null,
    ownerProfile: isRecord(raw.ownerProfile) ? (raw.ownerProfile as unknown as OwnerProfile) : null,
    websiteSettings: isRecord(raw.websiteSettings)
      ? (raw.websiteSettings as unknown as WebsiteSettings)
      : null,
    serviceCategories: asArray<ServiceCategory>(raw.serviceCategories).filter(isRecord) as unknown as ServiceCategory[],
    services: asArray<ServiceItem>(raw.services).filter(isRecord) as unknown as ServiceItem[],
    galleryItems: asArray<GalleryItem>(raw.galleryItems).filter(isRecord) as unknown as GalleryItem[],
    testimonials: asArray<TestimonialItem>(raw.testimonials).filter(isRecord) as unknown as TestimonialItem[],
    faqs: asArray<FaqItem>(raw.faqs).filter(isRecord) as unknown as FaqItem[],
    referencePortraits: asArray<ReferencePortrait>(raw.referencePortraits).filter(isRecord) as unknown as ReferencePortrait[],
    notifications: asArray<AdminNotification>(raw.notifications).filter(isRecord) as unknown as AdminNotification[],
  };
}

export function normalizeAccessStatePayload(raw: unknown): AccessStateSnapshot {
  if (!isRecord(raw)) {
    return { ...EMPTY_ACCESS_STATE };
  }
  return {
    roles: asArray<RoleRecord>(raw.roles).filter(isRecord) as unknown as RoleRecord[],
    permissions: asArray<PermissionRecord>(raw.permissions).filter(isRecord) as unknown as PermissionRecord[],
    rolePermissions: asArray<RolePermissionMapping>(raw.rolePermissions).filter(isRecord) as unknown as RolePermissionMapping[],
    users: asArray<AdminUserRecord>(raw.users).filter(isRecord) as unknown as AdminUserRecord[],
    loginLogs: asArray<LoginLogEntry>(raw.loginLogs).filter(isRecord) as unknown as LoginLogEntry[],
    auditLogs: asArray<ActivityLogEntry>(raw.auditLogs).filter(isRecord) as unknown as ActivityLogEntry[],
  };
}

export function normalizeEnquiriesPayload(raw: unknown): EnquiryItem[] {
  if (!isRecord(raw)) return [];
  return asArray<EnquiryItem>(raw.enquiries)
    .filter(isRecord)
    .map((item) => ({
      ...(item as unknown as EnquiryItem),
      notes: Array.isArray(item.notes) ? item.notes : [],
    }));
}

export function normalizeGovtStatePayload(raw: unknown): {
  sources: GovtSource[];
  updates: GovtUpdateItem[];
  fetchLogs: GovtFetchLog[];
} {
  if (!isRecord(raw)) {
    return { sources: [], updates: [], fetchLogs: [] };
  }
  return {
    sources: asArray<GovtSource>(raw.sources).filter(isRecord) as unknown as GovtSource[],
    updates: asArray<GovtUpdateItem>(raw.updates).filter(isRecord) as unknown as GovtUpdateItem[],
    fetchLogs: asArray<GovtFetchLog>(raw.fetchLogs).filter(isRecord) as unknown as GovtFetchLog[],
  };
}

/**
 * Resolves hash routes primarily, while safely mapping direct path navigations
 * such as `/admin`, `/admin/hardware`, or `/hardware` when hash is empty.
 */
export function parseLocationRoute(hash: string, pathname = ''): ParsedRoute {
  const cleanHash = hash.replace(/^#\/?/, '').trim();
  if (cleanHash) {
    return parseHash(hash);
  }
  const trimmedPath = pathname.replace(/^\/+|\/+$/g, '');
  if (!trimmedPath || trimmedPath === 'admin') {
    return { main: 'home' };
  }
  const withoutAdminPrefix = trimmedPath.startsWith('admin/')
    ? trimmedPath.slice('admin/'.length)
    : trimmedPath;
  return parseHash(`#/${withoutAdminPrefix}`);
}
