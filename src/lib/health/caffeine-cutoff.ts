/**
 * Pharmacokinetic Caffeine Clearance & Sleep Cutoff Calculator
 *
 * Implements evidence-based exponential metabolic decay calculations to compute
 * remaining active caffeine at bedtime, evaluate sleep disruption risk, and derive
 * personalized daily caffeine cutoffs.
 *
 * @module src/lib/health/caffeine-cutoff
 */

export type SleepDisruptionRisk = 'minimal' | 'moderate' | 'high';

export interface CaffeineIntakeLog {
  /** Caffeine in milligrams (e.g. 95 for brewed coffee, 150 for energy drink) */
  doseMg: number;
  /** ISO 8601 timestamp of consumption */
  consumedAtIso: string;
}

export interface CaffeineCalculatorOptions {
  /** Average metabolic half-life in hours (default: 5.0) */
  halfLifeHours?: number;
  /** Safe bedtime residual caffeine threshold in mg (default: 25.0) */
  safeBedtimeThresholdMg?: number;
}

export interface CaffeineClearanceReport {
  targetBedtimeIso: string;
  totalConsumedMg: number;
  remainingAtBedtimeMg: number;
  disruptionRisk: SleepDisruptionRisk;
  recommendedLastIntakeIso: string;
  hoursUntilSafeThreshold: number;
}

function parseValidDate(isoString: string, fieldName: string): number {
  if (typeof isoString !== 'string' || isoString.trim() === '') {
    throw new TypeError(`${fieldName} must be a non-empty ISO 8601 string`);
  }
  const timestamp = Date.parse(isoString);
  if (Number.isNaN(timestamp)) {
    throw new TypeError(`Invalid date format for ${fieldName}: "${isoString}"`);
  }
  return timestamp;
}

/**
 * Calculates remaining active caffeine at a target time across multiple consumption doses.
 * Uses the exponential clearance equation: C(t) = C0 * 0.5^(dt / t_half)
 *
 * @param doses Array of logged caffeine intake events
 * @param targetTimeIso Target assessment time (e.g. bedtime) as ISO 8601 string
 * @param halfLifeHours Metabolic half-life in hours (default 5.0)
 * @returns Total remaining caffeine in mg, rounded to 1 decimal place
 */
export function calculateRemainingCaffeine(
  doses: CaffeineIntakeLog[],
  targetTimeIso: string,
  halfLifeHours: number = 5.0
): number {
  if (!Number.isFinite(halfLifeHours) || halfLifeHours <= 0) {
    throw new RangeError(`halfLifeHours must be a positive number, got: ${halfLifeHours}`);
  }

  const targetMs = parseValidDate(targetTimeIso, 'targetTimeIso');

  let totalRemaining = 0;

  for (const dose of doses) {
    if (!Number.isFinite(dose.doseMg) || dose.doseMg < 0) {
      throw new RangeError(`doseMg must be a non-negative number, got: ${dose.doseMg}`);
    }

    const consumedMs = parseValidDate(dose.consumedAtIso, 'consumedAtIso');
    const elapsedHours = (targetMs - consumedMs) / (1000 * 60 * 60);

    // Ignore doses consumed in the future relative to the target assessment time
    if (elapsedHours < 0) {
      continue;
    }

    const remaining = dose.doseMg * Math.pow(0.5, elapsedHours / halfLifeHours);
    totalRemaining += remaining;
  }

  return Number(totalRemaining.toFixed(1));
}

/**
 * Calculates the latest time a planned dose can be consumed so that residual
 * caffeine clears to the safe threshold by bedtime.
 *
 * dt = t_half * log2(plannedDoseMg / threshold)
 *
 * @param targetBedtimeIso Target bedtime as ISO 8601 string
 * @param plannedDoseMg Caffeine dose in mg
 * @param options Calculation options
 * @returns ISO 8601 timestamp cutoff
 */
export function calculateCaffeineCutoffTime(
  targetBedtimeIso: string,
  plannedDoseMg: number,
  options?: CaffeineCalculatorOptions
): string {
  if (!Number.isFinite(plannedDoseMg) || plannedDoseMg < 0) {
    throw new RangeError(`plannedDoseMg must be a non-negative number, got: ${plannedDoseMg}`);
  }

  const bedtimeMs = parseValidDate(targetBedtimeIso, 'targetBedtimeIso');
  const halfLife = options?.halfLifeHours ?? 5.0;
  const threshold = options?.safeBedtimeThresholdMg ?? 25.0;

  if (halfLife <= 0) {
    throw new RangeError('halfLifeHours must be > 0');
  }
  if (threshold <= 0) {
    throw new RangeError('safeBedtimeThresholdMg must be > 0');
  }

  if (plannedDoseMg <= threshold) {
    return new Date(bedtimeMs).toISOString();
  }

  const requiredHalfLives = Math.log2(plannedDoseMg / threshold);
  const clearanceHours = halfLife * requiredHalfLives;
  const cutoffMs = bedtimeMs - Math.round(clearanceHours * 3600 * 1000);

  return new Date(cutoffMs).toISOString();
}

/**
 * Evaluates sleep architecture disruption risk based on residual caffeine at bedtime.
 *
 * - <= 25.0 mg -> 'minimal' (negligible slow-wave sleep suppression)
 * - 25.1 mg to 60.0 mg -> 'moderate' (delayed sleep onset latency)
 * - > 60.0 mg -> 'high' (significant REM/deep sleep impairment)
 */
export function evaluateSleepDisruptionRisk(remainingMg: number): SleepDisruptionRisk {
  if (remainingMg <= 25.0) {
    return 'minimal';
  }
  if (remainingMg <= 60.0) {
    return 'moderate';
  }
  return 'high';
}

/**
 * Generates an end-of-day caffeine clearance and bedtime sleep risk report.
 */
export function generateCaffeineClearanceReport(
  doses: CaffeineIntakeLog[],
  targetBedtimeIso: string,
  options?: CaffeineCalculatorOptions
): CaffeineClearanceReport {
  const halfLife = options?.halfLifeHours ?? 5.0;
  const threshold = options?.safeBedtimeThresholdMg ?? 25.0;

  const totalConsumedMg = doses.reduce((sum, d) => sum + (d.doseMg > 0 ? d.doseMg : 0), 0);
  const remainingAtBedtimeMg = calculateRemainingCaffeine(doses, targetBedtimeIso, halfLife);
  const disruptionRisk = evaluateSleepDisruptionRisk(remainingAtBedtimeMg);

  let hoursUntilSafeThreshold = 0;
  if (remainingAtBedtimeMg > threshold) {
    const halfLivesNeeded = Math.log2(remainingAtBedtimeMg / threshold);
    hoursUntilSafeThreshold = Number((halfLife * halfLivesNeeded).toFixed(1));
  }

  const plannedDose = doses.length > 0 ? doses[doses.length - 1].doseMg : 100;
  const recommendedLastIntakeIso = calculateCaffeineCutoffTime(
    targetBedtimeIso,
    plannedDose,
    options
  );

  return {
    targetBedtimeIso,
    totalConsumedMg,
    remainingAtBedtimeMg,
    disruptionRisk,
    recommendedLastIntakeIso,
    hoursUntilSafeThreshold,
  };
}
