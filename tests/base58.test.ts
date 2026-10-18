import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  BASE58_ALPHABET,
  encodeBase58,
  decodeBase58,
  encodeBase58Number,
} from '../src/lib/security/base58';

describe('Base58 Verification Token Encoder / Decoder (base58.ts)', () => {
  it('omits ambiguous characters (0, O, I, l) from alphabet', () => {
    assert.strictEqual(BASE58_ALPHABET.length, 58);
    assert.ok(!BASE58_ALPHABET.includes('0'));
    assert.ok(!BASE58_ALPHABET.includes('O'));
    assert.ok(!BASE58_ALPHABET.includes('I'));
    assert.ok(!BASE58_ALPHABET.includes('l'));
  });

  describe('encodeBase58 & decodeBase58 round-trips', () => {
    it('handles empty buffer', () => {
      assert.strictEqual(encodeBase58(new Uint8Array(0)), '');
      assert.deepStrictEqual(decodeBase58(''), new Uint8Array(0));
    });

    it('preserves leading zero bytes as leading "1" characters', () => {
      const input = Uint8Array.from([0, 0, 1]);
      const encoded = encodeBase58(input);
      assert.ok(encoded.startsWith('11'));
      const decoded = decodeBase58(encoded);
      assert.deepStrictEqual(decoded, input);
    });

    it('handles buffers consisting solely of zero bytes', () => {
      const input = Uint8Array.from([0, 0, 0]);
      const encoded = encodeBase58(input);
      assert.strictEqual(encoded, '111');
      assert.deepStrictEqual(decodeBase58(encoded), input);
    });

    it('losslessly encodes and decodes text and binary buffers', () => {
      const text = 'Pact OS High-Assurance Discipline Verification';
      const buffer = new TextEncoder().encode(text);
      const encoded = encodeBase58(buffer);
      const decoded = decodeBase58(encoded);
      assert.strictEqual(new TextDecoder().decode(decoded), text);
    });

    it('throws on invalid characters like 0, O, I, l or symbols', () => {
      assert.throws(() => decodeBase58('abc0def'), /Invalid Base58 character: "0"/);
      assert.throws(() => decodeBase58('tokenO'), /Invalid Base58 character: "O"/);
      assert.throws(() => decodeBase58('tokenI'), /Invalid Base58 character: "I"/);
      assert.throws(() => decodeBase58('tokenl'), /Invalid Base58 character: "l"/);
      assert.throws(() => decodeBase58('Hello!World'), /Invalid Base58 character/);
    });
  });

  describe('encodeBase58Number', () => {
    it('encodes zero to "1"', () => {
      assert.strictEqual(encodeBase58Number(0), '1');
      assert.strictEqual(encodeBase58Number(BigInt(0)), '1');
    });

    it('encodes small and large integer numbers and BigInts', () => {
      assert.strictEqual(encodeBase58Number(57), 'z');
      assert.strictEqual(encodeBase58Number(58), '21');
      assert.strictEqual(
        encodeBase58Number(BigInt('12345678901234567890')),
        'Vf87B9opoow'
      );
    });

    it('throws RangeError for negative numbers and non-integers', () => {
      assert.throws(() => encodeBase58Number(-5), RangeError);
      assert.throws(() => encodeBase58Number(BigInt(-100)), RangeError);
      assert.throws(() => encodeBase58Number(3.14), RangeError);
    });
  });
});
