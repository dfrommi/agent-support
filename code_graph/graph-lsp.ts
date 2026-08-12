import fs from "node:fs";
import path from "node:path";
import { Language, Parser } from "web-tree-sitter";
import { LspClient } from "./lsp/client.ts";
import * as javaLsp from "./lsp/java.ts";
import * as rustLsp from "./lsp/rust.ts";
import { type TraversalResolvers } from "./query.ts";
import { createGraphFromResolvers, type Graph } from "./graph.ts";
import { indexProject } from "./indexer.ts";
import { extendStartOverComments } from "./languages/helpers.ts";
import type { Symbol, SymbolKind, FileInfo } from "./model.ts";

// ── LSP server management ───────────────────────────────────

interface LspState {
	client: LspClient;
	languageId: string;
	extensions: string[];
	/** Last-sent content per file path. Used to skip didChange when content hasn't changed. */
	fileContent: Map<string, string>;
	version: number;
}

const _states = new Map<string, LspState>();

async function getState(root: string): Promise<LspState> {
	const resolved = path.resolve(root);
	const existing = _states.get(resolved);
	if (existing) return existing;

	const exts = scanExtensions(root);
	const primary = dominantLanguage(exts);

	let client: LspClient;
	let languageId: string;
	let extensions: string[];

	switch (primary) {
		case "rust":
			client = await rustLsp.createRustServer(root);
			languageId = rustLsp.languageId;
			extensions = rustLsp.extensions;
			break;
		case "java":
		default:
			client = await javaLsp.createJavaServer(root);
			languageId = javaLsp.languageId;
			extensions = javaLsp.extensions;
	}

	const state: LspState = { client, languageId, extensions, fileContent: new Map(), version: 1 };
	_states.set(resolved, state);
	return state;
}

function scanExtensions(root: string): Record<string, number> {
	const counts: Record<string, number> = {};
	const SKIP = new Set(["node_modules", "dist", ".git", "target", "build", ".jdtls-data"]);
	const stack = [root];
	while (stack.length > 0) {
		const dir = stack.pop()!;
		let entries: fs.Dirent[];
		try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { continue; }
		for (const e of entries) {
			const full = path.join(dir, e.name);
			if (e.isDirectory()) {
				if (!e.name.startsWith(".") && !SKIP.has(e.name)) stack.push(full);
			} else {
				const ext = path.extname(e.name);
				counts[ext] = (counts[ext] ?? 0) + 1;
			}
		}
	}
	return counts;
}

function dominantLanguage(counts: Record<string, number>): string {
	const java = counts[".java"] ?? 0;
	const rs = counts[".rs"] ?? 0;
	if (java >= rs) return "java";
	return "rust";
}

function guessClassName(filePath: string): string | null {
	try {
		const text = fs.readFileSync(filePath, "utf8");
		const m = text.match(/(?:class|interface|struct|enum)\s+(\w+)/);
		return m ? m[1] : null;
	} catch {
		return null;
	}
}

// ── File walking ────────────────────────────────────────────

const SKIP = new Set(["node_modules", "dist", ".git", "target", "build", ".jdtls-data"]);

function walkFiles(root: string, extensions: string[]): string[] {
	const exts = new Set(extensions);
	const files: string[] = [];
	const dirs = [root];
	while (dirs.length > 0) {
		const dir = dirs.pop()!;
		let entries: fs.Dirent[];
		try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { continue; }
		for (const entry of entries) {
			const full = path.join(dir, entry.name);
			if (entry.isDirectory()) {
				if (!entry.name.startsWith(".") && !SKIP.has(entry.name)) dirs.push(full);
			} else if (exts.has(path.extname(entry.name))) {
				files.push(full);
			}
		}
	}
	return files.sort();
}

// ── Symbol kind mapping ─────────────────────────────────────

