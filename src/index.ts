/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run `npm run dev` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run `npm run deploy` to publish your worker
 *
 * Bind resources to your worker in `wrangler.jsonc`. After adding bindings, a type definition for the
 * `Env` object can be regenerated with `npm run cf-typegen`.
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */

const BASE_URL = 'https://hacker-news.firebaseio.com/v0/';

// Common Hacker News Item from

type HackerNewsItem = {
	id: number; // unique identifier
	deleted?: boolean; // true if the item is deleted
	type?: string; // one of "job", "story", "comment", "poll", or "pollopt"
	by: string; // username
	time: number; // unix timestamp
	text: string; // content
	dead?: boolean; // true if the item is dead
	parent?: number; // the comment's parent: either another comment or the relevant story
	poll?: number; // the pollopt's associated poll
	kids?: number[]; // list of comments, in ranked display order
	url?: string; // the url of the story
	score?: number; // story score, or votes for a pollopt
	title: string; // title HTML
	parts?: number[]; // a list of related pollopts, in display order
	descendants?: number; // in the case of stories or polls, the total comment count
};

export default {
	async fetch(request, env, ctx): Promise<Response> {
		const url = new URL(request.url);
		switch (url.pathname) {
			case '/':
				return new Response('Hello World!');
			case '/about':
				return new Response('About: This is a haker news worker.');
			case '/blog':
				const blogUrl = new URL('https://edwardzcn.me');
				return fetch(blogUrl);
		}
		// Forward Hacker News API. Fetch item by id
		// v0.1.0 regex
		// const match = url.pathname.match();
		// v0.2.0
		const match = url.pathname.match(/^\/forward\/([A-Za-z]+)(?:\/(\d+))?$/);
		if (!match) {
			return new Response('Forward route /forward/xxx not match. Not Found', { status: 404 });
		}

		const [_, endpoint, num] = match;
		if (endpoint === 'item') {
			if (!num) {
				return new Response('Forward route /forward/item/ddd missing item id. Bad Request', { status: 400 });
			}
			console.log('Forward fetching item id:', num);
			const n: number = parseInt(num, 10);

			// const item = await apiFetchItem(n);
			// if(!item) {
			// 	return new Response('Forward fetch item not found', { status: 404 });
			// }
			// return new Response(JSON.stringify(item, null, 2), {
			// 	headers: { 'Content-Type': 'application/json' },
			// });

			// v0.2.0: refactor to a promise-based functional style
			return apiFetchItem(n).then((item) =>
				item
					? new Response(JSON.stringify(item, null, 2), {
							headers: { 'Content-Type': 'application/json' },
					  })
					: new Response('Forward fetch item not found', { status: 404 })
			);
		} else if (endpoint === 'updates') {
			console.log('Forward fetching updates');
			// Omit limit for updates

			// v0.2.0: refactor to a promise-based functional style
			return apiFetchUpdates().then(
				(data) =>
					new Response(JSON.stringify(data, null, 2), {
						headers: { 'Content-Type': 'application/json' },
					})
			);
		} else if(LIVE_DATA_TYPES.includes(endpoint as LiveDataKey)){
			// match `forward/topstories` and others, Bug free?
			if (!num) {
				return new Response('Forward route /forward/xxx/ddd missing limit number. Bad Request', { status: 400 });
			}
			console.log('Forward limit number:', num);
			const n: number = parseInt(num, 10);
			return apiFetchLiveData(endpoint as LiveDataKey, n).then(
				(data) =>
					new Response(JSON.stringify(data, null, 2), {
						headers: { 'Content-Type': 'application/json' },
					})
			);
		}
		return new Response('Forward route unknown endpoint. Not Found', { status: 404 });
		// const url = new URL(`item/${itemId}.json`, BASE_URL);
		// url.searchParams.append('print', 'pretty');
		// console.log('Full URL string:', url.toString());
		// const response = await fetch(url, {
		// 	headers: {
		// 		'User-Agent': 'Cloudflare Worker - hacker-news-worker/v0.1.0',
		// 		Accept: 'application/json',
		// 	},
		// });
		// return response;
	},
	async scheduled(event, env, ctx): Promise<void> {
		// Entry point for scheduled events (cron jobs)
		console.log('Scheduled event triggered at:', new Date().toISOString());
		// ctx.waitUntil(handleCron(env));
	},
} satisfies ExportedHandler<Env>;

// ==================== Cron Handler ====================

// async function handleCron(env: Env): Promise<void> {
// 	// 1. 获取 top story id 列表
// 	const items_top_k: number = 20;
// 	const items = await apiFetchTopItems(items_top_k);

// 	// 2. TODO 做过滤
// 	// const filtered = filterItems(items);

// 	// TODO: 未来可加：去重 (KV hasSent/markSent)，按时间过滤等

