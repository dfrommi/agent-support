import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { createGraph } from "./graph.ts";

export default function codeGraphExtension(pi: ExtensionAPI) {
	pi.registerTool({
		name: "graph",
		label: "Code Graph",
		description:
			"Execute TypeScript code to explore the codebase via a queryable graph. " +
			"Access symbols, callers, callees, and files through the `db` object. " +
			"Use terminal methods like .list(), .asTable(), .tree(), .count(), .first(), .summary() to get results. " +
			"TypeScript/JavaScript only. Automatically indexes the project on first use.",
		promptSnippet: "Explore the codebase graph: symbols, callers, callees, files",
		promptGuidelines: [
			"Use graph to find symbols, trace callers/callees, or survey files — prefer a single chain over multiple calls.",
			"Start broad then refine: db.all().where(s => s.kind === 'class').asTable()",
			"Use db.all().inPath('src/**/*.ts') to scope to a directory before further filtering.",
			"For call hierarchy: db.symbol('handleRequest').callers().asTable() or db.symbol('f').callers({ transitive: true }).asTable()",
			"Use scope.exclude to prune test/lib code during traversal: .callers({ transitive: true, scope: { exclude: ['**/test/**', '**/node_modules/**'] } })",
			"Explore main code first, then widen scope to include tests only when needed.",
			"Use .explain() for a single-symbol summary (callers, callees, history, confidence).",
			"Use .impact() for blast-radius analysis; supports scope: .impact({ scope: { exclude: ['**/test/**'] } })",
			"Use db.find('partial') for fuzzy name search.",
		],
		parameters: Type.Object({
			code: Type.String({
				description:
					"TypeScript code to execute. `db` is pre-bound. Examples:\n" +
					'- db.symbol("AuthService").callers().asTable()\n' +
					'- db.all().where(s => s.kind === "class" && s.exported).asTable()\n' +
					'- db.file("handler.ts").symbols().callees().tree()\n' +
					'- db.find("payment").asTable()\n' +
					"- db.stats()\n" +
					"Terminals: .list(), .asTable(), .tree(), .count(), .first(), .summary(), .explain()",
			}),
		}),
		execute: async (_toolCallId, params) => {
			const cwd = process.cwd();
			try {
				const db = await createGraph(cwd);
				const code = (params.code as string).trim();
				// Single-expression lines get auto-returned; multi-line/statement code uses explicit return
				const isExpression = !code.includes("\n") && !code.includes(";");
				const wrapped = isExpression
					? `return (${code})`
					: `return (async () => { ${code} })()`;
				const fn = new Function("db", wrapped);
				const result = await fn(db);
				return {
					content: [{ type: "text", text: formatOutput(result) }],
					details: {},
				};
			} catch (e) {
				return {
					content: [{ type: "text", text: `Error: ${(e as Error).message}` }],
					details: {},
				};
			}
		},
	});
}

function formatOutput(value: unknown): string {
	if (value === undefined) return "(no return value — did you forget .list(), .asTable(), etc.?)";
	if (value === null) return "null";
	if (typeof value === "string") return value;
	if (typeof value === "number" || typeof value === "boolean") return String(value);
	if (Array.isArray(value)) {
		if (value.length === 0) return "[]";
		return JSON.stringify(
			value.map((item) => {
				if (item && typeof item === "object") {
					return {
						name: (item as any).name,
						kind: (item as any).kind,
						file: (item as any).file,
						line: (item as any).line,
					};
				}
				return item;
			}),
			null,
			2,
		);
	}
	if (typeof value === "object") {
		return JSON.stringify(value, null, 2);
	}
	return String(value);
}
