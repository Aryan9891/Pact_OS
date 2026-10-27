/**
 * PACT Accountability OS — Reverse Dutch Auction Escalating Penalty Price Decaying Multiplier
 *
 * Implements the Escalating Grace Buyout Model:
 * When a deadline passes, a configurable grace period begins (default 12 hours).
 * Rather than immediate binary forfeiture of the entire bond, the penalty fee escalates
 * monotonically from a base fee up to the total bond amount.
 *
 * Supported escalation curves:
 *  - quadratic: Fee(t) = BaseFee + (MaxFee - BaseFee) * (t / T_grace)^2
 *  - linear:    Fee(t) = BaseFee + (MaxFee - BaseFee) * (t / T_grace)
 *  - exponential: Normalized exponential curve scaling from BaseFee to MaxFee
 *
 * Precision:
 *  - All calculations enforce integer-cents precision (no fractional cents).
 */

export type EscalationCurveType = 'quadratic' | 'linear' | 'exponential';

export interface DutchAuctionConfig {
  /** Total duration of late recovery grace period in hours. Must be > 0. Default: 12 */
  gracePeriodHours: number;
  /** Initial buyout fee in integer cents at t = 0. Default: 500 ($5.00) */
  baseFeeCents: number;
  /** Maximum forfeiture bond in integer cents at t >= T_grace. Default: 5000 ($50.00) */
  maxBondCents: number;
  /** Mathematical curve used to escalate the penalty over time. Default: 'quadratic' */
  escalationCurve: EscalationCurveType;
}

export interface DutchAuctionCurrentState {
  /** Elapsed whole minutes since the deadline. Negative if current time is before deadline */
  elapsedMinutesSinceDeadline: number;
  /** True strictly while elapsed time is >= 0 and < T_grace */
  isGracePeriodActive: boolean;
  /** Current calculated settlement buyout fee in integer cents */
  currentBuyoutFeeCents: number;
  /** Percentage of maximum bond forfeited (0.00 to 100.00) */
  forfeiturePercentage: number;
  /** Integer cents saved compared to waiting until full forfeiture */
  centsSavedIfSettledNow: number;
  /** Remaining whole minutes in the grace window before 100% bond forfeiture */
  minutesRemainingInGrace: number;
}

export interface DutchAuctionScheduleStep {
  hour: number;
  elapsedMinutes: number;
  buyoutFeeCents: number;
  forfeiturePercentage: number;
  centsSaved: number;
}

export const DEFAULT_DUTCH_AUCTION_CONFIG: DutchAuctionConfig = {
  gracePeriodHours: 12,
  baseFeeCents: 500, // $5.00
  maxBondCents: 5000, // $50.00
  escalationCurve: 'quadratic',
};

/**
 * Validates and merges configuration with defaults.
 */
export function resolveDutchAuctionConfig(config?: Partial<DutchAuctionConfig>): DutchAuctionConfig {
  const merged: DutchAuctionConfig = {
    gracePeriodHours: config?.gracePeriodHours ?? DEFAULT_DUTCH_AUCTION_CONFIG.gracePeriodHours,
    baseFeeCents: config?.baseFeeCents ?? DEFAULT_DUTCH_AUCTION_CONFIG.baseFeeCents,
    maxBondCents: config?.maxBondCents ?? DEFAULT_DUTCH_AUCTION_CONFIG.maxBondCents,
    escalationCurve: config?.escalationCurve ?? DEFAULT_DUTCH_AUCTION_CONFIG.escalationCurve,
  };

  if (!Number.isFinite(merged.gracePeriodHours) || merged.gracePeriodHours <= 0) {
    throw new RangeError(`gracePeriodHours must be a finite positive number, received: ${merged.gracePeriodHours}`);
  }

  if (!Number.isSafeInteger(merged.baseFeeCents) || merged.baseFeeCents < 0) {
    throw new RangeError(`baseFeeCents must be a non-negative integer, received: ${merged.baseFeeCents}`);
  }

  if (!Number.isSafeInteger(merged.maxBondCents) || merged.maxBondCents < merged.baseFeeCents) {
    throw new RangeError(
      `maxBondCents must be an integer greater than or equal to baseFeeCents (${merged.baseFeeCents}), received: ${merged.maxBondCents}`
    );
  }

  if (!['quadratic', 'linear', 'exponential'].includes(merged.escalationCurve)) {
    throw new TypeError(`Invalid escalationCurve: '${merged.escalationCurve}'. Must be 'quadratic', 'linear', or 'exponential'.`);
  }

  return merged;
}

/**
 * Parses an ISO date string safely and validates it.
 */
function parseDateOrThrow(isoString: string, fieldName: string): number {
  if (typeof isoString !== 'string' || !isoString.trim()) {
    throw new TypeError(`${fieldName} must be a valid non-empty ISO date string`);
  }
  const timestamp = Date.parse(isoString);
  if (Number.isNaN(timestamp)) {
    throw new RangeError(`${fieldName} is not a valid date string: "${isoString}"`);
  }
  return timestamp;
}

/**
 * Computes the normalized escalation factor [0.0, 1.0] given a fraction [0.0, 1.0].
 */
