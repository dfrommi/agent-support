import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { explore } from "./explore.ts";
import { resetGraph, warmup } from "./backend.ts";

export default function codelinExtension(pi: ExtensionAPI) {
	pi.on("session_start", (_event, ctx) => {
		void warmup(ctx.cwd);
	});

	pi.on("session_shutdown", () => {
		resetGraph();
	});

	pi.registerTool({
		name: "code",
		label: "Code",
		description:
			"Return line-numbered source and call relationships from a local code index. " +
			"Accepts a symbol name, a file path, or a natural-language question. " +
			"Returns the verbatim, line-numbered code (Read-equivalent) plus who calls it and what it affects — use instead of grep/read to find and read code.",
		promptSnippet: "Find and read code by symbol, file, or question — returns line-numbered source + callers/callees/impact",
		promptGuidelines: [
			"Use code instead of grep or read to find and read code: it returns the verbatim line-numbered source plus callers, callees, and blast radius in one call.",
			"Query code with a symbol name (e.g. 'findUser'), a file path (e.g. 'src/service.ts'), or a question (e.g. 'how does auth work').",
			"Treat code's returned source as already read and use its line numbers to edit; do not re-read the same file afterwards.",
			"Fall back to grep/read only for what code does not index (configs, docs, build files).",
		],
		parameters: Type.Object({
			query: Type.String({
				description:
					"Symbol name, file path, or natural-language question. Examples: 'findUser', 'src/service.ts', 'how does login work'.",
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
