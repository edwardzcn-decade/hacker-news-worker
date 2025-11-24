// src/utils/base62.ts
const ALPHABET = "23456789abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ";

export const DEFAULT_ALPHABET = ALPHABET;

export function encode(num: number, alphabet: string = ALPHABET): string {
  /**
   * Encode a positive number in Base X
   *
   * @param num - The number to encode
   * @param alphabet - The alphabet to use for encoding
   */
  if (num === 0) {
    return alphabet[0];
  }

  const arr: string[] = [];
  const base = alphabet.length;

  let n = num;
  while (n > 0) {
    const rem = n % base;
    n = Math.floor(n / base);
    arr.push(alphabet[rem]);
  }

  arr.reverse();
  return arr.join("");
}

export function decode(str: string, alphabet: string = ALPHABET): number {
  /**
   * Decode a Base X encoded string into a number
   *
   * @param str - The encoded string
   * @param alphabet - The alphabet to use for encoding
   */
  const base = alphabet.length;
  const strlen = str.length;
  let num = 0;

  let idx = 0;
  for (const char of str) {
    const power = strlen - (idx + 1);
    const charIndex = alphabet.indexOf(char);
    if (charIndex === -1) {
      throw new Error(`Character "${char}" is not in alphabet`);
    }
    num += charIndex * Math.pow(base, power);
    idx += 1;
  }

  return num;
}

export function encodeBigInt(num: bigint, alphabet: string = ALPHABET): string {
  /**
   * Encode a positive bigint in Base X
   *
   * @param num - The bigint number to encode
   * @param alphabet - The alphabet to use for encoding
   */
  if (num === 0n) {
    return alphabet[0];
  }

  const arr: string[] = [];
  const base = BigInt(alphabet.length);

  let n = num;
  while (n > 0n) {
    const rem = n % base;
    n = n / base;
    arr.push(alphabet[Number(rem)]);
  }

  arr.reverse();
  return arr.join("");
}

export function decodeBigInt(str: string, alphabet: string = ALPHABET): bigint {
  /**
   * Decode a Base X encoded string into a bigint
   *
   * @param str - The encoded string
   * @param alphabet - The alphabet to use for encoding
   */
  const base = BigInt(alphabet.length);
  let num = 0n;

  for (const char of str) {
    const charIndex = alphabet.indexOf(char);
    if (charIndex === -1) {
      throw new Error(`Character "${char}" is not in alphabet`);
    }
    num = num * base + BigInt(charIndex);
  }

  return num;
}