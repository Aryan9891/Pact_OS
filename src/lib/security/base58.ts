/**
 * Base58 Unambiguous Binary & Numeric Token Encoder / Decoder
 *
 * Implements the standard Bitcoin/IPFS Base58 alphabet, omitting visually ambiguous
 * characters (0, O, I, l) to produce clean, human-readable verification tokens,
 * accountability partner invite tokens, and recovery keys.
 *
 * @module src/lib/security/base58
 */

export const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

const CHAR_MAP: Map<string, number> = new Map();
for (let i = 0; i < BASE58_ALPHABET.length; i++) {
  CHAR_MAP.set(BASE58_ALPHABET[i], i);
}

const BIG_ZERO = BigInt(0);
const BIG_EIGHT = BigInt(8);
const BIG_58 = BigInt(58);
const BIG_FF = BigInt(0xff);

/**
 * Encodes a binary buffer into a Base58 string.
 * Preserves leading zero bytes as leading '1' characters.
 *
 * @param buffer Uint8Array binary data
 * @returns Base58 encoded string (empty string for empty buffer)
 */
export function encodeBase58(buffer: Uint8Array): string {
  if (buffer.length === 0) {
    return '';
  }

  // Count leading zero bytes
  let zeros = 0;
  while (zeros < buffer.length && buffer[zeros] === 0) {
    zeros++;
  }

  // Convert payload to BigInt
  let num = BIG_ZERO;
  for (let i = zeros; i < buffer.length; i++) {
    num = (num << BIG_EIGHT) + BigInt(buffer[i]);
  }

  let encoded = '';
  while (num > BIG_ZERO) {
    const rem = Number(num % BIG_58);
    num = num / BIG_58;
    encoded = BASE58_ALPHABET[rem] + encoded;
  }

  return '1'.repeat(zeros) + encoded;
}

/**
 * Decodes a Base58 string into the original binary bytes.
 * Preserves leading '1' characters as leading zero bytes.
 *
 * @param encoded Base58 encoded string
 * @returns Original Uint8Array buffer
 * @throws {Error} If string contains characters not in the Base58 alphabet
 */
export function decodeBase58(encoded: string): Uint8Array {
  if (encoded.length === 0) {
    return new Uint8Array(0);
  }

  // Count leading '1's (representing leading zero bytes)
  let zeros = 0;
  while (zeros < encoded.length && encoded[zeros] === '1') {
    zeros++;
  }

  let num = BIG_ZERO;
  for (let i = zeros; i < encoded.length; i++) {
    const char = encoded[i];
    const val = CHAR_MAP.get(char);
    if (val === undefined) {
      throw new Error(`Invalid Base58 character: "${char}" at index ${i}`);
    }
    num = num * BIG_58 + BigInt(val);
  }

  const bytes: number[] = [];
  while (num > BIG_ZERO) {
    bytes.unshift(Number(num & BIG_FF));
    num = num >> BIG_EIGHT;
  }

  const result = new Uint8Array(zeros + bytes.length);
  result.set(bytes, zeros);
  return result;
}

/**
 * Encodes a non-negative integer or BigInt into Base58 representation.
 *
 * @param value Non-negative integer or BigInt
 * @returns Base58 string
 * @throws {RangeError} If value is negative or not an integer
 */
export function encodeBase58Number(value: number | bigint): string {
  let num: bigint;

  if (typeof value === 'number') {
    if (!Number.isFinite(value) || !Number.isInteger(value) || value < 0) {
      throw new RangeError(`Value must be a non-negative integer, got: ${value}`);
    }
    num = BigInt(value);
  } else if (typeof value === 'bigint') {
    if (value < BIG_ZERO) {
      throw new RangeError(`Value must be a non-negative BigInt, got: ${value}`);
    }
    num = value;
  } else {
    throw new TypeError(`Expected number or bigint, got: ${typeof value}`);
  }

  if (num === BIG_ZERO) {
    return '1';
  }

  let result = '';
  while (num > BIG_ZERO) {
    const rem = Number(num % BIG_58);
    num = num / BIG_58;
    result = BASE58_ALPHABET[rem] + result;
  }

  return result;
}
