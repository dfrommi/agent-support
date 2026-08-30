import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";

/** Return the text blocks from the last assistant message on the active branch. */
export function getLastAssistantMessageText(ctx: ExtensionCommandContext): string {
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

	const textBlocks = (lastAssistant.content as any[])
		.filter((block: any) => block.type === "text")
		.map((block: any) => block.text);

	if (textBlocks.length === 0) {
		throw new Error("The last assistant message contains no text content.");
	}

	return textBlocks.join("\n\n");
}
