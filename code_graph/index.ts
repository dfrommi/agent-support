import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { createGraph, resetLspGraph } from "./graph-lsp.ts";
import type { Graph } from "./graph.ts";

let _graph: Graph | null = null;

export default function codeGraphExtension(pi: ExtensionAPI) {
	pi.on("session_shutdown", async () => {
		await resetLspGraph();
		_graph = null;
	});

	pi.registerTool({
		name: "graph",
		label: "Code Graph",
		description:
			"Query the codebase graph via LSP. `db` is pre-bound. Chain methods, end with a terminal. " +
			"Supports Java and Rust. Requires language server on PATH.",
		promptSnippet: "Query code structure via LSP: symbols, callers, callees, impact, paths",
		promptGuidelines: [
			"Write a single comprehensive graph query that answers the question fully. Prefer one well-crafted chain over multiple graph calls — avoid using graph like grep or find.",
			"Start from db.symbol('name'), db.find('partial'), db.all(), or db.file('path.java').symbols().",
			"Traverse: .callers({ transitive: true }) / .callees(...). Add scope: { exclude: ['**/test/**'] } to prune test code.",
			"Filter: .where(s => s.kind === 'class'), .inPath('src/main/**/*.java').",
			"Terminate with .explain() for one symbol, .impact({ scope }) for blast radius, .pathsTo(target) for call paths, or .asTable() / .tree() / .list().",
			"Java methods include parameter types in names: use db.find('findById') for fuzzy matching, not db.symbol('findById').",
		],
		parameters: Type.Object({
			code: Type.String({
				description:
					"TypeScript expression or statements. `db` is pre-bound. Examples:\n" +
					'• db.symbol("UserService").explain()\n' +
					'• db.symbol("findUser").callers({ transitive: true, scope: { exclude: ["**/test/**"] } }).asTable()\n' +
					'• db.file("UserService.java").symbols().where(s => s.kind === "method").asTable()\n' +
					'• db.symbol("findById").impact({ scope: { exclude: ["**/test/**"] } })\n' +
					'• db.changed({ since: "main" }).where(s => s.kind === "class").asTable()',
			}),
		}),
		execute: async (_toolCallId, params) => {
			const cwd = process.cwd();
			try {
				_graph = await createGraph(cwd);
				const db = _graph;
				const code = (params.code as string).trim();
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
