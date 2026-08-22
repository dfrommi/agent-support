import fs from "node:fs";
import path from "node:path";
import type { LanguageAdapter } from "./adapter.ts";
import { CodeGraph } from "./graph.ts";

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

function changed(a: Map<string, number>, b: Map<string, number>): boolean {
	if (a.size !== b.size) return true;
	for (const [f, mtime] of a) {
		if (b.get(f) !== mtime) return true;
	}
	return false;
}

/**
 * Return a cached graph for `root`, re-indexing through the *running* adapter
 * when any indexed file changed. Usages are never cached — they are always
 * computed live via the adapter.
 */
export async function getGraph(root: string, factory: AdapterFactory): Promise<CodeGraph> {
	const resolved = path.resolve(root);
	const cached = graphs.get(resolved);

	if (cached) {
		const files = await cached.adapter.discoverSourceFiles(resolved);
		const mtimes = digest(files);
		if (!changed(cached.mtimes, mtimes)) {
			return cached.graph;
		}

		const symbols = await cached.adapter.indexSymbols(resolved, files);
		const graph = new CodeGraph(symbols, files, cached.adapter);
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
