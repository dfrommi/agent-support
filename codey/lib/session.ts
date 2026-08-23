import fs from "node:fs";
import path from "node:path";
import type { LanguageAdapter } from "./adapter.ts";
import { CodeGraph } from "./graph.ts";
import type { Symbol } from "./model.ts";

/** Creates the language adapter for a root (e.g. `JavaAdapter.connect`). */
export type AdapterFactory = (root: string) => Promise<LanguageAdapter>;

interface CachedGraph {
	adapter: LanguageAdapter;
	graph: CodeGraph;
	files: string[];
	mtimes: Map<string, number>;
}

const graphs = new Map<string, CachedGraph>();
const opening = new Map<string, Promise<CachedGraph>>();

function digest(files: string[]): Map<string, number> {
	const mtimes = new Map<string, number>();
	for (const f of files) {
		try {
			mtimes.set(f, fs.statSync(f).mtimeMs);
		} catch {
			// deleted mid-walk — a re-index will reconcile it
		}
	}
	return mtimes;
}

/**
 * Return a cached graph for `root`, re-indexing only added/changed files
 * through the *running* adapter and dropping removed ones. Usages are never
 * cached — they are always computed live via the adapter.
 */
export async function getGraph(root: string, factory: AdapterFactory): Promise<CodeGraph> {
	const resolved = path.resolve(root);
	const cached = graphs.get(resolved);

	if (cached) {
		const files = await cached.adapter.discoverSourceFiles(resolved);
		const mtimes = digest(files);

		const added = files.filter((f) => !cached.mtimes.has(f));
		const changedFiles = files.filter((f) => cached.mtimes.has(f) && cached.mtimes.get(f) !== mtimes.get(f));
		const removed = new Set(cached.files.filter((f) => !mtimes.has(f)));

		if (added.length === 0 && changedFiles.length === 0 && removed.size === 0) {
			return cached.graph;
		}

		// Re-index only what changed; drop stale/removed symbols and merge the fresh ones in.
		const stale = new Set([...changedFiles, ...removed]);
		const kept = cached.graph.symbols.filter((s) => !stale.has(s.file));

		let indexed: Symbol[] = [];
		if (added.length + changedFiles.length > 0) {
			indexed = await cached.adapter.indexSymbols(resolved, [...added, ...changedFiles]);
		}

		const graph = new CodeGraph([...kept, ...indexed], files, cached.adapter);
		cached.graph = graph;
		cached.files = files;
		cached.mtimes = mtimes;
		return graph;
	}

	// Share a single in-flight init so concurrent callers (e.g. warmup and the
	// first tool call) don't spawn two language servers.
	const pending = opening.get(resolved);
	if (pending) return (await pending).graph;

	const init = (async (): Promise<CachedGraph> => {
		const adapter = await factory(resolved);
		const files = await adapter.discoverSourceFiles(resolved);
		const symbols = await adapter.indexSymbols(resolved, files);
		const graph = new CodeGraph(symbols, files, adapter);
		return { adapter, graph, files, mtimes: digest(files) };
	})();
	opening.set(resolved, init);
	try {
		const entry = await init;
		graphs.set(resolved, entry);
		return entry.graph;
	} finally {
		opening.delete(resolved);
	}
}

/** Close and forget all cached graphs (session shutdown). */
export async function resetGraphs(): Promise<void> {
	const entries = [...graphs.values()];
	graphs.clear();
	await Promise.all(entries.map((e) => e.adapter.close().catch(() => {})));
}
