import { encode } from './utils/base62';
// import { Env } from './utils/types';
import { MIN_SCORE_DEFAULT, UNIX_TIME_DEFAULT } from './utils/config';
import {
	LIVE_DATA_TYPES,
	LiveDataKey,
	HackerNewsItem,
	apiFetchItem,
	apiFetchLiveData,
	apiFetchMaxItemId,
	apiFetchUpdates,
	fetchTop,
} from './apis/hn';

import { KVManager } from './kv';

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
			return new Response(`Forward route with no match branch. Not Found ${url.pathname}`, { status: 404 });
		}

		const [_, endpoint, num] = match;
		if (endpoint === 'item') {
			if (!num) {
				return new Response(`Forward route /forward/${endpoint} missing item id. Bad Request`, { status: 400 });
			}
			console.log(`Forward route /forward/${endpoint}, fetching item with id:${num}.`);
			const id: number = parseInt(num, 10);
			// v0.2.0: refactor to a promise-based functional style
			return apiFetchItem(id).then((item) =>
				item
					? new Response(JSON.stringify(item, null, 2), {
							headers: { 'Content-Type': 'application/json' },
					  })
					: new Response(`Forward route /forward/${endpoint}, target fetching item with id:${num} not found.`, { status: 404 })
			);
		} else if ((endpoint as LiveDataKey) === 'max_item') {
			console.log(`Forward route /forward/${endpoint}, fetching max_item.`);
			// v0.2.0: refactor to a promise-based functional style
			return apiFetchMaxItemId().then(
				(data) =>
					new Response(JSON.stringify(data, null, 2), {
						headers: { 'Content-Type': 'application/json' },
					})
			);
		} else if ((endpoint as LiveDataKey) === 'updates') {
			console.log(`Forward route /forward/${endpoint}, fetching updates.`);
			// v0.2.0: refactor to a promise-based functional style
			return apiFetchUpdates().then(
				(data) =>
					new Response(JSON.stringify(data, null, 2), {
						headers: { 'Content-Type': 'application/json' },
					})
			);
		} else if (LIVE_DATA_TYPES.includes(endpoint as LiveDataKey)) {
			// match `forward/topstories` and others
			// Bug free but with complicated type notations, TODO?
			if (!num) {
				// TODO relax limit for hn_news etc.
				return new Response(`Forward route /forward/${endpoint} missing limit number. Bad Request`, { status: 400 });
			}
			const n: number = parseInt(num, 10);
			return apiFetchLiveData(endpoint as Exclude<LiveDataKey, 'max_item' | 'updates'>, n).then(
				(data) =>
					new Response(JSON.stringify(data, null, 2), {
						headers: { 'Content-Type': 'application/json' },
					})
			);
		}
		console.warn('⚠️ Forward route pass regex match but fail to resolve.');
		return new Response(`Forward route /forward/${endpoint} matched but unknown/unresolved endpoint.`, { status: 404 });
	},

	// v0.3.0: scheduled handler (cron triggers)
	async scheduled(event, env, ctx): Promise<void> {
		// Entry point for scheduled events (cron jobs)
		console.log('Scheduled event triggered at:', new Date().toISOString());
		ctx.waitUntil(handleCron(env));
	},
} satisfies ExportedHandler<Env>;

