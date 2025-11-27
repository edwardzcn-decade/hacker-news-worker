import { HN_BASE_URL, LIMIT_DEFAULT, SHARD_DEFAULT } from '../utils/config';
import { shardsInterleaved, shardsSequential } from '../utils/shards';

// Represent a Hacker News item from [FireBase](https://firebase.google.com/)
// v0.3.1 change into interface to describe structure
// export type [HackerNewsItem](https://github.com/HackerNews/API?tab=readme-ov-file#items)
export interface HackerNewsItem {
	id: number; // unique identifier
	deleted?: boolean; // true if the item is deleted
	type?: string; // one of "job", "story", "comment", "poll", or "pollopt"
	by: string; // username
	time: number; // unix timestamp
	text?: string; // content. HTML
	dead?: boolean; // true if the item is dead
	parent?: number; // the comment's parent: either another comment or the relevant story
	poll?: number; // the pollopt's associated poll
	kids?: number[]; // list of comments, in ranked display order
	url?: string; // the url of the story
	score?: number; // story score, or votes for a pollopt
	title?: string; // title. HTML
	parts?: number[]; // a list of related pollopts, in display order
	descendants?: number; // in the case of stories or polls, the total comment count
}

export const LIVE_DATA_TYPES = [
	'max_item',
	'top_hn',
	'new_hn',
	'best_hn',
	'ask_hn',
	'show_hn',
	'job_hn',
	'updates',
];

export type LiveDataKey = (typeof LIVE_DATA_TYPES)[number];
export type LivaDataUpdateDict = { items: number[]; profiles: string[] };

export type LiveDataConfig = {
	apiEndpoint: string;
	label: string;
	description?: string;
	defaultLimit?: number;
	defaultMinScore?: number;
};

export const LIVE_DATA_CONFIGS: Record<LiveDataKey, LiveDataConfig> = {
	max_item: {
		apiEndpoint: 'maxitem.json',
		label: 'Max Item Id',
		description: 'The largest item id currently. No other data.',
	},
	top_hn: {
		apiEndpoint: 'topstories.json',
		label: 'Top Stories',
		description: 'Up to 500 of top stories on Hacker News.',
		defaultLimit: 500,
		defaultMinScore: 150,
	},
	new_hn: {
		apiEndpoint: 'newstories.json',
		label: 'New Stories',
		description: 'Up to 500 of new stories on Hacker News.',
		defaultLimit: 500,
	},
	best_hn: {
		apiEndpoint: 'beststories.json',
		label: 'Best Stories',
		description: 'Up to 100 of best stories on Hacker News.',
		defaultLimit: 100,
		defaultMinScore: 150,
	},
	ask_hn: {
		apiEndpoint: 'askstories.json',
		label: 'Ask HN Stories',
		description: 'Up to 200 Ask HN stories on Hacker News.',
		defaultLimit: 200,
	},
	show_hn: {
		apiEndpoint: 'showstories.json',
		label: 'Show HN Stories',
		description: 'Up to 200 Show HN stories on Hacker News.',
		defaultLimit: 200,
	},
	job_hn: {
		apiEndpoint: 'jobstories.json',
		label: 'Job Stories',
		description: 'Up to 200 Job stories on Hacker News.',
		defaultLimit: 200,
	},
	updates: {
		apiEndpoint: 'updates.json',
		label: 'Updates',
		description: 'See item and (user) profile changes.',
	},
};

// Fetch top stories with no shards
export async function fetchTop(limit: number = LIMIT_DEFAULT): Promise<HackerNewsItem[]> {
	return fetchItemsByIds(await apiFetchTopStoryIds(limit));
}

// Fetch top stories with shards
export async function fetchTopWithShards(
	limit: number = LIMIT_DEFAULT,
	shards: number = SHARD_DEFAULT,
	shardType: 'interleaved' | 'sequential' = 'interleaved',
): Promise<HackerNewsItem[]> {
	// Async parallel with sharding
	try {
		const ids: number[] = await apiFetchTopStoryIds(limit);
		const shardIds: number[][] =
			shardType === 'interleaved' ? shardsInterleaved(ids, shards) : shardsSequential(ids, shards);
		const shardPromises = shardIds.map((shard) => fetchItemsByIds(shard));
		const shardResults: HackerNewsItem[][] = await Promise.all(shardPromises);
		return shardResults.flat();
	} catch (err) {
		console.error('[HN API] Error in fetchTopWithShards:', err);
		return [];
	}
}

