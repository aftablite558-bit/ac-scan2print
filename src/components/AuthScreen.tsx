import React, { useCallback, useState } from 'react';
import { ArrowLeft, Mail, Moon, QrCode, ShieldCheck, Sun } from 'lucide-react';
import { useAdmin } from '../context/AdminContext';
import { resolveBrandLogoUrl, resolvePublicWebsiteUrl } from '../lib/env';
import { getFirebaseConfigError } from '../lib/firebase';
import type { LiquidMetalStatus, MercuryLoginState } from '../lib/liquidMetal';
import { getSupabaseConfigError } from '../lib/supabase';
import { LiquidMetalButton } from './LiquidMetalButton';
import { LiquidMetalLoginStage } from './LiquidMetalLoginStage';

const AMBIENT_PARTICLES = [
  { top: '14%', left: '12%', size: 3, dur: '12s', delay: '0s', cyan: true },
  { top: '24%', left: '84%', size: 2.5, dur: '14s', delay: '-3s', cyan: false },
  { top: '68%', left: '10%', size: 2.5, dur: '13s', delay: '-5s', cyan: false },
  { top: '76%', left: '88%', size: 3, dur: '11s', delay: '-2s', cyan: true },
  { top: '44%', left: '7%', size: 2, dur: '15s', delay: '-7s', cyan: true },
  { top: '52%', left: '92%', size: 2, dur: '12.5s', delay: '-4s', cyan: false },
];