// ==================== Cron Handler ====================
async function handleCron(env: Env): Promise<void> {
	const kvm = new KVManager(env.HACKER_NEWS_WORKER, 'kv_test');

	console.log('[Cron Handler] Fetch top stories without shards with Hacker News API');
	// Use default limit for fetchTopWithShards (with shards)
	// const items = await fetchTopWithShards();
	// Use default limit for fetchTop (no shards)
	const topItems: HackerNewsItem[] = await fetchTop();
	let filtered: HackerNewsItem[]
	// TODO: add logics for newItems, bestItems, etc.

	// +++++++++++++++++++ Data Process Calling +++++++++++++++++++++++
	// const results = [];
	// TODO Data Process (in the subgraph)
	// 1. TODO: Filter, remove duplicate (KV hasSent/markSent)
	const cachedIds = (await kvm.list()).map((cachedItem) => cachedItem.item.id);
	console.log(`[Cron Handler][Data Process] ✅ Already cached item ids:${cachedIds}`);
	try {
		const filterMinScore: number = MIN_SCORE_DEFAULT;
		const filterStartTime = UNIX_TIME_DEFAULT;
		// const filtered = filterByStartTime(filterByMinScore(topItems, filterMinScore), filterStartTime);
		// v0.3.1 filter once with cached id list
		filtered = topItems.filter(
			(item) => (item.score ?? 0) >= filterMinScore && (item.time ?? 0) >= filterStartTime && !(item.id in cachedIds)
		);
		const promises = filtered.map((item) => kvm.create(item));
		(await Promise.all(promises)).map((itemCache) => {
			let i = itemCache.item;
			const llmSummary = testSummaryLLM(env, i);
			const llmScore = testScoreLLM(env, i)
			console.log(`[Cron Handler][Data Process] Processed Item ID after filter and cached new item id:${i.id}, uuid:${itemCache.uuid}, at ceated:${itemCache.createdAt}`)
			console.log(`[Cron Handler][Data Process] Cached title:${i.title}`)
			console.log(`[Cron Handler][Data Process] Show LLM Score:${llmScore}, LLM Summary:${llmSummary}`)
		});
		// TODO Actual LLM summary and LLM score (optional)
		// for (const item of filtered) {
		// 	const llmSummary = await summaryLLM(env, item);
		// 	const llmScore = await scoreLLM(env, item);
		// 	console.log('Processed Item ID after filter:', item.id, '  LLM Score:', llmScore, '  LLM Summary:', llmSummary);
		// 	results.push({
		// 		...item,
		// 		llmSummary: llmSummary,
		// 		llmScore: llmScore,
		// 	});
		// }
	} catch (err) {
		console.error('Error in data processing:', err);
		filtered = [];
	}
	// +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++

	// 4. TODO Notification (telegram  / email / webhook)
	await notifyAll(env, filtered);
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
	return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function notifyTelegram(env: Env, p: any): Promise<void> {
	const story_id_int: number = p.id;
	const story_id: string = story_id_int.toString();
	const short_id: string = encode(story_id_int);
	const hn_url: URL = new URL('item', 'https://new.ycombinator.com/');
	hn_url.searchParams.append('id', story_id);

	let story_url = p.url;
	const short_hn_url: URL = new URL(`c/${short_id}`, 'https://readhacker.news/');
	let short_url: URL = new URL(`s/${short_id}`, 'https://readhacker.news/');

	if (!!story_url) {
		short_url = short_hn_url;
	}
	const buttons = [
		{
			text: 'Read',
			url: story_url,
		},
		{
			text: 'Comments',
			url: hn_url,
		},
	];

	const title = escapeHtml(p.title);
	const scorePart = typeof p.score === 'number' ? `Score: ${p.score}+` : '';
	const headerParts = [scorePart, `by ${p.by}`].filter(Boolean).join(' · ');

	let message = `<b>${title}</b>`;
	if (headerParts) {
		message += `\n(${headerParts})`;
	}

	// Story URL Link
	message += `\n\n<b>Link:</b> ${p.url}`;
	// Comments URL Link
	message += `\n\n<b>Comments:</b> ${hn_url}`;
	// Summary
	if (p.llmSummary) {
		message += `\n\nLLM Summary: ${escapeHtml(p.llmSummary)}`;
	}
	const replyMarkup = {
		inline_keyboard: [buttons],
	};

	// Send through telegrambot
	const telegramToken = env.TELEGRAM_BOT_TOKEN;
	if (!telegramToken) {
		console.error('Error in notifyTelegram, TELEGRAM_BOT_TOKEN missing in Env.');
		return;
	}
	const TELEGRAM_BASE_URL = 'https://api.telegram.org/';
	// const telegramEndpoint = new URL(`bot${telegramToken}/sendMessage`, TELEGRAM_BASE_URL);
	const endpoint = `https://api.telegram.org/bot${telegramToken}/sendMessage`;
	console.log(`Tg endpoint: ${endpoint}`);
	try {
		let payload = JSON.stringify({
			chat_id: '@hacker_news_summary', //TODO fix
			text: message,
			parse_mode: 'HTML',
			reply_markup: replyMarkup,
			disable_web_page_preview: false,
		});
		let header = {
			'Content-Type': 'application/json',
		};
		const res = await fetch(endpoint, {
			method: 'POST',
			headers: header,
			body: payload,
		});
		if (!res.ok) {
			const bodyText = await res.text();
			console.error('Error in notifyTelegram: sendMessage failed', res.status, res.statusText, bodyText);
		}
	} catch (err) {
		console.error('notifyTelegram: network or other error', err);
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
function testSummaryLLM(env: Env, item: HackerNewsItem): string | null {
	return item.title ?? null;
}
function testScoreLLM(env: Env, item: HackerNewsItem): number {
	return item.score ?? -1;
}

async function asyncSummaryLLM(env: Env, item: HackerNewsItem): Promise<string | null> {
	// TODO placeholder for LLM summary
	// return item.title if exists now
	return item.title ?? null;
}

async function asyncScoreLLM(env: Env, item: HackerNewsItem): Promise<number | null> {
	// TODO placeholder for LLM score
	// return item.score if exists now
	return item.score ?? null;
}