function lspKindToSymbolKind(kind: number): SymbolKind {
	switch (kind) {
		case 5: return "class";
		case 6: return "method";
		case 9: return "method";
		case 11: return "interface";
		case 12: return "function";
		case 13: return "variable";
		case 14: return "variable";
		case 7: return "variable";
		case 8: return "variable";
		case 10: return "enum";
		case 23: return "class";
		default: return "variable";
	}
}

// ── LSP symbol type ─────────────────────────────────────────

interface LspSymbol extends Symbol {
	uri: string;
	lspKind: number;
	selectionRange: { start: { line: number; character: number } };
	parentName?: string;
}

// ── Tree-sitter parser cache for comment extension ─────────

const BASE = path.join(path.dirname(new URL(import.meta.url).pathname), "node_modules/tree-sitter-wasms/out");
let _wasmInit = false;
const _parsers = new Map<string, Parser>();

async function getParserForFile(filePath: string): Promise<Parser | null> {
	const ext = path.extname(filePath);
	const wasmMap: Record<string, string> = {
		".java": path.join(BASE, "tree-sitter-java.wasm"),
		".rs": path.join(BASE, "tree-sitter-rust.wasm"),
	};
	const wasmPath = wasmMap[ext];
	if (!wasmPath) return null;

	let parser = _parsers.get(ext);
	if (parser) return parser;

	if (!_wasmInit) { await Parser.init(); _wasmInit = true; }
	parser = new Parser();
	parser.setLanguage(await Language.load(wasmPath));
	_parsers.set(ext, parser);
	return parser;
}

function buildLineNodeMap(root: import("web-tree-sitter").SyntaxNode): Map<number, import("web-tree-sitter").SyntaxNode> {
	const map = new Map<number, import("web-tree-sitter").SyntaxNode>();

	function walk(node: import("web-tree-sitter").SyntaxNode) {
		const startLine = node.startPosition.row + 1;
		const existing = map.get(startLine);
		if (!existing || (node.endPosition.row - node.startPosition.row < existing.endPosition.row - existing.startPosition.row)) {
			map.set(startLine, node);
		}
		for (const child of node.namedChildren) walk(child);
	}

	walk(root);
	return map;
}

// ── File syncing ────────────────────────────────────────────

/** Sync project files with the LSP server. Returns true if any files were sent. */
async function syncLspFiles(root: string, state: LspState): Promise<boolean> {
	const filePaths = walkFiles(root, state.extensions);
	let synced = false;
	state.version++;
	const syncs: Promise<void>[] = [];
	for (const f of filePaths) {
		try {
			const text = fs.readFileSync(f, "utf8");
			const prev = state.fileContent.get(f);
			if (prev === undefined) {
				syncs.push(state.client.didOpen(`file://${f}`, text, state.languageId));
				state.fileContent.set(f, text);
				synced = true;
			} else if (prev !== text) {
				syncs.push(state.client.didChange(`file://${f}`, text, state.version));
				state.fileContent.set(f, text);
				synced = true;
			}
		} catch { /* skip */ }
	}
	await Promise.all(syncs);
	if (synced) {
		await new Promise((r) => setTimeout(r, Math.max(500, Math.min(filePaths.length * 15, 5000))));
	}
	return synced;
}

/** Quick probe to check whether the LSP server imported the project successfully. */
async function probeLsp(state: LspState, filePaths: string[]): Promise<boolean> {
	try {
		const raw = await state.client.workspaceSymbols("");
		if (raw.length > 0) return true;
	} catch { /* empty query may fail on some servers */ }
	if (filePaths.length > 0) {
		try {
			const className = guessClassName(filePaths[0]);
			if (className) {
				const verify = await state.client.workspaceSymbols(className);
				return verify.length > 0;
			}
		} catch { /* ignore */ }
	}
	return false;
}

// ── Indexing ────────────────────────────────────────────────