// 	// 3. 可选 LLM 处理（暂时只是留接口）
// 	for (const item of items) {
// 		const url = item.url ?? `https://news.ycombinator.com/item?id=${item.id}`;
// 		const payload: NotificationPayload = {
// 			title: item.title,
// 			url,
// 			score: item.score,
// 			by: item.by,
// 			// summary: await summarizeItemWithLLM(env, item) ?? undefined,
// 		};

// 		await notifyAll(env, payload);
// 	}
// }

// ==================== Hacker News helpers ====================
const LIVE_DATA_TYPES = ['max_item', 'top_hn', 'new_hn', 'best_hn', 'ask_hn', 'show_hn', 'job_hn', 'updates'];
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

async function apiFetchLiveData(key: 'max_item', limit?: number): Promise<number | null>;
async function apiFetchLiveData(key: 'updates', limit?: number): Promise<LivaDataUpdateDict>;
async function apiFetchLiveData(key: Exclude<LiveDataKey, 'max_item' | 'updates'>, limit?: number): Promise<number[]>;
async function apiFetchLiveData(key: LiveDataKey, limit?: number) {
	const config = LIVE_DATA_CONFIGS[key];
	if (!config) {
		console.error('Unknown live data key:', key);
		return null;
	}

	const endpoint = new URL(config.apiEndpoint, BASE_URL);
	// Add print=pretty
	endpoint.searchParams.append('print', 'pretty');
	const res = await fetch(endpoint, {
		headers: {
			'User-Agent': 'Cloudflare Worker - hacker-news-worker/v0.2.0',
			Accept: 'application/json',
		},
	});

	if (!res.ok) {
		console.error('Failed to fetch live data. key=', key, '  status=', res.status);
		return key === 'max_item' ? null : key === 'updates' ? { items: [], profiles: [] } : [];
	}

	const data = await res.json();

	if (key === 'max_item') {
		return typeof data === 'number' ? data : null; // Promise<number | null>
	}

	if (key === 'updates') {
		const dict = data as LivaDataUpdateDict; // typed
		const item_list = Array.isArray(dict.items) ? (dict.items as number[]) : [];
		const profile_list = Array.isArray(dict.profiles) ? (dict.profiles as string[]) : [];
		// No limit applied for updates (so no slice cut)
		return { items: item_list, profiles: profile_list }; // Promise<LivaDataUpdateDict>
	}

	const l = data as number[]; // typed
	const m = limit ?? config.defaultLimit;
	const ids = Array.isArray(l) ? (l as number[]) : [];
	if (m && Number.isFinite(m)) {
		return ids.slice(0, m);
	}
	return ids; // Promise<number[]>
}

// Common functions to fetch specific live data types
async function apiFetchTopStoryIds(limit?: number): Promise<number[]> {
	return apiFetchLiveData('top_hn', limit);
}
async function apiFetchNewStoryIds(limit?: number): Promise<number[]> {
	return apiFetchLiveData('new_hn', limit);
}
async function apiFetchBestStoryIds(limit?: number): Promise<number[]> {
	return apiFetchLiveData('best_hn', limit);
}

async function apiFetchMaxItemId(): Promise<number | null> {
	return apiFetchLiveData('max_item');
}
async function apiFetchUpdates(): Promise<LivaDataUpdateDict> {
	return apiFetchLiveData('updates');
}

// Fetch a single Hacker News item by id
async function apiFetchItem(item_id: number): Promise<HackerNewsItem | null> {
	const endpoint = new URL(`item/${item_id}`, BASE_URL);
	endpoint.searchParams.append('print', 'pretty');
	const res = await fetch(endpoint, {
		headers: {
			'User-Agent': 'Cloudflare Worker - hacker-news-worker/v0.2.0',
			Accept: 'application/json',
		},
	});
	if (!res.ok) {
		console.error('Failed to fetch item. item_id=', item_id, '  status=', res.status);
		return null;
	}
	return (await res.json()) as HackerNewsItem;
}

async function apiFetchTopItems(limit = 30): Promise<HackerNewsItem[]> {
	//// Sync sequential v0.1.0
	// const ids = await apiFetchTopStoryIds(limit);
	// const items: HackerNewsItem[] = [];
	// for (const id of ids) {
	// 	const item = await apiFetchItem(id);
	// 	if (item) items.push(item);
	// }

	// return items;

	// Async parallel v0.2.0
	try {
		const ids = await apiFetchTopStoryIds(limit);
		const promises = ids.map((id) => apiFetchItem(id));
		const results = await Promise.all(promises);
		return results.filter((item): item is HackerNewsItem => !!item);
	} catch (err) {
		console.error('Error in apiFetchTopItems:', err);
		return [];
	}
}
