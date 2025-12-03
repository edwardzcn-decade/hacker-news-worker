import { APP_USER_AGENT, TG_BASE_URL } from '../utils/config';

export async function sendMessage(
	tgBotToken: string,
	chatId: string,
	msg: string,
	replyMarkup: any,
): Promise<void> {
	// NOTE(#6) tg bot token like `bot91918237:ASDFSAF` will trigger scheme-like problem and let URL constructor omit base url.
	const tgEndpoint = new URL(TG_BASE_URL);
	tgEndpoint.pathname = `bot${tgBotToken}/sendMessage`;

	const header = {
		'User-Agent': APP_USER_AGENT,
		'Content-Type': 'application/json',
	};
	const payload = JSON.stringify({
		chat_id: chatId,
		text: msg,
		parse_mode: 'HTML',
		reply_markup: replyMarkup,
		disable_web_page_preview: false,
	});

	try {
		const res = await fetch(tgEndpoint, {
			method: 'POST',
			headers: header,
			body: payload,
		});
		if (!res.ok) {
			const bodyText = await res.text();
			console.error('[TG SendMessage] ❌ SendMessage failed', res.status, res.statusText, bodyText);
		}
	} catch (err) {
		console.error(`[TG SendMessage] ❌ Network or other error ${err}`);
	}
}
