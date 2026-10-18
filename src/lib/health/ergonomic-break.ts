/**
 * Ergonomic 20-20-20 Screen Rest & Posture Micro-Break Scheduler
 *
 * Implements evidence-based ergonomic micro-break schedules according to the
 * American Optometric Association 20-20-20 rule (every 20 minutes of screen time,
 * look 20 feet away for 20 seconds) paired with hourly posture resets and hydration
 * cues during focus sessions in Pact OS.
 *
 * @module src/lib/health/ergonomic-break
 */

export type ErgonomicBreakType = 'eye_rest_20_20_20' | 'posture_stretch' | 'hydration_checkin';

export interface ErgonomicBreakCue {
  /** Minute mark during session when break occurs (e.g. 20, 40, 60) */
  minuteOffset: number;
  /** Duration in seconds (20s for eye rest, 60s for posture, 30s for hydration) */
  durationSeconds: number;
  type: ErgonomicBreakType;
  prompt: string;
  suggestedAction: string;
}

export interface ErgonomicScheduleOptions {
  /** Interval in minutes between eye rest cues (default: 20) */
  eyeBreakIntervalMinutes?: number;
  /** Interval in minutes between posture resets (default: 60) */
  postureBreakIntervalMinutes?: number;
  /** Interval in minutes between hydration cues (default: 45) */
  hydrationIntervalMinutes?: number;
  /** Whether to include hydration cues (default: true) */
  includeHydration?: boolean;
}

export interface ErgonomicSessionSchedule {
  sessionDurationMinutes: number;
  totalBreaksCount: number;
  totalRecoverySeconds: number;
  effectiveFocusMinutes: number;
  cues: ErgonomicBreakCue[];
}

/**
 * Generates deterministic ergonomic break cues for a given session length.
 *
 * @param sessionMinutes Total length of focus session in minutes
 * @param options Schedule intervals and toggle options
 * @returns Complete session break schedule
 * @throws {RangeError} If sessionMinutes <= 0 or not finite
 */
export function generateErgonomicSchedule(
  sessionMinutes: number,
  options?: ErgonomicScheduleOptions
): ErgonomicSessionSchedule {
  if (!Number.isFinite(sessionMinutes) || sessionMinutes <= 0) {
    throw new RangeError(`sessionMinutes must be a positive number, got: ${sessionMinutes}`);
  }

  const eyeInterval = options?.eyeBreakIntervalMinutes ?? 20;
  const postureInterval = options?.postureBreakIntervalMinutes ?? 60;
  const hydrationInterval = options?.hydrationIntervalMinutes ?? 45;
  const includeHydration = options?.includeHydration ?? true;

  if (eyeInterval <= 0 || postureInterval <= 0 || hydrationInterval <= 0) {
    throw new RangeError('All break intervals must be positive integers');
  }

  const cuesMap = new Map<number, ErgonomicBreakCue>();

  for (let m = 1; m <= sessionMinutes; m++) {
    const isPosture = m % postureInterval === 0;
    const isHydration = includeHydration && m % hydrationInterval === 0;
    const isEye = m % eyeInterval === 0;

    if (isPosture) {
      // Posture break takes highest precedence on collision
      cuesMap.set(m, {
        minuteOffset: m,
        durationSeconds: 60,
        type: 'posture_stretch',
        prompt: 'Stand up and reset spinal posture',
        suggestedAction: 'Stand up, roll your shoulders back, and perform 60 seconds of gentle spinal decompression.',
      });
    } else if (isHydration) {
      // Hydration check-in takes precedence over standard eye break
      cuesMap.set(m, {
        minuteOffset: m,
        durationSeconds: 30,
        type: 'hydration_checkin',
        prompt: 'Hydrate your brain and body',
        suggestedAction: 'Drink a glass of water to sustain peak cognitive alertness.',
      });
    } else if (isEye) {
      // Standard 20-20-20 eye rest
      cuesMap.set(m, {
        minuteOffset: m,
        durationSeconds: 20,
        type: 'eye_rest_20_20_20',
        prompt: 'Rest your eyes with 20-20-20 rule',
        suggestedAction: 'Look at an object at least 20 feet away for 20 seconds to relax ciliary eye muscles.',
      });
    }
  }

  const cues = Array.from(cuesMap.values()).sort((a, b) => a.minuteOffset - b.minuteOffset);
  const totalBreaksCount = cues.length;
  const totalRecoverySeconds = cues.reduce((sum, c) => sum + c.durationSeconds, 0);
  const effectiveFocusMinutes = Number(
    (sessionMinutes - totalRecoverySeconds / 60).toFixed(2)
  );

  return {
    sessionDurationMinutes: sessionMinutes,
    totalBreaksCount,
    totalRecoverySeconds,
    effectiveFocusMinutes,
    cues,
  };
}

/**
 * Finds the immediate next upcoming break cue during an ongoing session.
 *
 * @param elapsedMinutes Minutes already completed in the session
 * @param sessionMinutes Total length of session in minutes
 * @param options Break configuration options
 * @returns The next break cue, or null if no further breaks remain
 */
export function getNextErgonomicBreak(
  elapsedMinutes: number,
  sessionMinutes: number,
  options?: ErgonomicScheduleOptions
): ErgonomicBreakCue | null {
  if (!Number.isFinite(elapsedMinutes) || elapsedMinutes < 0) {
    throw new RangeError(`elapsedMinutes must be a non-negative number, got: ${elapsedMinutes}`);
  }

  const schedule = generateErgonomicSchedule(sessionMinutes, options);
  const nextCue = schedule.cues.find(cue => cue.minuteOffset > elapsedMinutes);

  return nextCue ?? null;
}

/**
 * Formats a break cue into a clean notification string.
 */
export function formatBreakCueNotification(cue: ErgonomicBreakCue): string {
  switch (cue.type) {
    case 'eye_rest_20_20_20':
      return `👀 20-20-20 Eye Break (${cue.durationSeconds}s): ${cue.suggestedAction}`;
    case 'posture_stretch':
      return `🧘 Posture Reset (${cue.durationSeconds}s): ${cue.suggestedAction}`;
    case 'hydration_checkin':
      return `💧 Hydration Break (${cue.durationSeconds}s): ${cue.suggestedAction}`;
  }
}
