/**
 * KVManager wraps KV CRUD operations used for Hacker News caching.
 */

import { HackerNewsItem } from './apis/hn';
import { checkMetaLimit } from './utils/check';
interface HackerNewsItemCache {
	uuid: string;
	item: HackerNewsItem;
	createdAt: number;
	expiration: number;
	is_expired: boolean;
}

const TTL_KEY_NAME_DEFAULT = 'TTL'
const TTL_KEY_VALUE_DEFAULT = 3600
export class KVManager {
	/**
	 * Create a new KVManager instance.
	 * @param kv Cloudflare KV namespace instance.
	 * @param prefix Key prefix for Hacker News (e.g. HN for HN-13311).
	 * @param ttlKey Key storing the default TTL value.
	 * @param ttlDefault Fallback/Default TTL value in seconds.
	 */
	private constructor(private kv: KVNamespace, private prefix: string, private ttlKey: string = TTL_KEY_NAME_DEFAULT, private ttlDefault: number = TTL_KEY_VALUE_DEFAULT) {}

	static async init(
		kv: KVNamespace,
		prefix: string,
		ttlKey: string,
		ttlDefault: number
	){
		const mgr = new KVManager(kv, prefix, ttlKey, ttlDefault);
		try {
			// one time fetch and one time put ttl key-value pair
			const current = await kv.get(ttlKey, 'text');
			if (!current) {
				await kv.put(ttlKey, String(ttlDefault));
			}
		} catch (err) {
			console.error(`[KVManager] ❌ Fail in KVManager init. Error: ${err}`)
			throw err
		}
		return mgr;
	}
	/**
	 * List keys name and metadata.
	 * @param prefix Optional prefix filter.
	 * @param onlyOnce Default to be true, fetch one page (<=1000). Fetch all if set to false.
	 * @returns List of structure including key name and metadata
	 */
	async listKeysMeta(prefix?: string, onlyOnce: boolean = true): Promise<{ name: string; meta: {} | null }[]> {
		return onlyOnce ? this.listOnce(prefix) : this.listAll(prefix);
	}

	/**
	 * List key names.
	 * @param prefix Optional prefix filter.
	 * @param onlyOnce Default to be true, fetch one page (<=1000). Fetch all if set to false.
	 * @returns List of string representing key name
	 */
	async listKeys(prefix?: string, onlyOnce: boolean = true): Promise<string[]> {
		return onlyOnce ? (await this.listOnce(prefix)).map((k) => k.name) : (await this.listAll(prefix)).map((k) => k.name);
	}

	/**
	 * Retrieve one batch of keys information (<=1000) from KV.
	 * @param prefix Optional prefix filter.
	 * @returns List of structure including key name and metadata
	 */
	async listOnce(prefix?: string): Promise<{ name: string; meta: {} | null }[]> {
		if (prefix === undefined) {
			console.log('[KVManager] Try list once cached keys without prefix (all keys).');
		} else if (prefix !== 'HN-' && prefix !== 'hn:') {
			console.warn(`[KVManager] ⚠️ Try list once cached keys without proper prefix:${prefix}. Please check.`);
		} else {
			console.log(`[KVManager] Try list once cached keys with prefix:${prefix}.`);
		}
		const options: KVNamespaceListOptions = {};
		if (prefix !== undefined) {
			options.prefix = prefix;
		}

		const res = await this.kv.list(options);
		if (!res.list_complete) {
			// Overflow only warning
			console.warn(
				`[KVManager] ⚠️ List once cached keys with prefix:${prefix} overflow limit, some keys may missing. Should use listAll instead.`
			);
		}
		return res.keys.map((k) => ({
			name: k.name,
			meta: k.metadata ?? null,
		}));
	}

