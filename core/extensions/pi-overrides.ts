/**
 * Overrides of pi's built-in behavior:
 * - Disables tools this repo doesn't want active.
 * - Rewrites the bash tool prompt to prefer gitignore-aware binaries
 *   ("find" -> "fd", "grep" -> "rg").
 * - Blocks bash commands that invoke find/grep, forcing fd/rg instead.
 *
 * The system prompt itself is assembled by `system-prompt-assembler.ts` from
 * `SYSTEM.md`; this module no longer touches it.
 */

import { createBashTool, isToolCallEventType, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { parse } from "unbash";

const PI_DOCS_SECTION =
	/\nPi documentation \(read only when the user asks about pi itself[^\n]*\):\n(?:- [^\n]*\n)*- [^\n]*/i;

// Matches pi's conditional file-operations guideline after find is replaced by fd.
export const BASH_FILE_OPS_GUIDELINE = "Use bash for file operations like ls, rg, fd";

// Tools to disable at session start. Add or remove names here.
const DISABLED_TOOLS: string[] = [
	"copilot_credit_usage",
];

/** Word-boundary-safe swap so "finding"/"grepping" are never rewritten. */
function swapCommandNames(text: string): string {
	return text.replace(/\bfind\b/g, "fd").replace(/\bgrep\b/g, "rg");
}

/** Binary names to block, mapped to their gitignore-aware replacements. */
const PREFERRED_ALTERNATIVES: Record<string, string> = {
	find: "fd",
	grep: "rg",
};

/**
 * Names of discouraged binaries invoked anywhere in the command.
 *
 * unbash materializes `Word.parts` and nested scripts inside expansions via lazy
 * getters, which a plain `Object.values` walk over the live AST would skip.
 * Round-tripping through JSON exposes them, so one trivial recursion finds every
 * `Command` node (pipes, &&, subshells, command/process substitution, ...).
 */
function usedDiscouragedCommands(command: string): string[] {
	const names = new Set<string>();
	collectCommandNames(JSON.parse(JSON.stringify(parse(command))), names);
	return Object.keys(PREFERRED_ALTERNATIVES).filter((name) => names.has(name));
}

/** Collect `name.value` from every `Command` node in a plain JSON AST. */
function collectCommandNames(node: unknown, names: Set<string>): void {
	if (node === null || typeof node !== "object") return;
	const record = node as { type?: string; name?: { value?: string } };
	if (record.type === "Command" && record.name?.value) names.add(record.name.value);
	for (const value of Object.values(node)) {
		if (Array.isArray(value)) {
			for (const item of value) collectCommandNames(item, names);
		} else if (value !== null && typeof value === "object") {
			collectCommandNames(value, names);
		}
	}
}

function buildBlockReason(used: string[]): string {
	const quoted = used.map((name) => `'${name}'`).join(" and ");
	const alts = used.map((name) => `'${PREFERRED_ALTERNATIVES[name]}'`).join(" and ");
	return `Blocked ${quoted}. Use ${alts} instead (faster, .gitignore-aware). Re-run the equivalent command with ${alts}.`;
}

export default function piOverrides(pi: ExtensionAPI) {
	// Block find/grep before they run, forcing the gitignore-aware
	// alternatives the prompt already recommends.
	pi.on("tool_call", (event) => {
		if (!isToolCallEventType("bash", event)) return undefined;
		const command = event.input.command;
		if (typeof command !== "string") return undefined;
		let used: string[];
		try {
			used = usedDiscouragedCommands(command);
		} catch {
			// Unparseable command — fail open rather than blocking it.
			return undefined;
		}
		return used.length === 0
			? undefined
			: { block: true, reason: buildBlockReason(used) };
	});

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
}
