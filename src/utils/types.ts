/**
 * Type definitions and env/secret bindings
 */

export interface Env {
	// Binding for the workers AI API

	AI: Ai;

	// Binding for static assets.
	ASSETS: { fetch: (request: Request) => Promise<Response> };

	// Binding for telegram bot token/secret
	TELEGRAM_BOT_TOKEN: string;

	// TODO
	// Binding for other tokens/secrets
	MY_FIRST_TOKEN: string;
}
