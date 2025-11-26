/**
 * Splits an array of numbers into `n` interleaved shards.
 * Equivalent to Python's [raw_array[i::n] for i in range(n)]
 */
export function shardsInterleaved(raw_array: number[], shards: number): number[][] {
	if (shards <= 0) throw new Error('Number of shards must be positive');
	const result: number[][] = Array.from({ length: shards }, () => []);
	for (let i = 0; i < raw_array.length; i++) {
		result[i % shards].push(raw_array[i]);
	}
	return result;
}

export function shardsSequential(raw_array: number[], shards: number): number[][] {
	if (shards <= 0) throw new Error('Number of shards must be positive');
	const result: number[][] = [];
	const shard_size = Math.ceil(raw_array.length / shards);
	for (let i = 0; i < raw_array.length; i += shard_size) {
		result.push(raw_array.slice(i, i + shard_size));
	}
	return result;
}
