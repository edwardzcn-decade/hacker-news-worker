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

const BASE_URL = "https://hacker-news.firebaseio.com/v0/";
export default {
	async fetch(request, env, ctx): Promise<Response> {
		const url = new URL(request.url);
		switch(url.pathname) {
			case "/":
				return new Response('Hello World!');
			case "/about":
				return new Response('About: This is a haker news worker.');
			case "/blog":
				const blogUrl = new URL("https://edwardzcn.me");
				return fetch(blogUrl.toString());
		}
		// Forward Hacker News API. Fetch item by id
		const match = url.pathname.match(/^\/item\/(\d+)$/);
		if (match) {
			const itemId = match[1].trim();
			console.log("Fetching item id:", itemId);
			const url = new URL(`item/${itemId}.json`, BASE_URL);
			url.searchParams.append("print", "pretty");
			console.log("Full URL string:", url.toString());
			const response = await fetch(url.toString(), {
				headers: {
					"User-Agent": "Cloudflare Worker - Hacker News API Proxy",
					"Accept": "application/json",
				},
			});
			return response;
		}
		return new Response('Not Found', { status: 404 });
	},
} satisfies ExportedHandler<Env>;