async function index(root: string): Promise<{
	symbols: LspSymbol[];
	files: Map<string, FileInfo>;
	state: LspState;
	projectImported: boolean;
}> {
	const state = await getState(root);
	const filePaths = walkFiles(root, state.extensions);

	await syncLspFiles(root, state);

	// Collect workspace symbols
	let rawSymbols: any[] = [];
	let projectImported = false;
	try {
		rawSymbols = await state.client.workspaceSymbols("");
		projectImported = rawSymbols.length > 0;
	} catch { /* fall through */ }

	// Always supplement with per-file documentSymbols — workspace/symbol
	// often returns only top-level items and misses methods, trait impls, etc.
	for (const f of filePaths) {
		try {
			const docSyms = await state.client.documentSymbols(`file://${f}`);
			rawSymbols.push(...flattenDocSymbols(docSyms, f));
		} catch { /* skip */ }
	}

	if (!projectImported) {
		projectImported = await probeLsp(state, filePaths);
	}

	const symbols: LspSymbol[] = [];
	const seen = new Set<string>();

	for (const raw of rawSymbols) {
		const name: string = raw.name;
		const kind: number = raw.kind;
		const uri: string = raw.uri || raw.location?.uri || "";
		const file = uri.replace("file://", "");
		if (!file) continue;
		const line = (raw.range?.start?.line ?? raw.location?.range?.start?.line ?? 0) + 1;
		const column = (raw.range?.start?.character ?? raw.location?.range?.start?.character ?? 0) + 1;
		const endLine = (raw.range?.end?.line ?? raw.location?.range?.end?.line) != null
			? (raw.range?.end?.line ?? raw.location?.range?.end?.line ?? 0) + 1
			: undefined;
		const endColumn = (raw.range?.end?.character ?? raw.location?.range?.end?.character) != null
			? (raw.range?.end?.character ?? raw.location?.range?.end?.character ?? 0) + 1
			: undefined;
		const selLine = raw.selectionRange?.start?.line ?? raw.range?.start?.line ?? raw.location?.range?.start?.line ?? 0;
		const selChar = raw.selectionRange?.start?.character ?? raw.range?.start?.character ?? raw.location?.range?.start?.character ?? 0;

		const key = `${file}:${name}:${line}`;
		if (seen.has(key)) continue;
		seen.add(key);

		symbols.push({
			id: key,
			name,
			kind: lspKindToSymbolKind(kind),
			file,
			line,
			column,
			endLine,
			endColumn,
			exported: true,
			parentName: raw.containerName || raw.parent || undefined,
			uri: `file://${file}`,
			lspKind: kind,
			selectionRange: { start: { line: selLine, character: selChar } },
		});
	}

	const fileMap = new Map<string, FileInfo>();
	for (const f of filePaths) {
		fileMap.set(f, { path: f, symbols: symbols.filter((s) => s.file === f) });
	}

	return { symbols, files: fileMap, state, projectImported };
}

function flattenDocSymbols(rawSyms: any[], file: string, parentName?: string): any[] {
	const result: any[] = [];
	for (const raw of rawSyms) {
		result.push({ ...raw, uri: `file://${file}`, parent: parentName });
		if (raw.children && raw.children.length > 0) {
			const isContainer = raw.kind === 5 || raw.kind === 11 || raw.kind === 10 || raw.kind === 23;
			result.push(...flattenDocSymbols(raw.children, file, isContainer ? raw.name : parentName));
		}
	}
	return result;
}

function findInDocSymbols(syms: any[], name: string, line: number): any | null {
	for (const raw of syms) {
		if (raw.name === name && raw.range.start.line + 1 === line) {
			return raw;
		}
		if (raw.children && raw.children.length > 0) {
			const found = findInDocSymbols(raw.children, name, line);
			if (found) {
				if (!found.parent) {
					const isContainer = raw.kind === 5 || raw.kind === 11 || raw.kind === 10 || raw.kind === 23;
					if (isContainer) found.parent = raw.name;
				}
				return found;
			}
		}
	}
	return null;
}

// ── LSP TraversalResolvers ──────────────────────────────────

