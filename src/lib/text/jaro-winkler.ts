/**
 * Jaro-Winkler Typo-Tolerant String Similarity Metric
 *
 * Implements the classic Jaro and Jaro-Winkler string distance metrics for
 * typo-tolerant prefix-weighted fuzzy matching in search and auto-complete.
 *
 * @module lib/text/jaro-winkler
 */

export interface JaroWinklerOptions {
  /** Winkler scaling factor (default: 0.1, max: 0.25) */
  prefixScale?: number;
  /** Maximum prefix length bonus (default: 4) */
  maxPrefixLength?: number;
  /** Minimum Jaro score required for Winkler boost (default: 0.7) */
  boostThreshold?: number;
  /** Whether comparison is case-sensitive (default: false) */
  caseSensitive?: boolean;
}

export interface MatchCandidate<T = string> {
  item: T;
  score: number; // 0.0 to 1.0
}

/**
 * Clamps a score between 0.0 and 1.0 and rounds to 4 decimal places.
 */
function round4(val: number): number {
  const clamped = Math.max(0, Math.min(1, val));
  return Math.round(clamped * 10000) / 10000;
}

/**
 * Computes raw unrounded Jaro similarity between two normalized strings.
 */
function rawJaroSimilarity(str1: string, str2: string): number {
  if (str1 === str2) {
    return 1.0;
  }

  const len1 = str1.length;
  const len2 = str2.length;

  if (len1 === 0 || len2 === 0) {
    return 0.0;
  }

  const matchWindow = Math.max(0, Math.floor(Math.max(len1, len2) / 2) - 1);
  const s1Matches = new Array<boolean>(len1).fill(false);
  const s2Matches = new Array<boolean>(len2).fill(false);

  let matches = 0;

  for (let i = 0; i < len1; i++) {
    const start = Math.max(0, i - matchWindow);
    const end = Math.min(i + matchWindow + 1, len2);

    for (let j = start; j < end; j++) {
      if (!s2Matches[j] && str1[i] === str2[j]) {
        s1Matches[i] = true;
        s2Matches[j] = true;
        matches++;
        break;
      }
    }
  }

  if (matches === 0) {
    return 0.0;
  }

  let k = 0;
  let transpositions = 0;

  for (let i = 0; i < len1; i++) {
    if (!s1Matches[i]) continue;

    while (k < len2 && !s2Matches[k]) {
      k++;
    }

    if (k < len2 && str1[i] !== str2[k]) {
      transpositions++;
    }
    k++;
  }

  const halfTranspositions = transpositions / 2;
  return (matches / len1 + matches / len2 + (matches - halfTranspositions) / matches) / 3;
}

/**
 * Computes Jaro similarity between two strings.
 *
 * @param s1 First string
 * @param s2 Second string
 * @param caseSensitive Whether to perform case-sensitive comparison (default: false)
 * @returns Similarity score between 0.0 and 1.0 (rounded to 4 decimal places)
 */
export function jaroSimilarity(s1: string, s2: string, caseSensitive = false): number {
  if (s1 === s2) {
    return 1.0;
  }

  if (s1.length === 0 || s2.length === 0) {
    return 0.0;
  }

  const str1 = caseSensitive ? s1 : s1.toLowerCase();
  const str2 = caseSensitive ? s2 : s2.toLowerCase();

  return round4(rawJaroSimilarity(str1, str2));
}

/**
 * Computes Jaro-Winkler similarity between two strings, applying a favorable
 * weight to matching prefixes.
 *
 * @param s1 First string
 * @param s2 Second string
 * @param options Optional configuration parameters
 * @returns Similarity score between 0.0 and 1.0 (rounded to 4 decimal places)
 */
export function jaroWinklerSimilarity(
  s1: string,
  s2: string,
  options?: JaroWinklerOptions,
): number {
  if (s1 === s2) {
    return 1.0;
  }

  if (s1.length === 0 || s2.length === 0) {
    return 0.0;
  }

  const caseSensitive = options?.caseSensitive ?? false;
  const rawPrefixScale = options?.prefixScale ?? 0.1;
  const prefixScale = Math.max(0, Math.min(0.25, rawPrefixScale));
  const maxPrefixLength = options?.maxPrefixLength ?? 4;
  const boostThreshold = options?.boostThreshold ?? 0.7;

  const str1 = caseSensitive ? s1 : s1.toLowerCase();
  const str2 = caseSensitive ? s2 : s2.toLowerCase();

  if (str1 === str2) {
    return 1.0;
  }

  const jaro = rawJaroSimilarity(str1, str2);

  if (jaro < boostThreshold) {
    return round4(jaro);
  }

  // Find common prefix length up to maxPrefixLength
  let prefix = 0;
  const maxPrefix = Math.min(str1.length, str2.length, maxPrefixLength);
  while (prefix < maxPrefix && str1[prefix] === str2[prefix]) {
    prefix++;
  }

  const jaroWinkler = jaro + prefix * prefixScale * (1 - jaro);
  return round4(jaroWinkler);
}

/**
 * Ranks a list of candidate items by Jaro-Winkler similarity against a search query.
 *
 * @param query Search query string
 * @param candidates Array of candidate items to rank
 * @param extractString Optional function to extract a string representation from each candidate
 * @param minScore Optional minimum similarity score threshold (default: 0.0)
 * @returns Array of candidates matching the criteria, sorted descending by score
 */
export function rankByJaroWinkler<T = string>(
  query: string,
  candidates: T[],
  extractString?: (item: T) => string,
  minScore = 0.0,
): MatchCandidate<T>[] {
  const results: MatchCandidate<T>[] = [];

  for (const item of candidates) {
    const text = extractString ? extractString(item) : String(item);
    const score = jaroWinklerSimilarity(query, text);

    if (score >= minScore) {
      results.push({ item, score });
    }
  }

  return results.sort((a, b) => b.score - a.score);
}