export async function fetchItemsByIds(ids: number[]): Promise<HackerNewsItem[]> {
	try {
		const promises = ids.map((id) => apiFetchItem(id));
		const results = await Promise.all(promises);
		return results.filter((item): item is HackerNewsItem => !!item);
	} catch (err) {
		console.error('[HN API] Error in fetchItemsByIds:', err);
		return [];
	}
}

async function apiFetchLiveData(key: 'max_item', limit?: number): Promise<number | null>;
async function apiFetchLiveData(key: 'updates', limit?: number): Promise<LivaDataUpdateDict>;
async function apiFetchLiveData(
	key: Exclude<LiveDataKey, 'max_item' | 'updates'>,
	limit?: number,
): Promise<number[]>;
async function apiFetchLiveData(key: LiveDataKey, limit?: number) {
	const config = LIVE_DATA_CONFIGS[key];
	if (!config) {
		console.warn('[HN API] ⚠️ Missing config for live data key:', key);
		return null;
	}

	const endpoint = new URL(config.apiEndpoint, HN_BASE_URL);
	endpoint.searchParams.append('print', 'pretty');
	const res = await fetch(endpoint, {
		headers: {
			'User-Agent': 'Cloudflare Worker - hacker-news-worker/v0.2.0',
			Accept: 'application/json',
		},
	});

	if (!res.ok) {
		console.error('[HN API] Failed to fetch live data. key=', key, '  status=', res.status);
		return key === 'max_item' ? null : key === 'updates' ? { items: [], profiles: [] } : [];
	}

	const data = await res.json();

	if (key === 'max_item') {
		return typeof data === 'number' ? data : null;
	}

	if (key === 'updates') {
		const dict = data as LivaDataUpdateDict;
		const itemList = Array.isArray(dict.items) ? (dict.items as number[]) : [];
		const profileList = Array.isArray(dict.profiles) ? (dict.profiles as string[]) : [];
		return { items: itemList, profiles: profileList };
	}

	const l = data as number[];
	const m = limit ?? config.defaultLimit;
	const ids = Array.isArray(l) ? (l as number[]) : [];
	if (m && Number.isFinite(m)) {
		return ids.slice(0, m);
	}
	return ids;
}

// Common functions to fetch specific live data types
export async function apiFetchTopStoryIds(limit?: number): Promise<number[]> {
	return apiFetchLiveData('top_hn', limit);
}

export async function apiFetchNewStoryIds(limit?: number): Promise<number[]> {
	return apiFetchLiveData('new_hn', limit);
}

export async function apiFetchBestStoryIds(limit?: number): Promise<number[]> {
	return apiFetchLiveData('best_hn', limit);
}

export async function apiFetchMaxItemId(): Promise<number | null> {
	return apiFetchLiveData('max_item');
}

export async function apiFetchUpdates(): Promise<LivaDataUpdateDict> {
	return apiFetchLiveData('updates');
}

// Fetch a single Hacker News item by id
export async function apiFetchItem(itemId: number): Promise<HackerNewsItem | null> {
	const endpoint = new URL(`item/${itemId}.json`, HN_BASE_URL);
	endpoint.searchParams.append('print', 'pretty');
	const res = await fetch(endpoint, {
		headers: {
			'User-Agent': 'Cloudflare Worker - hacker-news-worker/v0.2.0',
			Accept: 'application/json',
		},
	});
	if (!res.ok) {
		console.error(`[HN API] Failed to fetch item. id:${itemId}, status:${res.status}`);
		return null;
	}
	const hnItem = (await res.json()) as HackerNewsItem;
	console.log(`[HN API] Fetch item from endpoint:${endpoint.toString()}. score:${hnItem.score}`);
	return hnItem;
}

export { apiFetchLiveData };