function createLspResolvers(
	root: string,
	lsps: LspSymbol[],
	state: LspState,
): TraversalResolvers {
	const symbolMap = new Map<string, LspSymbol>(lsps.map((s) => [s.id, s]));

	async function resolveLsp(sym: Symbol): Promise<LspSymbol | null> {
		const cached = symbolMap.get(sym.id);
		if (cached && cached.lspKind > 0) return cached;

		const uri = `file://${sym.file}`;
		try {
			const docSyms = await state.client.documentSymbols(uri);
			const found = findInDocSymbols(docSyms, sym.name, sym.line);
			if (found) {
				const lspSym: LspSymbol = {
					...sym,
					uri,
					lspKind: found.kind,
					selectionRange: found.selectionRange,
					parentName: found.parent || sym.parentName,
				};
				symbolMap.set(sym.id, lspSym);
				return lspSym;
			}
		} catch { /* fall through */ }
		return null;
	}

	async function prepareCallHierarchyItem(sym: Symbol): Promise<any | null> {
		const lspSym = await resolveLsp(sym);
		if (!lspSym) return null;

		const pos = lspSym.selectionRange?.start ?? { line: sym.line - 1, character: sym.column - 1 };
		try {
			const items = await state.client.prepareCallHierarchy(lspSym.uri, pos.line, pos.character);
			if (items && items.length > 0) return items[0];
		} catch { /* fall through */ }
		return null;
	}

	return {
		projectRoot: root,
		async callers(symbols: Symbol[]): Promise<Symbol[]> {
			const results: LspSymbol[] = [];
			for (const sym of symbols) {
				const item = await prepareCallHierarchyItem(sym);
				if (!item) continue;
				try {
					const incoming = await state.client.incomingCalls(item);
					for (const call of incoming) {
						const from = call.from;
						results.push({
							id: `${from.uri}:${from.name}:${from.range.start.line + 1}`,
							name: from.name,
							kind: lspKindToSymbolKind(from.kind),
							file: from.uri.replace("file://", ""),
							line: from.range.start.line + 1,
							column: from.range.start.character + 1,
							exported: true,
							parentName: from.detail || undefined,
							uri: from.uri,
							lspKind: from.kind,
							selectionRange: from.selectionRange?.start ?? from.range.start,
						});
					}
				} catch { /* skip */ }
			}
			return results;
		},

		async callees(symbols: Symbol[]): Promise<Symbol[]> {
			const results: LspSymbol[] = [];
			for (const sym of symbols) {
				const item = await prepareCallHierarchyItem(sym);
				if (!item) continue;
				try {
					const outgoing = await state.client.outgoingCalls(item);
					for (const call of outgoing) {
						const to = call.to;
						results.push({
							id: `${to.uri}:${to.name}:${to.range.start.line + 1}`,
							name: to.name,
							kind: lspKindToSymbolKind(to.kind),
							file: to.uri.replace("file://", ""),
							line: to.range.start.line + 1,
							column: to.range.start.character + 1,
							exported: true,
							parentName: to.detail || undefined,
							uri: to.uri,
							lspKind: to.kind,
							selectionRange: to.selectionRange?.start ?? to.range.start,
						});
					}
				} catch { /* skip */ }
			}
			return results;
		},

		async references(sym: Symbol): Promise<{ file: string; line: number; column: number }[]> {
			const lspSym = await resolveLsp(sym);
			if (!lspSym) return [];

			const pos = lspSym.selectionRange?.start ?? { line: sym.line - 1, character: sym.column - 1 };
			try {
				const refs = await state.client.references(lspSym.uri, pos.line, pos.character);
				return refs.map((r: any) => ({
					file: r.uri.replace("file://", ""),
					line: r.range.start.line + 1,
					column: r.range.start.character + 1,
				}));
			} catch {
				return [];
			}
		},

		symbolById(id: string): Symbol | undefined {
			return symbolMap.get(id);
		},

		allFiles(): string[] {
			return [...new Set(lsps.map((s) => s.file))];
		},

		confidence(): "complete" | "partial" {
			return "complete";
		},

		confidenceNote(): string {
			return "";
		},
	};
}

