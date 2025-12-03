import { KVManager } from './kvm';
import { type HackerNewsItem, fetchTop, fetchTopWithShards } from './apis/hn';
import { sendMessage } from './apis/tg';
import { sendEmail } from './email';
import {
	FOUR_HOURS,
	TWO_DAYS,
	prefixFactory,
	keyWithPrefix,
	encode,
	escapeHtml,
} from './utils/tools';
import {
	MIN_SCORE_DEFAULT,
	TG_BASE_URL,
	UNIX_TIME_DEFAULT,
	KV_PREFIX,
	KV_TTL_KEY,
	KV_TTL_VAL,
} from './utils/config';

export async function runTelegramJob(env: Env, shards?: number): Promise<void> {
	console.log('[Job TG] Fetch top stories without shards with Hacker News API');
	const hnPrefix: string = prefixFactory(KV_PREFIX);
	const kvm = await KVManager.init(env.HACKER_NEWS_WORKER, hnPrefix, KV_TTL_KEY, KV_TTL_VAL);
	const topItems: HackerNewsItem[] =
		shards !== undefined ? await fetchTopWithShards(undefined, shards) : await fetchTop();

	// Note: No test for listKeys with setting `onlyOnce` false
	const cachedIds = (await kvm.listKeys(hnPrefix, true))
		.map((prefixed_id) => {
			if (!prefixed_id.startsWith(hnPrefix)) {
				console.warn(`[Job TG] ⚠️ Skip unexpected KV key:${prefixed_id}`);
				return NaN;
			}
			return Number(prefixed_id.slice(hnPrefix.length));
		})
		.filter((n) => Number.isFinite(n));
	console.log(`[Job TG] Cached Hacker News itme ids (parse to to number):${cachedIds}`);

	const filteredItems = topItems.filter(
		(item) =>
			(item.score ?? 0) >= MIN_SCORE_DEFAULT &&
			(item.time ?? 0) >= UNIX_TIME_DEFAULT &&
			!cachedIds.includes(item.id),
	);
	try {
		const promises = filteredItems.map((item) => {
			const kk = keyWithPrefix(item.id, hnPrefix);
			const vv = JSON.stringify(item);
			console.log(`[Job TG] Try cache id:${item.id} with metadata... and ttl(default).`);
			return kvm.create(
				kk,
				vv,
				{
					uuid: crypto.randomUUID(),
					llm_summary: `[TEST] ${testSummaryLLM(env, item)}`,
					llm_score: `[TEST] ${testScoreLLM(env, item)}`,
				},
				// TTL as default
			);
		});
		await Promise.all(promises);
	} catch (err) {
		console.error('[Job TG] ❌ Error in data processing:', err);
	}

	await notifyAll(env, filteredItems);
}

export async function runEmailJob(env: Env): Promise<void> {
	// Manage your own subject and text
	const subject = 'Hacker News Weekly Summary';
	const text = 'Congratulations, you just sent an email from a worker.';
	await sendEmail(env, subject, text);
}
// ========= Notification Channels =========

async function notifyAll(env: Env, payloads: any[], specifiedBots?: string[]): Promise<void> {
	if (specifiedBots !== undefined) {
		console.warn(
			`[Notify] ⚠️ notifyAll with specifiedBots (bot list) not implement. Fallback to default bot.`,
		);
	}
	const tgBotToken = env.TG_BOT_TOKEN;
	if (!tgBotToken) {
		console.error(
			'[Notify] ❌ Error in notifyTg, Telegram bot token missing in Env. Please Check.',
		);
		return;
	}
	const tgChatId = env.TG_CHAT_ID;
	if (!tgChatId) {
		console.error(
			"[Notify] ❌ Error in notifyTg, Telegram Chat ID (may use '@xxx') missing in Env. Please Check.",
		);
		return;
	}
	for (const p of payloads) {
		console.log(`[Notify] Title: \"${p.title}\" --- By: ${p.by}\n[Notify] Link: ${p.url}`);
		await notifyTg(tgBotToken, tgChatId, p, undefined);
	}
}

async function notifyTg(
	tgBotToken: string,
	tgChatId: string,
	p: any,
	specified?: string,
): Promise<void> {
	if (specified !== undefined) {
		console.warn(`[Notify] ⚠️ notifyTg with specified bot not implement. Fallback to default bot.`);
	}
	const storyId: string = p.id.toString();
	const shortId: string = encode(p.id);
	const commentCounts: number | undefined = p.descendants;
	// Comment url group
	const hnUrl: URL = new URL('item', 'https://news.ycombinator.com/');
	hnUrl.searchParams.append('id', storyId);
	const shortHnUrl: URL = new URL(`c/${shortId}`, 'https://readhacker.news/');
	// Story url group
	const storyUrl: URL = typeof p.url === 'string' ? new URL(p.url) : hnUrl;
	const shortStoryUrl: URL = p.url
		? new URL(`s/${shortId}`, 'https://readhacker.news/')
		: shortHnUrl;

	const buttons = [
		{
			text: p.url ? 'Read' : 'Read HN',
			url: storyUrl,
		},
		{
			text: commentCounts ? `Comments ${commentCounts}+` : `Comments`,
			url: shortHnUrl,
		},
	];

	// Get the time difference and emoji
	const nowSecs: number = Math.ceil(Date.now() / 1000);
	const statusEmoji =
		typeof p.time === 'number'
			? (() => {
					const deltaSecs = nowSecs - p.time;
					if (deltaSecs <= FOUR_HOURS) return '🔥 ';
					if (deltaSecs >= TWO_DAYS) return '❄️ ';
					return '';
			  })()
			: '';

	// Add title
	const title = escapeHtml(p.title);
	const scorePart = typeof p.score === 'number' ? `Score: ${p.score}+` : '';
	const headerParts = [scorePart, `by ${p.by}`].filter(Boolean).join(' · ');

	let message = `<b>${title}</b> ${statusEmoji}`;
	if (headerParts) {
		message += `\n(${headerParts})`;
	}

	// Story URL Link
	message += `\n\n<b>Link:</b> ${shortStoryUrl}`;
	// Comments URL Link
	message += `\n<b>Comments:</b> ${shortHnUrl}`;

	const replyMarkup = {
		inline_keyboard: [buttons],
	};
	return sendMessage(tgBotToken, tgChatId, message, replyMarkup);
}

// LLM integration placeholder, replace with your true implementation
function testSummaryLLM(env: Env, item: HackerNewsItem): string | null {
	return item.title ?? null;
}
function testScoreLLM(env: Env, item: HackerNewsItem): number {
	return item.score ?? -1;
}
