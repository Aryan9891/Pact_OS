import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  generateErgonomicSchedule,
  getNextErgonomicBreak,
  formatBreakCueNotification,
} from '../src/lib/health/ergonomic-break';

describe('Ergonomic 20-20-20 & Micro-Break Scheduler (ergonomic-break.ts)', () => {
  describe('generateErgonomicSchedule', () => {
    it('schedules 1 eye break for a 25-minute Pomodoro session at minute 20', () => {
      const schedule = generateErgonomicSchedule(25);
      assert.strictEqual(schedule.sessionDurationMinutes, 25);
      assert.strictEqual(schedule.totalBreaksCount, 1);
      assert.strictEqual(schedule.totalRecoverySeconds, 20);
      assert.strictEqual(schedule.cues[0].minuteOffset, 20);
      assert.strictEqual(schedule.cues[0].type, 'eye_rest_20_20_20');
      assert.strictEqual(schedule.cues[0].durationSeconds, 20);
    });

    it('schedules breaks at 20m, 40m, 45m hydration, and 60m posture upgrade for a 60m session', () => {
      const schedule = generateErgonomicSchedule(60);
      assert.strictEqual(schedule.totalBreaksCount, 4);

      // Cue 1: 20m eye rest
      assert.strictEqual(schedule.cues[0].minuteOffset, 20);
      assert.strictEqual(schedule.cues[0].type, 'eye_rest_20_20_20');

      // Cue 2: 40m eye rest
      assert.strictEqual(schedule.cues[1].minuteOffset, 40);
      assert.strictEqual(schedule.cues[1].type, 'eye_rest_20_20_20');

      // Cue 3: 45m hydration checkin
      assert.strictEqual(schedule.cues[2].minuteOffset, 45);
      assert.strictEqual(schedule.cues[2].type, 'hydration_checkin');

      // Cue 4: 60m posture reset (upgrades eye break)
      assert.strictEqual(schedule.cues[3].minuteOffset, 60);
      assert.strictEqual(schedule.cues[3].type, 'posture_stretch');
      assert.strictEqual(schedule.cues[3].durationSeconds, 60);

      // Total recovery: 20 + 20 + 30 + 60 = 130s (~2.17 min)
      assert.strictEqual(schedule.totalRecoverySeconds, 130);
    });

    it('allows disabling hydration checkins', () => {
      const schedule = generateErgonomicSchedule(60, { includeHydration: false });
      assert.strictEqual(schedule.totalBreaksCount, 3); // 20m, 40m, 60m
      assert.ok(!schedule.cues.some(c => c.type === 'hydration_checkin'));
    });

    it('supports custom interval overrides', () => {
      const schedule = generateErgonomicSchedule(30, {
        eyeBreakIntervalMinutes: 10,
      });
      // 10m, 20m, 30m
      assert.strictEqual(schedule.totalBreaksCount, 3);
      assert.strictEqual(schedule.cues[0].minuteOffset, 10);
      assert.strictEqual(schedule.cues[1].minuteOffset, 20);
      assert.strictEqual(schedule.cues[2].minuteOffset, 30);
    });

    it('returns empty cues array for sessions shorter than shortest interval', () => {
      const schedule = generateErgonomicSchedule(15);
      assert.strictEqual(schedule.totalBreaksCount, 0);
      assert.strictEqual(schedule.cues.length, 0);
      assert.strictEqual(schedule.effectiveFocusMinutes, 15);
    });

    it('throws RangeError for invalid session duration or intervals', () => {
      assert.throws(() => generateErgonomicSchedule(0), RangeError);
      assert.throws(() => generateErgonomicSchedule(-25), RangeError);
      assert.throws(
        () => generateErgonomicSchedule(60, { eyeBreakIntervalMinutes: 0 }),
        RangeError
      );
    });
  });

  describe('getNextErgonomicBreak', () => {
    it('returns the next upcoming break in a session', () => {
      const nextBreak = getNextErgonomicBreak(25, 60);
      assert.notStrictEqual(nextBreak, null);
      assert.strictEqual(nextBreak?.minuteOffset, 40);
    });

    it('returns null when past the last break of the session', () => {
      const nextBreak = getNextErgonomicBreak(60, 60);
      assert.strictEqual(nextBreak, null);
    });
  });

  describe('formatBreakCueNotification', () => {
    it('formats notification strings correctly', () => {
      const eyeCue = {
        minuteOffset: 20,
        durationSeconds: 20,
        type: 'eye_rest_20_20_20' as const,
        prompt: 'Rest eyes',
        suggestedAction: 'Look 20 feet away into the distance.',
      };
      const formatted = formatBreakCueNotification(eyeCue);
      assert.ok(formatted.includes('20-20-20 Eye Break (20s)'));
      assert.ok(formatted.includes('Look 20 feet away'));
    });
  });
});
