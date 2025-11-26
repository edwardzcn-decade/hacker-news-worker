/**
 * KVManager handles all interactions with the KV store
 * This class provides CURD perations like [database.py](https://github.com/phil-r/hackernewsbot/blob/master/database.py)
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

	/**
	 * Retrives and list all the keys in the kv storage
	 */
	async list_all() {
		return this.list();
	}
	/**
	 * Retrives all items with prefix (e.g. HN for hacker news) from storage
	 * @returns Promise containing an array of hacker news items
	 */
	async list(prefix?: string): Promise<[string, unknown | null][]> {
		if (prefix !== 'HN-' && prefix !== 'hn:') {
			console.warn(`[KVManager] ⚠️ Try list cached keys without proper prefix:${prefix}. Please check.`);
		} else {
			console.log(`[KVManager] Try list cached keys with prefix:${prefix}.`);
		}
		const options: KVNamespaceListOptions = prefix ? { prefix } : {};
		const res = await this.kv.list(options);
		if (!res.list_complete) {
			// Need pagination, over 1000 limit
			console.warn(`[KVManager] ⚠️ List cached keys with prefix:${prefix} overflow limit. Some keys may missing.`);
		}
		return res.keys.map((k) => [k.name, k.metadata ?? null]);
	}

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
			expiration: 0,
			is_expired: false,
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
