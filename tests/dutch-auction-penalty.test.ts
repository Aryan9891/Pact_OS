import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateCurrentBuyoutFee,
  generateEscalationSchedule,
  resolveDutchAuctionConfig,
  DEFAULT_DUTCH_AUCTION_CONFIG,
} from '../src/lib/finance/dutch-auction-penalty';

describe('Reverse Dutch Auction Escalating Penalty Price Decaying Multiplier (dutch-auction-penalty.ts)', () => {
  const baseDeadline = '2026-10-27T12:00:00.000Z';

  describe('resolveDutchAuctionConfig', () => {
    it('returns default configuration when no overrides are passed', () => {
      const config = resolveDutchAuctionConfig();
      assert.strictEqual(config.gracePeriodHours, DEFAULT_DUTCH_AUCTION_CONFIG.gracePeriodHours);
      assert.strictEqual(config.baseFeeCents, DEFAULT_DUTCH_AUCTION_CONFIG.baseFeeCents);
      assert.strictEqual(config.maxBondCents, DEFAULT_DUTCH_AUCTION_CONFIG.maxBondCents);
      assert.strictEqual(config.escalationCurve, DEFAULT_DUTCH_AUCTION_CONFIG.escalationCurve);
    });

    it('merges partial overrides correctly', () => {
      const config = resolveDutchAuctionConfig({
        baseFeeCents: 1000,
        maxBondCents: 10000,
        escalationCurve: 'linear',
      });
      assert.strictEqual(config.baseFeeCents, 1000);
      assert.strictEqual(config.maxBondCents, 10000);
      assert.strictEqual(config.escalationCurve, 'linear');
      assert.strictEqual(config.gracePeriodHours, 12);
    });

    it('throws RangeError for non-positive or non-finite gracePeriodHours', () => {
      assert.throws(() => resolveDutchAuctionConfig({ gracePeriodHours: 0 }), RangeError);
      assert.throws(() => resolveDutchAuctionConfig({ gracePeriodHours: -5 }), RangeError);
      assert.throws(() => resolveDutchAuctionConfig({ gracePeriodHours: Number.NaN }), RangeError);
      assert.throws(() => resolveDutchAuctionConfig({ gracePeriodHours: Number.POSITIVE_INFINITY }), RangeError);
    });

    it('throws RangeError for negative baseFeeCents or fractional baseFeeCents', () => {
      assert.throws(() => resolveDutchAuctionConfig({ baseFeeCents: -100 }), RangeError);
      assert.throws(() => resolveDutchAuctionConfig({ baseFeeCents: 5.5 }), RangeError);
    });

    it('throws RangeError when maxBondCents is less than baseFeeCents', () => {
      assert.throws(
        () => resolveDutchAuctionConfig({ baseFeeCents: 5000, maxBondCents: 2000 }),
        RangeError
      );
    });

    it('throws TypeError for unsupported escalation curves', () => {
      // @ts-expect-error Testing invalid curve input
      assert.throws(() => resolveDutchAuctionConfig({ escalationCurve: 'hyperbolic' }), TypeError);
    });
  });

  describe('calculateCurrentBuyoutFee: Date Validation', () => {
    it('throws TypeError for non-string or empty date parameters', () => {
      // @ts-expect-error Testing null date parameter
      assert.throws(() => calculateCurrentBuyoutFee(null, baseDeadline), TypeError);
      assert.throws(() => calculateCurrentBuyoutFee(baseDeadline, ''), TypeError);
      assert.throws(() => calculateCurrentBuyoutFee(baseDeadline, '   '), TypeError);
    });

    it('throws RangeError for invalid unparseable date strings', () => {
      assert.throws(() => calculateCurrentBuyoutFee('not-a-date', baseDeadline), RangeError);
      assert.throws(() => calculateCurrentBuyoutFee(baseDeadline, 'invalid-iso'), RangeError);
    });
  });

  describe('calculateCurrentBuyoutFee: Boundary & Escalation Logic', () => {
    it('returns zero fee when evaluated before deadline (t < 0)', () => {
      // 30 minutes before deadline
      const evaluationTime = '2026-10-27T11:30:00.000Z';
      const state = calculateCurrentBuyoutFee(baseDeadline, evaluationTime);

      assert.strictEqual(state.isGracePeriodActive, false);
      assert.strictEqual(state.currentBuyoutFeeCents, 0);
      assert.strictEqual(state.forfeiturePercentage, 0);
      assert.strictEqual(state.centsSavedIfSettledNow, 5000); // 100% of default bond
      assert.strictEqual(state.minutesRemainingInGrace, 720); // 12 * 60
      assert.strictEqual(state.elapsedMinutesSinceDeadline, -30);
    });

    it('evaluates exactly at the deadline (t = 0) with baseFeeCents', () => {
      const state = calculateCurrentBuyoutFee(baseDeadline, baseDeadline);

      assert.strictEqual(state.isGracePeriodActive, true);
      assert.strictEqual(state.currentBuyoutFeeCents, 500); // Base fee: $5.00
      assert.strictEqual(state.forfeiturePercentage, 10.0); // 500 / 5000 * 100
      assert.strictEqual(state.centsSavedIfSettledNow, 4500); // $50 - $5
      assert.strictEqual(state.minutesRemainingInGrace, 720);
      assert.strictEqual(state.elapsedMinutesSinceDeadline, 0);
    });

    it('escalates quadratically at 25% elapsed time (t = 3h of 12h)', () => {
      // 3 hours after deadline: fraction = 3/12 = 0.25 -> fraction^2 = 0.0625
      // Fee = 500 + (5000 - 500) * 0.0625 = 500 + 281.25 = 781 cents ($7.81)
      const evaluationTime = '2026-10-27T15:00:00.000Z';
      const state = calculateCurrentBuyoutFee(baseDeadline, evaluationTime);

      assert.strictEqual(state.isGracePeriodActive, true);
      assert.strictEqual(state.currentBuyoutFeeCents, 781);
      assert.strictEqual(state.forfeiturePercentage, 15.62);
      assert.strictEqual(state.centsSavedIfSettledNow, 4219);
      assert.strictEqual(state.minutesRemainingInGrace, 540); // 9 hours left
      assert.strictEqual(state.elapsedMinutesSinceDeadline, 180);
    });

    it('escalates quadratically at 50% elapsed time (t = 6h of 12h)', () => {
      // 6 hours after deadline: fraction = 6/12 = 0.5 -> fraction^2 = 0.25
      // Fee = 500 + (5000 - 500) * 0.25 = 500 + 1125 = 1625 cents ($16.25)
      const evaluationTime = '2026-10-27T18:00:00.000Z';
      const state = calculateCurrentBuyoutFee(baseDeadline, evaluationTime);

      assert.strictEqual(state.isGracePeriodActive, true);
      assert.strictEqual(state.currentBuyoutFeeCents, 1625);
      assert.strictEqual(state.forfeiturePercentage, 32.5);
      assert.strictEqual(state.centsSavedIfSettledNow, 3375);
      assert.strictEqual(state.minutesRemainingInGrace, 360); // 6 hours left
      assert.strictEqual(state.elapsedMinutesSinceDeadline, 360);
    });

    it('escalates linearly when linear curve is selected', () => {
      // 6 hours after deadline: fraction = 0.5
      // Fee = 500 + (5000 - 500) * 0.5 = 500 + 2250 = 2750 cents ($27.50)
      const evaluationTime = '2026-10-27T18:00:00.000Z';
      const state = calculateCurrentBuyoutFee(baseDeadline, evaluationTime, {
        escalationCurve: 'linear',
      });

      assert.strictEqual(state.isGracePeriodActive, true);
      assert.strictEqual(state.currentBuyoutFeeCents, 2750);
      assert.strictEqual(state.forfeiturePercentage, 55.0);
      assert.strictEqual(state.centsSavedIfSettledNow, 2250);
    });

    it('escalates with exponential curve and maintains strict bounds', () => {
      const evaluationTime = '2026-10-27T18:00:00.000Z';
      const state = calculateCurrentBuyoutFee(baseDeadline, evaluationTime, {
        escalationCurve: 'exponential',
      });

      assert.strictEqual(state.isGracePeriodActive, true);
      assert.ok(state.currentBuyoutFeeCents > 500);
      assert.ok(state.currentBuyoutFeeCents < 5000);
      assert.ok(Number.isInteger(state.currentBuyoutFeeCents));
    });

    it('forfeits 100% of bond exactly at end of grace period (t = 12h)', () => {
      const evaluationTime = '2026-10-28T00:00:00.000Z';
      const state = calculateCurrentBuyoutFee(baseDeadline, evaluationTime);

      assert.strictEqual(state.isGracePeriodActive, false);
      assert.strictEqual(state.currentBuyoutFeeCents, 5000);
      assert.strictEqual(state.forfeiturePercentage, 100);
      assert.strictEqual(state.centsSavedIfSettledNow, 0);
      assert.strictEqual(state.minutesRemainingInGrace, 0);
      assert.strictEqual(state.elapsedMinutesSinceDeadline, 720);
    });

    it('remains capped at maxBondCents well past grace period (t = 48h)', () => {
      const evaluationTime = '2026-10-29T12:00:00.000Z';
      const state = calculateCurrentBuyoutFee(baseDeadline, evaluationTime);

      assert.strictEqual(state.isGracePeriodActive, false);
      assert.strictEqual(state.currentBuyoutFeeCents, 5000);
      assert.strictEqual(state.forfeiturePercentage, 100);
      assert.strictEqual(state.centsSavedIfSettledNow, 0);
      assert.strictEqual(state.minutesRemainingInGrace, 0);
      assert.strictEqual(state.elapsedMinutesSinceDeadline, 2880);
    });
  });

  describe('Strict Monotonicity & Integer Cent Precision', () => {
    it('strictly increases buyout fee monotonically as time advances across each hour', () => {
      let previousFee = 0;
      for (let hour = 0; hour <= 12; hour++) {
        const evalTime = new Date(Date.parse(baseDeadline) + hour * 3600 * 1000).toISOString();
        const state = calculateCurrentBuyoutFee(baseDeadline, evalTime);

        assert.ok(Number.isInteger(state.currentBuyoutFeeCents), 'Fee must be an integer');
        assert.ok(Number.isInteger(state.centsSavedIfSettledNow), 'Cents saved must be an integer');
        assert.ok(
          state.currentBuyoutFeeCents >= previousFee,
          `Fee at hour ${hour} (${state.currentBuyoutFeeCents}) should be >= previous (${previousFee})`
        );
        previousFee = state.currentBuyoutFeeCents;
      }
    });

    it('supports custom base fee equal to max bond without crashing', () => {
      const state = calculateCurrentBuyoutFee(baseDeadline, baseDeadline, {
        baseFeeCents: 5000,
        maxBondCents: 5000,
      });
      assert.strictEqual(state.currentBuyoutFeeCents, 5000);
      assert.strictEqual(state.forfeiturePercentage, 100);
      assert.strictEqual(state.centsSavedIfSettledNow, 0);
    });
  });

  describe('generateEscalationSchedule', () => {
    it('generates an hourly schedule from hour 0 to 12', () => {
      const schedule = generateEscalationSchedule();
      assert.strictEqual(schedule.length, 13); // Hours 0 through 12 inclusive
      assert.strictEqual(schedule[0].hour, 0);
      assert.strictEqual(schedule[0].buyoutFeeCents, 500);
      assert.strictEqual(schedule[12].hour, 12);
      assert.strictEqual(schedule[12].buyoutFeeCents, 5000);
      assert.strictEqual(schedule[12].centsSaved, 0);
    });

    it('supports custom step hours', () => {
      const schedule = generateEscalationSchedule({ gracePeriodHours: 8 }, 2);
      assert.strictEqual(schedule.length, 5); // 0, 2, 4, 6, 8
      assert.strictEqual(schedule[0].hour, 0);
      assert.strictEqual(schedule[4].hour, 8);
    });

    it('throws RangeError for invalid stepHours', () => {
      assert.throws(() => generateEscalationSchedule({}, 0), RangeError);
      assert.throws(() => generateEscalationSchedule({}, -1), RangeError);
    });
  });
});
