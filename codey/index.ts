import { existsSync } from "node:fs";
import path from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { getGraph, resetGraphs } from "./lib/session.ts";
import type { SymbolKind } from "./lib/model.ts";
import type { Scope } from "./lib/scope.ts";
import { detectLanguage } from "./languages/detect.ts";
import { explore, search, type SearchParams } from "./render.ts";

const ROOT_MARKER_FILES = ["Cargo.toml", "pom.xml", "build.gradle", "build.gradle.kts"];

// Must stay in sync with the SymbolKind union in lib/model.ts.
const symbolKindType = Type.Union([
	Type.Literal("class"),
	Type.Literal("interface"),
	Type.Literal("enum"),
	Type.Literal("struct"),
	Type.Literal("trait"),
	Type.Literal("module"),
	Type.Literal("method"),
	Type.Literal("constructor"),
	Type.Literal("field"),
	Type.Literal("function"),
	Type.Literal("variable"),
	Type.Literal("constant"),
	Type.Literal("enum_member"),
	Type.Literal("macro"),
	Type.Literal("type"),
]);

function hasProjectMarker(cwd: string): boolean {
	return ROOT_MARKER_FILES.some((file) => existsSync(path.join(cwd, file)));
}

async function warmup(root: string): Promise<void> {
	try {
		await getGraph(root, detectLanguage(root).factory);
	} catch {
		// surface the error on first tool use, not during session start
	}
}

export default function codeGraphExtension(pi: ExtensionAPI) {
	let registered = false;

	pi.on("session_start", (_event, ctx) => {
		if (!hasProjectMarker(ctx.cwd)) return;

		if (!registered) {
			registered = true;
			pi.registerTool({
				name: "code",
				label: "Code",
				description:
					"One call for a symbol, file, or location: returns source/members, Callees (what it calls), Callers/Usages (who calls it), and Implementations/Subclasses/Overrides. " +
					"Prefer over rg+read when you know a name or line.",
				promptSnippet: "Look up a symbol, file, or location: source + members + callees + callers + implementations in one call",
				promptGuidelines: [
					"Use code(name) whenever you know a symbol name (from a file, an rg hit, or a stack trace) — it returns body/members plus Callees, Callers, and Overrides in one call.",
					"Use code('Container.member') to resolve straight to a member when a bare name is ambiguous.",
					"Use code(file:line) or code(Class:line) to zoom from a listing to the enclosing method's body + Callees + Callers; prefer code over read().",
					"Use code(file) to outline a file's symbols instead of reading the whole file.",
					"Read code's Callees / Callers / Implementations sections for 'what X calls', 'who calls X', and 'who implements/overrides X'.",
					"Discover unknown names with code_search first; use rg only for literal text, regex, config, comments, and unindexed/generated files.",
				],
				parameters: Type.Object({
					query: Type.String({
						description: "Symbol name ('UserService', 'UserService.findUser'), file path ('src/.../User.java'), or location ('UserService.java:14', 'UserService:14', 'UserService.java:14-20'); a location resolves to the enclosing method.",
					}),
					scope: Type.Optional(Type.Union([Type.Literal("main"), Type.Literal("test"), Type.Literal("all")], { description: "main/test/all; default all." })),
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

			pi.registerTool({
				name: "code_search",
				label: "Code Search",
				description:
					"Find symbols by name substring. Optional includeKinds/excludeKinds, path glob, and scope. " +
					"Returns ranked matches with kind, container, file:line, signature. Use to discover a name, then call code(name).",
				promptSnippet: "Find symbol names by substring + kind/path/scope filters (use before code())",
				promptGuidelines: [
					"Use code_search to discover a symbol name you don't know yet; it searches indexed names (including Container.member) and returns kind + file:line. Then call code(name) for source, members, and usages.",
					"code_search substrings are OR'd and case-insensitive: start with one substring, add more only to widen.",
					"Narrow large code_search results with includeKinds/excludeKinds, a path glob, or scope instead of reading every hit.",
					"code_search covers symbol names only; use rg for literal text, regex, config, comments, and unindexed/generated files.",
				],
				parameters: Type.Object({
					substrings: Type.Array(Type.String(), {
						description: "Case-insensitive substrings (OR'd); a symbol matches if any appears in its name or 'Container.member' name.",
					}),
					includeKinds: Type.Optional(Type.Array(symbolKindType, { description: "Only return these kinds." })),
					excludeKinds: Type.Optional(Type.Array(symbolKindType, { description: "Exclude these kinds; wins over includeKinds." })),
					scope: Type.Optional(Type.Union([Type.Literal("main"), Type.Literal("test"), Type.Literal("all")], { description: "main/test/all; default all." })),
					path: Type.Optional(Type.String({ description: "Glob on the project-relative or absolute file path (e.g. 'src/main/**')." })),
				}),
				execute: async (_toolCallId, params, _signal, _onUpdate, ctx) => {
					try {
						const p: SearchParams = {
							substrings: params.substrings as string[],
							includeKinds: params.includeKinds as SymbolKind[] | undefined,
							excludeKinds: params.excludeKinds as SymbolKind[] | undefined,
							scope: (params.scope as Scope | undefined) ?? "all",
							path: params.path as string | undefined,
						};
						const text = await search(ctx.cwd, p);
						return { content: [{ type: "text", text }], details: {} };
					} catch (e) {
						return { content: [{ type: "text", text: `Error: ${(e as Error).message}` }], details: {} };
					}
				},
			});
		}

		void warmup(ctx.cwd);
	});

	pi.on("session_shutdown", () => {
		void resetGraphs();
	});
}
