import type { ExtensionAPI, ExtensionCommandContext, SessionManager } from "@earendil-works/pi-coding-agent";

/**
 * /new-from-last [kickoff text]
 *
 * Starts a new session carrying over the last assistant message's text content
 * as the first user message. Optional kickoff text is sent as a follow-up prompt.
 */

export default function newFromLast(pi: ExtensionAPI) {
	pi.registerCommand("new-from-last", {
		description: "Start a new session with the last assistant message as context",
		handler: async (args: string, ctx: ExtensionCommandContext) => {
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

			const result = await ctx.newSession({
				parentSession: ctx.sessionManager.getSessionFile(),
				setup: (sm: SessionManager) => {
					sm.appendMessage({
						role: "user",
						content: [{ type: "text", text: summaryText }],
						timestamp: Date.now(),
					});
				},
				withSession: async (newCtx: any) => {
					if (args && args.trim()) {
						await newCtx.sendUserMessage(args.trim());
					}
				},
			});
		},
	});
}
