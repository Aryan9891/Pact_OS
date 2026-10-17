import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  jaroSimilarity,
  jaroWinklerSimilarity,
  rankByJaroWinkler,
} from '../src/lib/text/jaro-winkler';

describe('Jaro Similarity', () => {
  it('returns 1.0 for identical strings', () => {
    assert.strictEqual(jaroSimilarity('martha', 'martha'), 1.0);
    assert.strictEqual(jaroSimilarity('PactOS', 'PactOS', true), 1.0);
  });

  it('handles empty strings correctly', () => {
    assert.strictEqual(jaroSimilarity('', ''), 1.0);
    assert.strictEqual(jaroSimilarity('', 'test'), 0.0);
    assert.strictEqual(jaroSimilarity('test', ''), 0.0);
  });

  it('returns 0.0 for completely disjoint strings', () => {
    assert.strictEqual(jaroSimilarity('abc', 'xyz'), 0.0);
    assert.strictEqual(jaroSimilarity('123', '456'), 0.0);
  });

  it('handles case-insensitivity by default and respects caseSensitive flag', () => {
    assert.strictEqual(jaroSimilarity('habit', 'HABIT'), 1.0);
    assert.strictEqual(jaroSimilarity('habit', 'HABIT', false), 1.0);
    assert.strictEqual(jaroSimilarity('habit', 'HABIT', true), 0.0);
  });

  it('calculates Jaro similarity with transpositions correctly', () => {
    // MARTHA vs MARHTA has Jaro score 17/18 ~= 0.9444
    const score = jaroSimilarity('MARTHA', 'MARHTA');
    assert.strictEqual(score, 0.9444);
  });

  it('calculates Jaro similarity for single character strings', () => {
    assert.strictEqual(jaroSimilarity('a', 'a'), 1.0);
    assert.strictEqual(jaroSimilarity('a', 'b'), 0.0);
  });
});

describe('Jaro-Winkler Similarity', () => {
  it('matches standard benchmark values', () => {
    // Benchmark 1: MARTHA vs MARHTA (approx 0.961)
    const marthaScore = jaroWinklerSimilarity('MARTHA', 'MARHTA');
    assert.strictEqual(marthaScore, 0.9611);
    assert.ok(Math.abs(marthaScore - 0.961) < 0.005);

    // Benchmark 2: DWAYNE vs DUANE (approx 0.840)
    const dwayneScore = jaroWinklerSimilarity('DWAYNE', 'DUANE');
    assert.strictEqual(dwayneScore, 0.84);
    assert.ok(Math.abs(dwayneScore - 0.840) < 0.005);

    // Benchmark 3: DIXON vs DICKSONX (approx 0.813)
    const dixonScore = jaroWinklerSimilarity('DIXON', 'DICKSONX');
    assert.strictEqual(dixonScore, 0.8133);
    assert.ok(Math.abs(dixonScore - 0.813) < 0.005);
  });

  it('handles empty string edge cases', () => {
    assert.strictEqual(jaroWinklerSimilarity('', ''), 1.0);
    assert.strictEqual(jaroWinklerSimilarity('', 'habit'), 0.0);
    assert.strictEqual(jaroWinklerSimilarity('habit', ''), 0.0);
  });

  it('handles identical and disjoint strings', () => {
    assert.strictEqual(jaroWinklerSimilarity('focus', 'focus'), 1.0);
    assert.strictEqual(jaroWinklerSimilarity('hello', 'xyz'), 0.0);
  });

  it('respects caseSensitive option', () => {
    assert.strictEqual(jaroWinklerSimilarity('Meditation', 'meditation'), 1.0);
    assert.strictEqual(
      jaroWinklerSimilarity('Meditation', 'meditation', { caseSensitive: true }),
      0.9333,
    );
    assert.strictEqual(
      jaroWinklerSimilarity('ABC', 'abc', { caseSensitive: true }),
      0.0,
    );
  });

  it('respects boostThreshold when Jaro similarity is below threshold', () => {
    // Strings with low similarity below 0.7 should not receive Winkler prefix boost
    const scoreWithHighThreshold = jaroWinklerSimilarity('prefix_apple', 'prefix_zebra', { boostThreshold: 0.9 });
    const jaroScore = jaroSimilarity('prefix_apple', 'prefix_zebra');
    assert.strictEqual(scoreWithHighThreshold, jaroScore);
  });

  it('respects custom maxPrefixLength', () => {
    const scoreLen2 = jaroWinklerSimilarity('MARTHA', 'MARHTA', { maxPrefixLength: 2 });
    const scoreLen4 = jaroWinklerSimilarity('MARTHA', 'MARHTA', { maxPrefixLength: 4 });
    // Prefix bonus for length 2 is less than length 3
    assert.ok(scoreLen2 < scoreLen4);
  });

  it('clamps prefixScale to a maximum of 0.25', () => {
    const scoreWithHighScale = jaroWinklerSimilarity('MARTHA', 'MARHTA', { prefixScale: 0.5 });
    const scoreWithMaxScale = jaroWinklerSimilarity('MARTHA', 'MARHTA', { prefixScale: 0.25 });
    assert.strictEqual(scoreWithHighScale, scoreWithMaxScale);
  });
});

describe('rankByJaroWinkler', () => {
  it('ranks simple string candidates in descending order of similarity', () => {
    const query = 'morn';
    const candidates = ['Morning Routine', 'Evening Reflection', 'Moroccan Tea', 'Afternoon Walk'];

    const ranked = rankByJaroWinkler(query, candidates);

    assert.ok(ranked.length > 0);
    assert.strictEqual(ranked[0].item, 'Morning Routine');
    assert.ok(ranked[0].score >= ranked[1].score);
    assert.ok(ranked[1].score >= ranked[2].score);
  });

  it('filters candidates with minScore threshold', () => {
    const query = 'habit';
    const candidates = ['Habit Tracker', 'Healthy Habits', 'Completely Unrelated'];

    const ranked = rankByJaroWinkler(query, candidates, undefined, 0.75);

    assert.ok(ranked.every(c => c.score >= 0.75));
    assert.ok(!ranked.some(c => c.item === 'Completely Unrelated'));
  });

  it('supports custom extractString for object items', () => {
    interface Habit {
      id: string;
      title: string;
    }

    const habits: Habit[] = [
      { id: '1', title: 'Morning Routine' },
      { id: '2', title: 'Evening Reading' },
      { id: '3', title: 'Meditation' },
    ];

    const ranked = rankByJaroWinkler(
      'morn',
      habits,
      h => h.title,
      0.5,
    );

    assert.ok(ranked.length >= 1);
    assert.strictEqual(ranked[0].item.title, 'Morning Routine');
  });

  it('handles empty candidates array cleanly', () => {
    const ranked = rankByJaroWinkler('query', []);
    assert.deepStrictEqual(ranked, []);
  });
});