export const AuthScreen: React.FC = () => {
  const {
    authError,
    integrations,
    resolvedTheme,
    toggleTheme,
    login,
    forgotPassword,
    showToast,
  } = useAdmin();

  const [mode, setMode] = useState<'login' | 'forgot'>('login');
  const [mercuryState, setMercuryState] = useState<MercuryLoginState>('idle');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberSession, setRememberSession] = useState(true);
  const [forgotBusy, setForgotBusy] = useState(false);
  const [forgotStatus, setForgotStatus] = useState<LiquidMetalStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [logoFailed, setLogoFailed] = useState(false);

  const configError = getFirebaseConfigError() || getSupabaseConfigError();
  const publicWebsite = resolvePublicWebsiteUrl();
  const brandLogoUrl = resolveBrandLogoUrl();
  const displayError = error || authError;
  const isBackendReady = integrations.firebaseConfigured && integrations.supabaseConfigured;

  const handlePublicSiteNavigation = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (publicWebsite.configured && publicWebsite.url) {
      return;
    }
    e.preventDefault();
    setError(
      publicWebsite.error ||
        'Public website URL is not configured yet. Set VITE_PUBLIC_WEBSITE_URL in your environment configuration.'
    );
  };

  const handleCredentialSubmit = useCallback(async () => {
    setError(null);
    setInfo(null);
    await login(email.trim(), password, rememberSession);
  }, [email, login, password, rememberSession]);

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (forgotBusy) return;
    setError(null);
    setInfo(null);
    setForgotBusy(true);
    setForgotStatus('loading');
    try {
      const msg = await forgotPassword(email.trim());
      setInfo(msg);
      setForgotStatus('success');
      showToast('Password reset email sent');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to send reset email');
      setForgotStatus('error');
    } finally {
      setForgotBusy(false);
    }
  };

  const publicWebsiteHref =
    publicWebsite.configured && publicWebsite.url ? publicWebsite.url : '#public-website-unconfigured';

  const isBusy = mode === 'forgot' ? forgotBusy : mercuryState === 'loading' || mercuryState === 'closing';

  const statusIndicator = !isBackendReady
    ? {
        dotClass: 'bg-amber-400',
        textClass: 'text-amber-200/90',
        label: 'Security setup incomplete — check client config',
      }
    : isBusy
      ? {
          dotClass: 'bg-[#25C7D9] animate-pulse',
          textClass: 'text-[#AEEFF6]',
          label: 'Verifying Firebase ID Token with backend...',
        }
      : mercuryState === 'wrong' || Boolean(displayError)
        ? {
            dotClass: 'bg-[#FF5762]',
            textClass: 'text-[#FFB4B9]',
            label: 'Verification rejected — check credentials',
          }
        : mercuryState === 'done'
          ? {
              dotClass: 'bg-[#25C7D9]',
              textClass: 'text-[#AEEFF6]',
              label: 'Admin verified — unlocking Control Center',
            }
          : {
              dotClass: 'bg-[#25C7D9]',
              textClass: 'text-[#9FB0C2]',
              label: 'Firebase Auth · Supabase Verification Active',
            };

  return (
    <div className="min-h-screen relative flex items-center justify-center px-4 py-6 sm:px-6 sm:py-10 bg-[#111318] text-[#F4F7FA] overflow-x-hidden">
      {/* Deep Obsidian + Subtle Electric Cyan Ambient Backdrop */}
      <div className="fixed inset-0 pointer-events-none ac-login-backdrop" aria-hidden="true">
        <div className="absolute inset-0 ac-login-grid" />
        <div
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[540px] max-w-[95vw] h-[540px] rounded-full blur-[95px] opacity-80"
          style={{
            background:
              'radial-gradient(circle, rgba(37,199,217,0.16) 0%, rgba(37,199,217,0.04) 48%, transparent 74%)',
          }}
        />
        {AMBIENT_PARTICLES.map((p, idx) => (
          <span
            key={idx}
            className="hidden sm:block absolute rounded-full ac-login-particle"
            style={
              {
                top: p.top,
                left: p.left,
                width: `${p.size}px`,
                height: `${p.size}px`,
                backgroundColor: p.cyan ? 'rgba(37, 199, 217, 0.55)' : 'rgba(229, 237, 246, 0.4)',
                boxShadow: p.cyan ? '0 0 10px rgba(37, 199, 217, 0.45)' : 'none',
                '--ac-dur': p.dur,
                '--ac-delay': p.delay,
              } as React.CSSProperties
            }
          />
        ))}
      </div>

      <main className="relative z-10 w-full max-w-[464px] space-y-3.5">
        {/* Top Navigation Row: Back to Public Website (Left) + Theme Toggle (Right) */}
        <div className="flex items-center justify-between gap-3">
          <a
            href={publicWebsiteHref}
            onClick={handlePublicSiteNavigation}
            className="inline-flex items-center gap-2 px-3.5 py-2 min-h-[44px] rounded-[12px] bg-[#191D25]/88 backdrop-blur-md border border-white/[0.11] text-[13px] font-semibold text-[#E5EDF6] hover:border-[#25C7D9]/60 hover:text-[#25C7D9] focus-visible:outline-2 focus-visible:outline-[#25C7D9] focus-visible:outline-offset-2 transition-colors"
          >
            <ArrowLeft size={15} aria-hidden="true" />
            <span>Back to Aman Computer</span>
          </a>

          <button
            type="button"
            onClick={(e) => toggleTheme(e.currentTarget)}
            aria-label={resolvedTheme === 'dark' ? 'Switch to light' : 'Switch to dark'}
            title={
              resolvedTheme === 'dark'
                ? 'Switch dashboard theme to light'
                : 'Switch dashboard theme to dark'
            }
            className="w-[44px] h-[44px] rounded-[12px] bg-[#191D25]/88 backdrop-blur-md border border-white/[0.11] text-[#C9D6E3] hover:border-[#25C7D9]/55 hover:text-[#25C7D9] focus-visible:outline-2 focus-visible:outline-[#25C7D9] focus-visible:outline-offset-2 flex items-center justify-center shrink-0 cursor-pointer transition-colors"
          >
            {resolvedTheme === 'dark' ? (
              <Sun size={16} aria-hidden="true" />
            ) : (
              <Moon size={16} aria-hidden="true" />
            )}
          </button>
        </div>

        {/* Main Obsidian Glass Login Card */}
        <section
          aria-labelledby="admin-control-center-heading"
          className="relative w-full rounded-[24px] bg-[#191D25]/92 backdrop-blur-2xl border border-white/[0.11] shadow-[0_32px_80px_-24px_rgba(0,0,0,0.88),inset_0_1px_0_rgba(255,255,255,0.08)] p-5 sm:p-7 space-y-5"
        >
          {/* Subtle top specular edge highlight */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-[#25C7D9]/55 to-transparent"
          />

          {/* Brand Header (Official Logo + Brand Name + Product Name + Tagline) */}
          <div className="flex items-start gap-3.5">
            <a
              href={publicWebsiteHref}
              onClick={handlePublicSiteNavigation}
              aria-label="Go to Aman Computer public website"
              className="w-12 h-12 rounded-[14px] bg-[#111318] border border-[#25C7D9]/40 hover:border-[#25C7D9] shadow-[0_0_24px_-8px_rgba(37,199,217,0.45)] flex items-center justify-center shrink-0 overflow-hidden transition-colors focus-visible:outline-2 focus-visible:outline-[#25C7D9] focus-visible:outline-offset-2"
            >
              {brandLogoUrl && !logoFailed ? (
                <img
                  src={brandLogoUrl}
                  alt="AC Scan2Print official logo"
                  onError={() => setLogoFailed(true)}
                  className="w-full h-full object-contain p-1.5"
                />
              ) : (
                <QrCode size={24} className="text-[#25C7D9]" aria-hidden="true" />
              )}
            </a>

            <div className="min-w-0 flex-1">
              <a
                href={publicWebsiteHref}
                onClick={handlePublicSiteNavigation}
                className="group inline-block rounded-[6px] focus-visible:outline-2 focus-visible:outline-[#25C7D9] focus-visible:outline-offset-2"
              >
                <p className="text-[10.5px] font-semibold tracking-[0.18em] uppercase text-[#B5C4D4] group-hover:text-[#25C7D9] transition-colors leading-snug">
                  AMAN COMPUTER SCAN2PRINT
                </p>
                <p className="text-[21px] sm:text-[23px] font-bold tracking-[-0.02em] text-[#F5F8FC] leading-tight mt-0.5">
                  AC <span className="text-[#25C7D9]">Scan2Print</span>
                </p>
              </a>
              <p className="text-[10px] font-semibold tracking-[0.23em] uppercase text-[#7E92A6] mt-0.5">
                SMART PRINT TECHNOLOGY
              </p>
            </div>
          </div>

          {/* Control Center Heading, Subtitle & Single Authorized Admin Badge */}
          <div className="pt-1 border-t border-white/[0.08] flex flex-wrap items-start justify-between gap-2.5">
            <div>
              <h1
                id="admin-control-center-heading"
                className="text-[18px] sm:text-[19px] font-bold text-[#F5F8FC] tracking-[-0.01em]"
              >
                Admin Control Center
              </h1>
              <p className="text-[13px] text-[#9EB0C2] mt-0.5">
                Authorized administrator access only
              </p>
            </div>

            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[9px] bg-[#25C7D9]/[0.09] border border-[#25C7D9]/30 text-[11px] font-semibold text-[#AEEFF6] shrink-0">
              <ShieldCheck size={13} className="text-[#25C7D9] shrink-0" aria-hidden="true" />
              <span>Single Authorized Admin</span>
            </span>
          </div>

          {/* Real Config / Error / Info Feedback Banners */}
          {!isBackendReady && configError && (
            <div
              role="alert"
              className="rounded-[12px] bg-[#FF424D]/12 border border-[#FF424D]/35 px-3.5 py-2.5 text-[12.5px] text-[#FFB4B9] font-medium"
            >
              {configError}
            </div>
          )}

          {displayError && (
            <div
              role="alert"
              className="rounded-[12px] bg-[#FF424D]/12 border border-[#FF424D]/35 px-3.5 py-2.5 text-[13px] text-[#FFB4B9] font-medium"
            >
              {displayError}
            </div>
          )}

          {info && (
            <div
              role="status"
              className="rounded-[12px] bg-[#25C7D9]/12 border border-[#25C7D9]/35 px-3.5 py-2.5 text-[13px] text-[#AEEFF6] font-medium"
            >
              {info}
            </div>
          )}

          {mode === 'login' ? (
            <LiquidMetalLoginStage
              email={email}
              onEmailChange={setEmail}
              password={password}
              onPasswordChange={setPassword}
              rememberSession={rememberSession}
              onRememberSessionChange={setRememberSession}
              disabled={!isBackendReady}
              externalError={authError}
              onErrorMessage={(msg) => setError(msg)}
              onSubmitCredentials={handleCredentialSubmit}
              onOpenForgotPassword={() => {
                setError(null);
                setInfo(null);
                setForgotStatus('idle');
                setMode('forgot');
              }}
              onStateChange={setMercuryState}
            />
          ) : (
            <form onSubmit={handleForgot} className="space-y-4">
              <div>
                <label
                  htmlFor="reset-email"
                  className="block text-[12px] font-semibold text-[#B9C7D6] mb-1.5"
                >
                  Authorized admin email
                </label>
                <div className="relative">
                  <Mail
                    size={16}
                    aria-hidden="true"
                    className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#7E92A6] pointer-events-none"
                  />
                  <input
                    id="reset-email"
                    type="email"
                    required
                    autoFocus
                    autoComplete="email"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      if (error) setError(null);
                      if (forgotStatus === 'error') setForgotStatus('idle');
                    }}
                    placeholder="admin@amancomputer.in"
                    className="w-full min-h-[46px] rounded-[12px] bg-[#111318]/90 border border-white/[0.12] pl-10 pr-3.5 py-2.5 text-[14px] text-[#F5F8FC] placeholder:text-[#5F7184] focus:outline-none focus:border-[#25C7D9] focus:ring-2 focus:ring-[#25C7D9]/20 transition-colors"
                  />
                </div>
              </div>

              <LiquidMetalButton
                type="submit"
                status={forgotStatus}
                disabled={!integrations.firebaseConfigured || forgotBusy}
                label="Send Firebase Password Reset"
                loadingLabel="Sending Reset Email..."
                successLabel="Reset Email Sent"
                errorLabel="Reset Request Failed"
              />

              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setInfo(null);
                  setForgotStatus('idle');
                  setMercuryState('idle');
                  setMode('login');
                }}
                className="w-full min-h-[44px] text-center text-[13px] font-medium text-[#9EB0C2] hover:text-[#F5F8FC] focus-visible:outline-2 focus-visible:outline-[#25C7D9] rounded-[10px] cursor-pointer transition-colors"
              >
                Back to Sign in
              </button>
            </form>
          )}

          {/* Secure Authentication Status Indicator */}
          <div className="pt-3.5 border-t border-white/[0.08] flex items-center justify-between gap-2 text-[11.5px]">
            <div className="inline-flex items-center gap-2 min-w-0">
              <span
                aria-hidden="true"
                className={`w-2 h-2 rounded-full shrink-0 ${statusIndicator.dotClass}`}
              />
              <span className={`truncate font-medium ${statusIndicator.textClass}`}>
                {statusIndicator.label}
              </span>
            </div>
            <span className="text-[10.5px] uppercase tracking-[0.14em] text-[#6B7E92] shrink-0">
              TLS · RS256
            </span>
          </div>
        </section>
      </main>
    </div>
  );
};
