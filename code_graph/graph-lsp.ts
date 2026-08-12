import fs from "node:fs";
import path from "node:path";
import { Language, Parser } from "web-tree-sitter";
import { LspClient } from "./lsp/client.ts";
import * as tsLsp from "./lsp/typescript.ts";
import * as javaLsp from "./lsp/java.ts";
import * as rustLsp from "./lsp/rust.ts";
import { SymbolQuery, FileQuery, gitChangedFiles, type TraversalResolvers } from "./query.ts";
import { extendStartOverComments } from "./languages/helpers.ts";
import type { Symbol, SymbolKind, FileInfo } from "./model.ts";

// ── LSP server management ───────────────────────────────────

interface LspState {
	client: LspClient;
	languageId: string;
	extensions: string[];
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
		case "java":
			client = await javaLsp.createJavaServer(root);
			languageId = javaLsp.languageId;
			extensions = javaLsp.extensions;
			break;
		case "rust":
			client = await rustLsp.createRustServer(root);
			languageId = rustLsp.languageId;
			extensions = rustLsp.extensions;
			break;
		default:
			client = await tsLsp.createTsServer(root);
			languageId = tsLsp.languageId;
			extensions = tsLsp.extensions;
	}

	const state: LspState = { client, languageId, extensions };
	_states.set(resolved, state);
	return state;
}

