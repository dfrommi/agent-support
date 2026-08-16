/**
 * Overrides of pi's built-in behavior:
 * - Strips the built-in docs guidance from the system prompt (restored on
 *   demand by the `pi-context` skill).
 * - Disables tools this repo doesn't want active.
 * - Rewrites the bash tool prompt to prefer gitignore-aware binaries
 *   ("find" -> "fd", "grep" -> "rg").
 */

import { createBashTool, type ExtensionAPI } from "@earendil-works/pi-coding-agent";

const PI_DOCS_SECTION =
	/\nPi documentation \(read only when the user asks about pi itself[^\n]*\):\n(?:- [^\n]*\n)*- [^\n]*/i;

// Tools to disable at session start. Add or remove names here.
const DISABLED_TOOLS: string[] = [
	"copilot_credit_usage",
];

/** Word-boundary-safe swap so "finding"/"grepping" are never rewritten. */
function swapCommandNames(text: string): string {
	return text.replace(/\bfind\b/g, "fd").replace(/\bgrep\b/g, "rg");
}

// Added by pi's core system-prompt builder (dist/core/system-prompt.js), not by
// the bash tool, so it can only be changed via a before_agent_start rewrite.
const CORE_FILE_OPS_GUIDELINE = "Use bash for file operations like ls, rg, find";

export default function piOverrides(pi: ExtensionAPI) {
	pi.on("session_start", (_event, ctx) => {
		if (DISABLED_TOOLS.length > 0) {
			const active = pi.getActiveTools();
			pi.setActiveTools(active.filter((name) => !DISABLED_TOOLS.includes(name)));
		}

		const bash = createBashTool(ctx.cwd);
		pi.registerTool({
			...bash,
			promptSnippet: bash.promptSnippet ? swapCommandNames(bash.promptSnippet) : bash.promptSnippet,
			promptGuidelines: bash.promptGuidelines?.map(swapCommandNames),
		});
	});

	pi.on("before_agent_start", (event: any) => {
		let prompt = event.systemPrompt;

		const removed = prompt.match(PI_DOCS_SECTION)?.[0];
		if (removed) {
			prompt = prompt.replace(removed, "");
		}

		if (prompt.includes(CORE_FILE_OPS_GUIDELINE)) {
			prompt = prompt.replace(CORE_FILE_OPS_GUIDELINE, swapCommandNames(CORE_FILE_OPS_GUIDELINE));
		}

		if (prompt === event.systemPrompt) return undefined;

		return {
			systemPrompt: prompt.trimEnd(),
		};
	});
}
