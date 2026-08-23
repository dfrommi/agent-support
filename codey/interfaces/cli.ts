#!/usr/bin/env node
import path from "node:path";
import { createGraph } from "../lib/graph.ts";
import { resetGraphs } from "../lib/session.ts";
import type { Location, Symbol, SymbolKind } from "../lib/model.ts";
import type { Scope } from "../lib/scope.ts";
import { detectLanguage } from "../languages/detect.ts";
import { explore, search } from "../render.ts";

const HELP = `code-graph — explore a codebase's structure

Usage:
  node interfaces/cli.ts <directory> symbol <name>        Find symbols by exact name
  node interfaces/cli.ts <directory> find <pattern>        Fuzzy-find symbols [--kind <k>] [--path <glob>]
  node interfaces/cli.ts <directory> members <container>   Symbols inside a container
  node interfaces/cli.ts <directory> file <path>           Symbols in a file
  node interfaces/cli.ts <directory> detail <name>         Show one symbol incl. annotations + doc
  node interfaces/cli.ts <directory> find-usages <name>    Find usages [--kind <k>] [--container <c>] [--signature <sig>]
  node interfaces/cli.ts <directory> code <query>          Render the pi code-tool output [--scope <main|test|all>] [--usages <summary|full>]
  node interfaces/cli.ts <directory> search <substr> [...]  Search symbols [--include <k,...>] [--exclude <k,...>] [--scope <main|test|all>] [--path <glob>]
  node interfaces/cli.ts <directory> --stats               Index stats

Requires a buildable Maven/Gradle project (Java) or Cargo project (Rust).
`;

async function main(): Promise<void> {
	const args = process.argv.slice(2);
	if (args.length < 2 || args.includes("--help") || args.includes("-h")) {
		console.log(HELP);
		process.exit(args.length < 2 ? 1 : 0);
	}

	const [dir, command, ...rest] = args;
	const root = path.resolve(dir);

	// `code` mirrors the pi tool exactly: it renders through explore(), not the
	// tabular graph views below.
	if (command === "code") {
		const query = rest[0];
		if (!query) {
			console.error("code requires a query");
			process.exit(1);
		}
		const scope = parseScope(rest.slice(1));
		const usages = parseUsages(rest.slice(1));
		try {
			console.log(await explore(root, query, scope, usages));
		} finally {
			// explore() keeps the session's language server alive; close it so the
			// process can exit.
			await resetGraphs();
		}
		return;
	}

	// `search` mirrors the pi code_search tool exactly: it renders through search().
	if (command === "search") {
		const { substrings, includeKinds, excludeKinds, scope, path } = parseSearch(rest);
		if (substrings.length === 0) {
			console.error("search requires at least one substring");
			process.exit(1);
		}
		try {
			console.log(await search(root, { substrings, includeKinds, excludeKinds, scope, path }));
		} finally {
			await resetGraphs();
		}
		return;
	}

	const adapter = await detectLanguage(root).factory(root);
	try {
		const graph = await createGraph(root, adapter);

		if (command === "--stats") {
			console.log(formatStats(graph.stats()));
			return;
		}
		if (command === "symbol") {
			const name = rest[0];
			if (!name) {
				console.error("symbol requires a name");
				process.exit(1);
			}
			console.log(formatSymbols(graph.symbol(name)));
			return;
		}
		if (command === "find") {
			const pattern = rest[0];
			if (!pattern) {
				console.error("find requires a pattern");
				process.exit(1);
			}
			const flags = parseFlags(rest.slice(1));
			let q = graph.find(pattern);
			if (flags.kind) q = q.where(flags.kind as SymbolKind);
			if (flags.path) q = q.inPath(flags.path);
			console.log(formatSymbols(q.list()));
			return;
		}
		if (command === "members") {
			const container = rest[0];
			if (!container) {
				console.error("members requires a container name");
				process.exit(1);
			}
			console.log(formatSymbols(graph.members(container).list()));
			return;
		}
		if (command === "file") {
			const partialPath = rest[0];
			if (!partialPath) {
				console.error("file requires a path");
				process.exit(1);
			}
			console.log(formatSymbols(graph.file(partialPath).list()));
			return;
		}
		if (command === "detail") {
			const name = rest[0];
			if (!name) {
				console.error("detail requires a name");
				process.exit(1);
			}
			console.log(formatDetail(graph.symbol(name)));
			return;
		}
		if (command === "find-usages") {
			const name = rest[0];
			if (!name) {
				console.error("find-usages requires a name");
				process.exit(1);
			}
			const flags = parseFlags(rest.slice(1));
			const selector = {
				...(flags.kind ? { kind: flags.kind as SymbolKind } : {}),
				...(flags.container ? { container: flags.container } : {}),
				...(flags.signature ? { signature: flags.signature } : {}),
			};
			console.log(formatUsages(await graph.findUsages(name, selector)));
			return;
		}
		console.error(`Unknown command: ${command}`);
		process.exit(1);
	} finally {
		await adapter.close();
	}
}

