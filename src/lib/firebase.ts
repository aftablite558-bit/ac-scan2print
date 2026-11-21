import { getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import {
  browserLocalPersistence,
  browserSessionPersistence,
  getAuth,
  onIdTokenChanged,
  sendPasswordResetEmail,
  setPersistence,
  signInWithEmailAndPassword,
  signOut,
  type Auth,
  type User,
} from 'firebase/auth';
import { validateFirebaseConfig } from './env';

export const firebaseEnvValidation = validateFirebaseConfig();
export const isFirebaseClientConfigured = firebaseEnvValidation.ok;

let cachedApp: FirebaseApp | null = null;
let cachedAuth: Auth | null = null;
let persistencePromise: Promise<void> | null = null;

export function getFirebaseConfigError(): string | null {
  return firebaseEnvValidation.summary;
}

export function getFirebaseApp(): FirebaseApp | null {
  if (!firebaseEnvValidation.ok || !firebaseEnvValidation.config) {
    return null;
  }
  if (!cachedApp) {
    cachedApp = getApps().length > 0 ? getApps()[0] : initializeApp(firebaseEnvValidation.config);
  }
  return cachedApp;
}

export function requireFirebaseApp(): FirebaseApp {
  const app = getFirebaseApp();
  if (!app) {
    throw new Error(
      firebaseEnvValidation.summary ??
        'Firebase frontend configuration is incomplete. Check VITE_FIREBASE_* variables in .env.local.'
    );
  }
  return app;
}

export function getFirebaseAuth(): Auth | null {
  const app = getFirebaseApp();
  if (!app) return null;
  if (!cachedAuth) {
    cachedAuth = getAuth(app);
    if (typeof window !== 'undefined' && !persistencePromise) {
      persistencePromise = setPersistence(cachedAuth, browserLocalPersistence).catch(() => {});
    }
  }
  return cachedAuth;
}

export function requireFirebaseAuth(): Auth {
  const auth = getFirebaseAuth();
  if (!auth) {
    throw new Error(
      firebaseEnvValidation.summary ??
        'Firebase Authentication is unavailable. Check VITE_FIREBASE_* configuration.'
    );
  }
  return auth;
}

export function mapFirebaseAuthError(err: unknown): string {
  const code =
    typeof err === 'object' && err !== null && 'code' in err && typeof err.code === 'string'
      ? err.code
      : '';

  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'Invalid admin email or password.';
    case 'auth/invalid-email':
      return 'Enter a valid admin email address.';
    case 'auth/user-disabled':
      return 'This Firebase Admin account has been disabled.';
    case 'auth/too-many-requests':
      return 'Too many failed sign-in attempts. Please wait a few minutes and try again.';
    case 'auth/network-request-failed':
      return 'Network error while contacting Firebase Authentication. Check your connection.';
    case 'auth/operation-not-allowed':
      return 'Email/Password sign-in is not enabled in Firebase Authentication.';
    default:
      if (err instanceof Error && err.message.trim()) {
        return err.message;
      }
      return 'Firebase authentication failed.';
  }
}

export async function signInWithFirebaseEmailPassword(
  email: string,
  password: string,
  rememberSession = true
): Promise<User> {
  const auth = requireFirebaseAuth();
  if (persistencePromise) {
    await persistencePromise;
  }
  if (typeof window !== 'undefined') {
    await setPersistence(
      auth,
      rememberSession ? browserLocalPersistence : browserSessionPersistence
    ).catch(() => {});
  }
  try {
    const credential = await signInWithEmailAndPassword(auth, email.trim(), password);
    return credential.user;
  } catch (err) {
    throw new Error(mapFirebaseAuthError(err));
  }
}

export async function signOutFirebase(): Promise<void> {
  const auth = getFirebaseAuth();
  if (!auth) return;
  await signOut(auth);
}

export async function sendFirebasePasswordReset(email: string): Promise<void> {
  const auth = requireFirebaseAuth();
  try {
    await sendPasswordResetEmail(auth, email.trim());
  } catch (err) {
    throw new Error(mapFirebaseAuthError(err));
  }
}

export function subscribeFirebaseAuthState(
  onChange: (user: User | null) => void
): () => void {
  const auth = getFirebaseAuth();
  if (!auth) {
    onChange(null);
    return () => {};
  }
  return onIdTokenChanged(auth, onChange);
}

export async function getCurrentFirebaseIdToken(forceRefresh = false): Promise<string | null> {
  const auth = getFirebaseAuth();
  if (!auth) return null;
  if (typeof auth.authStateReady === 'function') {
    await auth.authStateReady();
  }
  if (!auth.currentUser) return null;
  return auth.currentUser.getIdToken(forceRefresh);
}

export async function initFirebaseTelemetry(): Promise<void> {
  const app = getFirebaseApp();
  if (!app || typeof window === 'undefined') return;
  try {
    const { getAnalytics, isSupported } = await import('firebase/analytics');
    if (await isSupported()) {
      getAnalytics(app);
    }
    const { getPerformance } = await import('firebase/performance');
    getPerformance(app);
  } catch {
    // Telemetry initialization is optional and non-blocking
  }
}

export async function registerFcmPushNotifications(
  onForegroundMessage: (title: string, body: string) => void
): Promise<{ ok: boolean; token?: string; error?: string }> {
  const app = getFirebaseApp();
  const vapidKey = firebaseEnvValidation.config?.vapidKey;
  if (!app) {
    return {
      ok: false,
      error:
        firebaseEnvValidation.summary ??
        'Firebase Web Push requires all VITE_FIREBASE_* environment variables.',
    };
  }
  if (!vapidKey) {
    return {
      ok: false,
      error: 'Firebase Web Push requires VITE_FIREBASE_VAPID_KEY to be configured in .env.local.',
    };
  }
  if (typeof window === 'undefined' || !('Notification' in window) || !('serviceWorker' in navigator)) {
    return { ok: false, error: 'Browser notifications or service workers are unavailable here.' };
  }

  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      return { ok: false, error: 'Browser notification permission was denied.' };
    }
    const { getMessaging, getToken, onMessage, isSupported } = await import('firebase/messaging');
    if (!(await isSupported())) {
      return { ok: false, error: 'Firebase Messaging is not supported in this browser.' };
    }
    const messaging = getMessaging(app);
    const token = await getToken(messaging, { vapidKey });
    if (!token) {
      return { ok: false, error: 'Failed to acquire an FCM device token.' };
    }
    onMessage(messaging, (payload) => {
      const title = payload.notification?.title || 'AMAN COMPUTER';
      const body = payload.notification?.body || 'Workspace update received';
      onForegroundMessage(title, body);
    });
    return { ok: true, token };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'FCM registration failed',
    };
  }
}
