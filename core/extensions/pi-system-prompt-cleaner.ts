/**
 * Remove Pi's built-in docs guidance from the system prompt.
 * Use `/pi` to inject the preserved guidance into conversation context.
 * Also auto-inject once per session when user input contains the word "Pi".
 */

import type { ExtensionAPI, ExtensionContext, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";

const PI_DOCS_SECTION =
	/\nPi documentation \(read only when the user asks about pi itself[^\n]*\):\n(?:- [^\n]*\n)*- [^\n]*/i;
const PI_WORD = /(^|[^\p{L}\p{N}_])pi(?=$|[^\p{L}\p{N}_])/iu;
const CUSTOM_TYPE = "pi-docs-guidance";

export default function piSystemPromptCleaner(pi: ExtensionAPI) {
	let rememberedPiDocs = "";
	let piDocsInjected = false;

	pi.on("session_start", async (_event: any, ctx: ExtensionContext) => {
		piDocsInjected = ctx.sessionManager
			.getEntries()
			.some((entry: any) => entry.type === "custom_message" && entry.customType === CUSTOM_TYPE);
	});

	pi.registerCommand("pi", {
		description: "Inject Pi documentation guidance into context",
		handler: async (_args: string, ctx: ExtensionCommandContext) => {
			if (injectPiDocs(ctx)) {
				ctx.ui.notify("Pi documentation guidance injected into context.", "info");
			} else if (piDocsInjected) {
				ctx.ui.notify("Pi documentation guidance is already in this session.", "info");
			} else {
				ctx.ui.notify("No Pi documentation guidance was found to inject.", "warning");
			}
		},
	});

	pi.on("input", async (event: any, ctx: ExtensionContext) => {
		if (!piDocsInjected && PI_WORD.test(event.text) && injectPiDocs(ctx, event.streamingBehavior)) {
			ctx.ui.notify("Pi documentation guidance injected into context.", "info");
		}
		return { action: "continue" as const };
	});

	pi.on("before_agent_start", async (event: any) => {
		const removed = rememberPiDocs(event.systemPrompt);
		if (!removed) return undefined;

		return {
			systemPrompt: event.systemPrompt.replace(removed, "").trimEnd(),
		};
	});

	function injectPiDocs(ctx: ExtensionContext, deliverAs?: "steer" | "followUp") {
		if (piDocsInjected) return false;

		rememberPiDocs(ctx.getSystemPrompt());
		if (!rememberedPiDocs) return false;

		pi.sendMessage(
			{
				customType: CUSTOM_TYPE,
				content: "<pi_agent_docs>\n" + rememberedPiDocs + "\n</pi_agent_docs>",
				display: true,
			},
			ctx.isIdle() ? undefined : { deliverAs: deliverAs ?? "followUp" },
		);
		piDocsInjected = true;
		return true;
	}

	function rememberPiDocs(systemPrompt: string) {
		const removed = systemPrompt.match(PI_DOCS_SECTION)?.[0];
		if (removed) rememberedPiDocs = removed.trim();
		return removed;
	}
}
