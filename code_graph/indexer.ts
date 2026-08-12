import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Language, Parser, type SyntaxNode } from "web-tree-sitter";
import type { CallEdge, FileInfo, Symbol } from "./model.ts";
import type { ExtractionContext } from "./languages/helpers.ts";
import * as ts from "./languages/typescript.ts";
import * as java from "./languages/java.ts";
import * as rust from "./languages/rust.ts";

// ── Language registry ───────────────────────────────────────

const BASE = path.join(path.dirname(fileURLToPath(import.meta.url)), "node_modules/tree-sitter-wasms/out");

interface LanguageModule {
	/** File extensions this module handles. */
	extensions: string[];
	/** WASM paths keyed by extension. */
	wasm: Record<string, string>;
	/** Extract symbols, edges, imports, and re-exports from a parsed tree. */
	extract(root: SyntaxNode, file: string): ExtractionContext;
}

const LANGUAGES: LanguageModule[] = [
	{
		extensions: [".ts", ".tsx", ".js", ".jsx"],
		wasm: {
			".ts": path.join(BASE, "tree-sitter-typescript.wasm"),
			".tsx": path.join(BASE, "tree-sitter-tsx.wasm"),
			".js": path.join(BASE, "tree-sitter-javascript.wasm"),
			".jsx": path.join(BASE, "tree-sitter-javascript.wasm"),
		},
		extract(root: SyntaxNode, file: string): ExtractionContext {
			const ctx: ExtractionContext = { file, symbols: [], edges: [], imports: [], reexports: [] };
			ts.extractSymbols(root, ctx);
			return ctx;
		},
	},
	{
		extensions: [".java"],
		wasm: {
			".java": path.join(BASE, "tree-sitter-java.wasm"),
		},
		extract(root: SyntaxNode, file: string): ExtractionContext {
			const ctx: ExtractionContext = { file, symbols: [], edges: [], imports: [], reexports: [] };
			java.extractSymbols(root, ctx);
			return ctx;
		},
	},
	{
		extensions: [".rs"],
		wasm: {
			".rs": path.join(BASE, "tree-sitter-rust.wasm"),
		},
		extract(root: SyntaxNode, file: string): ExtractionContext {
			const ctx: ExtractionContext = { file, symbols: [], edges: [], imports: [], reexports: [] };
			rust.extractSymbols(root, ctx);
			return ctx;
		},
	},
];

function getLanguage(ext: string): LanguageModule | undefined {
	return LANGUAGES.find((l) => l.extensions.includes(ext));
}

// ── Parser cache ────────────────────────────────────────────

let _wasmInit = false;
async function ensureInit(): Promise<void> {
	if (!_wasmInit) {
		await Parser.init();
		_wasmInit = true;
	}
}

const parserCache = new Map<string, Parser>();

async function getParser(ext: string): Promise<Parser> {
	const cached = parserCache.get(ext);
	if (cached) return cached;
	const lang = getLanguage(ext);
	if (!lang) throw new Error(`Unsupported extension: ${ext}`);
	const wasmPath = lang.wasm[ext];
	if (!wasmPath) throw new Error(`No WASM for ${ext}`);
	const p = new Parser();
	p.setLanguage(await Language.load(wasmPath));
	parserCache.set(ext, p);
	return p;
}

// ── File walking ────────────────────────────────────────────

const SUPPORTED = new Set(LANGUAGES.flatMap((l) => l.extensions));
const DEFAULT_SKIP = new Set(["node_modules", "dist", ".git", "target", "build"]);

export function walkProjectFiles(root: string): string[] {
	const files: string[] = [];
	const dirs = [root];
	while (dirs.length > 0) {
		const dir = dirs.pop()!;
		let entries: fs.Dirent[];
		try {
			entries = fs.readdirSync(dir, { withFileTypes: true });
		} catch {
			continue;
		}
		for (const entry of entries) {
			const full = path.join(dir, entry.name);
			if (entry.isDirectory()) {
				if (!entry.name.startsWith(".") && !DEFAULT_SKIP.has(entry.name)) {
					dirs.push(full);
				}
			} else if (SUPPORTED.has(path.extname(entry.name))) {
				files.push(full);
			}
		}
	}
	return files.sort();
}

// ── Edge resolution ─────────────────────────────────────────