// ── Public API ──────────────────────────────────────────────

/** Create a graph backed by LSP. Throws if the language server cannot import the project. */
export async function createLspGraph(root: string): Promise<Graph> {
	const resolved = path.resolve(root);
	const state = await getState(resolved);
	const { symbols, files, projectImported } = await index(resolved);

	if (!projectImported) {
		const lang = state.languageId === "java" ? "jdtls" : "rust-analyzer";
		throw new Error(
			`${lang} could not import this project. ` +
			(state.languageId === "java"
				? "Ensure standard layout (src/main/java/…) and run `mvn compile` or `gradle compileJava`."
				: "Ensure Cargo.toml is present and run `cargo check`."),
		);
	}

	// Lazy line extension: tree-sitter parse runs once, only when a terminal
	// consumes symbol lines (stats() never triggers it).
	let _extended = false;
	const _extendedPromise: Promise<void> = (async () => {
		const fileGroups = new Map<string, LspSymbol[]>();
		for (const sym of symbols) {
			const list = fileGroups.get(sym.file) ?? [];
			list.push(sym);
			fileGroups.set(sym.file, list);
		}
		for (const [filePath, syms] of fileGroups) {
			const parser = await getParserForFile(filePath);
			if (!parser) continue;
			let text: string;
			try { text = fs.readFileSync(filePath, "utf8"); } catch { continue; }
			const tree = parser.parse(text);
			const lineNodeMap = buildLineNodeMap(tree.rootNode);
			for (const sym of syms) {
				const node = lineNodeMap.get(sym.line);
				if (node) {
					const extended = extendStartOverComments(node);
					if (extended.row + 1 !== sym.line) sym.line = extended.row + 1;
				}
			}
			tree.delete();
		}
		_extended = true;
	})();

	function extendSource<S>(source: () => Promise<S[]>): () => Promise<S[]> {
		return async () => {
			await _extendedPromise;
			return source();
		};
	}

	const resolvers = createLspResolvers(resolved, symbols, state);

	return createGraphFromResolvers(symbols, files, resolvers, extendSource);
}

/**
 * Create a graph using tree-sitter for fast indexing and LSP for accurate
 * call hierarchy. Throws if the language server cannot import the project.
 */
export async function createGraph(root: string): Promise<Graph> {
	const resolved = path.resolve(root);

	// 1. Fast index with tree-sitter
	const result = await indexProject(resolved);
	const symbols = [...result.symbolById.values()];

	// 2. Start LSP for call hierarchy
	const state = await getState(resolved);
	await syncLspFiles(resolved, state);
	const filePaths = walkFiles(resolved, state.extensions);
	const alive = await probeLsp(state, filePaths);

	if (!alive) {
		const lang = state.languageId === "java" ? "jdtls" : "rust-analyzer";
		throw new Error(
			`${lang} could not import this project. ` +
			(state.languageId === "java"
				? "Ensure standard layout (src/main/java/…) and run `mvn compile` or `gradle compileJava`."
				: "Ensure Cargo.toml is present and run `cargo check`."),
		);
	}

	// Wrap tree-sitter symbols for LSP resolvers — resolveLsp will
	// populate lspKind on first call hierarchy request.
	const lspSymbols: LspSymbol[] = symbols.map((s) => ({
		...s,
		uri: `file://${s.file}`,
		lspKind: 0,
		selectionRange: { start: { line: s.line - 1, character: s.column - 1 } },
	}));
	const resolvers = createLspResolvers(resolved, lspSymbols, state);

	return createGraphFromResolvers(symbols, result.files, resolvers);
}

/** Shut down all cached LSP clients. Call on session shutdown. */
export async function resetLspGraph(): Promise<void> {
	for (const [, state] of _states) {
		try { await state.client.shutdown(); } catch { /* ignore */ }
	}
	_states.clear();
}
