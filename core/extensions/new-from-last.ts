import type {
	ExtensionAPI,
	ExtensionCommandContext,
	ReplacedSessionContext,
	SessionManager,
} from "@earendil-works/pi-coding-agent";

/**
 * /new-from-last [-x]
 *
 * Starts a new session carrying over the last assistant message's text content
 * as the first user message. With -x, the carried-over message is sent in the
 * new session and executed immediately instead of only being added to the
 * session history.
 */

function parseArgs(args: string): { execute: boolean } {
	const parts = args.trim().split(/\s+/).filter(Boolean);
	const invalidArgs = parts.filter((part) => part !== "-x");
	if (invalidArgs.length > 0) {
		throw new Error("Usage: /new-from-last [-x]");
	}

	return { execute: parts.includes("-x") };
}

export default function newFromLast(pi: ExtensionAPI) {
	pi.registerCommand("new-from-last", {
		description: "Start a new session with the last assistant message as context (-x executes it)",
		handler: async (args: string, ctx: ExtensionCommandContext) => {
			const { execute } = parseArgs(args);

			await ctx.waitForIdle();

			// Walk the branch backwards to find the last assistant message
			const branch = ctx.sessionManager.getBranch();
			let lastAssistant: any = null;
			for (let i = branch.length - 1; i >= 0; i--) {
				const entry = branch[i];
				if (entry.type === "message" && entry.message?.role === "assistant") {
					lastAssistant = entry.message;
					break;
				}
			}

			if (!lastAssistant) {
				throw new Error("No assistant message found in the current session.");
			}

			// Extract text content blocks only (strip thinking blocks)
			const textBlocks = (lastAssistant.content as any[])
				.filter((block: any) => block.type === "text")
				.map((block: any) => block.text);

			if (textBlocks.length === 0) {
				throw new Error("The last assistant message contains no text content.");
			}

			const summaryText = textBlocks.join("\n\n");

			await ctx.newSession({
				parentSession: ctx.sessionManager.getSessionFile(),
				setup: execute
					? undefined
					: async (sm: SessionManager) => {
							sm.appendMessage({
								role: "user",
								content: [{ type: "text", text: summaryText }],
								timestamp: Date.now(),
							});
						},
				withSession: async (newCtx: ReplacedSessionContext) => {
					if (execute) {
						await newCtx.sendUserMessage(summaryText);
					}
				},
			});
		},
	});
}
