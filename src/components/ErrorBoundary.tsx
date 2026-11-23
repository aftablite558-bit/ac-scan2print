import React from 'react';
import { AlertTriangle, Home, LogOut, RefreshCw } from 'lucide-react';
import { sanitizeErrorMessage } from '../utils/workspaceState';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  variant?: 'fullscreen' | 'inline';
  title?: string;
  resetKey?: string | number;
  onReturnOverview?: () => void;
  onSignOut?: () => Promise<void> | void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = {
    hasError: false,
    errorMessage: '',
  };

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: sanitizeErrorMessage(
        error,
        'An unexpected runtime error occurred while rendering this view.'
      ),
    };
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo): void {
    console.error('[AMAN COMPUTER Admin ErrorBoundary]', sanitizeErrorMessage(error), {
      componentStack: info.componentStack,
    });
  }

  componentDidUpdate(prevProps: ErrorBoundaryProps): void {
    if (this.state.hasError && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false, errorMessage: '' });
    }
  }

  private handleReset = (): void => {
    this.setState({ hasError: false, errorMessage: '' });
  };

  private handleOverview = (): void => {
    this.setState({ hasError: false, errorMessage: '' });
    if (this.props.onReturnOverview) {
      this.props.onReturnOverview();
    } else if (typeof window !== 'undefined') {
      window.location.hash = '#/home';
    }
  };

  private handleSignOut = async (): Promise<void> => {
    try {
      await this.props.onSignOut?.();
    } catch (err) {
      console.error('[ErrorBoundary] Sign-out error:', sanitizeErrorMessage(err));
    } finally {
      this.setState({ hasError: false, errorMessage: '' });
    }
  };

  render(): React.ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }

    const isFullscreen = this.props.variant !== 'inline';
    const heading =
      this.props.title ||
      (isFullscreen
        ? 'AMAN COMPUTER Admin Dashboard encountered a rendering error'
        : 'This dashboard section could not render');

    const card = (
      <div
        role="alert"
        className="w-full max-w-[540px] rounded-[24px] bg-[#191D25] text-[#F5F8FC] border border-white/15 shadow-2xl p-6 sm:p-7 space-y-5"
      >
        <div className="flex items-start gap-3.5">
          <div className="w-11 h-11 rounded-[14px] bg-[#FF424D]/15 border border-[#FF424D]/35 text-[#FF8C94] flex items-center justify-center shrink-0">
            <AlertTriangle size={20} aria-hidden="true" />
          </div>
          <div className="min-w-0 space-y-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#9EB0C2]">
              AC Scan2Print · Safe Recovery
            </p>
            <h2 className="text-[18px] font-bold leading-snug text-[#F5F8FC]">{heading}</h2>
          </div>
        </div>

        <div className="rounded-[14px] bg-[#111318] border border-white/10 px-4 py-3 text-[13px] text-[#FFB4B9] break-words">
          {this.state.errorMessage}
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={this.handleReset}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-[12px] bg-[#25C7D9] hover:bg-[#32D4E6] text-[#07161B] font-semibold text-[13px] cursor-pointer transition-colors"
          >
            <RefreshCw size={14} aria-hidden="true" />
            <span>Retry View</span>
          </button>

          <button
            type="button"
            onClick={this.handleOverview}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-[12px] bg-white/10 hover:bg-white/15 text-[#F5F8FC] font-medium text-[13px] cursor-pointer transition-colors"
          >
            <Home size={14} aria-hidden="true" />
            <span>Overview</span>
          </button>

          {isFullscreen && (
            <button
              type="button"
              onClick={() => {
                if (typeof window !== 'undefined') window.location.reload();
              }}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-[12px] bg-white/10 hover:bg-white/15 text-[#F5F8FC] font-medium text-[13px] cursor-pointer transition-colors"
            >
              <RefreshCw size={14} aria-hidden="true" />
              <span>Reload Page</span>
            </button>
          )}

          {this.props.onSignOut && (
            <button
              type="button"
              onClick={() => void this.handleSignOut()}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-[12px] bg-[#FF424D]/15 hover:bg-[#FF424D]/25 border border-[#FF424D]/35 text-[#FFB4B9] font-medium text-[13px] cursor-pointer transition-colors ml-auto"
            >
              <LogOut size={14} aria-hidden="true" />
              <span>Sign Out</span>
            </button>
          )}
        </div>
      </div>
    );

    if (!isFullscreen) {
      return <div className="py-6 flex justify-center">{card}</div>;
    }

    return (
      <div className="min-h-screen w-full bg-[#111318] text-[#F5F8FC] flex items-center justify-center p-4 sm:p-6">
        {card}
      </div>
    );
  }
}
