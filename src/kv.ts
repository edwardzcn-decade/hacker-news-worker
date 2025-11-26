/**
 * KVManager handles all interactions with the KV store
 * This class provides CURD perations like [database.py](https://github.com/phil-r/hackernewsbot/blob/master/database.py)
 */

import { HackerNewsItem } from './apis/hn';

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
	 * @param hnKey - The key under which hacker news will be stored in KV (default to "hns")
	 */
	constructor(private kv: KVNamespace, private hnKey: string = 'hns') {}

	/**
	 * Retrives all hacker news from storage
	 * @returns Promise containing an array of hacker news items
	 */
	async list(): Promise<HackerNewsItemCache[]> {
		const hns = await this.kv.get(this.hnKey, 'json');
		if (Array.isArray(hns)) {
			return hns as HackerNewsItemCache[];
		} else {
			console.warn(`⚠️ List nothing from ${this.hnKey} and return empty list. Please check.`);
			return [] as HackerNewsItemCache[];
		}
	}

  async create(hnItem: HackerNewsItem): Promise<HackerNewsItemCache> {
    const newHnItem: HackerNewsItemCache = {
      uuid: crypto.randomUUID(),
      item: hnItem,
      createdAt: Date.now(),
      expiration: 0,
      is_expired: false,
    }
    const hns = await this.list();
    hns.push(newHnItem)
    // Update at present
    await this.kv.put(this.hnKey, JSON.stringify(hns), {
      expirationTtl: 300,
    });
    return newHnItem
  }

  async delete(uuid: string): Promise<void> {
    const hns = await this.list();
    const newHns = hns.filter((hn) => hn.uuid != uuid);
    // Update at present
    await this.kv.put(this.hnKey, JSON.stringify(newHns), {
      expirationTtl: 300,
    })
  }
}
