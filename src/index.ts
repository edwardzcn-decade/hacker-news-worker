import {
	LIVE_DATA_TYPES,
	type LiveDataKey,
	apiFetchItem,
	apiFetchLiveData,
	apiFetchMaxItemId,
	apiFetchUpdates,
} from './apis/hn';

import { runTelegramJob, runEmailJob } from './jobs';

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
		const match = url.pathname.match(/^\/forward\/([A-Za-z_]+)(?:\/(\d+))?$/);
		if (!match) {
			return new Response(`Forward route with no match branch. Not Found ${url.pathname}`, {
				status: 404,
			});
		}

		const [_, endpoint, num] = match;
		if (endpoint === 'item') {
			if (!num) {
				return new Response(`Forward route /forward/${endpoint} missing item id. Bad Request`, {
					status: 400,
				});
			}
			console.log(`[Forward] Forward route /forward/${endpoint}, fetching item with id:${num}.`);
			const id: number = parseInt(num, 10);
			return apiFetchItem(id).then((item) =>
				item
					? new Response(JSON.stringify(item, null, 2), {
							headers: { 'Content-Type': 'application/json' },
					  })
					: new Response(
							`Forward route /forward/${endpoint}, target fetching item with id:${num} not found.`,
							{ status: 404 },
					  ),
			);
		} else if ((endpoint as LiveDataKey) === 'max_item') {
			console.log(`[Forward] Forward route /forward/${endpoint}, fetching max_item.`);
			return apiFetchMaxItemId().then(
				(data) =>
					new Response(JSON.stringify(data, null, 2), {
						headers: { 'Content-Type': 'application/json' },
					}),
			);
		} else if ((endpoint as LiveDataKey) === 'updates') {
			console.log(`[Forward] Forward route /forward/${endpoint}, fetching updates.`);
			return apiFetchUpdates().then(
				(data) =>
					new Response(JSON.stringify(data, null, 2), {
						headers: { 'Content-Type': 'application/json' },
					}),
			);
		} else if (LIVE_DATA_TYPES.includes(endpoint as LiveDataKey)) {
			if (!num) {
				return new Response(
					`Forward route /forward/${endpoint} missing specific limit number. Bad Request`,
					{ status: 400 },
				);
			}
			const n: number = parseInt(num, 10);
			return apiFetchLiveData(endpoint as Exclude<LiveDataKey, 'max_item' | 'updates'>, n).then(
				(data) =>
					new Response(JSON.stringify(data, null, 2), {
						headers: { 'Content-Type': 'application/json' },
					}),
			);
		}
		console.warn('[Forward] ⚠️ Forward route pass regex match but fail to resolve.');
		return new Response(
			`Forward route /forward/${endpoint} matched but unknown/unresolved endpoint.`,
			{ status: 404 },
		);
	},

	async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
		// Entry point for scheduled events (cron jobs)
		console.log('[Scheduled] Scheduled event triggered at:', new Date().toISOString());
		switch (controller.cron) {
			case '*/10 * * * *':
				// Every 10 minutes, trigger telegram bot
				ctx.waitUntil(runTelegramJob(env));
				break;
			case '30 9 * * mon,wed,fri':
				// 09:30 UTC every Monday, Wednesday and Friday
				ctx.waitUntil(runEmailJob(env));
				break;
			default:
				console.warn(
					`[Scheduled] ⚠️ Mismatch cron expression:${controller.cron}. Read https://github.com/edwardzcn-decade/hacker-news-worker/tree/main?tab=readme-ov-file#scheduled-jobs`,
				);
		}
	},
} satisfies ExportedHandler<Env>;
