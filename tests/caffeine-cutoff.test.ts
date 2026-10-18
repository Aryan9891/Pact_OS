import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateRemainingCaffeine,
  calculateCaffeineCutoffTime,
  evaluateSleepDisruptionRisk,
  generateCaffeineClearanceReport,
} from '../src/lib/health/caffeine-cutoff';

describe('Caffeine Pharmacokinetics & Bedtime Sleep Cutoff (caffeine-cutoff.ts)', () => {
  const baseBedtime = '2026-10-19T23:00:00.000Z';

  describe('calculateRemainingCaffeine', () => {
    it('calculates 50.0mg remaining for a 100mg dose consumed 5 hours before bedtime', () => {
      // 5h before 23:00 is 18:00
      const doses = [{ doseMg: 100, consumedAtIso: '2026-10-19T18:00:00.000Z' }];
      const remaining = calculateRemainingCaffeine(doses, baseBedtime);
      assert.strictEqual(remaining, 50.0);
    });

    it('calculates 25.0mg remaining for a 100mg dose consumed 10 hours before bedtime', () => {
      // 10h before 23:00 is 13:00
      const doses = [{ doseMg: 100, consumedAtIso: '2026-10-19T13:00:00.000Z' }];
      const remaining = calculateRemainingCaffeine(doses, baseBedtime);
      assert.strictEqual(remaining, 25.0);
    });

    it('sums remaining amounts across multiple doses taken throughout the day', () => {
      const doses = [
        // 95mg at 08:00 (15h before 23:00 -> 3 half-lives -> 95 * 0.125 = 11.875)
        { doseMg: 95, consumedAtIso: '2026-10-19T08:00:00.000Z' },
        // 50mg at 13:00 (10h before 23:00 -> 2 half-lives -> 50 * 0.25 = 12.5)
        { doseMg: 50, consumedAtIso: '2026-10-19T13:00:00.000Z' },
      ];
      // Total = 11.875 + 12.5 = 24.375 -> 24.4 mg
      const remaining = calculateRemainingCaffeine(doses, baseBedtime);
      assert.strictEqual(remaining, 24.4);
    });

    it('ignores doses consumed in the future relative to the assessment time', () => {
      const doses = [
        { doseMg: 100, consumedAtIso: '2026-10-20T02:00:00.000Z' }, // after bedtime
        { doseMg: 100, consumedAtIso: '2026-10-19T18:00:00.000Z' }, // 5h before
      ];
      const remaining = calculateRemainingCaffeine(doses, baseBedtime);
      assert.strictEqual(remaining, 50.0);
    });

    it('throws TypeError on invalid date strings and RangeError on negative doses', () => {
      assert.throws(() => calculateRemainingCaffeine([], 'not-a-date'), TypeError);
      assert.throws(
        () =>
          calculateRemainingCaffeine(
            [{ doseMg: -50, consumedAtIso: '2026-10-19T12:00:00.000Z' }],
            baseBedtime
          ),
        RangeError
      );
    });
  });

  describe('calculateCaffeineCutoffTime', () => {
    it('calculates 8:00 AM cutoff for a 200mg dose with 23:00 bedtime (3 half-lives / 15 hours)', () => {
      // 200mg / 25mg threshold = 8 = 2^3 half-lives = 15 hours before 23:00 = 08:00
      const cutoff = calculateCaffeineCutoffTime(baseBedtime, 200);
      assert.strictEqual(cutoff, '2026-10-19T08:00:00.000Z');
    });

    it('returns target bedtime if planned dose is already at or below safe threshold', () => {
      const cutoff = calculateCaffeineCutoffTime(baseBedtime, 20);
      assert.strictEqual(cutoff, baseBedtime);
    });
  });

  describe('evaluateSleepDisruptionRisk', () => {
    it('categorizes risk accurately by remaining threshold', () => {
      assert.strictEqual(evaluateSleepDisruptionRisk(20.0), 'minimal');
      assert.strictEqual(evaluateSleepDisruptionRisk(25.0), 'minimal');
      assert.strictEqual(evaluateSleepDisruptionRisk(45.0), 'moderate');
      assert.strictEqual(evaluateSleepDisruptionRisk(60.0), 'moderate');
      assert.strictEqual(evaluateSleepDisruptionRisk(65.0), 'high');
    });
  });

  describe('generateCaffeineClearanceReport', () => {
    it('produces a comprehensive daily clearance report', () => {
      const doses = [
        { doseMg: 150, consumedAtIso: '2026-10-19T13:00:00.000Z' }, // 10h before (37.5mg left)
      ];
      const report = generateCaffeineClearanceReport(doses, baseBedtime);
      assert.strictEqual(report.totalConsumedMg, 150);
      assert.strictEqual(report.remainingAtBedtimeMg, 37.5);
      assert.strictEqual(report.disruptionRisk, 'moderate');
      assert.ok(report.hoursUntilSafeThreshold > 0);
      assert.ok(report.recommendedLastIntakeIso.includes('2026-10-19'));
    });
  });
});
