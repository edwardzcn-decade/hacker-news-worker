// src/utils/base62.ts
const ALPHABET = '23456789abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ';

/**
 * Encode a positive number in Base X.
 *
 * @param num Number to encode (>= 0).
 * @param alphabet Alphabet used for encoding.
 */
export function encode(num: number, alphabet: string = ALPHABET): string {
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
	return arr.join('');
}

/**
 * Decode a Base X encoded string into a number.
 *
 * @param str Encoded input.
 * @param alphabet Alphabet used for decoding.
 */
export function decode(str: string, alphabet: string = ALPHABET): number {
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

/**
 * Encode a positive bigint in Base X.
 * Kept for potential future large-ID support.
 */
export function encodeBigInt(num: bigint, alphabet: string = ALPHABET): string {
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
	return arr.join('');
}

/**
 * Decode a Base X encoded string into a bigint.
 * Kept for potential future large-ID support.
 */
export function decodeBigInt(str: string, alphabet: string = ALPHABET): bigint {
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
