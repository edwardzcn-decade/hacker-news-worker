import {
	encode,
	decode,
} from "./utils/base62";
const HN_BASE_URL = 'https://hacker-news.firebaseio.com/v0/';

const LIMIT_DEFAULT = 5;
const SHARD_DEFAULT = 3;
const MIN_SCORE_DEFAULT = 100;
const UNIX_TIME_DEFAULT = 0; // no time filter by default
// Common Hacker News Item from



type HackerNewsItem = {
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
		// v0.2.0
		const match = url.pathname.match(/^\/forward\/([A-Za-z_]+)(?:\/(\d+))?$/);
		if (!match) {
			return new Response('Forward route /forward/xxx not match. Not Found', { status: 404 });
		}

		const [_, endpoint, num] = match;
		if (endpoint === 'item') {
			if (!num) {
				return new Response('Forward route /forward/item/ddd missing item id. Bad Request', { status: 400 });
			}
			console.log('Forward fetching item id:', num);
			const id: number = parseInt(num, 10);

			// const item = await apiFetchItem(n);
			// if(!item) {
			// 	return new Response('Forward fetch item not found', { status: 404 });
			// }
			// return new Response(JSON.stringify(item, null, 2), {
			// 	headers: { 'Content-Type': 'application/json' },
			// });

			// v0.2.0: refactor to a promise-based functional style
			return apiFetchItem(id).then((item) =>
				item
					? new Response(JSON.stringify(item, null, 2), {
							headers: { 'Content-Type': 'application/json' },
					  })
					: new Response('Forward fetch item not found', { status: 404 })
			);
		} else if (endpoint === 'max_item') {
			console.log('Forward fetching max_item');
			// v0.2.0: refactor to a promise-based functional style
			return apiFetchMaxItemId().then(
				(data) =>
					new Response(JSON.stringify(data, null, 2), {
						headers: { 'Content-Type': 'application/json' },
					})
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
		} else if (LIVE_DATA_TYPES.includes(endpoint as LiveDataKey)) {
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
		// const url = new URL(`item/${itemId}.json`, HN_BASE_URL);
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
	// v0.3.0: scheduled handler (cron triggers)
	async scheduled(event, env, ctx): Promise<void> {
		// Entry point for scheduled events (cron jobs)
		console.log('Scheduled event triggered at:', new Date().toISOString());
		ctx.waitUntil(handleCron(env));
	},
} satisfies ExportedHandler<Env>;

// ==================== Cron Handler ====================

/**
 * Splits an array of numbers into `n` interleaved shards.
 * Equivalent to Python's [raw_array[i::n] for i in range(n)]
 *
 * @param raw_array - The input array of numbers to shard
 * @param n - Number of shards
 * @returns An array of `n` arrays with interleaved values
 */
function shardInterleaved(raw_array: number[], shards: number): number[][] {
	if (shards <= 0) throw new Error('Number of shards must be positive');
	const result: number[][] = Array.from({ length: shards }, () => []);
	for (let i = 0; i < raw_array.length; i++) {
		result[i % shards].push(raw_array[i]);
	}
	return result;
}
function shardSequential(raw_array: number[], shards: number): number[][] {
	if (shards <= 0) throw new Error('Number of shards must be positive');
	const result: number[][] = [];
	const shard_size = Math.ceil(raw_array.length / shards);
	for (let i = 0; i < raw_array.length; i += shard_size) {
		result.push(raw_array.slice(i, i + shard_size));
	}
	return result;
}

// Fetch top stories with no shards
async function fetchTop(limit: number = LIMIT_DEFAULT): Promise<HackerNewsItem[]> {
	return fetchItemsByIds(await apiFetchTopStoryIds(limit));
}

// Fetch top stories with shards
async function fetchTopWithShards(
	limit: number = LIMIT_DEFAULT,
	shards: number = SHARD_DEFAULT,
	shardType: 'interleaved' | 'sequential' = 'interleaved'
): Promise<HackerNewsItem[]> {
	// Async parallel v0.3.0 with sharding
	try {
		const ids: number[] = await apiFetchTopStoryIds(limit);
		const shardIds: number[][] = shardType === 'interleaved' ? shardInterleaved(ids, shards) : shardSequential(ids, shards);
		// `shards`: the length of shardIds
		// const pp = shardIds.map((shard): shard is number[] => fetchItemsByIds(shard))  // no need for type predicate/guard here
		const shardPromises = shardIds.map((shard) => fetchItemsByIds(shard));
		const shardResults: HackerNewsItem[][] = await Promise.all(shardPromises);
		// flat
		const allItems = shardResults.flat();
		return allItems;
	} catch (err) {
		console.error('Error in fetchTopWithShards:', err);
		console.error('Return empty array of HackerNewsItem');
		return [];
	}
}

async function fetchItemsByIds(ids: number[]): Promise<HackerNewsItem[]> {
	// Async parallel v0.2.0
	try {
		const promises = ids.map((id) => apiFetchItem(id));
		const results = await Promise.all(promises);
		return results.filter((item): item is HackerNewsItem => !!item);
	} catch (err) {
		console.error('Error in fetchItemsByIds:', err);
		console.error('Return empty array of HackerNewsItem');
		return [];
	}
}

async function handleCron(env: Env): Promise<void> {
	// v0.3.0: fetch top stories like hackernewsbot
	// const limit: number = 30;

	// Use default limit for fetchTopWithShards (with shards)
	// const items = await fetchTopWithShards();
	// Use default limit for fetchTop (no shards)
	console.log('Trigger Cron: fetch top stories without shards');
	const topItems: HackerNewsItem[] = await fetchTop();
	// TODO: add logics for newItems, bestItems, etc.

	// +++++++++++++++++++ Data Process Calling +++++++++++++++++++++++
	// TODO: design process type?
	const results = [];
	// TODO Data Process (in the subgraph)
	// 1. TODO: Filter, remove duplicate (KV hasSent/markSent)
	try {
		const filterMinScore: number = MIN_SCORE_DEFAULT;
		const filterStartTime = UNIX_TIME_DEFAULT;
		const filtered = filterByStartTime(filterByMinScore(topItems, filterMinScore), filterStartTime);

		// TODO Actual LLM summary and LLM score (optional)
		for (const item of filtered) {
			const llmSummary = await summaryLLM(env, item);
			const llmScore = await scoreLLM(env, item);
			console.log('Processed Item ID after filter:', item.id, '  LLM Score:', llmScore, '  LLM Summary:', llmSummary);
			results.push({
				...item,
				llmSummary: llmSummary,
				llmScore: llmScore,
			});
		}
	} catch (err) {
		console.error('Error in data processing:', err);
	}
	// +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++

	// 4. TODO Notification (telegram  / email / webhook)
	await notifyAll(
		env,
		results
	);
}

// ========= Notification Channels =========

async function notifyAll(env: Env, payloads: any[]): Promise<void> {
	// v0.3.0 Only print logs to console
	for (const p of payloads) {
		console.log(
			'[Notify]',
			`[Score: ${p.score}]`,
			`[Title: ${p.title}]`,
			`[Link: ${p.url}]`,
			`[By: ${p.by}]`,
			`[LLM Summary: ${p.llmSummary}]`,
			`[LLM Score: ${p.llmScore}]`
		);
		await notifyTelegram(env, p);
		// TODO: for v0.3.2 add notifyEmail, notifyWebhook
		// await notifyEmail(env, payloads);
		// await notifyWebhook(env, payloads);
	}
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

async function notifyTelegram(env: Env, p: any): Promise<void> {

	const story_id_int: number = p.id;
	const story_id: string = story_id_int.toString();
	const short_id: string = encode(story_id_int);
	const hn_url: URL = new URL( "item","https://new.ycombinator.com/");
	hn_url.searchParams.append("id", story_id);

	let story_url = p.url;
	const short_hn_url: URL = new URL(`c/${short_id}`, "https://readhacker.news/")
	let short_url: URL = new URL(`s/${short_id}`, "https://readhacker.news/")

	if (!!story_url){
		short_url = short_hn_url
	}
	const buttons = [
		{
			text: "Read",
			url: story_url
		},
		{
			text: "Comments",
			url: hn_url
		}
	];

	const title = escapeHtml(p.title)
	const scorePart = typeof p.score === "number" ? `Score: ${p.score}+` : "";
  const headerParts = [scorePart, `by ${p.by}`].filter(Boolean).join(" · ");

  let message = `<b>${title}</b>`;
  if (headerParts) {
    message += `\n(${headerParts})`;
  }

  // Story URL Link
  message += `\n\n<b>Link:</b> ${p.url}`;
	// Comments URL Link
	message += `\n\n<b>Comments:</b> ${hn_url}`;
	// Summary
	if(p.llmSummary) {
		message += `\n\nLLM Summary: ${escapeHtml(p.llmSummary)}`
	}
	const replyMarkup = {
		inline_keyboard: [buttons],
	};
	

	// Send through telegrambot
	const telegramToken = env.TELEGRAM_BOT_TOKEN;
	if (!telegramToken) {
		console.error("Error in notifyTelegram, TELEGRAM_BOT_TOKEN missing in Env.")
		return;
	}
	const TELEGRAM_BASE_URL = 'https://api.telegram.org/';
	// const telegramEndpoint = new URL(`bot${telegramToken}/sendMessage`, TELEGRAM_BASE_URL);
	const endpoint = `https://api.telegram.org/bot${telegramToken}/sendMessage`
	console.log(`Tg endpoint: ${endpoint}`)
	try {
		let payload = JSON.stringify({
          chat_id: "@hacker_news_summary", //TODO fix
          text: message,
          parse_mode: "HTML",
          reply_markup: replyMarkup,
          disable_web_page_preview: false,
        });
		let header ={
          "Content-Type": "application/json",
        };
		const res = await fetch(endpoint, {
        method: "POST",
        headers: header,
        body: payload,
      });
		if (!res.ok) {
        const bodyText = await res.text();
        console.error(
          "Error in notifyTelegram: sendMessage failed",
          res.status,
          res.statusText,
          bodyText,
        );
      }
	} catch(err) {
		console.error("notifyTelegram: network or other error", err);
	}
}

// ==================== Data process helpers ====================

function filterByMinScore(items: HackerNewsItem[], minScore: number): HackerNewsItem[] {
	return items.filter((item) => (item.score ?? 0) >= minScore);
}
function filterByStartTime(items: HackerNewsItem[], startTime: number): HackerNewsItem[] {
	return items.filter((item) => (item.time ?? 0) >= startTime);
}

// LLM process placeholder
async function summaryLLM(env: Env, item: HackerNewsItem): Promise<string | null> {
	// TODO placeholder for LLM summary
	// return item.title if exists now
	return item.title ?? null;
}
async function scoreLLM(env: Env, item: HackerNewsItem): Promise<number | null> {
	// TODO placeholder for LLM score
	// return item.score if exists now
	return item.score ?? null;
}

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

	const endpoint = new URL(config.apiEndpoint, HN_BASE_URL);
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
		const itemList = Array.isArray(dict.items) ? (dict.items as number[]) : [];
		const profileList = Array.isArray(dict.profiles) ? (dict.profiles as string[]) : [];
		// No limit applied for updates (so no slice cut)
		return { items: itemList, profiles: profileList }; // Promise<LivaDataUpdateDict>
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
async function apiFetchItem(itemId: number): Promise<HackerNewsItem | null> {
	const endpoint = new URL(`item/${itemId}.json`, HN_BASE_URL);
	endpoint.searchParams.append('print', 'pretty');

	console.log('Fetching item from endpoint:', endpoint.toString());
	const res = await fetch(endpoint, {
		headers: {
			'User-Agent': 'Cloudflare Worker - hacker-news-worker/v0.2.0',
			Accept: 'application/json',
		},
	});
	if (!res.ok) {
		console.error('Failed to fetch item. id=', itemId, '  status=', res.status);
		return null;
	}
	return (await res.json()) as HackerNewsItem;
}
