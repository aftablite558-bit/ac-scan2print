import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type {
  CustomerPortalApiAdapter,
  FinalizePrintUploadResponse,
} from '../api/CustomerPortalAdapter';
import { MockCustomerPortalAdapter } from '../api/mockCustomerAdapter';
import { SupabaseCustomerPortalAdapter } from '../api/supabaseCustomerAdapter';
import { validateCustomerSupabaseConfig } from '../lib/env';
import { parseCustomerRoute } from '../lib/pricing';
import {
  inspectClientFileBytes,
  parseCustomPageRange,
  validateClientDocumentFile,
} from '../lib/validation';
import type {
  CustomerRoute,
  PaymentMethod,
  PortalCapabilities,
  PrintPreferencesInput,
  PublicPaymentSettingsResponse,
  SelectedUploadFileItem,
  SubmissionConfirmationRecord,
} from '../types/portal';

const THEME_STORAGE_KEY = 'ac-scan2print-customer-theme';
const SESSION_CONFIRMATION_KEY = 'ac-scan2print-last-confirmation-v1';
const SESSION_TOKENS_KEY = 'ac-scan2print-recent-tokens-v1';

export type ThemeSetting = 'light' | 'dark' | 'system';

const DEFAULT_PREFERENCES: PrintPreferencesInput = {
  paperSize: 'A4',
  printMode: 'bw',
  printSides: 'single',
  copies: 1,
  orientation: 'auto',
  scaling: 'fit',
  requestedPageRange: 'all',
  customerName: '',
  customerPhone: '',
};

export interface RecentSessionJobRef {
  jobNumber: string;
  trackingToken: string;
  submittedAt: string;
}

interface PortalContextValue {
  adapter: CustomerPortalApiAdapter;
  isMockMode: boolean;
  route: CustomerRoute;
  searchParams: URLSearchParams;
  navigate: (pathWithQuery: string) => void;

  theme: ThemeSetting;
  resolvedTheme: 'light' | 'dark';
  toggleTheme: () => void;

  capabilities: PortalCapabilities | null;
  capabilitiesLoading: boolean;
  capabilitiesError: string | null;
  reloadCapabilities: () => Promise<void>;

  paymentSettings: PublicPaymentSettingsResponse | null;
  paymentSettingsLoading: boolean;

  selectedFiles: SelectedUploadFileItem[];
  fileAlertError: string | null;
  clearFileAlertError: () => void;
  addFiles: (files: FileList | File[]) => Promise<void>;
  removeFile: (localId: string) => void;
  retryFileUpload: (localId: string) => Promise<void>;

  preferences: PrintPreferencesInput;
  updatePreferences: (patch: Partial<PrintPreferencesInput>) => void;
  totalDetectedPages: number;
  effectivePagesPerCopy: number;

  submittingOrder: boolean;
  submitOrderError: string | null;
  confirmation: SubmissionConfirmationRecord | null;
  recentSessionJobs: RecentSessionJobRef[];
  submitPrintOrder: (paymentInput: {
    paymentMethod: PaymentMethod;
    utrReference?: string;
    evidenceFile?: File | null;
  }) => Promise<SubmissionConfirmationRecord>;
  startNewPrintOrder: () => void;
}

const PortalContext = createContext<PortalContextValue | null>(null);

function readInitialTheme(): ThemeSetting {
  if (typeof window === 'undefined') return 'light';
  const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
  return stored === 'dark' || stored === 'light' || stored === 'system' ? stored : 'light';
}

function readStoredConfirmation(): SubmissionConfirmationRecord | null {
  if (typeof window === 'undefined' || !window.sessionStorage) return null;
  try {
    const raw = window.sessionStorage.getItem(SESSION_CONFIRMATION_KEY);
    return raw ? (JSON.parse(raw) as SubmissionConfirmationRecord) : null;
  } catch {
    return null;
  }
}

