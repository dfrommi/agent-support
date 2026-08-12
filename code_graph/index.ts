import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { createGraph } from "./graph.ts";

export default function codeGraphExtension(pi: ExtensionAPI) {
	pi.registerTool({
		name: "graph",
		label: "Code Graph",
		description:
			"Query the codebase graph. `db` is pre-bound. Chain methods, end with a terminal. " +
			"Supports TypeScript, JavaScript, Java, and Rust. Automatically indexes on first use.",
		promptSnippet: "Query code structure: symbols, callers, callees, impact, paths",
		promptGuidelines: [
			"Write a single comprehensive graph query that answers the question fully. Prefer one well-crafted chain over multiple graph calls — avoid using graph like grep or find.",
			"Start from db.symbol('name'), db.find('partial'), db.all(), or db.file('path.ts').symbols().",
			"Traverse: .callers({ transitive: true }) / .callees(...). Add scope: { exclude: ['**/test/**', '**/node_modules/**'] } to prune test/lib code.",
			"Filter: .where(s => s.kind === 'class'), .exported(), .inPath('src/**/*.ts').",
			"Terminate with .explain() for one symbol, .impact({ scope }) for blast radius, .pathsTo(target) for call paths, or .asTable() / .tree() / .list().",
		],
		parameters: Type.Object({
			code: Type.String({
				description:
					"TypeScript expression or statements. `db` is pre-bound. Examples:\n" +
					'• db.symbol("PaymentService").explain()\n' +
					'• db.symbol("handleLogin").callers({ transitive: true, scope: { exclude: ["**/test/**"] } }).asTable()\n' +
					'• db.file("auth.ts").symbols().where(s => s.exported).asTable()\n' +
					'• db.symbol("hashPassword").impact({ scope: { exclude: ["**/test/**"] } })\n' +
					'• db.changed({ since: "main" }).where(s => s.kind === "class").asTable()',
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
