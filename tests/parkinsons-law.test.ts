import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateCompressedTimeBox,
  generateSprintMilestones,
} from '../src/lib/discipline/parkinsons-law';

describe('Parkinson\'s Law Time-Box Compression Calculator (parkinsons-law.ts)', () => {
  describe('calculateCompressedTimeBox', () => {
    it('compresses a 60m moderate task with default medium urgency to 42m (sprint_50)', () => {
      const result = calculateCompressedTimeBox(60, 'moderate');
      assert.strictEqual(result.originalMinutes, 60);
      assert.strictEqual(result.compressedMinutes, 42);
      assert.strictEqual(result.minutesSaved, 18);
      assert.strictEqual(result.compressionRatio, 0.70);
      assert.strictEqual(result.recommendedSprintFormat, 'sprint_50');
      assert.strictEqual(result.urgencyTier, 'medium');
    });

    it('compresses a 120m epic task with high urgency to 96m (deep_block_90)', () => {
      // epic factor (0.85) - high urgency (0.05) = 0.80 -> 120 * 0.80 = 96m
      const result = calculateCompressedTimeBox(120, 'epic', 'high');
      assert.strictEqual(result.compressedMinutes, 96);
      assert.strictEqual(result.minutesSaved, 24);
      assert.strictEqual(result.compressionRatio, 0.80);
      assert.strictEqual(result.recommendedSprintFormat, 'deep_block_90');
    });

    it('relaxes compression factor with low urgency', () => {
      // complex (0.80) + low urgency (+0.05) = 0.85 -> 100 * 0.85 = 85m
      const result = calculateCompressedTimeBox(100, 'complex', 'low');
      assert.strictEqual(result.compressedMinutes, 85);
      assert.strictEqual(result.minutesSaved, 15);
      assert.strictEqual(result.compressionRatio, 0.85);
    });

    it('preserves small tasks under 15m without sub-15m compression penalty', () => {
      const result = calculateCompressedTimeBox(10, 'trivial');
      assert.strictEqual(result.originalMinutes, 10);
      assert.strictEqual(result.compressedMinutes, 10);
      assert.strictEqual(result.minutesSaved, 0);
      assert.strictEqual(result.recommendedSprintFormat, 'micro_sprint_15');
    });

    it('respects 15m lower bound for tasks >= 15m', () => {
      // 25m trivial with high urgency -> 25 * 0.55 = 13.75, but bound is 15m
      const result = calculateCompressedTimeBox(25, 'trivial', 'high');
      assert.strictEqual(result.compressedMinutes, 15);
      assert.strictEqual(result.minutesSaved, 10);
      assert.strictEqual(result.recommendedSprintFormat, 'micro_sprint_15');
    });

    it('assigns pomodoro_25 format for durations between 21m and 35m', () => {
      const result = calculateCompressedTimeBox(40, 'moderate'); // 40 * 0.70 = 28m
      assert.strictEqual(result.compressedMinutes, 28);
      assert.strictEqual(result.recommendedSprintFormat, 'pomodoro_25');
    });

    it('throws RangeError for non-positive or non-finite minutes', () => {
      assert.throws(() => calculateCompressedTimeBox(0, 'moderate'), RangeError);
      assert.throws(() => calculateCompressedTimeBox(-30, 'moderate'), RangeError);
      assert.throws(() => calculateCompressedTimeBox(NaN, 'moderate'), RangeError);
    });

    it('throws TypeError for invalid complexity or urgency', () => {
      // @ts-expect-error Testing invalid runtime input
      assert.throws(() => calculateCompressedTimeBox(60, 'invalid'), TypeError);
      // @ts-expect-error Testing invalid runtime input
      assert.throws(() => calculateCompressedTimeBox(60, 'moderate', 'extreme'), TypeError);
    });
  });

  describe('generateSprintMilestones', () => {
    it('generates 4 evenly spaced milestones for a 42m sprint', () => {
      const milestones = generateSprintMilestones(42);
      assert.strictEqual(milestones.length, 4);

      assert.strictEqual(milestones[0].percentComplete, 25);
      assert.strictEqual(milestones[0].minuteMarker, 10.5);

      assert.strictEqual(milestones[1].percentComplete, 50);
      assert.strictEqual(milestones[1].minuteMarker, 21.0);

      assert.strictEqual(milestones[2].percentComplete, 75);
      assert.strictEqual(milestones[2].minuteMarker, 31.5);

      assert.strictEqual(milestones[3].percentComplete, 100);
      assert.strictEqual(milestones[3].minuteMarker, 42.0);
    });

    it('throws RangeError for invalid duration', () => {
      assert.throws(() => generateSprintMilestones(0), RangeError);
      assert.throws(() => generateSprintMilestones(-10), RangeError);
    });
  });
});
