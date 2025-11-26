import { encode } from './utils/base62';
import { Env } from './utils/types';
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
		} else if ((endpoint as LiveDataKey) === 'max_item') {
			console.log('Forward fetching max_item');
			// v0.2.0: refactor to a promise-based functional style
			return apiFetchMaxItemId().then(
				(data) =>
					new Response(JSON.stringify(data, null, 2), {
						headers: { 'Content-Type': 'application/json' },
					})
			);
		} else if ((endpoint as LiveDataKey) === 'updates') {
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
			return apiFetchLiveData(endpoint as Exclude<LiveDataKey, 'max_item' | 'updates'>, n).then(
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
	await notifyAll(env, results);
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
