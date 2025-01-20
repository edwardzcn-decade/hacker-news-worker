/**
 * KVManager handles all interactions with the KV store
 * This class provides kv CURD perations like [database.py](https://github.com/phil-r/hackernewsbot/blob/master/database.py)
 */

import { HackerNewsItem } from './apis/hn';
import { checkMetaLimit, getUtf8BytesLength } from './utils/check';
interface HackerNewsItemCache {
	uuid: string;
	item: HackerNewsItem;
	createdAt: number;
	expiration: number;
	is_expired: boolean;
}

export class KVManager {
	/**
	 * Create a new KVManager instance
	 * @param kv - The Cloudflare KV namespace instance to use for storage
	 * @param prefix - The key-prefix (e.g. HN for HN-13311) of hacker news item cache
	 * @param ttlKey - The key to check ttl default value for other items in kv
	 * @param ttlDefault - The default ttl default
	 */
	constructor(private kv: KVNamespace, private prefix: string, private ttlKey: string = 'TTL', private ttlDefault: number = 3600) {}

	async listKeysMeta(prefix?: string, onlyOnce: boolean = true): Promise<{ name: string; meta: {} | null }[]>{
		return onlyOnce? this.listOnce(prefix) : this.listAll(prefix)
	}

	async listKeys(prefix?: string, onlyOnce: boolean = true): Promise<string[]> {
		return onlyOnce ? (await this.listOnce(prefix)).map((k) => k.name) : (await this.listAll(prefix)).map((k) => k.name);
	}

	/**
	 * Retrives a batch of keys (without pagniation) from kv storage
	 * @param prefix Optional. If given, fetch keys start with that prefix
	 * @returns structure with string field name and json object field meta
	 */
	async listOnce(prefix?: string): Promise<{ name: string; meta: {} | null }[]> {
		if (prefix === undefined) {
  		console.log("[KVManager] Try list once cached keys without prefix (all keys).");
		}
		else if (prefix !== 'HN-' && prefix !== 'hn:') {
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
	 * Retrives all keys from kv storage
	 * @param prefix Optional. If given, fetch keys start with that prefix
	 * @param cursor Optional. Used for fetch next batch of keys
	 * @returns structure with string field name and json object field meta
	 */
	async listAll(prefix?: string, cursor?: string): Promise<{ name: string; meta: {} | null }[]> {
		if (prefix === undefined) {
  		console.log("[KVManager] Try list all cached keys without prefix (all keys).");
		}
		else if (prefix !== 'HN-' && prefix !== 'hn:') {
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
	 * Create a new key value pair with speci
	 * @param key
	 * @param meta
	 * @param value
	 * @param ttl
	 * @returns
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
		await this.create(kkey, kmeta, JSON.stringify(newHnItem), 3600);
		// await this.kv.put(this.hnKey, JSON.stringify(newHnItem), {
		// 	expirationTtl: 300,
		// });
		return newHnItem;
	}

	async delete(key: string): Promise<void> {
		console.warn(`[KVManager] ⚠️ Try delete key:${key}. Please check.`);
		// No options for delete
		return this.kv.delete(key);
	}
}
