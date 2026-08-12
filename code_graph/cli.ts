#!/usr/bin/env node
import { createLspGraph } from "./graph-lsp.ts";

const args = process.argv.slice(2);

if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
	console.log(`code-graph — explore your codebase as a queryable LSP-powered graph

Usage:
  node cli.ts <directory> <query>     Run a query
  node cli.ts <directory> --stats     Show index stats

Auto-detects language: TypeScript/JavaScript, Java, or Rust.

Examples:
  node cli.ts . 'db.stats()'
  node cli.ts . 'db.find("auth").asTable()'
  node cli.ts . 'db.symbol("handleWebhook").explain()'
  node cli.ts . 'db.changed({since: "main"}).where(s => s.kind === "class").asTable()'

Query API:
  db.symbol(name)         Find symbols by exact name
  db.find(pattern)        Find symbols by partial name (case-insensitive)
  db.changed({since})     Symbols in files changed since a git ref
  db.file(path)           Find file by partial path
  db.all()                All symbols
  db.stats()              Index stats + confidence

  .callers()              Direct callers
  .callers({transitive})  Transitive callers (BFS)
  .callees()              Direct callees
  .callees({transitive})  Transitive callees
  .references()           All references
  .impact()               Blast radius analysis
  .callTree({maxDepth})   Hierarchical call tree
  .pathsTo(predicate)     Find call paths between symbols
  .why()                  Git blame history

  .filter(fn) / .where(fn)  Filter predicate
  .inPath(glob)          Filter by file path glob
  .select(columns)        Pick table columns

  .list()                 Raw array
  .asTable()              Pretty-printed table
  .tree()                 Grouped by file
  .count()                Count
  .first()                First match
  .summary()              Distribution
  .explain()              Full breakdown: callers, callees, git, tests
`);
	process.exit(0);
}

const dir = args[0];
if (!dir) { console.log("Usage: node cli.ts <directory> [query|--stats]"); process.exit(1); }

const mode = args.includes("--stats") ? "stats" : "query";

async function run(code: string, db: Awaited<ReturnType<typeof createLspGraph>>) {
	try {
		const isExpression = !code.includes("\n") && !code.includes(";");
		const wrapped = isExpression
			? `return (${code})`
			: `return (async () => { ${code} })()`;
		const fn = new Function("db", wrapped);
		const result = await fn(db);
		return formatOutput(result);
	} catch (e) {
		return `Error: ${(e as Error).message}`;
	}
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
					const obj = item as any;
					return { name: obj.name, kind: obj.kind, file: obj.file, line: obj.line };
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

if (mode === "stats") {
	console.time("Indexed");
	const db = await createLspGraph(dir);
	console.timeEnd("Indexed");
	console.log(db.stats());
	await resetLspGraph();
	process.exit(0);
}

const query = args.slice(1).join(" ");
console.time("Indexed");
const db = await createLspGraph(dir);
console.timeEnd("Indexed");
const result = await run(query, db);
console.log(result);
await resetLspGraph();