function formatStats(stats: { files: number; symbols: number }): string {
	return `files: ${stats.files}\nsymbols: ${stats.symbols}`;
}

function formatUsages(usages: Location[]): string {
	if (usages.length === 0) return "(no usages)";
	const rows = usages.map((u) => {
		const file = u.uri.replace("file://", "");
		return {
			file: file.split("/").pop() ?? file,
			line: String(u.range.start.line),
			column: String(u.range.start.column),
		};
	});
	return formatTable(rows, ["file", "line", "column"]);
}

function parseScope(args: string[]): Scope {
	const i = args.indexOf("--scope");
	const value = i !== -1 ? args[i + 1] : "all";
	return value === "main" || value === "test" || value === "all" ? value : "all";
}

function parseUsages(args: string[]): "summary" | "full" {
	const i = args.indexOf("--usages");
	return args[i + 1] === "full" ? "full" : "summary";
}

function parseSearch(args: string[]): { substrings: string[]; includeKinds?: SymbolKind[]; excludeKinds?: SymbolKind[]; scope: Scope; path?: string } {
	const substrings: string[] = [];
	const includeKinds: SymbolKind[] = [];
	const excludeKinds: SymbolKind[] = [];
	let scope: Scope = "all";
	let path: string | undefined;
	for (let i = 0; i < args.length; i++) {
		if (args[i] === "--include") includeKinds.push(...splitKinds(args[++i]));
		else if (args[i] === "--exclude") excludeKinds.push(...splitKinds(args[++i]));
		else if (args[i] === "--scope") scope = parseScope([args[i], args[++i]]);
		else if (args[i] === "--path") path = args[++i];
		else if (!args[i].startsWith("--")) substrings.push(args[i]);
	}
	return { substrings, includeKinds, excludeKinds, scope, path };
}

function splitKinds(value: string | undefined): SymbolKind[] {
	return (value ?? "").split(",").map((k) => k.trim()).filter(Boolean) as SymbolKind[];
}

function parseFlags(args: string[]): { kind?: string; path?: string; container?: string; signature?: string } {
	const flags: { kind?: string; path?: string; container?: string; signature?: string } = {};
	for (let i = 0; i < args.length; i++) {
		if (args[i] === "--kind") flags.kind = args[++i];
		else if (args[i] === "--path") flags.path = args[++i];
		else if (args[i] === "--container") flags.container = args[++i];
		else if (args[i] === "--signature") flags.signature = args[++i];
	}
	return flags;
}

function formatDetail(symbols: Symbol[]): string {
	if (symbols.length === 0) return "(no match)";
	if (symbols.length > 1) return `(${symbols.length} matches — narrow to a single symbol)`;
	const s = symbols[0];
	const lines = [
		`${s.name} (${s.kind}${s.containerName ? " of " + s.containerName : ""})`,
		`  ${s.file}:${s.location.nameRange.start.line}`,
	];
	if (s.signature) lines.push(`  signature: ${s.signature}`);
	if (s.annotations?.length) lines.push(`  annotations: ${s.annotations.join(", ")}`);
	if (s.doc) lines.push(`  doc:\n${indent(s.doc, "    ")}`);
	return lines.join("\n");
}

function indent(text: string, prefix: string): string {
	return text.split("\n").map((l) => prefix + l).join("\n");
}

function formatSymbols(symbols: Symbol[]): string {
	if (symbols.length === 0) return "(no matches)";
	const rows = symbols.map((s) => ({
		name: s.name,
		kind: s.kind,
		container: s.containerName ?? "",
		signature: s.signature ?? "",
		location: `${s.file.split("/").pop()}:${s.location.nameRange.start.line}`,
	}));
	return formatTable(rows, ["name", "kind", "container", "signature", "location"]);
}

function formatTable(rows: Record<string, string>[], columns: string[]): string {
	const widths = new Map<string, number>();
	for (const col of columns) widths.set(col, col.length);
	for (const row of rows) {
		for (const col of columns) {
			widths.set(col, Math.max(widths.get(col) ?? col.length, row[col].length));
		}
	}
	const header = columns.map((c) => c.padEnd(widths.get(c)!)).join("  ");
	const sep = columns.map((c) => "─".repeat(widths.get(c)!)).join("  ");
	const body = rows.map((r) => columns.map((c) => r[c].padEnd(widths.get(c)!)).join("  "));
	return [header, sep, ...body].join("\n");
}

main().catch((e) => {
	console.error(`Error: ${(e as Error).message}`);
	process.exit(1);
});
