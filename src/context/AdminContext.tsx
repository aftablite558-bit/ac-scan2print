import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { ApiError, apiRequest } from '../lib/api';
import {
  getCurrentFirebaseIdToken,
  initFirebaseTelemetry,
  isFirebaseClientConfigured,
  registerFcmPushNotifications,
  sendFirebasePasswordReset,
  signInWithFirebaseEmailPassword,
  signOutFirebase,
  subscribeFirebaseAuthState,
} from '../lib/firebase';
import {
  canAccessAdminRoute,
  createAdminSessionFromBackend,
  invokeProtectedEdgeFunction,
  ProtectedEdgeApiError,
  verifyAdminAccessWithBackend,
} from '../lib/scan2printAdmin';
import { isSupabaseClientConfigured, subscribeAdminRealtime } from '../lib/supabase';
import type {
  ActivityLogEntry,
  AdminNotification,
  AdminUserRecord,
  AdminUserSession,
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
  IntegrationStatus,
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
  WebsiteSettings,
} from '../types/admin';
import {
  getPageTitle,
  hasPermission,
  parseHash,
  type ParsedRoute,
} from '../utils/adminLogic';
import { performThemeTransition } from '../utils/animations';
import {
  EMPTY_ACCESS_STATE,
  EMPTY_DASHBOARD_METRICS,
  normalizeAccessStatePayload,
  normalizeCmsStatePayload,
  normalizeDashboardOverviewPayload,
  normalizeEnquiriesPayload,
  normalizeGovtStatePayload,
  parseAppearanceSettings,
  parseLocationRoute,
  sanitizeErrorMessage,
} from '../utils/workspaceState';

const APPEARANCE_KEY = 'aman-computer-appearance-v1';

export type ModalState =
  | { type: 'search' }
  | { type: 'shortcuts' }
  | null;

export interface ToastState {
  id: number;
  text: string;
  tone?: 'good' | 'bad';
  onUndo?: () => void;
}

export interface AccessStateSnapshot {
  roles: RoleRecord[];
  permissions: PermissionRecord[];
  rolePermissions: RolePermissionMapping[];
  users: AdminUserRecord[];
  loginLogs: LoginLogEntry[];
  auditLogs: ActivityLogEntry[];
}

interface AdminContextValue {
  authLoading: boolean;
  authError: string | null;
  dataLoading: boolean;
  needsBootstrap: boolean;
  integrations: IntegrationStatus;
  currentUser: AdminUserSession | null;
  appearance: AppearanceSettings;
  resolvedTheme: 'light' | 'dark';
  route: ParsedRoute;
  navigate: (href: string) => void;
  modal: ModalState;
  setModal: (m: ModalState) => void;
  toast: ToastState | null;
  showToast: (text: string, toneOrUndo?: 'good' | 'bad' | (() => void)) => void;
  dismissToast: () => void;
  updateAppearance: (patch: Partial<AppearanceSettings>, anchorEl?: HTMLElement | null) => void;
  setTheme: (theme: ThemeMode, anchorEl?: HTMLElement | null) => void;
  toggleTheme: (anchorEl?: HTMLElement | null) => void;
  can: (permissionCode: string) => boolean;

  // Auth & Protected Backend actions
  bootstrapSuperAdmin: (input: {
    fullName: string;
    email: string;
    password: string;
    designation?: string;
  }) => Promise<void>;
  login: (email: string, password: string, rememberSession?: boolean) => Promise<void>;
  logout: () => Promise<void>;
  forgotPassword: (email: string) => Promise<string>;
  resetPassword: (token: string, newPassword: string) => Promise<string>;
  refreshAll: () => Promise<void>;
  invokeAdminEdgeFunction: <T>(functionName: string, body?: unknown) => Promise<T>;

  // Live backend domain state
  metrics: DashboardMetrics;
  recentActivities: ActivityLogEntry[];
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
  enquiries: EnquiryItem[];
  govtSources: GovtSource[];
  govtUpdates: GovtUpdateItem[];
  govtFetchLogs: GovtFetchLog[];
  accessState: AccessStateSnapshot;
  fcmStatus: { registered: boolean; message?: string };

