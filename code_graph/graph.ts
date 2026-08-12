import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { indexProject, walkProjectFiles, type IndexResult } from "./indexer.ts";
import { SymbolQuery, FileQuery, type TraversalResolvers } from "./query.ts";
import type { Symbol, FileInfo } from "./model.ts";

// ── Git helpers ────────────────────────────────────────────

/** Run `git diff --name-only <base>` and return absolute file paths. */
export function gitChangedFiles(root: string, base: string): string[] {
	try {
		const gitRoot = execSync(`git -C "${root}" rev-parse --show-toplevel`, {
			encoding: "utf8", timeout: 3000,
		}).trim();
		const raw = execSync(`git -C "${gitRoot}" diff --name-only ${base}`, {
			encoding: "utf8", timeout: 5000, maxBuffer: 512 * 1024,
		});
		return raw.trim().split("\n").filter(Boolean).map((f) => path.resolve(gitRoot, f));
	} catch {
		return [];
	}
}

// ── Tree-sitter TraversalResolvers ──────────────────────────

function createTreeSitterResolvers(result: IndexResult, root: string): TraversalResolvers {
	return {
		projectRoot: root,
		async callers(symbols: Symbol[]): Promise<Symbol[]> {
			// Tree-sitter only resolves intra-file calls. Cross-file traversal requires LSP.
			const ids = new Set(symbols.map((s) => s.id));
			const callerIds = new Set(
				result.edges.filter((e) => ids.has(e.calleeId)).map((e) => e.callerId),
			);
			return [...callerIds].map((id) => result.symbolById.get(id)!).filter(Boolean);
		},

		async callees(symbols: Symbol[]): Promise<Symbol[]> {
			const ids = new Set(symbols.map((s) => s.id));
			const calleeIds = new Set(
				result.edges.filter((e) => ids.has(e.callerId)).map((e) => e.calleeId),
			);
			return [...calleeIds].map((id) => result.symbolById.get(id)!).filter(Boolean);
		},

		async references(symbol: Symbol): Promise<{ file: string; line: number; column: number }[]> {
			// Tree-sitter doesn't track reads/writes — return empty
			return [];
		},

		symbolById(id: string): Symbol | undefined {
			return result.symbolById.get(id);
		},

		allFiles(): string[] {
			return [...result.files.keys()];
		},

		confidence(): "complete" | "partial" {
			return "partial";
		},

		confidenceNote(): string {
			return "Tree-sitter: cross-file edges rely on import resolution; dynamic calls and indirect references are not tracked.";
		},
	};
}

// ── Public API ──────────────────────────────────────────────

export interface Graph {
	/** Find symbols by exact name. */
	symbol(name: string): SymbolQuery;
	/** Find symbols by partial name match (case-insensitive). */
	find(pattern: string): SymbolQuery;
	/** Find a file by partial path. */
	file(partialPath: string): FileQuery;
	/** All symbols in the graph. */
	all(): SymbolQuery;
	/** All files in the graph. */
	files(): FileQuery;
	/** Symbols in files changed since a git ref (e.g. "main", "HEAD~3"). */
	changed(opts: { since: string }): SymbolQuery;
	/** Number of indexed files and symbols. */
	stats(): { files: number; symbols: number };
}

/** Build a Graph from pre-indexed symbols, files, and resolvers. */
export function createGraphFromResolvers(
	symbols: Symbol[],
	files: Map<string, FileInfo>,
	resolvers: TraversalResolvers,
	wrapSource?: <S>(source: () => Promise<S[]>) => () => Promise<S[]>,
): Graph {
	const w = wrapSource ?? (<S>(s: () => Promise<S[]>) => s);
	const allSymbols = new SymbolQuery(w(async () => [...symbols]), resolvers);

	return {
		symbol(name: string) {
			return new SymbolQuery(
				w(async () => symbols.filter((s) => s.name === name)),
				resolvers,
			);
		},

		find(pattern: string) {
			const lower = pattern.toLowerCase();
			return new SymbolQuery(
				w(async () => symbols.filter((s) => s.name.toLowerCase().includes(lower))),
				resolvers,
			);
		},

		file(partialPath: string) {
			return new FileQuery(
				async () => [...files.values()].filter(
					(f) => f.path.includes(partialPath) || f.path.endsWith(partialPath),
				),
				resolvers,
			);
		},

		all() { return allSymbols; },

		files() {
			return new FileQuery(async () => [...files.values()], resolvers);
		},

		changed(opts: { since: string }) {
			return new SymbolQuery(w(async () => {
				const changedFiles = gitChangedFiles(resolvers.projectRoot, opts.since);
				const changedSet = new Set(changedFiles);
				return symbols.filter((s) => changedSet.has(s.file));
			}), resolvers);
		},

		stats() {
			return { files: files.size, symbols: symbols.length };
		},
	};
}

// ── Factory ─────────────────────────────────────────────────

function fileDigest(files: string[]): Map<string, number> {
	const mtimes = new Map<string, number>();
	for (const f of files) {
		try { mtimes.set(f, fs.statSync(f).mtimeMs); } catch { /* deleted mid-walk */ }
	}
	return mtimes;
}

function digestChanged(a: Map<string, number>, b: Map<string, number>): boolean {
	if (a.size !== b.size) return true;
	for (const [f, mtime] of a) {
		if (b.get(f) !== mtime) return true;
	}
	return false;
}

const _graphs = new Map<string, { graph: Graph; mtimes: Map<string, number> }>();

/** Get or build the tree-sitter graph. Uses mtime-based cache invalidation: re-indexes only when files change. */
export async function createGraph(root: string): Promise<Graph> {
	const resolved = path.resolve(root);
	const currentFiles = walkProjectFiles(resolved);
	const currentMtimes = fileDigest(currentFiles);

	const cached = _graphs.get(resolved);
	if (cached && !digestChanged(cached.mtimes, currentMtimes)) {
		return cached.graph;
	}

	const result = await indexProject(resolved);
	const symbols = [...result.symbolById.values()];
	const resolvers = createTreeSitterResolvers(result, resolved);
	const graph = createGraphFromResolvers(symbols, result.files, resolvers);
	_graphs.set(resolved, { graph, mtimes: currentMtimes });
	return graph;
}

/** Clear cached graphs (useful for testing). */
export function resetGraph(): void {
	_graphs.clear();
}