	/**
	 * Retrieve all keys from KV using pagination.
	 * @param prefix Optional prefix filter.
	 * @param cursor Optional cursor for fetching the next batch.
	 * @returns List of structure including key name and metadata
	 */
	async listAll(prefix?: string, cursor?: string): Promise<{ name: string; meta: {} | null }[]> {
		if (prefix === undefined) {
			console.log('[KVManager] Try list all cached keys without prefix (all keys).');
		} else if (prefix !== 'HN-' && prefix !== 'hn:') {
			console.warn(`[KVManager] ⚠️ Try list all cached keys without proper prefix:${prefix}. Please check.`);
		} else {
			console.log(`[KVManager] Try list all cached keys with prefix:${prefix}.`);
		}
		const options: KVNamespaceListOptions = {};
		if (prefix !== undefined) {
			options.prefix = prefix;
		}
		if (cursor !== undefined) {
			options.cursor = cursor;
		}
		const res = await this.kv.list(options);
		const current = res.keys.map((k) => ({
			name: k.name,
			meta: k.metadata ?? null,
		}));
		if (res.list_complete || !res.cursor) {
			return current;
		}
		// Need pagination, over 1000 limit
		console.warn(`[KVManager] ⬇️ List all keys with prefix:${prefix} next cursor:${res.cursor}.`);
		const nxt = await this.listAll(prefix, res.cursor);
		return current.concat(nxt);
	}

	/**
	 * Store a value with metadata and TTL.
	 * @param key KV key (expects HN- or hn: prefix).
	 * @param meta Metadata string stored under `m`.
	 * @param value Value to put.
	 * @param ttl Optional expiration TTL override in seconds.
	 */
	async create(key: string, meta: string, value: string, ttl?: number): Promise<void> {
		if (key.startsWith('HN-') || key.startsWith('hn:')) {
			console.log(`[KVManager] Try creat cache for key:${key}`);
		} else {
			console.warn(`[KVManager] ⚠️ Try create cache for key without proper prefix, key:${key}. Please check.`);
		}
		if (!checkMetaLimit({ m: meta })) {
			console.warn(`[KVManager] ⚠️ Metadata ${meta} too large for key:${key}}. Please check.`);
		}
		const options: KVNamespacePutOptions = {
			// expiration not used
			expirationTtl: ttl ?? this.ttlDefault,
			metadata: { m: meta },
		};
		return this.kv.put(key, value, options);
	}

	/**
	 * Read and fetch a value as plain text or json object
	 * @param key Key to read.
	 * @param type Desired return type (`text` or `json`).
	 * @returns Return string as plain text or HackerNewsItemCache
	 */
	async get(key: string, type: 'text'): Promise<string | null>;
	async get(key: string, type: 'json'): Promise<HackerNewsItemCache | null>;
	async get(key: string, type: 'text' | 'json'): Promise<string | HackerNewsItemCache | null> {
		// TEXT branch
		if (type === 'text') {
			const promise = this.kv.get(key, 'text');
			return promise;
		}
		// JSON branch
		else {
			const res = await this.kv.get(key, 'json');
			return res as HackerNewsItemCache;
		}
	}

	/**
	 * Delete a key from KV.
	 * @param key KV key to remove.
	 */
	async delete(key: string): Promise<void> {
		console.warn(`[KVManager] ⚠️ Try delete key:${key}. Please check.`);
		// No options for delete
		return this.kv.delete(key);
	}

	/**
	 * Create and store a Hacker News item cache entry. (Compatible with older versions)
	 * @param hnItem Hacker News item payload.
	 * @returns Newly created cache record.
	 */
	async createHnItemCache(hnItem: HackerNewsItem): Promise<HackerNewsItemCache> {
		const newHnItem: HackerNewsItemCache = {
			uuid: crypto.randomUUID(),
			item: hnItem,
			createdAt: Date.now(),
			expiration: 0, // TODO not used
			is_expired: false, // TODO not used
		};
		const kprefex = this.prefix ? (this.prefix.endsWith('-') ? this.prefix : `${this.prefix}-`) : 'HN-';
		const kkey: string = `${kprefex}${newHnItem.item.id}`;
		const kmeta: string = `${newHnItem.uuid}`;
		// Pass ttl directly
		await this.create(kkey, kmeta, JSON.stringify(newHnItem));
		// await this.kv.put(this.hnKey, JSON.stringify(newHnItem), {
		// 	expirationTtl: 300,
		// });
		return newHnItem;
	}
}