  // Mutations
  uploadFile: (
    bucket: 'business-assets' | 'owner-portraits' | 'gallery-media' | 'govt-media',
    file: File
  ) => Promise<{ url: string; sizeBytes: number; mime: string }>;
  saveBusinessProfile: (payload: BusinessProfile) => Promise<void>;
  saveHeroSection: (payload: HeroSection) => Promise<void>;
  saveOwnerProfile: (payload: OwnerProfile) => Promise<void>;
  saveWebsiteSettings: (payload: WebsiteSettings) => Promise<void>;
  uploadReferencePortrait: (file: File, bgRemovalEnabled: boolean) => Promise<ReferencePortrait>;
  retryReferencePortrait: (id: string, bgRemovalEnabled?: boolean) => Promise<ReferencePortrait>;
  approveReferencePortrait: (id: string) => Promise<void>;
  createService: (payload: Partial<ServiceItem>) => Promise<void>;
  updateService: (id: string, payload: Partial<ServiceItem>) => Promise<void>;
  deleteService: (id: string) => Promise<void>;
  createGalleryItem: (payload: Partial<GalleryItem>) => Promise<void>;
  updateGalleryItem: (id: string, payload: Partial<GalleryItem>) => Promise<void>;
  deleteGalleryItem: (id: string) => Promise<void>;
  createTestimonial: (payload: Partial<TestimonialItem>) => Promise<void>;
  updateTestimonial: (id: string, payload: Partial<TestimonialItem>) => Promise<void>;
  deleteTestimonial: (id: string) => Promise<void>;
  createFaq: (payload: Partial<FaqItem>) => Promise<void>;
  updateFaq: (id: string, payload: Partial<FaqItem>) => Promise<void>;
  deleteFaq: (id: string) => Promise<void>;
  createEnquiry: (payload: Partial<EnquiryItem>) => Promise<void>;
  updateEnquiryStatus: (id: string, status: EnquiryItem['status']) => Promise<void>;
  addEnquiryNote: (id: string, note: string) => Promise<void>;
  createGovtSource: (payload: Partial<GovtSource>) => Promise<void>;
  updateGovtSource: (id: string, payload: Partial<GovtSource>) => Promise<void>;
  triggerGovtFetch: (sourceId?: string) => Promise<void>;
  updateGovtUpdate: (
    id: string,
    payload: Partial<Pick<GovtUpdateItem, 'title' | 'description' | 'category' | 'expires_at' | 'status'>>
  ) => Promise<void>;
  summarizeGovtHindi: (id: string) => Promise<string>;
  sweepExpiredGovtUpdates: () => Promise<number>;
  createAdminUser: (input: {
    fullName: string;
    email: string;
    designation: string;
    roleId: string;
    password: string;
  }) => Promise<void>;
  updateAdminUser: (
    id: string,
    patch: { roleId?: string; isActive?: boolean; designation?: string }
  ) => Promise<void>;
  issueResetToken: (id: string) => Promise<{ token: string; expiresInMinutes: number }>;
  updateRolePermissions: (roleId: string, permissionCodes: string[]) => Promise<void>;
  markNotificationRead: (id: string) => Promise<void>;
  markAllNotificationsRead: () => Promise<void>;
  registerFcm: () => Promise<void>;
  exportDatabaseJson: () => Promise<void>;
}

const EMPTY_METRICS: DashboardMetrics = EMPTY_DASHBOARD_METRICS;
const EMPTY_ACCESS: AccessStateSnapshot = EMPTY_ACCESS_STATE;

function loadAppearance(): AppearanceSettings {
  try {
    return parseAppearanceSettings(localStorage.getItem(APPEARANCE_KEY));
  } catch {
    return parseAppearanceSettings(null);
  }
}

const AdminContext = createContext<AdminContextValue | null>(null);

