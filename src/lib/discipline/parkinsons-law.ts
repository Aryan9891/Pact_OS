/**
 * Parkinson's Law Task Time-Box Compression Factor Calculator
 *
 * Combats Parkinson's Law ("work expands to fill the time allotted for its completion")
 * by computing realistic, high-urgency compressed sprint durations and checkpoint
 * milestones for focused task execution in Pact OS.
 *
 * @module src/lib/discipline/parkinsons-law
 */

export type TaskComplexity = 'trivial' | 'moderate' | 'complex' | 'epic';
export type SprintUrgency = 'low' | 'medium' | 'high';

export interface CompressedTimeBoxResult {
  originalMinutes: number;
  compressedMinutes: number;
  minutesSaved: number;
  compressionRatio: number;
  urgencyTier: SprintUrgency;
  recommendedSprintFormat: 'micro_sprint_15' | 'pomodoro_25' | 'sprint_50' | 'deep_block_90';
}

export interface SprintMilestone {
  percentComplete: number; // 25, 50, 75, 100
  minuteMarker: number; // Elapsed minute mark
  milestoneLabel: string; // Concrete goal reminder
}

const BASE_COMPRESSION_FACTORS: Record<TaskComplexity, number> = {
  trivial: 0.60, // 40% reduction
  moderate: 0.70, // 30% reduction
  complex: 0.80, // 20% reduction
  epic: 0.85, // 15% reduction
};

const URGENCY_MODIFIERS: Record<SprintUrgency, number> = {
  high: -0.05,
  medium: 0.0,
  low: 0.05,
};

/**
 * Calculates a compressed, Parkinson's Law-resistant focus time box.
 *
 * @param originalMinutes Estimated duration in minutes (must be > 0)
 * @param complexity Task complexity tier
 * @param urgency Urgency modifier (default 'medium')
 * @returns Compression calculations and recommended sprint format
 * @throws {RangeError} If originalMinutes is <= 0 or not finite
 */
export function calculateCompressedTimeBox(
  originalMinutes: number,
  complexity: TaskComplexity,
  urgency: SprintUrgency = 'medium'
): CompressedTimeBoxResult {
  if (!Number.isFinite(originalMinutes) || originalMinutes <= 0) {
    throw new RangeError(`originalMinutes must be a positive number, got: ${originalMinutes}`);
  }

  const baseFactor = BASE_COMPRESSION_FACTORS[complexity];
  if (baseFactor === undefined) {
    throw new TypeError(`Invalid complexity tier: ${complexity}`);
  }

  const urgencyMod = URGENCY_MODIFIERS[urgency];
  if (urgencyMod === undefined) {
    throw new TypeError(`Invalid urgency tier: ${urgency}`);
  }

  const rawFactor = Math.round((baseFactor + urgencyMod) * 100) / 100;
  const rawCompressed = Math.round(originalMinutes * rawFactor);

  // Minimum viable focus block rule:
  // Never compresses below 15m unless the original estimate was already under 15m.
  let compressedMinutes: number;
  if (originalMinutes < 15) {
    compressedMinutes = originalMinutes;
  } else {
    compressedMinutes = Math.max(15, rawCompressed);
  }

  const minutesSaved = originalMinutes - compressedMinutes;
  const compressionRatio = Number((compressedMinutes / originalMinutes).toFixed(2));

  let recommendedSprintFormat: CompressedTimeBoxResult['recommendedSprintFormat'];
  if (compressedMinutes <= 20) {
    recommendedSprintFormat = 'micro_sprint_15';
  } else if (compressedMinutes <= 35) {
    recommendedSprintFormat = 'pomodoro_25';
  } else if (compressedMinutes <= 70) {
    recommendedSprintFormat = 'sprint_50';
  } else {
    recommendedSprintFormat = 'deep_block_90';
  }

  return {
    originalMinutes,
    compressedMinutes,
    minutesSaved,
    compressionRatio,
    urgencyTier: urgency,
    recommendedSprintFormat,
  };
}

/**
 * Generates 4 disciplined milestone checkpoints at 25%, 50%, 75%, and 100% of sprint time.
 *
 * @param compressedMinutes Duration in minutes of the compressed sprint
 * @returns Array of 4 SprintMilestone markers
 * @throws {RangeError} If compressedMinutes is <= 0 or not finite
 */
export function generateSprintMilestones(compressedMinutes: number): SprintMilestone[] {
  if (!Number.isFinite(compressedMinutes) || compressedMinutes <= 0) {
    throw new RangeError(`compressedMinutes must be a positive number, got: ${compressedMinutes}`);
  }

  const milestonesConfig: Array<{ percent: number; label: string }> = [
    {
      percent: 25,
      label: 'Quarter check-in: Foundation established & distractions cleared',
    },
    {
      percent: 50,
      label: 'Halfway checkpoint: Core functionality implemented',
    },
    {
      percent: 75,
      label: 'Three-quarter checkpoint: Edge cases covered & polish underway',
    },
    {
      percent: 100,
      label: 'Sprint complete: Verification & commit ready',
    },
  ];

  return milestonesConfig.map(m => ({
    percentComplete: m.percent,
    minuteMarker: Number((compressedMinutes * (m.percent / 100)).toFixed(1)),
    milestoneLabel: m.label,
  }));
}
