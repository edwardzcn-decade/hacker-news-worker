const METADATA_LIMIT_BYTE_LENGTH = 1024;
const PREFIX_DEFAULT = 'DEFAULT';
const ALPHABET = '23456789abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ';
const HOUR_SECS = 60 * 60;
const DAY_SECS = 24 * HOUR_SECS;

export const FOUR_HOURS = 4 * HOUR_SECS;
export const TWO_DAYS = 2 * DAY_SECS;
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

export function getUtf8BytesLength(str: string): number {
	return new TextEncoder().encode(str).length;
}

export function checkMetaLimit(metadata: object): boolean {
	return getUtf8BytesLength(JSON.stringify(metadata)) <= METADATA_LIMIT_BYTE_LENGTH;
}

export function keyWithPrefix(rawKey: string, rawPrefix?: string): string;
export function keyWithPrefix(rawKey: number, rawPrefix?: string): string;
export function keyWithPrefix(rawKey: string | number, rawPrefix?: string): string {
	return `${prefixFactory(rawPrefix)}${rawKey}`;
}

export function prefixFactory(str?: string): string {
	if (str === undefined || str.trim() === '') {
		return `${PREFIX_DEFAULT}-`;
	}
	const cleaned = str
		.trim()
		.replace(/[^A-Za-z]+$/, '')
		.toUpperCase();
	if (cleaned === '') {
		return `${PREFIX_DEFAULT}-`;
	}
	return `${cleaned}-`;
}

export function escapeHtml(text: string): string {
	return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
