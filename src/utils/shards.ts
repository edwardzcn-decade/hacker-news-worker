// Shard helpers kept for optional parallel fetches
// see `fetchTop` and `fetchTopWithShards` in `../apis/hn.ts`.

/**
 * Split numbers into `shards` interleaved buckets.
 * Same as `[a[i::n] for  i in range(n)]` in Python
 *
 * @param rawArray Source ids.
 * @param shards Number of buckets (must be > 0).
 * @returns Sharded id lists in round-robin order.
 */
export function shardsInterleaved(rawArray: number[], shards: number): number[][] {
	if (shards <= 0) throw new Error('Number of shards must be positive');
	const result: number[][] = Array.from({ length: shards }, () => []);
	for (let i = 0; i < rawArray.length; i++) {
		result[i % shards].push(rawArray[i]);
	}
	return result;
}

/**
 * Split numbers into `shards` sequential chunks.
 *
 * @param rawArray Source ids.
 * @param shards Number of buckets (must be > 0).
 * @returns Sharded id lists in contiguous slices.
 */
export function shardsSequential(rawArray: number[], shards: number): number[][] {
	if (shards <= 0) throw new Error('Number of shards must be positive');
	const result: number[][] = [];
	const shard_size = Math.ceil(rawArray.length / shards);
	for (let i = 0; i < rawArray.length; i += shard_size) {
		result.push(rawArray.slice(i, i + shard_size));
	}
	return result;
}
