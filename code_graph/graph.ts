import fs from "node:fs";
import path from "node:path";
import { indexProject, walkProjectFiles, type IndexResult } from "./indexer.ts";
import { SymbolQuery, FileQuery, gitChangedFiles, type TraversalResolvers } from "./query.ts";
import type { Symbol } from "./model.ts";

// ── Tree-sitter TraversalResolvers ──────────────────────────

function createTreeSitterResolvers(result: IndexResult, root: string): TraversalResolvers {
	return {
		projectRoot: root,
		async callers(symbols: Symbol[]): Promise<Symbol[]> {
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
	/** Number of indexed files, symbols, and edges. */
	stats(): { files: number; symbols: number; edges: number };
}

class GraphImpl implements Graph {
	private result: IndexResult;
	private resolvers: TraversalResolvers;

	constructor(result: IndexResult, root: string) {
		this.result = result;
		this.resolvers = createTreeSitterResolvers(result, root);
	}

	symbol(name: string): SymbolQuery {
		return new SymbolQuery(
			async () => {
				const matches: Symbol[] = [];
				for (const sym of this.result.symbolById.values()) {
					if (sym.name === name) matches.push(sym);
				}
				return matches;
			},
			this.resolvers,
		);
	}

	find(pattern: string): SymbolQuery {
		const lower = pattern.toLowerCase();
		return new SymbolQuery(
			async () => {
				const matches: Symbol[] = [];
				for (const sym of this.result.symbolById.values()) {
					if (sym.name.toLowerCase().includes(lower)) matches.push(sym);
				}
				return matches;
			},
			this.resolvers,
		);
	}

	file(partialPath: string): FileQuery {
		const fileInfos = [...this.result.files.values()];
		return new FileQuery(
			async () => fileInfos.filter((f) => f.path.endsWith(partialPath) || f.path.includes(partialPath)),
			this.resolvers,
		);
	}

	all(): SymbolQuery {
		return new SymbolQuery(async () => [...this.result.symbolById.values()], this.resolvers);
	}

	files(): FileQuery {
		const all = [...this.result.files.values()];
		return new FileQuery(async () => all, this.resolvers);
	}

	changed(opts: { since: string }): SymbolQuery {
		const resolvers = this.resolvers;
		return new SymbolQuery(async () => {
			const changedFiles = gitChangedFiles(resolvers.projectRoot, opts.since);
			const changedSet = new Set(changedFiles);
			const matches: Symbol[] = [];
			for (const sym of this.result.symbolById.values()) {
				if (changedSet.has(sym.file)) matches.push(sym);
			}
			return matches;
		}, resolvers);
	}

	stats(): { files: number; symbols: number; edges: number } {
		return {
			files: this.result.files.size,
			symbols: this.result.symbolById.size,
			edges: this.result.edges.length,
		};
	}
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
	const graph = new GraphImpl(result, resolved);
	_graphs.set(resolved, { graph, mtimes: currentMtimes });
	return graph;
}

/** Clear cached graphs (useful for testing). */
export function resetGraph(): void {
	_graphs.clear();
}
