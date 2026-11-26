// AC Scan2Print — Phase 17 Self-Service Touch Kiosk Terminal
// Unattended walk-in print pickup terminal with 4-digit PIN release, 80mm thermal slip preview,
// live fleet station readiness, and 60s inactivity auto-reset.

import React, { useCallback, useEffect, useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  Delete,
  Printer,
  Receipt,
  RefreshCw,
  Zap,
} from 'lucide-react';
import { usePortal } from '../context/PortalContext';

interface ReleasedJobView {
  jobNumber: string;
  tokenNumber: string;
  pickupPin: string;
  documentTitle: string;
  paperSize: string;
  pages: number;
  sheets: number;
  amountInr: number;
  paymentStatus: string;
  stationName: string;
}

const INACTIVITY_TIMEOUT_SECONDS = 60;

export const KioskPage: React.FC = () => {
  const { navigate } = usePortal();

  const [enteredPin, setEnteredPin] = useState('');
  const [activeMode, setActiveMode] = useState<'pin' | 'thermal_slip'>('pin');
  const [isProcessing, setIsProcessing] = useState(false);
  const [releasedJob, setReleasedJob] = useState<ReleasedJobView | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [secondsRemaining, setSecondsRemaining] = useState(INACTIVITY_TIMEOUT_SECONDS);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setSecondsRemaining((prev) => {
        if (prev <= 1) {
          setEnteredPin('');
          setReleasedJob(null);
          setErrorMessage(null);
          setActiveMode('pin');
          return INACTIVITY_TIMEOUT_SECONDS;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const touchActivity = useCallback(() => {
    setSecondsRemaining(INACTIVITY_TIMEOUT_SECONDS);
  }, []);

  const handleDigitPress = (digit: string) => {
    touchActivity();
    setErrorMessage(null);
    if (enteredPin.length < 4) {
      setEnteredPin((prev) => prev + digit);
    }
  };

  const handleBackspace = () => {
    touchActivity();
    setErrorMessage(null);
    setEnteredPin((prev) => prev.slice(0, -1));
  };

  const handleClear = () => {
    touchActivity();
    setErrorMessage(null);
    setEnteredPin('');
    setReleasedJob(null);
  };

  const handleClaimJob = () => {
    touchActivity();
    if (enteredPin.length < 4) {
      setErrorMessage('Enter the 4-digit pickup PIN shown on your phone or counter token slip.');
      return;
    }

    setIsProcessing(true);
    setErrorMessage(null);

    window.setTimeout(() => {
      setIsProcessing(false);
      setReleasedJob({
        jobNumber: `JOB-20261125-${enteredPin}`,
        tokenNumber: `T-${enteredPin}`,
        pickupPin: enteredPin,
        documentTitle: 'Verified_Document_Queue.pdf',
        paperSize: 'A4',
        pages: 4,
        sheets: 2,
        amountInr: 16.0,
        paymentStatus: 'PAID (UPI)',
        stationName: 'Terminal 3 — Self-Service Kiosk Bay',
      });
    }, 550);
  };

  return (
    <div className="space-y-5" onClick={touchActivity} onTouchStart={touchActivity}>
      {/* Top Kiosk Header Bar */}
      <div className="portal-card px-4 py-3.5 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => navigate('/quick-print')}
          className="portal-btn-secondary px-3 text-[13px] inline-flex items-center gap-1.5 cursor-pointer shrink-0 whitespace-nowrap"
        >
          <ArrowLeft size={15} />
          <span>Exit Kiosk</span>
        </button>

        <div className="text-center min-w-0">
          <div className="text-[14px] font-bold text-[var(--color-text-primary)] truncate">
            Self-Service Pickup Kiosk
          </div>
          <div className="text-[11.5px] text-[var(--color-text-muted)] truncate">
            Aman Computer Express Terminal
          </div>
        </div>

        <div
          className="px-2.5 py-1.5 rounded-[10px] bg-[var(--color-surface-subtle)] border border-[var(--color-border)] text-[12px] font-mono text-[var(--color-text-secondary)] inline-flex items-center gap-1.5 shrink-0"
          title="Session auto-resets after inactivity"
        >
          <Clock size={13} className="text-[var(--color-accent)]" />
          <span className="tabular-nums">{secondsRemaining}s</span>
        </div>
      </div>

      {/* Mode Selector Segmented Tabs */}
      <div className="grid grid-cols-2 gap-1.5 p-1 rounded-[14px] bg-[var(--color-surface-subtle)] border border-[var(--color-border)]">
        <button
          type="button"
          onClick={() => {
            touchActivity();
            setActiveMode('pin');
          }}
          className={`min-h-[44px] rounded-[10px] text-[13px] font-bold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
            activeMode === 'pin'
              ? 'bg-[var(--color-surface)] text-[var(--color-accent)] shadow-sm'
              : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
          }`}
        >
          <Zap size={15} />
          <span>Enter Pickup PIN</span>
        </button>

        <button
          type="button"
          onClick={() => {
            touchActivity();
            setActiveMode('thermal_slip');
          }}
          className={`min-h-[44px] rounded-[10px] text-[13px] font-bold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
            activeMode === 'thermal_slip'
              ? 'bg-[var(--color-surface)] text-[var(--color-accent)] shadow-sm'
              : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
          }`}
        >
          <Receipt size={15} />
          <span>Thermal Token Slip</span>
        </button>
      </div>

      {activeMode === 'pin' ? (
        <div className="space-y-4">
          <section className="portal-card p-5 space-y-4">
            <div className="text-center space-y-1">
              <h1 className="text-[19px] font-bold text-[var(--color-text-primary)]">
                Enter 4-Digit Pickup PIN
              </h1>
              <p className="text-[12.5px] text-[var(--color-text-muted)]">
                Enter the 4-digit release PIN displayed on your order tracking screen or counter receipt.
              </p>
            </div>

            {/* 4-Digit PIN Display */}
            <div className="flex items-center justify-center gap-3 py-1">
              {[0, 1, 2, 3].map((index) => {
                const char = enteredPin[index];
                const isActive = enteredPin.length === index;
                return (
                  <div
                    key={index}
                    aria-label={`PIN digit ${index + 1}`}
                    className={`w-14 h-16 rounded-[14px] border-2 flex items-center justify-center text-[24px] font-mono font-bold transition-colors ${
                      char
                        ? 'border-[var(--ac-cyan)] bg-[var(--ac-cyan-soft)] text-[var(--color-text-primary)]'
                        : isActive
                          ? 'border-[var(--ac-cyan)] bg-[var(--color-surface)]'
                          : 'border-[var(--color-border-strong)] bg-[var(--color-surface-subtle)] text-[var(--color-text-muted)]'
                    }`}
                  >
                    {char ? char : ''}
                  </div>
                );
              })}
            </div>

            {errorMessage && (
              <div
                role="alert"
                className="p-3 rounded-[12px] bg-[var(--bad-soft)] border border-[var(--bad)]/30 text-[var(--bad)] text-[12.5px] font-semibold text-center"
              >
                {errorMessage}
              </div>
            )}

            {/* Touch Numeric Keypad */}
            <div className="grid grid-cols-3 gap-2.5 max-w-[336px] mx-auto pt-1">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
                <button
                  key={digit}
                  type="button"
                  onClick={() => handleDigitPress(digit)}
                  className="min-h-[56px] rounded-[14px] bg-[var(--color-surface-subtle)] border border-[var(--color-border-strong)] text-[22px] font-mono font-bold text-[var(--color-text-primary)] hover:bg-[var(--ac-cyan-soft)] active:scale-95 transition-all cursor-pointer"
                >
                  {digit}
                </button>
              ))}

              <button
                type="button"
                onClick={handleClear}
                className="min-h-[56px] rounded-[14px] bg-[var(--color-surface-subtle)] border border-[var(--color-border)] text-[13px] font-bold text-[var(--color-text-secondary)] hover:bg-[var(--color-surface)] active:scale-95 transition-all cursor-pointer"
              >
                Clear
              </button>

              <button
                type="button"
                onClick={() => handleDigitPress('0')}
                className="min-h-[56px] rounded-[14px] bg-[var(--color-surface-subtle)] border border-[var(--color-border-strong)] text-[22px] font-mono font-bold text-[var(--color-text-primary)] hover:bg-[var(--ac-cyan-soft)] active:scale-95 transition-all cursor-pointer"
              >
                0
              </button>

              <button
                type="button"
                onClick={handleBackspace}
                aria-label="Backspace"
                className="min-h-[56px] rounded-[14px] bg-[var(--color-surface-subtle)] border border-[var(--color-border)] text-[18px] font-bold text-[var(--color-text-secondary)] hover:bg-[var(--color-surface)] active:scale-95 transition-all cursor-pointer inline-flex items-center justify-center"
              >
                <Delete size={20} />
              </button>
            </div>

            <div className="pt-1 max-w-[336px] mx-auto">
              <button
                type="button"
                disabled={enteredPin.length < 4 || isProcessing}
                onClick={handleClaimJob}
                className="portal-btn-primary w-full min-h-[52px] text-[15px] inline-flex items-center justify-center gap-2 cursor-pointer"
              >
                {isProcessing ? (
                  <>
                    <RefreshCw size={17} className="animate-spin" />
                    <span>Releasing Job to Spooler...</span>
                  </>
                ) : (
                  <>
                    <Printer size={18} />
                    <span>Print Documents Now</span>
                  </>
                )}
              </button>
            </div>
          </section>

          {releasedJob && (
            <section
              role="status"
              className="portal-card p-4 bg-[var(--good-soft)] border-[var(--good)]/35 space-y-3"
            >
              <div className="flex items-center gap-2 text-[var(--good)] font-bold text-[14px]">
                <CheckCircle2 size={18} />
                <span>Job {releasedJob.jobNumber} Released to Printer</span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-[12px]">
                <div>
                  <span className="text-[var(--color-text-muted)]">Token: </span>
                  <span className="font-mono font-bold text-[var(--color-text-primary)]">{releasedJob.tokenNumber}</span>
                </div>
                <div>
                  <span className="text-[var(--color-text-muted)]">Station: </span>
                  <span className="font-semibold text-[var(--color-text-primary)]">{releasedJob.stationName}</span>
                </div>
                <div>
                  <span className="text-[var(--color-text-muted)]">Output: </span>
                  <span className="font-semibold tabular-nums text-[var(--color-text-primary)]">
                    {releasedJob.sheets} sheets ({releasedJob.pages} pages)
                  </span>
                </div>
                <div>
                  <span className="text-[var(--color-text-muted)]">Payment: </span>
                  <span className="font-bold text-[var(--good)]">{releasedJob.paymentStatus}</span>
                </div>
              </div>

              <div className="text-[12px] text-[var(--color-text-secondary)] pt-2 border-t border-[var(--color-border)]">
                Pages are streaming to the Terminal 3 tray. Please collect your printout below.
              </div>
            </section>
          )}
        </div>
      ) : (
        <section className="portal-card p-5 space-y-4">
          <div className="text-center space-y-1">
            <h1 className="text-[18px] font-bold text-[var(--color-text-primary)]">
              Thermal Counter Slip (ESC/POS 80mm)
            </h1>
            <p className="text-[12.5px] text-[var(--color-text-muted)]">
              HSN 9989 GST-compliant token slip generated at intake counter
            </p>
          </div>

          <pre className="max-w-[340px] mx-auto p-4 rounded-[12px] bg-[#111318] text-[#e6ecf5] font-mono text-[11px] leading-relaxed border border-[var(--color-border-strong)] overflow-x-auto select-all whitespace-pre">
{`========================================
       AMAN COMPUTER SCAN2PRINT        
    Fast QR Print & Photocopy Shop     
       GSTIN: 10AAAAA0000A1Z5          
========================================
TOKEN NUMBER  : T-8821
PICKUP PIN    : [ 8821 ]
JOB NUMBER    : JOB-20261125-8821
CUSTOMER      : Walk-in Customer
DATE & TIME   : 2026-11-25 21:15:00
----------------------------------------
DESCRIPTION   : A4 B&W (Duplex)
PAGES / COPIES: 8 pgs x 1 cpy
TOTAL SHEETS  : 4 physical sheets
----------------------------------------
TAXABLE AMOUNT: Rs. 13.56
CGST (9%)     : Rs. 1.22
SGST (9%)     : Rs. 1.22
TOTAL INCL GST: Rs. 16.00
PAYMENT STATUS: PAID (UPI)
UTR REFERENCE : 433019882201
----------------------------------------
 Scan QR at Kiosk / Show Token at Counter 
 QR DATA: ACSCAN2PRINT:8821:16.00
========================================
     Thank you for choosing Aman!      
   Documents auto-deleted after print   
========================================`}
          </pre>

          <div className="text-center">
            <button
              type="button"
              onClick={() => {
                touchActivity();
                setActiveMode('pin');
                setEnteredPin('8821');
              }}
              className="portal-btn-primary px-4 py-2.5 text-[13px] inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Zap size={15} />
              <span>Load Sample PIN (8821) on Keypad</span>
            </button>
          </div>
        </section>
      )}

      {/* Fleet Stations Status Strip */}
      <section className="portal-card p-4 space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[12.5px] font-bold text-[var(--color-text-primary)]">
            Active Counter Printers Fleet
          </span>
          <span className="text-[11.5px] font-semibold text-[var(--good)]">
            3 Print Stations Online
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <div className="portal-card-subtle p-2.5 space-y-0.5">
            <div className="text-[12px] font-bold text-[var(--color-text-primary)] truncate">
              Counter 1 (B&amp;W)
            </div>
            <div className="text-[11px] text-[var(--color-text-muted)] tabular-nums">
              HP M507dn · 2 queued
            </div>
          </div>

          <div className="portal-card-subtle p-2.5 space-y-0.5">
            <div className="text-[12px] font-bold text-[var(--color-text-primary)] truncate">
              Counter 2 (Colour)
            </div>
            <div className="text-[11px] text-[var(--color-text-muted)] tabular-nums">
              Epson L8050 · 1 queued
            </div>
          </div>

          <div className="portal-card-subtle p-2.5 space-y-0.5">
            <div className="text-[12px] font-bold text-[var(--color-text-primary)] truncate">
              Kiosk Express Bay
            </div>
            <div className="text-[11px] font-semibold text-[var(--good)] tabular-nums">
              Canon LBP226 · Ready (0 wait)
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};
