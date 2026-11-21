import React, { useId, useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Banknote,
  Check,
  Copy,
  Image as ImageIcon,
  Info,
  Minus,
  Plus,
  QrCode,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { ErrorAlert } from '../components/LoadingEmptyError';
import { WorkflowStepper } from '../components/WorkflowStepper';
import { usePortal } from '../context/PortalContext';
import { calculateEstimateBreakdown, formatInr } from '../lib/pricing';
import {
  formatFileSize,
  parseCustomPageRange,
  validateClientEvidenceFile,
  validateOptionalPhone,
  validateUtrInput,
} from '../lib/validation';
import type { Orientation, PaperSize, PaymentMethod, PrintMode, PrintSides, ScalingMode } from '../types/portal';

export const OptionsAndPaymentPage: React.FC = () => {
  const {
    capabilities,
    paymentSettings,
    selectedFiles,
    preferences,
    updatePreferences,
    totalDetectedPages,
    effectivePagesPerCopy,
    submittingOrder,
    submitOrderError,
    submitPrintOrder,
    navigate,
  } = usePortal();

  const [subStep, setSubStep] = useState<'options' | 'payment'>('options');
  const [rangeMode, setRangeMode] = useState<'all' | 'custom'>(
    preferences.requestedPageRange === 'all' ? 'all' : 'custom'
  );
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('upi');
  const [utrInput, setUtrInput] = useState('');
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null);
  const [evidenceError, setEvidenceError] = useState<string | null>(null);
  const [localFormError, setLocalFormError] = useState<string | null>(null);
  const [copiedUpi, setCopiedUpi] = useState(false);

  const evidenceInputId = useId();
  const rangeInputId = useId();
  const nameInputId = useId();
  const phoneInputId = useId();
  const utrInputId = useId();

  const uploadedFiles = selectedFiles.filter((f) => f.status === 'uploaded');

  const pageRangeValidation = useMemo(() => {
    if (rangeMode === 'all') {
      return { valid: true, selectedPageCount: totalDetectedPages, normalized: 'all', error: null };
    }
    return parseCustomPageRange(preferences.requestedPageRange, totalDetectedPages || undefined);
  }, [rangeMode, preferences.requestedPageRange, totalDetectedPages]);

  const phoneValidation = useMemo(
    () => validateOptionalPhone(preferences.customerPhone),
    [preferences.customerPhone]
  );

  const estimate = useMemo(
    () =>
      calculateEstimateBreakdown({
        pagesPerCopy: effectivePagesPerCopy,
        copies: preferences.copies,
        paperSize: preferences.paperSize,
        printMode: preferences.printMode,
        printSides: preferences.printSides,
        rules: capabilities?.pricingRules ?? [],
      }),
    [effectivePagesPerCopy, preferences, capabilities]
  );

  if (uploadedFiles.length === 0) {
    return (
      <div className="space-y-4">
        <WorkflowStepper currentStep="options" />
        <section className="portal-card p-6 text-center space-y-3">
          <h1 className="text-[20px] font-bold">Upload documents first</h1>
          <p className="text-[13.5px] text-[var(--color-text-muted)]">
            Select and upload at least one PDF, JPG, or PNG file before configuring print options.
          </p>
          <button
            type="button"
            onClick={() => navigate('/quick-print/upload')}
            className="portal-btn-primary px-5 py-2.5 text-[14px] inline-flex items-center justify-center gap-2 cursor-pointer"
          >
            <span>Go to Document Upload</span>
          </button>
        </section>
      </div>
    );
  }

  const maxCopies = capabilities?.maxCopies ?? 20;
  const supportedSizes = capabilities?.supportedPaperSizes ?? (['A4'] as readonly PaperSize[]);
  const supportedModes = capabilities?.supportedPrintModes ?? (['bw', 'colour'] as readonly PrintMode[]);
  const supportedSides = capabilities?.supportedPrintSides ?? (['single', 'duplex'] as readonly PrintSides[]);
  const supportedOrientations =
    capabilities?.supportedOrientations ?? (['auto', 'portrait', 'landscape'] as readonly Orientation[]);
  const supportedScaling =
    capabilities?.supportedScalingModes ?? (['fit', 'actual'] as readonly ScalingMode[]);

  const upiAvailable = Boolean(paymentSettings?.upiEnabled && paymentSettings.upiId);

  const handleAdvanceToPayment = () => {
    setLocalFormError(null);
    if (!pageRangeValidation.valid) {
      setLocalFormError(pageRangeValidation.error || 'Enter a valid page range.');
      return;
    }
    if (!phoneValidation.valid) {
      setLocalFormError(phoneValidation.error || 'Enter a valid phone number.');
      return;
    }
    if (!upiAvailable) {
      setPaymentMethod('cash');
    }
    setSubStep('payment');
    window.scrollTo({ top: 0, behavior: 'auto' });
  };

  const handleSubmitOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalFormError(null);

    if (paymentMethod === 'upi') {
      if (!upiAvailable) {
        setLocalFormError('UPI payment is currently disabled by shop settings. Choose Cash at Counter.');
        return;
      }
      const utrCheck = validateUtrInput(utrInput);
      if (!utrCheck.valid) {
        setLocalFormError(utrCheck.error || 'Enter a valid UPI Transaction Reference (UTR).');
        return;
      }
      await submitPrintOrder({
        paymentMethod: 'upi',
        utrReference: utrCheck.normalized,
        evidenceFile,
      }).catch(() => {});
      return;
    }

    await submitPrintOrder({ paymentMethod: 'cash' }).catch(() => {});
  };

  const handleCopyUpiId = async () => {
    if (!paymentSettings?.upiId) return;
    try {
      await navigator.clipboard.writeText(paymentSettings.upiId);
      setCopiedUpi(true);
      window.setTimeout(() => setCopiedUpi(false), 1800);
    } catch {
      // Clipboard fallback not needed
    }
  };

  return (
    <div className="space-y-4">
      <WorkflowStepper currentStep={subStep} />

      {subStep === 'options' ? (
        <div className="space-y-4">
          <section className="portal-card p-5 sm:p-6 space-y-5">
            <div>
              <h1 className="text-[22px] sm:text-[24px] font-bold leading-tight">
                Print options & price estimate
              </h1>
              <p className="text-[13px] text-[var(--color-text-muted)] mt-1 tabular-nums">
                {uploadedFiles.length} {uploadedFiles.length === 1 ? 'file' : 'files'} ·{' '}
                {totalDetectedPages} detected {totalDetectedPages === 1 ? 'page' : 'pages'}
              </p>
            </div>

            {/* Print Mode (B&W / Colour) */}
            <div className="space-y-2">
              <span className="block text-[13px] font-bold text-[var(--color-text-primary)]">
                Print Colour Mode
              </span>
              <div className="grid grid-cols-2 gap-2.5" role="radiogroup" aria-label="Print Colour Mode">
                {supportedModes.map((mode) => {
                  const selected = preferences.printMode === mode;
                  return (
                    <button
                      key={mode}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => updatePreferences({ printMode: mode })}
                      className={`min-h-[48px] px-3.5 py-2.5 rounded-[12px] border text-left transition-colors cursor-pointer ${
                        selected
                          ? 'bg-[var(--ac-cyan-soft)] border-[var(--ac-cyan)] text-[var(--color-text-primary)]'
                          : 'bg-[var(--color-surface-subtle)] border-[var(--color-border)] text-[var(--color-text-secondary)]'
                      }`}
                    >
                      <div className="text-[13.5px] font-bold">
                        {mode === 'bw' ? 'Black & White' : 'Full Colour'}
                      </div>
                      <div className="text-[11.5px] text-[var(--color-text-muted)]">
                        {mode === 'bw' ? 'Standard monochrome' : 'Colour inkjet/laser'}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Paper Size & Sides */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <span className="block text-[13px] font-bold">Paper Size</span>
                <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Paper Size">
                  {supportedSizes.map((size) => {
                    const selected = preferences.paperSize === size;
                    return (
                      <button
                        key={size}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        onClick={() => updatePreferences({ paperSize: size })}
                        className={`min-h-[44px] px-4 rounded-[10px] border text-[13.5px] font-bold cursor-pointer ${
                          selected
                            ? 'bg-[var(--ac-cyan-soft)] border-[var(--ac-cyan)] text-[var(--color-text-primary)]'
                            : 'bg-[var(--color-surface-subtle)] border-[var(--color-border)] text-[var(--color-text-secondary)]'
                        }`}
                      >
                        {size}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-2">
                <span className="block text-[13px] font-bold">Print Sides</span>
                <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Print Sides">
                  {supportedSides.map((sides) => {
                    const selected = preferences.printSides === sides;
                    return (
                      <button
                        key={sides}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        onClick={() => updatePreferences({ printSides: sides })}
                        className={`min-h-[44px] px-3 rounded-[10px] border text-[13px] font-bold cursor-pointer ${
                          selected
                            ? 'bg-[var(--ac-cyan-soft)] border-[var(--ac-cyan)] text-[var(--color-text-primary)]'
                            : 'bg-[var(--color-surface-subtle)] border-[var(--color-border)] text-[var(--color-text-secondary)]'
                        }`}
                      >
                        {sides === 'single' ? 'Single-sided' : 'Double-sided'}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Copies & Page Range */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <span className="block text-[13px] font-bold">Copies (1–{maxCopies})</span>
                <div className="inline-flex items-center gap-2">
                  <button
                    type="button"
                    aria-label="Decrease copies"
                    disabled={preferences.copies <= 1}
                    onClick={() => updatePreferences({ copies: Math.max(1, preferences.copies - 1) })}
                    className="portal-btn-secondary w-11 h-11 inline-flex items-center justify-center cursor-pointer disabled:opacity-40"
                  >
                    <Minus size={16} />
                  </button>
                  <span
                    className="w-12 text-center text-[16px] font-bold tabular-nums"
                    aria-live="polite"
                  >
                    {preferences.copies}
                  </span>
                  <button
                    type="button"
                    aria-label="Increase copies"
                    disabled={preferences.copies >= maxCopies}
                    onClick={() =>
                      updatePreferences({ copies: Math.min(maxCopies, preferences.copies + 1) })
                    }
                    className="portal-btn-secondary w-11 h-11 inline-flex items-center justify-center cursor-pointer disabled:opacity-40"
                  >
                    <Plus size={16} />
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <span className="block text-[13px] font-bold">Page Range</span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setRangeMode('all');
                      updatePreferences({ requestedPageRange: 'all' });
                    }}
                    className={`min-h-[44px] px-3.5 rounded-[10px] border text-[13px] font-bold cursor-pointer ${
                      rangeMode === 'all'
                        ? 'bg-[var(--ac-cyan-soft)] border-[var(--ac-cyan)]'
                        : 'bg-[var(--color-surface-subtle)] border-[var(--color-border)]'
                    }`}
                  >
                    All Pages
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setRangeMode('custom');
                      if (preferences.requestedPageRange === 'all') {
                        updatePreferences({ requestedPageRange: '' });
                      }
                    }}
                    className={`min-h-[44px] px-3.5 rounded-[10px] border text-[13px] font-bold cursor-pointer ${
                      rangeMode === 'custom'
                        ? 'bg-[var(--ac-cyan-soft)] border-[var(--ac-cyan)]'
                        : 'bg-[var(--color-surface-subtle)] border-[var(--color-border)]'
                    }`}
                  >
                    Custom
                  </button>
                </div>
                {rangeMode === 'custom' && (
                  <div className="pt-1">
                    <label htmlFor={rangeInputId} className="sr-only">
                      Custom page range
                    </label>
                    <input
                      id={rangeInputId}
                      type="text"
                      placeholder="e.g. 1-3, 5"
                      value={preferences.requestedPageRange === 'all' ? '' : preferences.requestedPageRange}
                      onChange={(e) => updatePreferences({ requestedPageRange: e.target.value })}
                      className="portal-input w-full px-3 text-[13.5px]"
                    />
                    {!pageRangeValidation.valid && pageRangeValidation.error && (
                      <p className="text-[12px] text-[var(--bad)] font-medium mt-1">
                        {pageRangeValidation.error}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Orientation & Scaling */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label htmlFor="orientation-select" className="block text-[13px] font-bold">
                  Orientation
                </label>
                <select
                  id="orientation-select"
                  value={preferences.orientation}
                  onChange={(e) => updatePreferences({ orientation: e.target.value as Orientation })}
                  className="portal-input w-full px-3 text-[13.5px] capitalize"
                >
                  {supportedOrientations.map((o) => (
                    <option key={o} value={o}>
                      {o === 'auto' ? 'Auto-detect' : o.charAt(0).toUpperCase() + o.slice(1)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="scaling-select" className="block text-[13px] font-bold">
                  Page Scaling
                </label>
                <select
                  id="scaling-select"
                  value={preferences.scaling}
                  onChange={(e) => updatePreferences({ scaling: e.target.value as ScalingMode })}
                  className="portal-input w-full px-3 text-[13.5px]"
                >
                  {supportedScaling.map((s) => (
                    <option key={s} value={s}>
                      {s === 'fit' ? 'Fit to printable page' : 'Actual size (100%)'}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Optional Counter Callout Info */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-2 border-t border-[var(--color-border)]">
              <div>
                <label htmlFor={nameInputId} className="block text-[12.5px] font-semibold mb-1">
                  Your Name <span className="text-[var(--color-text-muted)] font-normal">(optional for pickup)</span>
                </label>
                <input
                  id={nameInputId}
                  type="text"
                  maxLength={80}
                  value={preferences.customerName}
                  onChange={(e) => updatePreferences({ customerName: e.target.value })}
                  placeholder="Optional"
                  className="portal-input w-full px-3 text-[13.5px]"
                />
              </div>
              <div>
                <label htmlFor={phoneInputId} className="block text-[12.5px] font-semibold mb-1">
                  Mobile / WhatsApp <span className="text-[var(--color-text-muted)] font-normal">(optional)</span>
                </label>
                <input
                  id={phoneInputId}
                  type="tel"
                  maxLength={20}
                  value={preferences.customerPhone}
                  onChange={(e) => updatePreferences({ customerPhone: e.target.value })}
                  placeholder="Optional 10-digit number"
                  className="portal-input w-full px-3 text-[13.5px]"
                />
                {!phoneValidation.valid && phoneValidation.error && (
                  <p className="text-[12px] text-[var(--bad)] font-medium mt-1">
                    {phoneValidation.error}
                  </p>
                )}
              </div>
            </div>
          </section>

          {/* Price Summary Card (Spec §7.3 & Phase 1 PRD §5.1) */}
          <section className="portal-card p-5 space-y-3" aria-labelledby="price-summary-heading">
            <div className="flex items-center justify-between gap-2">
              <h2 id="price-summary-heading" className="text-[16px] font-bold">
                Price Summary (Estimate)
              </h2>
              {estimate.isMockEstimate && (
                <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-[var(--warn-soft)] text-[var(--warn)]">
                  Sample Rate
                </span>
              )}
            </div>

            <dl className="space-y-1.5 text-[13px]">
              <div className="flex justify-between gap-2">
                <dt className="text-[var(--color-text-muted)]">Configuration</dt>
                <dd className="font-semibold">
                  {preferences.paperSize} · {preferences.printMode === 'bw' ? 'B&W' : 'Colour'} ·{' '}
                  {preferences.printSides === 'duplex' ? 'Double-sided' : 'Single-sided'}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-[var(--color-text-muted)]">Printed Pages × Copies</dt>
                <dd className="font-semibold tabular-nums">
                  {effectivePagesPerCopy} × {preferences.copies} = {estimate.printedPagesTotal} pages (
                  {estimate.physicalSheetsTotal} physical sheets)
                </dd>
              </div>
              {estimate.matchedRule && (
                <div className="flex justify-between gap-2">
                  <dt className="text-[var(--color-text-muted)]">Rate Basis</dt>
                  <dd className="font-semibold tabular-nums">
                    {formatInr(estimate.matchedRule.rate)}{' '}
                    {estimate.matchedRule.pricingUnit === 'per_physical_sheet'
                      ? 'per sheet'
                      : 'per page'}
                  </dd>
                </div>
              )}
              <div className="flex justify-between items-baseline gap-2 pt-2 border-t border-[var(--color-border)]">
                <dt className="text-[14.5px] font-bold">Estimated Total</dt>
                <dd className="text-[20px] font-bold text-[var(--color-accent)] tabular-nums">
                  {estimate.pricingConfigured
                    ? formatInr(estimate.finalEstimatedAmount)
                    : 'Counter confirmation'}
                </dd>
              </div>
            </dl>

            <div className="flex items-start gap-2 text-[12px] text-[var(--color-text-muted)] bg-[var(--color-surface-subtle)] p-2.5 rounded-[10px]">
              <Info size={15} className="shrink-0 mt-0.5 text-[var(--color-accent)]" aria-hidden="true" />
              <span>
                Estimated total only — final price will be confirmed by Aman Computer counter staff after document verification.
              </span>
            </div>
          </section>

          {localFormError && <ErrorAlert title="Check your options" message={localFormError} />}

          <div className="flex flex-col-reverse sm:flex-row justify-between gap-2.5">
            <button
              type="button"
              onClick={() => navigate('/quick-print/upload')}
              className="portal-btn-secondary px-4 py-2.5 text-[14px] inline-flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <ArrowLeft size={16} aria-hidden="true" />
              <span>Back to Upload</span>
            </button>

            <button
              type="button"
              onClick={handleAdvanceToPayment}
              className="portal-btn-primary px-5 py-2.5 text-[14.5px] inline-flex items-center justify-center gap-2 cursor-pointer"
            >
              <span>Review & Payment</span>
              <ArrowRight size={16} aria-hidden="true" />
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmitOrder} className="space-y-4">
          <section className="portal-card p-5 sm:p-6 space-y-4">
            <div>
              <h1 className="text-[22px] sm:text-[24px] font-bold leading-tight">
                Payment & final submission
              </h1>
              <p className="text-[13px] text-[var(--color-text-muted)] mt-1">
                Estimated amount:{' '}
                <strong className="text-[var(--color-text-primary)] tabular-nums">
                  {estimate.pricingConfigured
                    ? formatInr(estimate.finalEstimatedAmount)
                    : 'Confirmed at counter'}
                </strong>
              </p>
            </div>

            {/* Payment Choice Selector */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5" role="radiogroup" aria-label="Payment method">
              <button
                type="button"
                role="radio"
                aria-checked={paymentMethod === 'upi'}
                disabled={!upiAvailable}
                onClick={() => setPaymentMethod('upi')}
                className={`p-3.5 rounded-[14px] border text-left flex items-start gap-2.5 cursor-pointer disabled:opacity-50 ${
                  paymentMethod === 'upi'
                    ? 'bg-[var(--ac-cyan-soft)] border-[var(--ac-cyan)]'
                    : 'bg-[var(--color-surface-subtle)] border-[var(--color-border)]'
                }`}
              >
                <QrCode size={18} className="text-[var(--color-accent)] shrink-0 mt-0.5" />
                <div>
                  <div className="text-[14px] font-bold">Pay via UPI</div>
                  <div className="text-[12px] text-[var(--color-text-muted)]">
                    {upiAvailable ? 'Scan QR & submit UTR reference' : 'Currently unavailable'}
                  </div>
                </div>
              </button>

              <button
                type="button"
                role="radio"
                aria-checked={paymentMethod === 'cash'}
                onClick={() => setPaymentMethod('cash')}
                className={`p-3.5 rounded-[14px] border text-left flex items-start gap-2.5 cursor-pointer ${
                  paymentMethod === 'cash'
                    ? 'bg-[var(--ac-cyan-soft)] border-[var(--ac-cyan)]'
                    : 'bg-[var(--color-surface-subtle)] border-[var(--color-border)]'
                }`}
              >
                <Banknote size={18} className="text-[var(--good)] shrink-0 mt-0.5" />
                <div>
                  <div className="text-[14px] font-bold">Pay Cash at Counter</div>
                  <div className="text-[12px] text-[var(--color-text-muted)]">
                    Pay shop staff before printing begins
                  </div>
                </div>
              </button>
            </div>

            {/* UPI Details + UTR + Screenshot Evidence */}
            {paymentMethod === 'upi' && upiAvailable && paymentSettings && (
              <div className="portal-card-subtle p-4 space-y-4">
                <div className="flex flex-col sm:flex-row items-center gap-4">
                  {paymentSettings.upiQrSignedUrl ? (
                    <div className="p-2.5 rounded-[14px] bg-white border border-[var(--color-border)] shrink-0">
                      <img
                        src={paymentSettings.upiQrSignedUrl}
                        alt="Aman Computer UPI Payment QR Code"
                        className="w-36 h-36 object-contain"
                      />
                    </div>
                  ) : (
                    <div className="w-36 h-36 rounded-[14px] bg-[var(--color-surface)] border border-[var(--color-border)] flex items-center justify-center text-[12px] text-[var(--color-text-muted)] text-center p-3">
                      QR image not set — use UPI ID below
                    </div>
                  )}

                  <div className="space-y-2 text-center sm:text-left flex-1 min-w-0">
                    <div className="text-[13px] font-bold">{paymentSettings.displayName}</div>
                    {paymentSettings.upiId && (
                      <div className="flex items-center justify-center sm:justify-start gap-2 flex-wrap">
                        <code className="px-2.5 py-1 rounded-[8px] bg-[var(--color-surface)] border border-[var(--color-border)] text-[13px] font-semibold">
                          {paymentSettings.upiId}
                        </code>
                        <button
                          type="button"
                          onClick={() => void handleCopyUpiId()}
                          className="portal-btn-secondary px-3 py-1.5 text-[12px] min-h-[36px] inline-flex items-center gap-1 cursor-pointer"
                        >
                          {copiedUpi ? <Check size={13} /> : <Copy size={13} />}
                          <span>{copiedUpi ? 'Copied' : 'Copy UPI ID'}</span>
                        </button>
                      </div>
                    )}
                    <p className="text-[12px] text-[var(--color-text-muted)]">
                      {paymentSettings.paymentInstructions}
                    </p>
                  </div>
                </div>

                <div>
                  <label htmlFor={utrInputId} className="block text-[13px] font-bold mb-1">
                    UPI Transaction Reference / UTR <span className="text-[var(--bad)]">*</span>
                  </label>
                  <input
                    id={utrInputId}
                    type="text"
                    required
                    value={utrInput}
                    onChange={(e) => setUtrInput(e.target.value)}
                    placeholder="Enter 12-digit UTR (e.g. 432198765432)"
                    className="portal-input w-full px-3.5 text-[14px] tabular-nums"
                  />
                  <p className="text-[11.5px] text-[var(--color-text-muted)] mt-1">
                    Submitting a UTR marks payment as <strong>Pending Verification</strong>. Printing begins only after staff confirm receipt.
                  </p>
                </div>

                <div className="space-y-2">
                  <span className="block text-[13px] font-bold">
                    Payment Screenshot <span className="text-[var(--color-text-muted)] font-normal">(optional, max 10 MB)</span>
                  </span>
                  {!evidenceFile ? (
                    <label
                      htmlFor={evidenceInputId}
                      className="portal-btn-secondary px-4 py-2.5 text-[13px] inline-flex items-center gap-2 cursor-pointer"
                    >
                      <ImageIcon size={16} aria-hidden="true" />
                      <span>Attach Payment Screenshot</span>
                      <input
                        id={evidenceInputId}
                        type="file"
                        accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                        className="sr-only"
                        onChange={(e) => {
                          setEvidenceError(null);
                          const f = e.target.files?.[0];
                          if (!f) return;
                          const check = validateClientEvidenceFile({
                            name: f.name,
                            type: f.type,
                            size: f.size,
                          });
                          if (!check.valid) {
                            setEvidenceError(check.error);
                            return;
                          }
                          setEvidenceFile(f);
                          e.target.value = '';
                        }}
                      />
                    </label>
                  ) : (
                    <div className="flex items-center justify-between gap-2 p-2.5 rounded-[10px] bg-[var(--color-surface)] border border-[var(--color-border)] text-[13px]">
                      <span className="truncate font-semibold">
                        {evidenceFile.name} ({formatFileSize(evidenceFile.size)})
                      </span>
                      <button
                        type="button"
                        onClick={() => setEvidenceFile(null)}
                        aria-label="Remove payment screenshot"
                        className="min-w-[40px] min-h-[40px] rounded-[8px] text-[var(--bad)] inline-flex items-center justify-center cursor-pointer"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  )}
                  {evidenceError && (
                    <p className="text-[12px] text-[var(--bad)] font-semibold">{evidenceError}</p>
                  )}
                </div>
              </div>
            )}

            {paymentMethod === 'cash' && (
              <div className="portal-card-subtle p-4 text-[13px] text-[var(--color-text-secondary)] flex items-start gap-2.5">
                <ShieldCheck size={17} className="text-[var(--good)] shrink-0 mt-0.5" />
                <span>
                  After submitting, show your <strong>Job Number</strong> at the Aman Computer counter to confirm pricing and pay in cash.
                </span>
              </div>
            )}

            {/* Review Before Submit Summary */}
            <div className="portal-card-subtle p-3.5 space-y-1 text-[12.5px]">
              <div className="font-bold text-[var(--color-text-primary)]">Review before submitting</div>
              <div className="text-[var(--color-text-muted)]">
                {uploadedFiles.map((f) => f.filename).join(', ')} · {preferences.paperSize} ·{' '}
                {preferences.printMode === 'bw' ? 'B&W' : 'Colour'} · {preferences.copies}{' '}
                {preferences.copies === 1 ? 'copy' : 'copies'} ·{' '}
                {preferences.printSides === 'duplex' ? 'Double-sided' : 'Single-sided'}
              </div>
            </div>
          </section>

          {(localFormError || submitOrderError) && (
            <ErrorAlert
              title="Submission could not be completed"
              message={localFormError || submitOrderError || 'Please verify your details.'}
            />
          )}

          <div className="flex flex-col-reverse sm:flex-row justify-between gap-2.5">
            <button
              type="button"
              disabled={submittingOrder}
              onClick={() => {
                setLocalFormError(null);
                setSubStep('options');
              }}
              className="portal-btn-secondary px-4 py-2.5 text-[14px] inline-flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <ArrowLeft size={16} aria-hidden="true" />
              <span>Edit Print Options</span>
            </button>

            <button
              type="submit"
              disabled={submittingOrder}
              className="portal-btn-primary px-6 py-2.5 text-[15px] inline-flex items-center justify-center gap-2 cursor-pointer"
            >
              <span>{submittingOrder ? 'Submitting Request...' : 'Submit Print Request'}</span>
              <ArrowRight size={16} aria-hidden="true" />
            </button>
          </div>
        </form>
      )}
    </div>
  );
};