function resolveEdges(
	ctxs: Map<string, ExtractionContext>,
	symbolById: Map<string, Symbol>,
): CallEdge[] {
	const resolved: CallEdge[] = [];

	for (const [file, ctx] of ctxs) {
		// Local name lookup in this file
		const localByName = new Map<string, Symbol[]>();
		for (const sym of ctx.symbols) {
			const list = localByName.get(sym.name) ?? [];
			list.push(sym);
			localByName.set(sym.name, list);
		}

		for (const edge of ctx.edges) {
			if (edge.callerId === "") continue;

			// 1. Local scope
			const locals = localByName.get(edge.calleeName);
			if (locals && locals.length > 0) {
				const target = locals.find((s) => s.id !== edge.callerId) ?? locals[0];
				resolved.push({ ...edge, calleeId: target.id });
				continue;
			}

			// 2. Imported symbols
			const imp = ctx.imports.find((i) => i.localName === edge.calleeName);
			if (imp && imp.sourceFile) {
				const sourceCtx = ctxs.get(imp.sourceFile);
				if (sourceCtx) {
					// For Java classpath imports, match on simple name; for TS relative imports, match on exportedName
					const matchName = imp.sourceFile.endsWith(".java") ? imp.localName : imp.exportedName;
					const exported = sourceCtx.symbols.find(
						(s) => s.exported && s.name === matchName,
					);
					if (exported) {
						resolved.push({ ...edge, calleeId: exported.id });
						continue;
					}
				}
			}

			// 3. Same-package resolution (Java)
			if (file.endsWith(".java")) {
				const pkgDir = path.dirname(file);
				for (const [otherFile, otherCtx] of ctxs) {
					if (!otherFile.endsWith(".java") || otherFile === file) continue;
					if (path.dirname(otherFile) !== pkgDir) continue;
					const match = otherCtx.symbols.find(
						(s) => s.name === edge.calleeName && !s.parentName,
					);
					if (match) {
						resolved.push({ ...edge, calleeId: match.id });
						continue;
					}
				}
			}
		}
	}

	return resolved;
}

/** Resolve non-relative (classpath/module-path) imports against all indexed files. */
function resolveAbsoluteImports(ctxs: Map<string, ExtractionContext>, allFiles: string[]): void {
	for (const [, ctx] of ctxs) {
		for (const imp of ctx.imports) {
			if (imp.sourceFile !== "") continue; // already resolved
			let resolved: string | null = null;
			if (ctx.file.endsWith(".java")) {
				resolved = java.resolveJavaImport(imp.exportedName, allFiles);
			} else if (ctx.file.endsWith(".rs")) {
				resolved = rust.resolveRustImport(imp.exportedName, allFiles);
			}
			if (resolved) imp.sourceFile = resolved;
		}
	}
}

/** Apply re-export aliases: if `export { foo as bar }`, add `bar` as an exported alias pointing to the same symbol. */
function applyReExports(ctxs: Map<string, ExtractionContext>, symbolById: Map<string, Symbol>): void {
	for (const [, ctx] of ctxs) {
		for (const re of ctx.reexports) {
			// Find the local symbol being re-exported
			for (const sym of ctx.symbols) {
				if (sym.name === re.localName) {
					// The local symbol is exported
					sym.exported = true;
					// If the export name differs, we could add an alias — but for now
					// the re-exported name just marks the symbol as exported.
					// A separate alias map would be needed for db.symbol("bar") to find it.
				}
			}
		}
	}
}

// ── Public API ──────────────────────────────────────────────

export interface IndexResult {
	files: Map<string, FileInfo>;
	symbolById: Map<string, Symbol>;
	edges: CallEdge[];
}

export async function indexProject(root: string): Promise<IndexResult> {
	await ensureInit();

	const files = walkProjectFiles(root);
	const ctxs = new Map<string, ExtractionContext>();
	const symbolById = new Map<string, Symbol>();

	for (const file of files) {
		const ext = path.extname(file);
		const lang = getLanguage(ext);
		if (!lang) continue;

		const src = fs.readFileSync(file, "utf8");
		const parser = await getParser(ext);
		const tree = parser.parse(src);
		try {
			if (tree.rootNode.hasError) {
				// Skip unparseable files silently
				continue;
			}
			const ctx = lang.extract(tree.rootNode, file);
			ctxs.set(file, ctx);
			for (const sym of ctx.symbols) symbolById.set(sym.id, sym);

	
		} finally {
			tree.delete();
		}
	}

	// Resolve absolute imports (Java classpath, Rust module paths)
	resolveAbsoluteImports(ctxs, files);

	// Resolve cross-file edges
	const edges = resolveEdges(ctxs, symbolById);

	// Apply re-export aliases
	applyReExports(ctxs, symbolById);

	// Build file info
	const fileInfos = new Map<string, FileInfo>();
	for (const ctx of ctxs.values()) {
		fileInfos.set(ctx.file, { path: ctx.file, symbols: ctx.symbols });
	}

	return { files: fileInfos, symbolById, edges };
}
