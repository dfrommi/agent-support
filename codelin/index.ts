import { existsSync } from "node:fs";
import path from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { explore } from "./explore.ts";
import { resetGraph, warmup } from "./backend.ts";

const ROOT_MARKER_FILES = ["build.gradle", "build.gradle.kts", "Cargo.toml"];

/** True when the repo root has a Gradle or Cargo build file that codelin can index. */
export function hasProjectMarker(cwd: string): boolean {
	return ROOT_MARKER_FILES.some((file) => existsSync(path.join(cwd, file)));
}

function registerCodeTool(pi: ExtensionAPI) {
	pi.registerTool({
		name: "code",
		label: "Code",
		description:
			"Return line-numbered source and call relationships from a local code index. " +
			"Query with a symbol name to get its body plus callers, callees, and impact in one call — prefer this over rg+read whenever you know the name. " +
			"Also reads a file by path, or finds the call path between two symbols (static calls only). " +
			"Line numbers locate code; re-read the exact range before editing.",
		promptSnippet: "Look up a symbol's source + callers/callees/impact in one call (use for any known symbol name), or read a file by path",
		promptGuidelines: [
			"If you know a symbol's name — from a file you read, an rg hit, or a doc — use code(name) instead of rg-then-read. e.g. code('plan_for_home') returns the body plus callers, callees, and impact in one call; rg returns only the text line. Don't default to rg when you have a name.",
			"For 'who calls X' or 'what does X call', query code('X') and read its Called-by / Calls lists. Do not reconstruct these by hand from rg hits.",
			"code('A B') finds the static call path between two known symbols (direct/static calls only — event-bus/subscribe wiring is not modeled).",
			"Use rg for literal strings, regex, all-occurrence search, unindexed files, and discovering symbol names when you don't yet know them — then switch to code once you have a name.",
			"code's output is for understanding only. Before editing, re-read the exact range with read(path, offset, limit) using the returned file:line numbers.",
		],
		parameters: Type.Object({
			query: Type.String({
				description:
					"Symbol name (e.g. 'findUser'), file path (e.g. 'src/service.ts'), or two symbols for a call path (e.g. 'run findUser').",
			}),
		}),
		execute: async (_toolCallId, params, _signal, _onUpdate, ctx) => {
			try {
				const text = await explore(ctx.cwd, params.query as string);
				return { content: [{ type: "text", text }], details: {} };
			} catch (e) {
				return {
					content: [{ type: "text", text: `Error: ${(e as Error).message}` }],
					details: {},
				};
			}
		},
	});
}

export default function codelinExtension(pi: ExtensionAPI) {
	let toolRegistered = false;

	pi.on("session_start", (_event, ctx) => {
		if (!hasProjectMarker(ctx.cwd)) return;

		if (!toolRegistered) {
			toolRegistered = true;
			registerCodeTool(pi);
		}

		void warmup(ctx.cwd);
	});

	pi.on("session_shutdown", () => {
		resetGraph();
	});
}