function readRecentTokens(): RecentSessionJobRef[] {
  if (typeof window === 'undefined' || !window.sessionStorage) return [];
  try {
    const raw = window.sessionStorage.getItem(SESSION_TOKENS_KEY);
    return raw ? (JSON.parse(raw) as RecentSessionJobRef[]) : [];
  } catch {
    return [];
  }
}

function createCustomerPortalAdapter(): { adapter: CustomerPortalApiAdapter; configError: string | null } {
  const supa = validateCustomerSupabaseConfig();
  if (supa.error) {
    return { adapter: new MockCustomerPortalAdapter(), configError: supa.error };
  }
  if (supa.configured && supa.config) {
    return {
      adapter: new SupabaseCustomerPortalAdapter({
        supabaseUrl: supa.config.url,
        supabaseAnonKey: supa.config.anonKey,
      }),
      configError: null,
    };
  }
  return { adapter: new MockCustomerPortalAdapter(), configError: null };
}

export const PortalProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const adapterInitRef = useRef<{ adapter: CustomerPortalApiAdapter; configError: string | null } | null>(null);
  if (!adapterInitRef.current) {
    adapterInitRef.current = createCustomerPortalAdapter();
  }
  const adapter = adapterInitRef.current.adapter;
  const envConfigError = adapterInitRef.current.configError;

  const [pathname, setPathname] = useState<string>(() =>
    typeof window !== 'undefined' ? window.location.pathname : '/quick-print'
  );
  const [searchStr, setSearchStr] = useState<string>(() =>
    typeof window !== 'undefined' ? window.location.search : ''
  );

  const [theme, setTheme] = useState<ThemeSetting>(readInitialTheme);
  const [systemDark, setSystemDark] = useState<boolean>(() =>
    typeof window !== 'undefined'
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
      : false
  );

  const [capabilities, setCapabilities] = useState<PortalCapabilities | null>(null);
  const [capabilitiesLoading, setCapabilitiesLoading] = useState(true);
  const [capabilitiesError, setCapabilitiesError] = useState<string | null>(envConfigError);

  const [paymentSettings, setPaymentSettings] = useState<PublicPaymentSettingsResponse | null>(null);
  const [paymentSettingsLoading, setPaymentSettingsLoading] = useState(true);

  const [selectedFiles, setSelectedFiles] = useState<SelectedUploadFileItem[]>([]);
  const selectedFilesRef = useRef<SelectedUploadFileItem[]>(selectedFiles);
  selectedFilesRef.current = selectedFiles;

  const [fileAlertError, setFileAlertError] = useState<string | null>(null);
  const [preferences, setPreferences] = useState<PrintPreferencesInput>(DEFAULT_PREFERENCES);

  const idempotencyKeyRef = useRef<string>(crypto.randomUUID());
  const draftSessionRef = useRef<{ jobId: string; draftUploadSecret: string } | null>(null);
  const draftPromiseRef = useRef<Promise<{ jobId: string; draftUploadSecret: string }> | null>(null);
  const finalizedPendingPaymentRef = useRef<FinalizePrintUploadResponse | null>(null);
  const submittingLockRef = useRef(false);

  const [submittingOrder, setSubmittingOrder] = useState(false);
  const [submitOrderError, setSubmitOrderError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<SubmissionConfirmationRecord | null>(
    readStoredConfirmation
  );
  const [recentSessionJobs, setRecentSessionJobs] = useState<RecentSessionJobRef[]>(readRecentTokens);

  const resolvedTheme: 'light' | 'dark' =
    theme === 'system' ? (systemDark ? 'dark' : 'light') : theme;

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', resolvedTheme);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // Ignore storage errors
    }
  }, [theme, resolvedTheme]);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  useEffect(() => {
    const onPopState = () => {
      setPathname(window.location.pathname);
      setSearchStr(window.location.search);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const route = useMemo(() => parseCustomerRoute(pathname), [pathname]);
  const searchParams = useMemo(() => new URLSearchParams(searchStr), [searchStr]);

  const navigate = useCallback((pathWithQuery: string) => {
    const [nextPath, nextQuery] = pathWithQuery.split('?');
    const fullUrl = nextQuery ? `${nextPath}?${nextQuery}` : nextPath;
    if (window.location.pathname + window.location.search !== fullUrl) {
      window.history.pushState(null, '', fullUrl);
    }
    setPathname(nextPath);
    setSearchStr(nextQuery ? `?${nextQuery}` : '');
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, []);

  const loadConfig = useCallback(async () => {
    setCapabilitiesLoading(true);
    setPaymentSettingsLoading(true);
    setCapabilitiesError(envConfigError);
    try {
      const [caps, pay] = await Promise.all([
        adapter.getPortalCapabilities(),
        adapter.getPublicPaymentSettings(),
      ]);
      setCapabilities(caps);
      setPaymentSettings(pay);
      // Keep default/current print preferences strictly within verified/supported capabilities
      setPreferences((prev) => ({
        ...prev,
        paperSize: caps.supportedPaperSizes.includes(prev.paperSize)
          ? prev.paperSize
          : (caps.supportedPaperSizes[0] ?? 'A4'),
        printMode: caps.supportedPrintModes.includes(prev.printMode)
          ? prev.printMode
          : (caps.supportedPrintModes[0] ?? 'bw'),
        printSides: caps.supportedPrintSides.includes(prev.printSides)
          ? prev.printSides
          : (caps.supportedPrintSides[0] ?? 'single'),
        copies: Math.min(Math.max(1, prev.copies), caps.maxCopies),
      }));
    } catch (err) {
      setCapabilitiesError(
        err instanceof Error ? err.message : 'Unable to load print portal settings.'
      );
    } finally {
      setCapabilitiesLoading(false);
      setPaymentSettingsLoading(false);
    }
  }, [adapter, envConfigError]);

  useEffect(() => {
    void loadConfig();
  }, [loadConfig]);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  }, []);

  // Single deduplicated draft job creation across concurrent uploads / retries
  const ensureDraftJobSession = useCallback(async () => {
    if (draftSessionRef.current) return draftSessionRef.current;
    if (draftPromiseRef.current) return draftPromiseRef.current;

    const creation = (async () => {
      const draft = await adapter.createDraftJob({
        paperSize: preferences.paperSize,
        printMode: preferences.printMode,
        printSides: preferences.printSides,
        copies: preferences.copies,
        orientation: preferences.orientation,
        scaling: preferences.scaling,
        requestedPageRange: preferences.requestedPageRange,
        customerName: preferences.customerName || undefined,
        customerPhone: preferences.customerPhone || undefined,
        submissionIdempotencyKey: idempotencyKeyRef.current,
      });
      if (!draft.draftUploadSecret) {
        throw new Error('Could not initialize secure draft upload session.');
      }
      const session = {
        jobId: draft.jobId,
        draftUploadSecret: draft.draftUploadSecret,
      };
      draftSessionRef.current = session;
      return session;
    })();

    draftPromiseRef.current = creation;
    try {
      return await creation;
    } finally {
      draftPromiseRef.current = null;
    }
  }, [adapter, preferences]);

  const runSingleFileUpload = useCallback(
    async (item: SelectedUploadFileItem) => {
      setSelectedFiles((prev) =>
        prev.map((f) =>
          f.localId === item.localId
            ? { ...f, status: 'uploading', progressPct: 10, errorMessage: null }
            : f
        )
      );

      try {
        const session = await ensureDraftJobSession();
        const urlRes = await adapter.requestUploadUrl({
          jobId: session.jobId,
          draftUploadSecret: session.draftUploadSecret,
          filename: item.filename,
          mimeType: item.mimeType,
          fileSizeBytes: item.fileSizeBytes,
        });

        await adapter.uploadFileBytes(urlRes.signedUrl, item.file, (pct) => {
          setSelectedFiles((prev) =>
            prev.map((f) => (f.localId === item.localId ? { ...f, progressPct: pct } : f))
          );
        });

        setSelectedFiles((prev) =>
          prev.map((f) =>
            f.localId === item.localId
              ? {
                  ...f,
                  status: 'uploaded',
                  progressPct: 100,
                  errorMessage: null,
                  remoteFileId: urlRes.fileId,
                  storagePath: urlRes.storagePath,
                }
              : f
          )
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Upload failed. Tap Retry.';
        setSelectedFiles((prev) =>
          prev.map((f) =>
            f.localId === item.localId
              ? { ...f, status: 'error', progressPct: 0, errorMessage: msg }
              : f
          )
        );
      }
    },
    [adapter, ensureDraftJobSession]
  );

  const addFiles = useCallback(
    async (files: FileList | File[]) => {
      setFileAlertError(null);
      const limits = {
        maxFilesPerJob: capabilities?.maxFilesPerJob ?? 5,
        maxFileSizeBytes: capabilities?.maxFileSizeBytes ?? 20 * 1024 * 1024,
      };
      const incoming = Array.from(files);
      let runningCount = selectedFilesRef.current.length;
      const errors: string[] = [];
      const accepted: SelectedUploadFileItem[] = [];

      for (const rawFile of incoming) {
        const check = validateClientDocumentFile(
          { name: rawFile.name, type: rawFile.type, size: rawFile.size },
          runningCount,
          limits
        );
        if (!check.valid || !check.normalizedMime) {
          if (check.error) errors.push(check.error);
          continue;
        }

        // Magic-byte & PDF structure inspection BEFORE requesting signed URLs
        const byteInspection = await inspectClientFileBytes(rawFile, check.normalizedMime, 'document');
        if (!byteInspection.valid) {
          if (byteInspection.error) errors.push(byteInspection.error);
          continue;
        }

        runningCount += 1;
        accepted.push({
          localId: crypto.randomUUID(),
          file: rawFile,
          filename: rawFile.name.trim(),
          mimeType: check.normalizedMime,
          fileSizeBytes: rawFile.size,
          estimatedPageCount: byteInspection.pageCount,
          status: 'ready',
          progressPct: 0,
          errorMessage: null,
        });
      }

      if (errors.length > 0) {
        setFileAlertError(errors.join(' '));
      }
      if (accepted.length === 0) return;

      setSelectedFiles((prev) => [...prev, ...accepted]);
      for (const item of accepted) {
        await runSingleFileUpload(item);
      }
    },
    [capabilities, runSingleFileUpload]
  );

  const removeFile = useCallback(
    (localId: string) => {
      setFileAlertError(null);
      const target = selectedFilesRef.current.find((f) => f.localId === localId);
      setSelectedFiles((prev) => prev.filter((f) => f.localId !== localId));

      if (target?.remoteFileId && draftSessionRef.current && adapter.removeDraftFile) {
        void adapter
          .removeDraftFile({
            jobId: draftSessionRef.current.jobId,
            draftUploadSecret: draftSessionRef.current.draftUploadSecret,
            fileId: target.remoteFileId,
          })
          .catch(() => {
            // Silently ignore if draft already expired or cleaned
          });
      }
    },
    [adapter]
  );

  const retryFileUpload = useCallback(
    async (localId: string) => {
      const target = selectedFilesRef.current.find((f) => f.localId === localId);
      if (!target) return;
      setFileAlertError(null);
      await runSingleFileUpload(target);
    },
    [runSingleFileUpload]
  );

  const updatePreferences = useCallback((patch: Partial<PrintPreferencesInput>) => {
    setPreferences((prev) => ({ ...prev, ...patch }));
  }, []);

  const totalDetectedPages = useMemo(
    () =>
      selectedFiles
        .filter((f) => f.status !== 'error')
        .reduce((sum, f) => sum + Math.max(1, f.estimatedPageCount), 0),
    [selectedFiles]
  );

  const effectivePagesPerCopy = useMemo(() => {
    if (totalDetectedPages <= 0) return 0;
    const rangeRes = parseCustomPageRange(preferences.requestedPageRange, totalDetectedPages);
    if (!rangeRes.valid || rangeRes.selectedPageCount === null) {
      return totalDetectedPages;
    }
    return rangeRes.selectedPageCount;
  }, [preferences.requestedPageRange, totalDetectedPages]);

  const submitPrintOrder = useCallback(
    async (paymentInput: {
      paymentMethod: PaymentMethod;
      utrReference?: string;
      evidenceFile?: File | null;
    }): Promise<SubmissionConfirmationRecord> => {
      if (submittingLockRef.current && confirmation) {
        return confirmation;
      }
      submittingLockRef.current = true;
      setSubmitOrderError(null);
      setSubmittingOrder(true);

      try {
        // Idempotent guard: if already submitted with same order session, reuse confirmation
        if (confirmation) {
          navigate('/quick-print/success');
          return confirmation;
        }

        const readyFiles = selectedFilesRef.current.filter((f) => f.status === 'uploaded');
        if (readyFiles.length === 0) {
          throw new Error('Upload at least one valid document before submitting your request.');
        }

        // Reuse the SAME draft job (no second draft job & no double-upload!)
        // And if finalize already succeeded in a prior attempt before payment failed, reuse finalizedPendingPaymentRef!
        let finalized = finalizedPendingPaymentRef.current;
        if (!finalized) {
          const session = draftSessionRef.current;
          if (!session) {
            throw new Error('Upload session expired. Please re-upload your document.');
          }
          finalized = await adapter.finalizeUploadAndSubmit({
            jobId: session.jobId,
            draftUploadSecret: session.draftUploadSecret,
            paperSize: preferences.paperSize,
            printMode: preferences.printMode,
            printSides: preferences.printSides,
            copies: preferences.copies,
            orientation: preferences.orientation,
            scaling: preferences.scaling,
            requestedPageRange: preferences.requestedPageRange,
            customerName: preferences.customerName.trim() || undefined,
            customerPhone: preferences.customerPhone.trim() || undefined,
          });
          finalizedPendingPaymentRef.current = finalized;
          // Clear draft secret ref since draft transitioned to submitted
          draftSessionRef.current = null;
        }

        let evidencePath: string | undefined;
        let evidenceMimeType: string | undefined;

        if (paymentInput.paymentMethod === 'upi' && paymentInput.evidenceFile) {
          const prep = await adapter.preparePaymentEvidenceUpload({
            trackingToken: finalized.trackingToken,
            filename: paymentInput.evidenceFile.name,
            mimeType: paymentInput.evidenceFile.type || 'image/jpeg',
            fileSizeBytes: paymentInput.evidenceFile.size,
          });
          await adapter.uploadFileBytes(prep.signedUrl, paymentInput.evidenceFile, () => {});
          evidencePath = prep.evidenceStoragePath;
          evidenceMimeType = prep.expectedMimeType;
        }

        const payRes = await adapter.submitPayment({
          trackingToken: finalized.trackingToken,
          paymentMethod: paymentInput.paymentMethod,
          transactionReference: paymentInput.utrReference,
          evidenceStoragePath: evidencePath,
          evidenceMimeType,
          idempotencyKey: `pay-${idempotencyKeyRef.current}-${paymentInput.paymentMethod}`,
        });

        const record: SubmissionConfirmationRecord = {
          jobId: finalized.jobId,
          jobNumber: finalized.jobNumber,
          trackingToken: finalized.trackingToken,
          status: payRes.status as SubmissionConfirmationRecord['status'],
          paymentStatus: payRes.paymentStatus as SubmissionConfirmationRecord['paymentStatus'],
          paymentMethod: payRes.paymentMethod,
          verifiedPageCount: finalized.verifiedPageCount,
          physicalSheetCount: finalized.physicalSheetCount,
          estimatedAmount: finalized.finalAmount,
          currency: finalized.currency,
          submittedAt: new Date().toISOString(),
          files: readyFiles.map((f) => ({
            filename: f.filename,
            fileSizeBytes: f.fileSizeBytes,
            pageCount: f.estimatedPageCount,
          })),
          preferences: { ...preferences },
          isMockMode: adapter.isMockMode,
        };

        finalizedPendingPaymentRef.current = null;
        setConfirmation(record);
        try {
          window.sessionStorage.setItem(SESSION_CONFIRMATION_KEY, JSON.stringify(record));
        } catch {
          // Ignore storage error
        }

        setRecentSessionJobs((prev) => {
          const next = [
            {
              jobNumber: record.jobNumber,
              trackingToken: record.trackingToken,
              submittedAt: record.submittedAt,
            },
            ...prev.filter((r) => r.trackingToken !== record.trackingToken),
          ].slice(0, 5);
          try {
            window.sessionStorage.setItem(SESSION_TOKENS_KEY, JSON.stringify(next));
          } catch {
            // Ignore
          }
          return next;
        });

        navigate('/quick-print/success');
        return record;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unable to submit print job.';
        setSubmitOrderError(msg);
        throw new Error(msg);
      } finally {
        submittingLockRef.current = false;
        setSubmittingOrder(false);
      }
    },
    [adapter, confirmation, navigate, preferences]
  );

  const startNewPrintOrder = useCallback(() => {
    idempotencyKeyRef.current = crypto.randomUUID();
    draftSessionRef.current = null;
    draftPromiseRef.current = null;
    finalizedPendingPaymentRef.current = null;
    setSelectedFiles([]);
    setFileAlertError(null);
    setSubmitOrderError(null);
    setPreferences({
      ...DEFAULT_PREFERENCES,
      paperSize: capabilities?.supportedPaperSizes[0] ?? 'A4',
      printMode: capabilities?.supportedPrintModes[0] ?? 'bw',
      printSides: capabilities?.supportedPrintSides[0] ?? 'single',
    });
    setConfirmation(null);
    try {
      window.sessionStorage.removeItem(SESSION_CONFIRMATION_KEY);
    } catch {
      // Ignore
    }
    navigate('/quick-print/upload');
  }, [capabilities, navigate]);

  const value = useMemo<PortalContextValue>(
    () => ({
      adapter,
      isMockMode: adapter.isMockMode,
      route,
      searchParams,
      navigate,
      theme,
      resolvedTheme,
      toggleTheme,
      capabilities,
      capabilitiesLoading,
      capabilitiesError,
      reloadCapabilities: loadConfig,
      paymentSettings,
      paymentSettingsLoading,
      selectedFiles,
      fileAlertError,
      clearFileAlertError: () => setFileAlertError(null),
      addFiles,
      removeFile,
      retryFileUpload,
      preferences,
      updatePreferences,
      totalDetectedPages,
      effectivePagesPerCopy,
      submittingOrder,
      submitOrderError,
      confirmation,
      recentSessionJobs,
      submitPrintOrder,
      startNewPrintOrder,
    }),
    [
      adapter,
      route,
      searchParams,
      navigate,
      theme,
      resolvedTheme,
      toggleTheme,
      capabilities,
      capabilitiesLoading,
      capabilitiesError,
      loadConfig,
      paymentSettings,
      paymentSettingsLoading,
      selectedFiles,
      fileAlertError,
      addFiles,
      removeFile,
      retryFileUpload,
      preferences,
      updatePreferences,
      totalDetectedPages,
      effectivePagesPerCopy,
      submittingOrder,
      submitOrderError,
      confirmation,
      recentSessionJobs,
      submitPrintOrder,
      startNewPrintOrder,
    ]
  );

  return <PortalContext.Provider value={value}>{children}</PortalContext.Provider>;
};

export function usePortal(): PortalContextValue {
  const ctx = useContext(PortalContext);
  if (!ctx) throw new Error('usePortal must be used inside PortalProvider');
  return ctx;
}