function scanExtensions(root: string): Record<string, number> {
	const counts: Record<string, number> = {};
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
	const ts = (counts[".ts"] ?? 0) + (counts[".tsx"] ?? 0) + (counts[".js"] ?? 0) + (counts[".jsx"] ?? 0);
	if (java > rs && java > ts) return "java";
	if (rs > java && rs > ts) return "rust";
	return "typescript";
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
		".ts": path.join(BASE, "tree-sitter-typescript.wasm"),
		".tsx": path.join(BASE, "tree-sitter-tsx.wasm"),
		".js": path.join(BASE, "tree-sitter-javascript.wasm"),
		".jsx": path.join(BASE, "tree-sitter-javascript.wasm"),
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

/** Build a map from start line (1-indexed) to the deepest node at that line. */
function buildLineNodeMap(root: import("web-tree-sitter").SyntaxNode): Map<number, import("web-tree-sitter").SyntaxNode> {
	const map = new Map<number, import("web-tree-sitter").SyntaxNode>();

	function walk(node: import("web-tree-sitter").SyntaxNode) {
		const startLine = node.startPosition.row + 1;
		const existing = map.get(startLine);
		// Keep the deeper (smaller) node
		if (!existing || (node.endPosition.row - node.startPosition.row < existing.endPosition.row - existing.startPosition.row)) {
			map.set(startLine, node);
		}
		for (const child of node.namedChildren) walk(child);
	}

	walk(root);
	return map;
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

	// Fire all didOpen notifications
	const opens: Promise<void>[] = [];
	for (const f of filePaths) {
		try {
			const text = fs.readFileSync(f, "utf8");
			opens.push(state.client.didOpen(`file://${f}`, text, state.languageId));
		} catch { /* skip */ }
	}
	await Promise.all(opens);

	// Give the server time to index
	await new Promise((r) => setTimeout(r, Math.min(filePaths.length * 15, 5000)));

	// Collect workspace symbols
	let rawSymbols: any[] = [];
	try {
		rawSymbols = await state.client.workspaceSymbols("");
	} catch { /* fall through */ }

	let projectImported = rawSymbols.length > 0;

	// Fallback if workspace/symbol returned nothing
	if (rawSymbols.length === 0) {
		projectImported = false;
		if (filePaths.length > 0) {
			try {
				const className = guessClassName(filePaths[0]);
				if (className) {
					const verifySymbols = await state.client.workspaceSymbols(className);
					projectImported = verifySymbols.length > 0;
				}
			} catch { /* ignore */ }

			if (!projectImported && state.languageId === "java") {
				console.warn(
					`jdtls: Project import may have failed for "${root}". ` +
						"Cross-file call hierarchy won't work. " +
						"Ensure standard layout (src/main/java/…) and working build (mvn compile / gradle compileJava).",
				);
			} else if (!projectImported) {
				console.warn(
					`LSP: workspace/symbol returned nothing for "${root}". ` +
						"Falling back to per-file symbols — cross-file resolution unavailable.",
				);
			}
		}

		for (const f of filePaths) {
			try {
				const docSyms = await state.client.documentSymbols(`file://${f}`);
				rawSymbols.push(...flattenDocSymbols(docSyms, f));
			} catch { /* skip */ }
		}
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
	projectImported: boolean,
): TraversalResolvers {
	const symbolMap = new Map<string, LspSymbol>(lsps.map((s) => [s.id, s]));

	/** Find the best LSP symbol match for a given Symbol (resolves position). */
	async function resolveLsp(sym: Symbol): Promise<LspSymbol | null> {
		// Check our indexed symbols first
		const cached = symbolMap.get(sym.id);
		if (cached && cached.lspKind > 0) return cached;

		// Try documentSymbol to get precise position
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

	/** Prepare call hierarchy for a symbol, trying progressively lazier position resolution. */
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
			return projectImported ? "complete" : "partial";
		},

		confidenceNote(): string {
			if (!projectImported) {
				return "LSP project import failed — cross-file call hierarchy unavailable. Only intra-file results shown.";
			}
			return "";
		},
	};
}

// ── Graph API ───────────────────────────────────────────────

export interface LspGraph {
	symbol(name: string): SymbolQuery;
	find(pattern: string): SymbolQuery;
	file(partialPath: string): FileQuery;
	all(): SymbolQuery;
	files(): FileQuery;
	changed(opts: { since: string }): SymbolQuery;
	stats(): { files: number; symbols: number; confidence: string };
	close(): Promise<void>;
}

export async function createLspGraph(root: string): Promise<LspGraph> {
	const resolved = path.resolve(root);

	// Reuse the LSP client (expensive) but re-index symbols (cheap on warm server)
	const state = await getState(resolved);
	const { symbols, files } = await index(resolved);
	const projectImported = symbols.length > 0;

	// Lazy line extension: tree-sitter parse + comment extension runs once,
	// only when a terminal actually consumes symbol lines
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

	const resolvers = createLspResolvers(resolved, symbols, state, projectImported);
	const allSymbols = new SymbolQuery(extendSource(async () => [...symbols]), resolvers);

	const graph: LspGraph = {
		symbol(name: string) {
			return new SymbolQuery(
				extendSource(async () => symbols.filter((s) => s.name === name)),
				resolvers,
			);
		},

		find(pattern: string) {
			const lower = pattern.toLowerCase();
			return new SymbolQuery(
				extendSource(async () => symbols.filter((s) => s.name.toLowerCase().includes(lower))),
				resolvers,
			);
		},

		file(partialPath: string) {
			return new FileQuery(
				async () => {
					const matches = [...files.values()].filter(
						(f) => f.path.includes(partialPath) || f.path.endsWith(partialPath),
					);
					return matches;
				},
				resolvers,
			);
		},

		all() { return allSymbols; },

		files() {
			return new FileQuery(async () => [...files.values()], resolvers);
		},

		changed(opts: { since: string }) {
			return new SymbolQuery(extendSource(async () => {
				const changedFiles = gitChangedFiles(resolved, opts.since);
				const changedSet = new Set(changedFiles);
				return symbols.filter((s) => changedSet.has(s.file));
			}), resolvers);
		},

		stats() {
			return {
				files: files.size,
				symbols: symbols.length,
				confidence: projectImported ? "complete" : "partial",
			};
		},

		async close() {
			await state.client.shutdown();
			_states.delete(resolved);
		},
	};

	return graph;
}

export async function resetLspGraph(): Promise<void> {
	// Close all LSP clients
	for (const [, state] of _states) {
		try { await state.client.shutdown(); } catch { /* ignore */ }
	}
	_states.clear();
}
