// AC Scan2Print — Single Authoritative Server-Side Pricing Engine
// Zero hardcoded INR rates: missing/inactive rules fail safely with PRICING_NOT_CONFIGURED.
// Duplex billing strictly enforces pricing_unit === 'per_physical_sheet'.

import {
  AppError,
  type PaperSize,
  type PrintMode,
  type PrintPricingRule,
  type PrintSides,
} from './types.ts';

export interface PricingCalculationInput {
  paperSize: PaperSize;
  printMode: PrintMode;
  printSides: PrintSides;
  verifiedPageCount: number;
  copies: number;
  rule: PrintPricingRule | null;
  nowIso?: string;
}

export interface PricingCalculationResult {
  pricingRuleId: string;
  pricingUnit: PrintPricingRule['pricing_unit'];
  rate: number;
  minimumCharge: number;
  verifiedPageCount: number;
  physicalSheetCount: number;
  billableUnitsPerCopy: number;
  copies: number;
  subtotal: number;
  finalAmount: number;
  currency: 'INR';
}

export function calculatePhysicalSheets(verifiedPageCount: number, printSides: PrintSides): number {
  if (!Number.isInteger(verifiedPageCount) || verifiedPageCount < 1) {
    throw new AppError(400, 'INVALID_PAGE_COUNT', 'Verified page count must be an integer >= 1.');
  }
  if (printSides === 'duplex') {
    return Math.ceil(verifiedPageCount / 2);
  }
  return verifiedPageCount;
}

function roundInr(paise: number): number {
  return Math.round(paise) / 100;
}

export function computeServerPrice(input: PricingCalculationInput): PricingCalculationResult {
  if (!Number.isInteger(input.copies) || input.copies < 1) {
    throw new AppError(400, 'INVALID_COPIES', 'Copies must be an integer >= 1.');
  }

  const physicalSheetCount = calculatePhysicalSheets(input.verifiedPageCount, input.printSides);
  const rule = input.rule;

  if (!rule || !rule.is_active) {
    throw new AppError(
      422,
      'PRICING_NOT_CONFIGURED',
      `Active pricing rule is not configured for ${input.paperSize} / ${input.printMode} / ${input.printSides}.`
    );
  }

  const nowMs = input.nowIso ? Date.parse(input.nowIso) : Date.now();
  const validFromMs = Date.parse(rule.valid_from);
  if (Number.isFinite(validFromMs) && nowMs < validFromMs) {
    throw new AppError(422, 'PRICING_NOT_CONFIGURED', 'Pricing rule is not yet active.');
  }
  if (rule.valid_until) {
    const validUntilMs = Date.parse(rule.valid_until);
    if (Number.isFinite(validUntilMs) && nowMs > validUntilMs) {
      throw new AppError(422, 'PRICING_NOT_CONFIGURED', 'Pricing rule has expired.');
    }
  }

  if (
    rule.paper_size !== input.paperSize ||
    rule.print_mode !== input.printMode ||
    rule.print_sides !== input.printSides
  ) {
    throw new AppError(500, 'PRICING_RULE_MISMATCH', 'Pricing rule does not match requested job options.');
  }

  // Approved Owner Decision OD-09: duplex jobs MUST be billed per_physical_sheet
  if (input.printSides === 'duplex' && rule.pricing_unit !== 'per_physical_sheet') {
    throw new AppError(
      500,
      'INVALID_DUPLEX_PRICING_UNIT',
      'Duplex pricing rules must use pricing_unit = per_physical_sheet.'
    );
  }

  if (!Number.isFinite(rule.rate) || rule.rate < 0 || !Number.isFinite(rule.minimum_charge) || rule.minimum_charge < 0) {
    throw new AppError(500, 'INVALID_PRICING_RATE', 'Pricing rule contains invalid non-finite or negative rates.');
  }

  const billableUnitsPerCopy =
    rule.pricing_unit === 'per_physical_sheet' ? physicalSheetCount : input.verifiedPageCount;

  // Integer paise arithmetic prevents IEEE-754 floating-point drift (e.g. 0.1 + 0.2)
  const ratePaise = Math.round(rule.rate * 100);
  const minimumPaise = Math.round(rule.minimum_charge * 100);
  const rawTotalPaise = ratePaise * billableUnitsPerCopy * input.copies;
  const finalPaise = minimumPaise > 0 ? Math.max(rawTotalPaise, minimumPaise) : rawTotalPaise;

  return {
    pricingRuleId: rule.id,
    pricingUnit: rule.pricing_unit,
    rate: roundInr(ratePaise),
    minimumCharge: roundInr(minimumPaise),
    verifiedPageCount: input.verifiedPageCount,
    physicalSheetCount,
    billableUnitsPerCopy,
    copies: input.copies,
    subtotal: roundInr(rawTotalPaise),
    finalAmount: roundInr(finalPaise),
    currency: 'INR',
  };
}
