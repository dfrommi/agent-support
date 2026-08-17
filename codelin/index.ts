import { existsSync } from "node:fs";
import path from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { explore, callgraph, type Scope } from "./explore.ts";
import { resetGraph, warmup } from "./backend.ts";

const ROOT_MARKER_FILES = ["build.gradle", "build.gradle.kts", "Cargo.toml"];

const ScopeSchema = Type.Optional(Type.Union([Type.Literal("main"), Type.Literal("test"), Type.Literal("all")]));

/** True when the repo root has a Gradle or Cargo build file that codelin can index. */
export function hasProjectMarker(cwd: string): boolean {
	return ROOT_MARKER_FILES.some((file) => existsSync(path.join(cwd, file)));
}

function registerCodeTool(pi: ExtensionAPI) {
	pi.registerTool({
		name: "code",
		label: "Code",
		description:
			"Resolve a symbol or file from the local code index: its line-numbered source plus callers, callees, and type relationships (implements/extends) in one call. " +
			"Prefer this over rg-then-read whenever you know a name. Exact matches rank types above similarly named fields. " +
			"Line numbers locate code; re-read the exact range before editing.",
		promptSnippet: "Look up a symbol's source + callers/callees/type relationships in one call (use for any known symbol name), or read a file by path",
		promptGuidelines: [
			"If you know a symbol's name — from a file you read, an rg hit, or a stack trace — call code(name) instead of reconstructing its structure with rg. It returns the body plus callers, callees, and type relationships in one call; rg returns only the text line.",
			"For 'who calls X' or 'what does X call', query code(X) and read its Called-by / Calls lists. Do not reconstruct these by hand from rg hits.",
			"Use code to find the implementation of an interface or base type (see 'Implemented by' / 'Extends/Implements').",
			"Use rg/fd only to discover names you don't yet know, and for literal strings, regex, config keys, comments, and unindexed or generated files — then switch to code once you have a name.",
			"code output is for understanding only. Before editing, re-read the exact range with read(path, offset, limit) using the returned file:line numbers.",
		],
		parameters: Type.Object({
			query: Type.String({
				description: "Symbol name (e.g. 'CatalogService') or file path (e.g. 'src/service.ts').",
			}),
			scope: ScopeSchema,
		}),
		execute: async (_toolCallId, params, _signal, _onUpdate, ctx) => {
			try {
				const text = await explore(ctx.cwd, params.query as string, (params.scope as Scope) ?? "all");
				return { content: [{ type: "text", text }], details: {} };
			} catch (e) {
				return { content: [{ type: "text", text: `Error: ${(e as Error).message}` }], details: {} };
			}
		},
	});
}

function registerCallgraphTool(pi: ExtensionAPI) {
	pi.registerTool({
		name: "callgraph",
		label: "Call graph",
		description:
			"Trace transitive call relationships between symbols or HTTP entry points in one call. " +
			"from + to finds the path between them; from alone lists what it reaches; to alone lists what reaches it. " +
			"from=\"@http\" answers 'which endpoints reach this symbol?'. Each hop carries its relationship kind, file:line, and confidence (inferred hops are flagged). " +
			"Use this for reachability, blast radius, and endpoint-to-symbol traces instead of chaining rg hits.",
		promptSnippet: "Trace reachability: callgraph(from=\"CatalogService\", to=\"@http\") or callgraph(from=\"X\", to=\"Y\") for a call path",
		promptGuidelines: [
			"For 'does X reach Y' / 'how does X reach Y', call callgraph(from=\"X\", to=\"Y\") — one call returns the annotated path. Do not reconstruct it by hand from rg hits.",
			"For 'what does X call transitively' use callgraph(from=\"X\"). For 'who calls X' / 'what is the blast radius of X' use callgraph(to=\"X\").",
			"For 'which HTTP endpoints reach this symbol' use callgraph(from=\"@http\", to=\"Symbol\") — it groups by endpoint.",
			"callgraph returns file:line per hop for locating and citing code; re-read the exact range with read before editing. Inferred edges (interface dispatch, framework wiring) are labeled — treat them as likely, not certain.",
		],
		parameters: Type.Object({
			from: Type.Optional(Type.String({
				description: "Source symbol name (e.g. 'PartnerProductController') or entry-point root '@http'.",
			})),
			to: Type.Optional(Type.String({
				description: "Target symbol name (e.g. 'CatalogService'). With `from`, finds the path; alone, lists what reaches it.",
			})),
			maxDepth: Type.Optional(Type.Integer({ minimum: 1, maximum: 12, default: 6 })),
			scope: ScopeSchema,
		}),
		execute: async (_toolCallId, params, _signal, _onUpdate, ctx) => {
			try {
				const text = await callgraph(ctx.cwd, {
					from: params.from as string | undefined,
					to: params.to as string | undefined,
					maxDepth: params.maxDepth as number | undefined,
					scope: (params.scope as Scope) ?? "all",
				});
				return { content: [{ type: "text", text }], details: {} };
			} catch (e) {
				return { content: [{ type: "text", text: `Error: ${(e as Error).message}` }], details: {} };
			}
		},
	});
}

export default function codelinExtension(pi: ExtensionAPI) {
	let toolsRegistered = false;

	pi.on("session_start", (_event, ctx) => {
		if (!hasProjectMarker(ctx.cwd)) return;

		if (!toolsRegistered) {
			toolsRegistered = true;
			registerCodeTool(pi);
			registerCallgraphTool(pi);
		}

		void warmup(ctx.cwd);
	});

	pi.on("session_shutdown", () => {
		resetGraph();
	});
}