function computeCurveMultiplier(fraction: number, curve: EscalationCurveType): number {
  const clampedFraction = Math.max(0, Math.min(1, fraction));

  switch (curve) {
    case 'linear':
      return clampedFraction;
    case 'quadratic':
      return clampedFraction * clampedFraction;
    case 'exponential': {
      // Normalized exponential: (e^(2*f) - 1) / (e^2 - 1)
      const k = 2;
      return (Math.exp(k * clampedFraction) - 1) / (Math.exp(k) - 1);
    }
    default:
      return clampedFraction * clampedFraction;
  }
}

/**
 * Calculates the current buyout fee and accountability metrics for an overdue pact.
 *
 * @param deadlineIso ISO 8601 string of the commitment deadline
 * @param currentInstantIso ISO 8601 string of the evaluation timestamp
 * @param config Optional configuration overrides
 * @returns DutchAuctionCurrentState with exact integer-cent amounts
 */
export function calculateCurrentBuyoutFee(
  deadlineIso: string,
  currentInstantIso: string,
  config?: Partial<DutchAuctionConfig>
): DutchAuctionCurrentState {
  const resolvedConfig = resolveDutchAuctionConfig(config);
  const deadlineMs = parseDateOrThrow(deadlineIso, 'deadlineIso');
  const currentMs = parseDateOrThrow(currentInstantIso, 'currentInstantIso');

  const elapsedMs = currentMs - deadlineMs;
  const elapsedMinutes = Math.floor(elapsedMs / (60 * 1000));
  const totalGraceMs = resolvedConfig.gracePeriodHours * 60 * 60 * 1000;
  const totalGraceMinutes = resolvedConfig.gracePeriodHours * 60;

  // Case 1: Before deadline (t < 0)
  if (elapsedMs < 0) {
    return {
      elapsedMinutesSinceDeadline: elapsedMinutes,
      isGracePeriodActive: false,
      currentBuyoutFeeCents: 0,
      forfeiturePercentage: 0,
      centsSavedIfSettledNow: resolvedConfig.maxBondCents,
      minutesRemainingInGrace: totalGraceMinutes,
    };
  }

  // Case 2: Past grace period expiration (t >= T_grace)
  if (elapsedMs >= totalGraceMs) {
    return {
      elapsedMinutesSinceDeadline: elapsedMinutes,
      isGracePeriodActive: false,
      currentBuyoutFeeCents: resolvedConfig.maxBondCents,
      forfeiturePercentage: 100,
      centsSavedIfSettledNow: 0,
      minutesRemainingInGrace: 0,
    };
  }

  // Case 3: Within active grace window (0 <= t < T_grace)
  const fraction = elapsedMs / totalGraceMs;
  const curveMultiplier = computeCurveMultiplier(fraction, resolvedConfig.escalationCurve);

  const feeDelta = resolvedConfig.maxBondCents - resolvedConfig.baseFeeCents;
  const unroundedFee = resolvedConfig.baseFeeCents + feeDelta * curveMultiplier;
  const currentBuyoutFeeCents = Math.min(
    resolvedConfig.maxBondCents,
    Math.max(resolvedConfig.baseFeeCents, Math.round(unroundedFee))
  );

  const rawPercentage = (currentBuyoutFeeCents / resolvedConfig.maxBondCents) * 100;
  const forfeiturePercentage = Math.round(rawPercentage * 100) / 100;
  const centsSavedIfSettledNow = Math.max(0, resolvedConfig.maxBondCents - currentBuyoutFeeCents);
  const remainingMs = totalGraceMs - elapsedMs;
  const minutesRemainingInGrace = Math.max(0, Math.ceil(remainingMs / (60 * 1000)));

  return {
    elapsedMinutesSinceDeadline: elapsedMinutes,
    isGracePeriodActive: true,
    currentBuyoutFeeCents,
    forfeiturePercentage,
    centsSavedIfSettledNow,
    minutesRemainingInGrace,
  };
}

/**
 * Generates an hourly breakdown of the escalating buyout fee schedule.
 * Useful for displaying transparent countdown tables to users in accountability circles.
 */
export function generateEscalationSchedule(
  config?: Partial<DutchAuctionConfig>,
  stepHours: number = 1
): DutchAuctionScheduleStep[] {
  const resolvedConfig = resolveDutchAuctionConfig(config);
  if (!Number.isFinite(stepHours) || stepHours <= 0) {
    throw new RangeError(`stepHours must be a positive number, received: ${stepHours}`);
  }

  const steps: DutchAuctionScheduleStep[] = [];
  const baseTime = Date.now();
  const deadlineIso = new Date(baseTime).toISOString();

  for (let h = 0; h <= resolvedConfig.gracePeriodHours; h += stepHours) {
    const currentIso = new Date(baseTime + h * 3600 * 1000).toISOString();
    const state = calculateCurrentBuyoutFee(deadlineIso, currentIso, resolvedConfig);
    steps.push({
      hour: h,
      elapsedMinutes: h * 60,
      buyoutFeeCents: state.currentBuyoutFeeCents,
      forfeiturePercentage: state.forfeiturePercentage,
      centsSaved: state.centsSavedIfSettledNow,
    });
  }

  return steps;
}