export const AdminProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [dataLoading, setDataLoading] = useState(false);
  const needsBootstrap = false;
  const [integrations, setIntegrations] = useState<IntegrationStatus>({
    supabaseConfigured: isSupabaseClientConfigured,
    firebaseConfigured: isFirebaseClientConfigured,
    fcmServerConfigured: false,
    birefnetConfigured: false,
    geminiConfigured: false,
  });
  const [currentUser, setCurrentUser] = useState<AdminUserSession | null>(null);
  const currentUserRef = useRef<AdminUserSession | null>(null);
  const loadedWorkspaceUidRef = useRef<string | null>(null);
  const inFlightVerifyRef = useRef<{
    uid: string;
    promise: Promise<AdminUserSession>;
  } | null>(null);
  const loggedStaticFallbackRef = useRef(false);
  const [appearance, setAppearance] = useState<AppearanceSettings>(loadAppearance);
  const [systemDark, setSystemDark] = useState<boolean>(() =>
    typeof window !== 'undefined'
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
      : true
  );
  const [route, setRoute] = useState<ParsedRoute>(() =>
    parseLocationRoute(
      typeof window !== 'undefined' ? window.location.hash : '#/home',
      typeof window !== 'undefined' ? window.location.pathname : ''
    )
  );
  const [modal, setModal] = useState<ModalState>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const toastTimerRef = useRef<number | null>(null);

  const [metrics, setMetrics] = useState<DashboardMetrics>(EMPTY_METRICS);
  const [recentActivities, setRecentActivities] = useState<ActivityLogEntry[]>([]);
  const [businessProfile, setBusinessProfile] = useState<BusinessProfile | null>(null);
  const [heroSection, setHeroSection] = useState<HeroSection | null>(null);
  const [ownerProfile, setOwnerProfile] = useState<OwnerProfile | null>(null);
  const [websiteSettings, setWebsiteSettings] = useState<WebsiteSettings | null>(null);
  const [serviceCategories, setServiceCategories] = useState<ServiceCategory[]>([]);
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [galleryItems, setGalleryItems] = useState<GalleryItem[]>([]);
  const [testimonials, setTestimonials] = useState<TestimonialItem[]>([]);
  const [faqs, setFaqs] = useState<FaqItem[]>([]);
  const [referencePortraits, setReferencePortraits] = useState<ReferencePortrait[]>([]);
  const [notifications, setNotifications] = useState<AdminNotification[]>([]);
  const [enquiries, setEnquiries] = useState<EnquiryItem[]>([]);
  const [govtSources, setGovtSources] = useState<GovtSource[]>([]);
  const [govtUpdates, setGovtUpdates] = useState<GovtUpdateItem[]>([]);
  const [govtFetchLogs, setGovtFetchLogs] = useState<GovtFetchLog[]>([]);
  const [accessState, setAccessState] = useState<AccessStateSnapshot>(EMPTY_ACCESS);
  const [fcmStatus, setFcmStatus] = useState<{ registered: boolean; message?: string }>({
    registered: false,
  });

  const showToast = useCallback(
    (text: string, toneOrUndo?: 'good' | 'bad' | (() => void)) => {
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
      const tone = typeof toneOrUndo === 'string' ? toneOrUndo : 'good';
      const onUndo = typeof toneOrUndo === 'function' ? toneOrUndo : undefined;
      setToast({ id: Date.now(), text, tone, onUndo });
      toastTimerRef.current = window.setTimeout(() => {
        setToast(null);
      }, 4500);
    },
    []
  );

  const dismissToast = useCallback(() => {
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    setToast(null);
  }, []);

  // Theme & Appearance side effects
  useEffect(() => {
    try {
      localStorage.setItem(APPEARANCE_KEY, JSON.stringify(appearance));
    } catch {
      // ignore
    }
  }, [appearance]);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const resolvedTheme: 'light' | 'dark' =
    appearance.theme === 'system'
      ? systemDark
        ? 'dark'
        : 'light'
      : appearance.theme;

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', resolvedTheme);
    document.documentElement.style.setProperty(
      '--frost',
      (appearance.frost / 100).toFixed(2)
    );
  }, [resolvedTheme, appearance.frost]);

  // Hash + path routing
  useEffect(() => {
    const onLocationChange = () => {
      setRoute(parseLocationRoute(window.location.hash, window.location.pathname));
    };
    window.addEventListener('hashchange', onLocationChange);
    window.addEventListener('popstate', onLocationChange);
    return () => {
      window.removeEventListener('hashchange', onLocationChange);
      window.removeEventListener('popstate', onLocationChange);
    };
  }, []);

  useEffect(() => {
    document.title = getPageTitle(route);
  }, [route]);

  const navigate = useCallback((href: string) => {
    const target = href.startsWith('#') ? href : `#${href}`;
    if (window.location.hash !== target) {
      window.location.hash = target;
    } else {
      setRoute(parseHash(target));
    }
  }, []);

  const updateAppearance = useCallback(
    (patch: Partial<AppearanceSettings>, anchorEl?: HTMLElement | null) => {
      if (patch.theme !== undefined) {
        performThemeTransition(() => {
          setAppearance((prev) => ({ ...prev, ...patch }));
        }, anchorEl);
      } else {
        setAppearance((prev) => ({ ...prev, ...patch }));
      }
    },
    []
  );

  const setTheme = useCallback(
    (theme: ThemeMode, anchorEl?: HTMLElement | null) => {
      updateAppearance({ theme }, anchorEl);
    },
    [updateAppearance]
  );

  const toggleTheme = useCallback(
    (anchorEl?: HTMLElement | null) => {
      const next: ThemeMode = resolvedTheme === 'dark' ? 'light' : 'dark';
      updateAppearance({ theme: next }, anchorEl);
    },
    [resolvedTheme, updateAppearance]
  );

  const can = useCallback(
    (code: string) => hasPermission(currentUser, code),
    [currentUser]
  );

  const verifyFirebaseSession = useCallback(
    async (
      uid: string,
      getIdToken: (forceRefresh?: boolean) => Promise<string | null>
    ): Promise<AdminUserSession> => {
      const existing = inFlightVerifyRef.current;
      if (existing && existing.uid === uid) {
        return existing.promise;
      }

      const promise = (async () => {
        const verified = await verifyAdminAccessWithBackend({ getIdToken });
        const sessionUser = createAdminSessionFromBackend(verified.admin);
        if (!canAccessAdminRoute(sessionUser)) {
          throw new ProtectedEdgeApiError(
            403,
            'FORBIDDEN',
            'Admin session has no active dashboard permissions.'
          );
        }
        return sessionUser;
      })().finally(() => {
        if (inFlightVerifyRef.current?.promise === promise) {
          inFlightVerifyRef.current = null;
        }
      });

      inFlightVerifyRef.current = { uid, promise };
      return promise;
    },
    []
  );

  const loadWorkspaceData = useCallback(async (user: AdminUserSession) => {
    setDataLoading(true);
    try {
      const overviewPromise = apiRequest('/dashboard/overview');
      const cmsPromise = apiRequest('/cms/state');
      const accessPromise = apiRequest('/access/state');
      const enquiriesPromise = hasPermission(user, 'enquiries.read')
        ? apiRequest('/enquiries')
        : Promise.resolve({ enquiries: [] });
      const govtPromise = hasPermission(user, 'govt.read')
        ? apiRequest('/govt/state')
        : Promise.resolve({ sources: [], updates: [], fetchLogs: [] });

      const [overviewRes, cmsRes, accessRes, enquiriesRes, govtRes] = await Promise.allSettled([
        overviewPromise,
        cmsPromise,
        accessPromise,
        enquiriesPromise,
        govtPromise,
      ]);

      if (overviewRes.status === 'fulfilled') {
        const normalized = normalizeDashboardOverviewPayload(overviewRes.value);
        setMetrics(normalized.metrics);
        setRecentActivities(normalized.recentActivities);
      }

      if (cmsRes.status === 'fulfilled') {
        const normalized = normalizeCmsStatePayload(cmsRes.value);
        setBusinessProfile(normalized.businessProfile);
        setHeroSection(normalized.heroSection);
        setOwnerProfile(normalized.ownerProfile);
        setWebsiteSettings(normalized.websiteSettings);
        setServiceCategories(normalized.serviceCategories);
        setServices(normalized.services);
        setGalleryItems(normalized.galleryItems);
        setTestimonials(normalized.testimonials);
        setFaqs(normalized.faqs);
        setReferencePortraits(normalized.referencePortraits);
        setNotifications(normalized.notifications);
      }

      if (accessRes.status === 'fulfilled') {
        setAccessState(normalizeAccessStatePayload(accessRes.value));
      }

      if (enquiriesRes.status === 'fulfilled') {
        setEnquiries(normalizeEnquiriesPayload(enquiriesRes.value));
      }

      if (govtRes.status === 'fulfilled') {
        const normalized = normalizeGovtStatePayload(govtRes.value);
        setGovtSources(normalized.sources);
        setGovtUpdates(normalized.updates);
        setGovtFetchLogs(normalized.fetchLogs);
      }

      const settled = [overviewRes, cmsRes, accessRes, enquiriesRes, govtRes];
      for (const result of settled) {
        if (result.status !== 'rejected') continue;
        const reason = result.reason;
        if (reason instanceof ApiError && (reason.isNonJson || reason.status === 404)) {
          if (!loggedStaticFallbackRef.current) {
            loggedStaticFallbackRef.current = true;
            console.info(
              '[AMAN COMPUTER Admin] Local Express CMS endpoints (/api/*) are inactive on static Firebase Hosting; operating in Supabase Edge + Firebase mode.'
            );
          }
        } else {
          console.error(
            '[AMAN COMPUTER Admin] Workspace loader error:',
            sanitizeErrorMessage(reason, 'Failed to load optional CMS workspace data.')
          );
        }
      }
    } catch (err) {
      console.error(
        '[AMAN COMPUTER Admin] Unexpected workspace load error:',
        sanitizeErrorMessage(err)
      );
    } finally {
      setDataLoading(false);
    }
  }, []);

  const refreshAll = useCallback(async () => {
    if (!currentUser) return;
    await loadWorkspaceData(currentUser);
  }, [currentUser, loadWorkspaceData]);

  // Initial Firebase Authentication + Supabase Backend Admin Verification
  useEffect(() => {
    let active = true;

    const handleBackendUnauthorized = async (message?: string) => {
      inFlightVerifyRef.current = null;
      loadedWorkspaceUidRef.current = null;
      currentUserRef.current = null;
      await signOutFirebase().catch(() => {});
      if (!active) return;
      setCurrentUser(null);
      setModal(null);
      if (message) {
        setAuthError(sanitizeErrorMessage(message));
      }
    };

    const unsubscribe = subscribeFirebaseAuthState((firebaseUser) => {
      if (!active) return;

      if (!firebaseUser) {
        inFlightVerifyRef.current = null;
        loadedWorkspaceUidRef.current = null;
        currentUserRef.current = null;
        setCurrentUser(null);
        setAuthLoading(false);
        return;
      }

      const alreadyLoadedForUid =
        currentUserRef.current !== null && loadedWorkspaceUidRef.current === firebaseUser.uid;

      void (async () => {
        try {
          const sessionUser = await verifyFirebaseSession(firebaseUser.uid, (forceRefresh) =>
            firebaseUser.getIdToken(forceRefresh)
          );
          if (!active) return;
          currentUserRef.current = sessionUser;
          setAuthError(null);
          setCurrentUser(sessionUser);

          if (!alreadyLoadedForUid && loadedWorkspaceUidRef.current !== firebaseUser.uid) {
            loadedWorkspaceUidRef.current = firebaseUser.uid;
            await loadWorkspaceData(sessionUser);
          }
        } catch (err) {
          if (!active) return;
          const sanitized = sanitizeErrorMessage(
            err,
            'Supabase backend rejected Admin authorization for this Firebase account.'
          );
          console.error('[AMAN COMPUTER Admin Auth]', sanitized);
          const isAuthRejection =
            err instanceof ProtectedEdgeApiError && (err.status === 401 || err.status === 403);
          if (!alreadyLoadedForUid || isAuthRejection) {
            await handleBackendUnauthorized(sanitized);
          }
        } finally {
          if (active) setAuthLoading(false);
        }
      })();
    });

    // Load optional local server integration status if dev backend is running (no auth dependency)
    void apiRequest<{ integrations: IntegrationStatus }>('/auth/bootstrap-status')
      .then((res) => {
        if (active && res?.integrations) {
          setIntegrations({
            ...res.integrations,
            supabaseConfigured: isSupabaseClientConfigured,
            firebaseConfigured: isFirebaseClientConfigured,
          });
        }
      })
      .catch((err) => {
        if (err instanceof ApiError && (err.isNonJson || err.status === 404)) {
          return;
        }
        console.info(
          '[AMAN COMPUTER Admin] Bootstrap status check skipped:',
          sanitizeErrorMessage(err)
        );
      });

    void initFirebaseTelemetry();

    return () => {
      active = false;
      unsubscribe();
    };
  }, [loadWorkspaceData, verifyFirebaseSession]);

  // Optional Supabase Realtime Sync
  useEffect(() => {
    if (!currentUser) return;
    const unsub = subscribeAdminRealtime(() => {
      void loadWorkspaceData(currentUser);
    });
    return unsub;
  }, [currentUser, loadWorkspaceData]);

  // Keyboard shortcuts
  useEffect(() => {
    if (!currentUser) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isInput =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable);

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setModal((m) => (m?.type === 'search' ? null : { type: 'search' }));
        return;
      }
      if (e.key === 'Escape') {
        setModal(null);
        return;
      }
      if (isInput) return;

      if (e.key === '[') {
        e.preventDefault();
        updateAppearance({ collapsedRail: !appearance.collapsedRail });
      } else if (e.key === '?') {
        e.preventDefault();
        setModal({ type: 'shortcuts' });
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [currentUser, appearance.collapsedRail, updateAppearance]);

  // Auth Methods (Firebase Email/Password + Authoritative Supabase Backend Verification)
  const bootstrapSuperAdmin = useCallback(async () => {
    throw new Error(
      'Public admin provisioning is disabled. The single authorized Admin account must be configured via Firebase Console and backend bootstrap.'
    );
  }, []);

  const login = useCallback(
    async (email: string, password: string, rememberSession = true) => {
      setAuthError(null);
      const firebaseUser = await signInWithFirebaseEmailPassword(email, password, rememberSession);
      try {
        const sessionUser = await verifyFirebaseSession(firebaseUser.uid, (forceRefresh) =>
          firebaseUser.getIdToken(forceRefresh)
        );
        currentUserRef.current = sessionUser;
        setAuthError(null);
        setCurrentUser(sessionUser);
        if (loadedWorkspaceUidRef.current !== firebaseUser.uid) {
          loadedWorkspaceUidRef.current = firebaseUser.uid;
          await loadWorkspaceData(sessionUser);
        }
        showToast(`Signed in as ${sessionUser.fullName}`);
      } catch (err) {
        inFlightVerifyRef.current = null;
        loadedWorkspaceUidRef.current = null;
        currentUserRef.current = null;
        await signOutFirebase().catch(() => {});
        setCurrentUser(null);
        const msg = sanitizeErrorMessage(
          err,
          'Unauthorized: Supabase backend rejected Admin access.'
        );
        console.error('[AMAN COMPUTER Admin Login]', msg);
        setAuthError(msg);
        throw new Error(msg);
      }
    },
    [loadWorkspaceData, showToast, verifyFirebaseSession]
  );

  const logout = useCallback(async () => {
    inFlightVerifyRef.current = null;
    loadedWorkspaceUidRef.current = null;
    currentUserRef.current = null;
    await signOutFirebase().catch(() => {});
    await apiRequest<{ ok: boolean }>('/auth/logout', { method: 'POST' }).catch(() => {});
    setCurrentUser(null);
    setAuthError(null);
    setModal(null);
    showToast('Session signed out');
  }, [showToast]);

  const forgotPassword = useCallback(async (email: string) => {
    await sendFirebasePasswordReset(email);
    return `Password reset email sent to ${email.trim()} via Firebase Authentication.`;
  }, []);

  const resetPassword = useCallback(async () => {
    return 'Use the password reset link sent to your Admin email via Firebase Authentication.';
  }, []);

  const invokeAdminEdgeFunction = useCallback(
    async <T,>(functionName: string, body?: unknown): Promise<T> => {
      return invokeProtectedEdgeFunction<T>(functionName, {
        method: 'POST',
        body,
        getIdToken: (forceRefresh) => getCurrentFirebaseIdToken(Boolean(forceRefresh)),
        onUnauthorized: async (err) => {
          inFlightVerifyRef.current = null;
          loadedWorkspaceUidRef.current = null;
          currentUserRef.current = null;
          await signOutFirebase().catch(() => {});
          setCurrentUser(null);
          setModal(null);
          setAuthError(sanitizeErrorMessage(err));
        },
      });
    },
    []
  );

  // File Uploads
  const uploadFile = useCallback(
    async (
      bucket: 'business-assets' | 'owner-portraits' | 'gallery-media' | 'govt-media',
      file: File
    ) => {
      const fd = new FormData();
      fd.append('file', file);
      return apiRequest<{ url: string; sizeBytes: number; mime: string }>(`/upload/${bucket}`, {
        method: 'POST',
        body: fd,
      });
    },
    []
  );

  // CMS Mutations
  const saveBusinessProfile = useCallback(
    async (payload: BusinessProfile) => {
      await apiRequest('/cms/business', { method: 'PUT', body: JSON.stringify(payload) });
      await refreshAll();
      showToast('Business profile saved');
    },
    [refreshAll, showToast]
  );

  const saveHeroSection = useCallback(
    async (payload: HeroSection) => {
      await apiRequest('/cms/hero', { method: 'PUT', body: JSON.stringify(payload) });
      await refreshAll();
      showToast('Hero section saved');
    },
    [refreshAll, showToast]
  );

  const saveOwnerProfile = useCallback(
    async (payload: OwnerProfile) => {
      await apiRequest('/cms/owner', { method: 'PUT', body: JSON.stringify(payload) });
      await refreshAll();
      showToast('Owner profile saved');
    },
    [refreshAll, showToast]
  );

  const saveWebsiteSettings = useCallback(
    async (payload: WebsiteSettings) => {
      await apiRequest('/cms/website-settings', {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
      await refreshAll();
      showToast('Website settings saved');
    },
    [refreshAll, showToast]
  );

  const uploadReferencePortrait = useCallback(
    async (file: File, bgRemovalEnabled: boolean) => {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('bgRemovalEnabled', String(bgRemovalEnabled));
      const res = await apiRequest<ReferencePortrait>('/portraits/upload', {
        method: 'POST',
        body: fd,
      });
      await refreshAll();
      if (res.processing_status === 'failed') {
        showToast(res.error_message || 'Background removal failed; original preserved', 'bad');
      } else {
        showToast('Reference portrait processed');
      }
      return res;
    },
    [refreshAll, showToast]
  );

  const retryReferencePortrait = useCallback(
    async (id: string, bgRemovalEnabled?: boolean) => {
      const res = await apiRequest<ReferencePortrait>(`/portraits/${id}/retry`, {
        method: 'POST',
        body: JSON.stringify(
          typeof bgRemovalEnabled === 'boolean' ? { bgRemovalEnabled } : {}
        ),
      });
      await refreshAll();
      if (res.processing_status === 'failed') {
        showToast(res.error_message || 'BiRefNet background removal failed', 'bad');
      } else {
        showToast('Portrait updated');
      }
      return res;
    },
    [refreshAll, showToast]
  );

  const approveReferencePortrait = useCallback(
    async (id: string) => {
      await apiRequest(`/portraits/${id}/approve`, { method: 'POST' });
      await refreshAll();
      showToast('Approved & synced to Owner Profile and Hero Section');
    },
    [refreshAll, showToast]
  );

  const createService = useCallback(
    async (payload: Partial<ServiceItem>) => {
      await apiRequest('/cms/services', { method: 'POST', body: JSON.stringify(payload) });
      await refreshAll();
      showToast('Service created');
    },
    [refreshAll, showToast]
  );

  const updateService = useCallback(
    async (id: string, payload: Partial<ServiceItem>) => {
      await apiRequest(`/cms/services/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
      await refreshAll();
      showToast('Service updated');
    },
    [refreshAll, showToast]
  );

  const deleteService = useCallback(
    async (id: string) => {
      await apiRequest(`/cms/services/${id}`, { method: 'DELETE' });
      await refreshAll();
      showToast('Service deleted');
    },
    [refreshAll, showToast]
  );

  const createGalleryItem = useCallback(
    async (payload: Partial<GalleryItem>) => {
      await apiRequest('/cms/gallery', { method: 'POST', body: JSON.stringify(payload) });
      await refreshAll();
      showToast('Gallery item saved');
    },
    [refreshAll, showToast]
  );

  const updateGalleryItem = useCallback(
    async (id: string, payload: Partial<GalleryItem>) => {
      await apiRequest(`/cms/gallery/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
      await refreshAll();
      showToast('Gallery item updated');
    },
    [refreshAll, showToast]
  );

  const deleteGalleryItem = useCallback(
    async (id: string) => {
      await apiRequest(`/cms/gallery/${id}`, { method: 'DELETE' });
      await refreshAll();
      showToast('Gallery item deleted');
    },
    [refreshAll, showToast]
  );

  const createTestimonial = useCallback(
    async (payload: Partial<TestimonialItem>) => {
      await apiRequest('/cms/testimonials', { method: 'POST', body: JSON.stringify(payload) });
      await refreshAll();
      showToast('Testimonial added');
    },
    [refreshAll, showToast]
  );

  const updateTestimonial = useCallback(
    async (id: string, payload: Partial<TestimonialItem>) => {
      await apiRequest(`/cms/testimonials/${id}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
      await refreshAll();
      showToast('Testimonial updated');
    },
    [refreshAll, showToast]
  );

  const deleteTestimonial = useCallback(
    async (id: string) => {
      await apiRequest(`/cms/testimonials/${id}`, { method: 'DELETE' });
      await refreshAll();
      showToast('Testimonial removed');
    },
    [refreshAll, showToast]
  );

  const createFaq = useCallback(
    async (payload: Partial<FaqItem>) => {
      await apiRequest('/cms/faqs', { method: 'POST', body: JSON.stringify(payload) });
      await refreshAll();
      showToast('FAQ created');
    },
    [refreshAll, showToast]
  );

  const updateFaq = useCallback(
    async (id: string, payload: Partial<FaqItem>) => {
      await apiRequest(`/cms/faqs/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
      await refreshAll();
      showToast('FAQ updated');
    },
    [refreshAll, showToast]
  );

  const deleteFaq = useCallback(
    async (id: string) => {
      await apiRequest(`/cms/faqs/${id}`, { method: 'DELETE' });
      await refreshAll();
      showToast('FAQ deleted');
    },
    [refreshAll, showToast]
  );

  const createEnquiry = useCallback(
    async (payload: Partial<EnquiryItem>) => {
      await apiRequest('/enquiries', { method: 'POST', body: JSON.stringify(payload) });
      await refreshAll();
      showToast('Enquiry logged');
    },
    [refreshAll, showToast]
  );

  const updateEnquiryStatus = useCallback(
    async (id: string, status: EnquiryItem['status']) => {
      await apiRequest(`/enquiries/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      await refreshAll();
      showToast(`Enquiry marked ${status.replace('_', ' ')}`);
    },
    [refreshAll, showToast]
  );

  const addEnquiryNote = useCallback(
    async (id: string, note: string) => {
      await apiRequest(`/enquiries/${id}/notes`, {
        method: 'POST',
        body: JSON.stringify({ note }),
      });
      await refreshAll();
      showToast('Admin note added');
    },
    [refreshAll, showToast]
  );

  const createGovtSource = useCallback(
    async (payload: Partial<GovtSource>) => {
      await apiRequest('/govt/sources', { method: 'POST', body: JSON.stringify(payload) });
      await refreshAll();
      showToast('Government source added');
    },
    [refreshAll, showToast]
  );

  const updateGovtSource = useCallback(
    async (id: string, payload: Partial<GovtSource>) => {
      await apiRequest(`/govt/sources/${id}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
      await refreshAll();
      showToast('Source settings updated');
    },
    [refreshAll, showToast]
  );

  const triggerGovtFetch = useCallback(
    async (sourceId?: string) => {
      const res = await apiRequest<{
        ok: boolean;
        results: Array<{ status: string; itemsInserted: number; duplicatesSkipped: number }>;
      }>('/govt/fetch', {
        method: 'POST',
        body: JSON.stringify(sourceId ? { sourceId } : {}),
      });
      await refreshAll();
      const results = Array.isArray(res?.results) ? res.results : [];
      const totalInserted = results.reduce((s, r) => s + (r?.itemsInserted || 0), 0);
      const errors = results.filter((r) => r?.status === 'error').length;
      if (errors > 0 && totalInserted === 0) {
        showToast(`Fetch finished with ${errors} portal error(s); check Fetch Logs`, 'bad');
      } else {
        showToast(`Fetch complete: ${totalInserted} new notice(s) captured`);
      }
    },
    [refreshAll, showToast]
  );

  const updateGovtUpdate = useCallback(
    async (
      id: string,
      payload: Partial<
        Pick<GovtUpdateItem, 'title' | 'description' | 'category' | 'expires_at' | 'status'>
      >
    ) => {
      await apiRequest(`/govt/updates/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
      await refreshAll();
      showToast('Government notice updated');
    },
    [refreshAll, showToast]
  );

  const summarizeGovtHindi = useCallback(
    async (id: string) => {
      const res = await apiRequest<{ ok: boolean; hindiSummary: string }>(
        `/govt/updates/${id}/summarize-hindi`,
        { method: 'POST' }
      );
      await refreshAll();
      showToast('Hindi summary generated via Gemini');
      return res.hindiSummary;
    },
    [refreshAll, showToast]
  );

  const sweepExpiredGovtUpdates = useCallback(async () => {
    const res = await apiRequest<{ ok: boolean; expiredCount: number }>(
      '/govt/updates/expire-sweep',
      { method: 'POST' }
    );
    await refreshAll();
    showToast(`Expired ${res.expiredCount} outdated notice(s)`);
    return res.expiredCount;
  }, [refreshAll, showToast]);

  const createAdminUser = useCallback(async () => {
    throw new Error(
      'Single-admin policy active: creating additional Admin accounts is permanently disabled.'
    );
  }, []);

  const updateAdminUser = useCallback(
    async (id: string, patch: { roleId?: string; isActive?: boolean; designation?: string }) => {
      await apiRequest(`/access/users/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      });
      await refreshAll();
      showToast('Admin user updated');
    },
    [refreshAll, showToast]
  );

  const issueResetToken = useCallback(
    async (id: string) => {
      const res = await apiRequest<{ token: string; expiresInMinutes: number }>(
        `/access/users/${id}/reset-token`,
        { method: 'POST' }
      );
      await refreshAll();
      showToast('One-time password reset token generated');
      return res;
    },
    [refreshAll, showToast]
  );

  const updateRolePermissions = useCallback(
    async (roleId: string, permissionCodes: string[]) => {
      await apiRequest(`/access/roles/${roleId}/permissions`, {
        method: 'PATCH',
        body: JSON.stringify({ permissionCodes }),
      });
      await refreshAll();
      showToast('Role permissions updated');
    },
    [refreshAll, showToast]
  );

  const markNotificationRead = useCallback(
    async (id: string) => {
      await apiRequest(`/notifications/${id}/read`, { method: 'POST' });
      setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: 1 } : n)));
      setMetrics((m) => ({
        ...m,
        unreadNotifications: Math.max(0, m.unreadNotifications - 1),
      }));
    },
    []
  );

  const markAllNotificationsRead = useCallback(async () => {
    await apiRequest('/notifications/read-all', { method: 'POST' });
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: 1 })));
    setMetrics((m) => ({ ...m, unreadNotifications: 0 }));
    showToast('All notifications marked read');
  }, [showToast]);

  const registerFcm = useCallback(async () => {
    const res = await registerFcmPushNotifications((title, body) => {
      showToast(`${title}: ${body}`);
    });
    if (!res.ok || !res.token) {
      setFcmStatus({ registered: false, message: res.error });
      showToast(res.error || 'FCM push registration unavailable', 'bad');
      return;
    }
    await apiRequest('/notifications/fcm-token', {
      method: 'POST',
      body: JSON.stringify({ token: res.token, deviceLabel: navigator.userAgent.slice(0, 60) }),
    });
    setFcmStatus({ registered: true, message: 'Device subscribed to FCM push alerts' });
    showToast('FCM Push Notifications enabled');
  }, [showToast]);

  const exportDatabaseJson = useCallback(async () => {
    const data = await apiRequest<Record<string, unknown>>('/system/export');
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `aman-computer-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Workspace database JSON exported');
  }, [showToast]);

  const value = useMemo<AdminContextValue>(
    () => ({
      authLoading,
      authError,
      dataLoading,
      needsBootstrap,
      integrations,
      currentUser,
      appearance,
      resolvedTheme,
      route,
      navigate,
      modal,
      setModal,
      toast,
      showToast,
      dismissToast,
      updateAppearance,
      setTheme,
      toggleTheme,
      can,
      bootstrapSuperAdmin,
      login,
      logout,
      forgotPassword,
      resetPassword,
      refreshAll,
      invokeAdminEdgeFunction,
      metrics,
      recentActivities,
      businessProfile,
      heroSection,
      ownerProfile,
      websiteSettings,
      serviceCategories,
      services,
      galleryItems,
      testimonials,
      faqs,
      referencePortraits,
      notifications,
      enquiries,
      govtSources,
      govtUpdates,
      govtFetchLogs,
      accessState,
      fcmStatus,
      uploadFile,
      saveBusinessProfile,
      saveHeroSection,
      saveOwnerProfile,
      saveWebsiteSettings,
      uploadReferencePortrait,
      retryReferencePortrait,
      approveReferencePortrait,
      createService,
      updateService,
      deleteService,
      createGalleryItem,
      updateGalleryItem,
      deleteGalleryItem,
      createTestimonial,
      updateTestimonial,
      deleteTestimonial,
      createFaq,
      updateFaq,
      deleteFaq,
      createEnquiry,
      updateEnquiryStatus,
      addEnquiryNote,
      createGovtSource,
      updateGovtSource,
      triggerGovtFetch,
      updateGovtUpdate,
      summarizeGovtHindi,
      sweepExpiredGovtUpdates,
      createAdminUser,
      updateAdminUser,
      issueResetToken,
      updateRolePermissions,
      markNotificationRead,
      markAllNotificationsRead,
      registerFcm,
      exportDatabaseJson,
    }),
    [
      authLoading,
      authError,
      dataLoading,
      needsBootstrap,
      integrations,
      currentUser,
      appearance,
      resolvedTheme,
      route,
      navigate,
      modal,
      toast,
      showToast,
      dismissToast,
      updateAppearance,
      setTheme,
      toggleTheme,
      can,
      bootstrapSuperAdmin,
      login,
      logout,
      forgotPassword,
      resetPassword,
      refreshAll,
      invokeAdminEdgeFunction,
      metrics,
      recentActivities,
      businessProfile,
      heroSection,
      ownerProfile,
      websiteSettings,
      serviceCategories,
      services,
      galleryItems,
      testimonials,
      faqs,
      referencePortraits,
      notifications,
      enquiries,
      govtSources,
      govtUpdates,
      govtFetchLogs,
      accessState,
      fcmStatus,
      uploadFile,
      saveBusinessProfile,
      saveHeroSection,
      saveOwnerProfile,
      saveWebsiteSettings,
      uploadReferencePortrait,
      retryReferencePortrait,
      approveReferencePortrait,
      createService,
      updateService,
      deleteService,
      createGalleryItem,
      updateGalleryItem,
      deleteGalleryItem,
      createTestimonial,
      updateTestimonial,
      deleteTestimonial,
      createFaq,
      updateFaq,
      deleteFaq,
      createEnquiry,
      updateEnquiryStatus,
      addEnquiryNote,
      createGovtSource,
      updateGovtSource,
      triggerGovtFetch,
      updateGovtUpdate,
      summarizeGovtHindi,
      sweepExpiredGovtUpdates,
      createAdminUser,
      updateAdminUser,
      issueResetToken,
      updateRolePermissions,
      markNotificationRead,
      markAllNotificationsRead,
      registerFcm,
      exportDatabaseJson,
    ]
  );

  return <AdminContext.Provider value={value}>{children}</AdminContext.Provider>;
};

export function useAdmin(): AdminContextValue {
  const ctx = useContext(AdminContext);
  if (!ctx) throw new Error('useAdmin must be used inside AdminProvider');
  return ctx;
}
