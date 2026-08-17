import path from "node:path";
import codegraphPackage from "@colbymchenry/codegraph";

// The published npm SDK (`npm-sdk.js`) re-exports the compiled CJS bundle via
// `module.exports = require(...)`, so a default import yields the namespace with
// the class on `.CodeGraph`. The local fork's `dist/index.js` instead exposes the
// class on BOTH `.CodeGraph` and `.default`, so a transpiler that unwraps
// `__esModule` defaults yields the class itself. Accept every shape.

type CgProgress = { phase: string; current: number; total: number };

export type CgNode = {
	id: string;
	kind: string;
	name: string;
	qualifiedName: string;
	filePath: string;
	language?: string;
	startLine: number;
	endLine: number;
	startColumn: number;
	endColumn: number;
	signature?: string;
	visibility?: string | null;
	docstring?: string;
};

export type CgEdge = {
	kind: string;
	source: string;
	target: string;
	metadata?: Record<string, unknown>;
	line?: number;
	column?: number;
};

export type CgPendingFile = { path: string };

export type CgContext = {
	focal: CgNode | null;
	ancestors: CgNode[];
	children: CgNode[];
	incomingRefs: Array<{ node: CgNode; edge: CgEdge }>;
	outgoingRefs: Array<{ node: CgNode; edge: CgEdge }>;
	types: CgNode[];
	imports: CgNode[];
};

export interface CgInstance {
	getFiles(): Array<{ path: string; language?: string; nodeCount?: number }>;
	getNode(id: string): CgNode | null;
	getNodesByName(name: string): CgNode[];
	getNodesByNameSubstring(substring: string, options?: { limit?: number; kinds?: string[] }): CgNode[];
	getNodesByKind(kind: string): CgNode[];
	getNodesInFile(filePath: string): CgNode[];
	getChildren(id: string): CgNode[];
	getContext(id: string): CgContext;
	getAncestors(id: string): CgNode[];
	searchNodes(query: string, options?: { limit?: number }): Array<{ node: CgNode; score: number }>;
	getSegmentMatches(words: string[], limit?: number): Array<{ name: string; kind: string; filePath: string; startLine: number; matchedWords: string[] }>;
	getCode(id: string): Promise<string | null>;
	getCallers(id: string, maxDepth?: number): Array<{ node: CgNode; edge: CgEdge }>;
	getCallees(id: string, maxDepth?: number): Array<{ node: CgNode; edge: CgEdge }>;
	getImpactRadius(id: string, maxDepth?: number): { nodes: Map<string, CgNode>; edges: CgEdge[]; roots: string[] };
	findPath(fromId: string, toId: string, edgeKinds?: string[]): Array<{ node: CgNode; edge: CgEdge | null }> | null;
	getFileDependents(filePath: string): string[];
	getStats(): { fileCount: number; nodeCount: number; edgeCount: number };
	getLastIndexedAt(): number | null;
	getPendingFiles(): CgPendingFile[];
	isWatcherDegraded(): boolean;
	indexAll(opts?: { onProgress?: (p: CgProgress) => void }): Promise<unknown>;
	sync(opts?: { onProgress?: (p: CgProgress) => void }): Promise<unknown>;
	watch(): boolean;
	waitUntilWatcherReady(timeoutMs?: number): Promise<void>;
	close(): void;
}

interface CgApi {
	init(root: string, opts?: { index?: boolean }): Promise<CgInstance>;
	open(root: string, opts?: { sync?: boolean }): Promise<CgInstance>;
}

const CodeGraph = ((codegraphPackage as any)?.CodeGraph ?? (codegraphPackage as any)?.default ?? codegraphPackage) as CgApi;

// ── Instance management ────────────────────────────────────

interface Backend {
	instance: CgInstance;
	watching: boolean;
	ready: Promise<void> | null;
	error: Error | null;
}

const backends = new Map<string, Backend>();
const opening = new Map<string, Promise<Backend>>();

async function getBackend(root: string): Promise<Backend> {
	const resolved = path.resolve(root);
	const existing = backends.get(resolved);
	if (existing) return existing;

	const pending = opening.get(resolved);
	if (pending) return pending;

	const p = (async () => {
		let instance: CgInstance;
		try {
			instance = await CodeGraph.open(resolved);
		} catch {
			instance = await CodeGraph.init(resolved);
		}
		const backend: Backend = { instance, watching: false, ready: null, error: null };
		backends.set(resolved, backend);
		return backend;
	})();
	opening.set(resolved, p);
	try {
		return await p;
	} finally {
		opening.delete(resolved);
	}
}

async function ensureIndexed(cg: CgInstance): Promise<void> {
	if (cg.getStats().nodeCount === 0) {
		await cg.indexAll();
	} else {
		await cg.sync();
	}
}

function startWatch(cg: CgInstance): boolean {
	try {
		return cg.watch();
	} catch {
		return false;
	}
}

function startInitialization(backend: Backend): Promise<void> {
	return (async () => {
		try {
			await ensureIndexed(backend.instance);
			backend.watching = startWatch(backend.instance);
			if (backend.watching) {
				try { await backend.instance.waitUntilWatcherReady(2000); } catch { /* fall back to per-call sync */ }
			}
		} catch (e) {
			backend.error = e as Error;
		}
	})();
}

// ── Public API ─────────────────────────────────────────────

/** Kick off indexing + watcher startup in the background (fire-and-forget). */
export async function warmup(root: string): Promise<void> {
	try {
		const backend = await getBackend(root);
		if (!backend.ready) backend.ready = startInitialization(backend);
	} catch {
		// getGraph retries and surfaces the error on first use.
	}
}

/** Return a ready, fresh codegraph instance for `root`. */
export async function getGraph(root: string): Promise<CgInstance> {
	const backend = await getBackend(root);
	if (!backend.ready) backend.ready = startInitialization(backend);
	await backend.ready;
	if (backend.error) throw backend.error;

	// Collapse the watcher's debounce window / handle a missing watcher.
	if (!backend.watching || backend.instance.isWatcherDegraded()) {
		await ensureIndexed(backend.instance);
	} else if (backend.instance.getPendingFiles().length > 0) {
		await backend.instance.sync();
	}

	return backend.instance;
}

/** Close all cached codegraph instances (session shutdown, tests). */
export function resetGraph(): void {
	for (const [, backend] of backends) {
		try { backend.instance.close(); } catch { /* ignore */ }
	}
	backends.clear();
}
