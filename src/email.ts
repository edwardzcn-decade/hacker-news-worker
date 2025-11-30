import { EmailMessage } from 'cloudflare:email';

function buildPlainTextEmail(from: string, to: string, subject: string, body: string): string {
	const messageId = `<${crypto.randomUUID()}@example.me>`;

	const headers = [
		`From: ${from}`,
		`To: ${to}`,
		`Message-ID: ${messageId}`,
		'MIME-Version: 1.0',
		'Content-Type: text/plain; charset=UTF-8',
		'Content-Transfer-Encoding: 7bit',
		`Subject: ${subject}`,
	];

	return headers.join('\r\n') + '\r\n\r\n' + body;
}

export async function sendEmail(env: Env, subject: string, text: string) {
	console.log('[Email SendEmail] Try send email');
	// Not support emoji (8-bit characters)
	const rawMessage = buildPlainTextEmail(env.EMAIL_FROM, env.EMAIL_TO, subject, text);

	const msg = new EmailMessage(env.EMAIL_FROM, env.EMAIL_TO, rawMessage);
	await env.HACKER_NEWS_EMAIL.send(msg);
	return Response.json({ ok: true });
}
