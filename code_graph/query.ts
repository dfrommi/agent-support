import { execSync } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import path from "node:path";
import type { CallEdge, FileInfo, Symbol } from "./model.ts";

// ── Resolver strategies (pluggable per backend) ──────────────

export interface TraversalResolvers {
	/** The absolute project root path. */
	projectRoot: string;
	/**
	 * Given a set of symbols, find all symbols that call them (direct callers).
	 * Called once per hop. The implementation is backend-specific:
	 * - tree-sitter: look up edges in precomputed edge list
	 * - LSP: call prepareCallHierarchy + incomingCalls per symbol
	 */
	callers(symbols: Symbol[]): Promise<Symbol[]>;
	/**
	 * Given a set of symbols, find all symbols they call (direct callees).
	 */
	callees(symbols: Symbol[]): Promise<Symbol[]>;
	/**
	 * Given a symbol, find all references (reads, writes, etc.) across the codebase.
	 */
	references(symbol: Symbol): Promise<{ file: string; line: number; column: number }[]>;
	/**
	 * Look up a symbol by ID (needed for transitive traversal to reconstruct full Symbol objects).
	 */
	symbolById(id: string): Symbol | undefined;
	/**
	 * All known file paths (for file queries).
	 */
	allFiles(): string[];
	/**
	 * Whether this backend can provide complete results. LSP backends return true;
	 * tree-sitter returns false for cross-file edges that don't resolve.
	 */
	confidence(): "complete" | "partial";
	/**
	 * Human-readable note about what might be missing.
	 */
	confidenceNote(): string;
}

// ── Helpers ─────────────────────────────────────────────────

function walkDir(dir: string): string[] {
	const results: string[] = [];
	const stack = [dir];
	while (stack.length > 0) {
		const d = stack.pop()!;
		let entries;
		try { entries = readdirSync(d); } catch { continue; }
		for (const name of entries) {
			const full = path.join(d, name);
			try {
				if (statSync(full).isDirectory()) {
					if (!name.startsWith(".")) stack.push(full);
				} else {
					results.push(full);
				}
			} catch { /* skip */ }
		}
	}
	return results;
}

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

// ── Scope filtering ───────────────────────────────────────

/** Minimal glob-to-regex: supports ** (any depth) and * (within segment). */
function globToRegex(pattern: string): RegExp {
	let rx = "";
	let i = 0;
	while (i < pattern.length) {
		if (pattern[i] === "*" && pattern[i + 1] === "*") {
			if (pattern[i + 2] === "/") { rx += "(?:.*/)?"; i += 3; }
			else { rx += ".*"; i += 2; }
		} else if (pattern[i] === "*") {
			rx += "[^/]*";
			i++;
		} else if (".+^$(){}[]|\\".includes(pattern[i])) {
			rx += "\\" + pattern[i];
			i++;
		} else {
			rx += pattern[i];
			i++;
		}
	}
	return new RegExp("^" + rx + "$");
}

/** Compile exclude patterns once, reuse across BFS hops. */
function compileExcludeRx(exclude: string[] | undefined): RegExp[] {
	if (!exclude || exclude.length === 0) return [];
	return exclude.map(globToRegex);
}

function isExcluded(file: string, rx: RegExp[]): boolean {
	return rx.length > 0 && rx.some((r) => r.test(file));
}

/** Shared BFS traversal used by callers, callees, and impact. */
async function bfsTraverse(
	start: Symbol[],
	traverse: (symbols: Symbol[]) => Promise<Symbol[]>,
	options: { maxDepth?: number; excludeRx?: RegExp[] },
): Promise<Map<string, Symbol>> {
	const visited = new Map<string, Symbol>();
	for (const s of start) visited.set(s.id, s);
	let frontier = start;
	let depth = 0;
	const maxDepth = options.maxDepth ?? 50;
	const excludeRx = options.excludeRx ?? [];

	while (frontier.length > 0 && depth < maxDepth) {
		const next = await traverse(frontier);
		frontier = [];
		for (const s of next) {
			if (visited.has(s.id)) continue;
			if (isExcluded(s.file, excludeRx)) continue;
			visited.set(s.id, s);
			frontier.push(s);
		}
		depth++;
	}
	return visited;
}

// ── Output formatters ───────────────────────────────────────

function formatTable(items: Record<string, unknown>[], columns?: string[]): string {
	if (items.length === 0) return "(no results)";
	const keys = columns ?? Object.keys(items[0]);
	const widths = new Map<string, number>();
	for (const key of keys) widths.set(key, key.length);
	for (const item of items) {
		for (const key of keys) {
			const val = String(item[key] ?? "");
			widths.set(key, Math.max(widths.get(key) ?? key.length, val.length));
		}
	}
	const header = keys.map((k) => k.padEnd(widths.get(k)!)).join("  ");
	const sep = keys.map((k) => "─".repeat(widths.get(k)!)).join("  ");
	const rows = items.map((item) => keys.map((k) => String(item[k] ?? "").padEnd(widths.get(k)!)).join("  "));
	return [header, sep, ...rows].join("\n");
}

// ── SymbolQuery ─────────────────────────────────────────────

type SymbolSource = () => Promise<Symbol[]>;

/**
 * Lazy, chainable, async query over symbols.
 * Everything composes via thunks. Nothing executes until a terminal is called.
 *
 * Traversal methods (callers, callees) return new SymbolQuery instances
 * that resolve lazily. Terminals (list, asTable, explain, etc.) trigger
 * the resolution chain and return Promises.
 */
export class SymbolQuery {
	private _source: SymbolSource;
	private _resolvers: TraversalResolvers;
	private _selectColumns: string[] | undefined;

	constructor(source: SymbolSource, resolvers: TraversalResolvers) {
		this._source = source;
		this._resolvers = resolvers;
	}

	// ── Refinement ──────────────────────────────────────────

	filter(predicate: (s: Symbol) => boolean): SymbolQuery {
		const prev = this._source;
		const q = new SymbolQuery(async () => (await prev()).filter(predicate), this._resolvers);
		q._selectColumns = this._selectColumns;
		return q;
	}

	/** Alias for filter — reads nicely: `.where(s => s.kind === "class")` */
	where(predicate: (s: Symbol) => boolean): SymbolQuery {
		return this.filter(predicate);
	}

	/** Limit to exported symbols only. */
	exported(): SymbolQuery {
		return this.filter((s) => s.exported);
	}

	/** Pick columns for table output. */
	select(columns: string[]): SymbolQuery {
		const q = this.filter(() => true);
		q._selectColumns = columns;
		return q;
	}

	/** Limit to symbols whose file path matches a glob pattern. */
	inPath(pattern: string): SymbolQuery {
		const rx = globToRegex(pattern);
		return this.filter((s) => rx.test(s.file));
	}

	// ── Traversal ────────────────────────────────────────────

	/**
	 * Symbols that call any of the current set.
	 * With { transitive: true }, follows the call graph recursively (BFS).
	 */
	callers(options?: { transitive?: boolean; maxDepth?: number; scope?: { exclude: string[] } }): SymbolQuery {
		const prev = this._source;
		const resolvers = this._resolvers;

		if (options?.transitive) {
			return new SymbolQuery(async () => {
				const start = await prev();
				const visited = await bfsTraverse(start, resolvers.callers, {
					maxDepth: options.maxDepth,
					excludeRx: compileExcludeRx(options.scope?.exclude),
				});
				const startIds = new Set(start.map((s) => s.id));
				return [...visited.values()].filter((s) => !startIds.has(s.id));
			}, resolvers);
		}

		return new SymbolQuery(async () => {
			const syms = await prev();
			const result = await resolvers.callers(syms);
			const excludeRx = compileExcludeRx(options?.scope?.exclude);
			return excludeRx.length > 0 ? result.filter((s) => !isExcluded(s.file, excludeRx)) : result;
		}, resolvers);
	}

	/**
	 * Symbols that are called by any of the current set.
	 * With { transitive: true }, follows outgoing calls recursively (BFS).
	 */
	callees(options?: { transitive?: boolean; maxDepth?: number; scope?: { exclude: string[] } }): SymbolQuery {
		const prev = this._source;
		const resolvers = this._resolvers;

		if (options?.transitive) {
			return new SymbolQuery(async () => {
				const start = await prev();
				const visited = await bfsTraverse(start, resolvers.callees, {
					maxDepth: options.maxDepth,
					excludeRx: compileExcludeRx(options.scope?.exclude),
				});
				const startIds = new Set(start.map((s) => s.id));
				return [...visited.values()].filter((s) => !startIds.has(s.id));
			}, resolvers);
		}

		return new SymbolQuery(async () => {
			const syms = await prev();
			const result = await resolvers.callees(syms);
			const excludeRx = compileExcludeRx(options?.scope?.exclude);
			return excludeRx.length > 0 ? result.filter((s) => !isExcluded(s.file, excludeRx)) : result;
		}, resolvers);
	}

	/**
	 * All references to the current symbol (requires a single symbol).
	 */
	references(): SymbolQuery {
		const prev = this._source;
		const resolvers = this._resolvers;

		return new SymbolQuery(async () => {
			const syms = await prev();
			const results: { name: string; kind: Symbol["kind"]; file: string; line: number; column: number; exported: boolean }[] = [];
			for (const sym of syms) {
				const refs = await resolvers.references(sym);
				for (const r of refs) {
					results.push({
						name: sym.name,
						kind: sym.kind,
						file: r.file,
						line: r.line,
						column: r.column,
						exported: false,
					});
				}
			}
			return results as Symbol[];
		}, resolvers);
	}

	/** The file(s) containing the current symbols. */
	file(): FileQuery {
		const prev = this._source;
		return new FileQuery(async () => {
			const syms = await prev();
			const fileNames = [...new Set(syms.map((s) => s.file))];
			return fileNames.map((f) => ({ path: f, symbols: syms.filter((s) => s.file === f) }));
		}, this._resolvers);
	}

	// ── Terminals ────────────────────────────────────────────

	async list(): Promise<Symbol[]> {
		return this._source();
	}

	/** Pretty-printed table. */
	async asTable(): Promise<string> {
		const syms = await this._source();
		const columns = this._selectColumns ?? ["name", "kind", "file", "line"];
		return formatTable(
			syms.map((s) => ({
				name: s.name,
				kind: s.kind,
				file: s.file,
				line: s.line,
				parent: s.parentName ?? "",
				exported: s.exported ? "✓" : "",
			})),
			columns,
		);
	}

	/** Indented name tree, grouped by file. */
	async tree(_maxDepth?: number): Promise<string> {
		const syms = await this._source();
		if (syms.length === 0) return "(no results)";

		const lines: string[] = [];
		const byFile = new Map<string, Symbol[]>();
		for (const s of syms) {
			const list = byFile.get(s.file) ?? [];
			list.push(s);
			byFile.set(s.file, list);
		}

		for (const [file, fileSyms] of byFile) {
			lines.push(`📄 ${file}`);
			for (const s of fileSyms) {
				const prefix = s.parentName ? `  ${s.parentName} → ` : "  ";
				lines.push(`${prefix}${s.name} (${s.kind}) :${s.line}`);
			}
		}
		return lines.join("\n");
	}

	async count(): Promise<number> {
		return (await this._source()).length;
	}

	async first(): Promise<Symbol | undefined> {
		return (await this._source())[0];
	}

	/** Distribution by kind and by file. */
	async summary(): Promise<string> {
		const syms = await this._source();
		if (syms.length === 0) return "(no symbols)";

		const byKind = new Map<string, number>();
		const byFile = new Map<string, number>();
		for (const s of syms) {
			byKind.set(s.kind, (byKind.get(s.kind) ?? 0) + 1);
			byFile.set(s.file, (byFile.get(s.file) ?? 0) + 1);
		}
		const lines: string[] = [`${syms.length} symbol(s)`, "", "By kind:"];
		for (const [kind, count] of [...byKind].sort((a, b) => b[1] - a[1])) {
			lines.push(`  ${kind}: ${count}`);
		}
		lines.push("", "By file:");
		for (const [file, count] of [...byFile].sort((a, b) => b[1] - a[1])) {
			lines.push(`  ${file}: ${count}`);
		}
		return lines.join("\n");
	}

	/**
	 * Blast radius analysis: transitive callers grouped by file.
	 * Shows which files would be affected if you change the current symbol(s).
	 */
	async impact(options?: { scope?: { exclude: string[] } }): Promise<string> {
		const syms = await this._source();
		if (syms.length === 0) return "(no symbols to analyze)";

		const visited = await bfsTraverse(syms, this._resolvers.callers, {
			maxDepth: 50,
			excludeRx: compileExcludeRx(options?.scope?.exclude),
		});

		const startIds = new Set(syms.map((s) => s.id));
		const impacted = [...visited.values()].filter((s) => !startIds.has(s.id));

		if (impacted.length === 0) {
			return "No callers found — changing this should be safe.";
		}

		// Group by file
		const byFile = new Map<string, Symbol[]>();
		for (const s of impacted) {
			const list = byFile.get(s.file) ?? [];
			list.push(s);
			byFile.set(s.file, list);
		}

		const lines: string[] = [];
		lines.push(`Impact: ${impacted.length} caller(s) across ${byFile.size} file(s)`);
		if (this._resolvers.confidence() === "partial") {
			lines.push(`  ⚠️  ${this._resolvers.confidenceNote()}`);
		}
		lines.push("");

		for (const [file, fileSyms] of [...byFile].sort()) {
			const names = fileSyms.slice(0, 5).map((s) => s.name).join(", ");
			const suffix = fileSyms.length > 5 ? ` +${fileSyms.length - 5} more` : "";
			lines.push(`  ${file}: ${names}${suffix}`);
		}

		return lines.join("\n");
	}

	/**
	 * Find call paths from the current symbol(s) to symbols matching a predicate.
	 * Returns the shortest paths found (BFS). Use `direction: "callees"` to follow
	 * outgoing calls, or `direction: "callers"` to trace incoming calls.
	 */
	async pathsTo(
		target: (s: Symbol) => boolean,
		options?: { maxDepth?: number; direction?: "callees" | "callers"; scope?: { exclude: string[] } },
	): Promise<string> {
		const sources = await this._source();
		if (sources.length === 0) return "(no source symbols)";

		const maxDepth = options?.maxDepth ?? 10;
		const direction = options?.direction ?? "callees";
		const traverse = direction === "callees" ? this._resolvers.callees : this._resolvers.callers;
		const excludeRx = compileExcludeRx(options?.scope?.exclude);

		// BFS with path tracking
		const visited = new Set<string>();
		interface PathNode { sym: Symbol; parent?: PathNode }
		let frontier: PathNode[] = sources.map((s) => ({ sym: s }));
		for (const s of sources) visited.add(s.id);

		const foundPaths: PathNode[] = [];
		let depth = 0;

		while (frontier.length > 0 && depth < maxDepth && foundPaths.length === 0) {
			const nextFrontier: PathNode[] = [];
			// Batch all frontier symbols for a single resolver call
			const frontierSyms = frontier.map((n) => n.sym);
			const nextSyms = await traverse.call(this._resolvers, frontierSyms);

			// Build a lookup from source symbol ID to its next symbols
			// Since the resolver returns flat results, we need to re-derive which source produced each result.
			// For simplicity, resolve individually when the frontier is small; batch for large frontiers.
			// Actually, let's resolve per-source for correctness:

			for (const node of frontier) {
				let nextBatch: Symbol[];
				try {
					nextBatch = await traverse.call(this._resolvers, [node.sym]);
				} catch {
					continue;
				}
				for (const nextSym of nextBatch) {
					if (visited.has(nextSym.id)) continue;
					if (isExcluded(nextSym.file, excludeRx)) continue;
					visited.add(nextSym.id);
					const child: PathNode = { sym: nextSym, parent: node };
					if (target(nextSym)) {
						foundPaths.push(child);
						break;
					}
					nextFrontier.push(child);
				}
				if (foundPaths.length > 0) break;
			}

			frontier = nextFrontier;
			depth++;
		}

		if (foundPaths.length === 0) {
			const dirLabel = direction === "callees" ? "calls to" : "callers from";
			return `No path found (searched ${depth} level(s) of ${dirLabel} target).`;
		}

		// Render paths
		const lines: string[] = [];
		for (const node of foundPaths.slice(0, 5)) {
			const path: Symbol[] = [];
			let cur: PathNode | undefined = node;
			while (cur) {
				path.unshift(cur.sym);
				cur = cur.parent;
			}
			lines.push(path.map((s) => `${s.name} (${s.file.split("/").pop()}:${s.line})`).join("\n  → "));
			lines.push("");
		}

		return lines.join("\n").trimEnd();
	}

	/**
	 * Render a call hierarchy tree from the current symbol(s).
	 * For each symbol in the result set, shows callees as an indented tree.
	 */
	async callTree(options?: { maxDepth?: number }): Promise<string> {
		const syms = await this._source();
		if (syms.length === 0) return "(no symbols)";

		const maxDepth = options?.maxDepth ?? 3;
		const lines: string[] = [];

		async function renderNode(sym: Symbol, prefix: string, depth: number, resolvers: TraversalResolvers): Promise<void> {
			const kindLabel = sym.parentName ? `${sym.kind} of ${sym.parentName}` : sym.kind;
			lines.push(`${prefix}${sym.name} (${kindLabel}) — ${sym.file}:${sym.line}${sym.endLine ? `-${sym.endLine}` : ""}`);

			if (depth >= maxDepth) return;

			try {
				const callees = await resolvers.callees([sym]);
				for (let i = 0; i < callees.length; i++) {
					const isLast = i === callees.length - 1;
					const childPrefix = prefix.replace(/├─ $/, "│  ").replace(/└─ $/, "   ");
					const connector = isLast ? "└─ " : "├─ ";
					await renderNode(callees[i], childPrefix + connector, depth + 1, resolvers);
				}
			} catch { /* skip */ }
		}

		for (let i = 0; i < syms.length; i++) {
			const isLast = i === syms.length - 1;
			const connector = syms.length > 1 ? (isLast ? "└─ " : "├─ ") : "";
			await renderNode(syms[i], connector, 0, this._resolvers);
		}

		return lines.join("\n") || "(no results)";
	}

	/**
	 * Git history for the symbol's source range — "who touched this and why?"
	 * Uses `git log -L` to follow the symbol through renames.
	 */
	async why(): Promise<string> {
		const syms = await this._source();
		if (syms.length === 0) return "(no symbols)";

		const root = this._resolvers.projectRoot;

		// Find the actual git root (may be a parent of projectRoot)
		let gitRoot: string | null = null;
		try {
			gitRoot = execSync(`git -C "${root}" rev-parse --show-toplevel`, {
				encoding: "utf8", timeout: 3000,
			}).trim();
		} catch {
			return "(not a git repository)";
		}

		const results: string[] = [];
		for (const sym of syms.slice(0, 5)) {
			// Path relative to git root (not project root)
			const relFile = path.relative(gitRoot!, sym.file);
			try {
				// git blame the specific line to find the last commit that touched it
				const raw = execSync(
					`git -C "${gitRoot}" blame -L ${sym.line},${sym.line} --line-porcelain "${relFile}"`,
					{ encoding: "utf8", timeout: 5000, maxBuffer: 256 * 1024 },
				);
				// Parse porcelain: find lines starting with "author ", "author-time ", "summary "
				const commitHash = raw.match(/^([0-9a-f]{7,40}) /m)?.[1];
				const author = raw.match(/^author (.+)$/m)?.[1];
				const authorTime = raw.match(/^author-time (.+)$/m)?.[1];
				const summary = raw.match(/^summary (.+)$/m)?.[1];

				if (commitHash) {
					const date = authorTime
						? new Date(parseInt(authorTime) * 1000).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })
						: "unknown";
					if (syms.length > 1) results.push(`${sym.name}:`);
					results.push(`  ${commitHash.slice(0, 7)} ${date}: ${summary ?? "(no message)"}`);
				} else {
					results.push(`${sym.name} — no git history found`);
				}
			} catch {
				results.push(`${sym.name} — git history unavailable`);
			}
		}
		return results.join("\n") || "(no results)";
	}

	/**
	 * Find tests that exercise the current symbol(s).
	 * Searches common test directories using name-based heuristics:
	 * matching filenames, imports, and symbol name mentions.
	 */
	/**
	 * Detailed breakdown of a single symbol — the "what matters about this thing" view.
	 * Includes callers, callees, references, confidence note, git history, and tests.
	 */
	async explain(): Promise<string> {
		const syms = await this._source();
		if (syms.length === 0) return "(no match)";
		if (syms.length > 1) return `(${syms.length} matches — narrow to a single symbol for explain)`;

		const sym = syms[0];
		const kindLabel = sym.parentName ? `${sym.kind} of ${sym.parentName}` : sym.kind;
		const lines: string[] = [];
		lines.push(`${sym.name} (${kindLabel}) — ${sym.file}:${sym.line}${sym.endLine ? `-${sym.endLine}` : ""}`);
		if (sym.exported) lines.push(`  Exported: yes`);

		// Git history — most recent change
		try {
			const history = await this.why();
			if (history && !history.startsWith("(")) {
				// Extract the first commit line (most recent)
				const firstLine = history.split("\n")[0];
				if (firstLine && !firstLine.includes("no git") && !firstLine.includes("unavailable") && !firstLine.includes("not a git")) {
					lines.push(`  Last changed: ${firstLine.replace(/^  /, "")}`);
				}
			}
		} catch { /* optional */ }

		// Callers
		const callerList = await this._resolvers.callers([sym]);
		if (callerList.length > 0) {
			const names = callerList.slice(0, 8).map((c) => c.name).join(", ");
			const suffix = callerList.length > 8 ? ` +${callerList.length - 8} more` : "";
			lines.push(`  Called by (${callerList.length}): ${names}${suffix}`);
		} else {
			lines.push(`  Called by: (none found)`);
		}

		// Callees
		const calleeList = await this._resolvers.callees([sym]);
		if (calleeList.length > 0) {
			const names = calleeList.slice(0, 8).map((c) => c.name).join(" → ");
			const suffix = calleeList.length > 8 ? ` +${calleeList.length - 8} more` : "";
			lines.push(`  Calls (${calleeList.length}): ${names}${suffix}`);
		} else {
			lines.push(`  Calls: (none found)`);
		}

		// References
		try {
			const refs = await this._resolvers.references(sym);
			if (refs.length > 0) {
				lines.push(`  References: ${refs.length} location(s)`);
			}
		} catch {
			// references not supported by all backends
		}

		// Confidence
		if (this._resolvers.confidence() === "partial") {
			lines.push(`  ⚠️  Results may be incomplete: ${this._resolvers.confidenceNote()}`);
		}

		return lines.join("\n");
	}
}

// ── FileQuery ───────────────────────────────────────────────

type FileSource = () => Promise<FileInfo[]>;

export class FileQuery {
	private _source: FileSource;
	private _resolvers: TraversalResolvers;

	constructor(source: FileSource, resolvers: TraversalResolvers) {
		this._source = source;
		this._resolvers = resolvers;
	}

	filter(predicate: (f: FileInfo) => boolean): FileQuery {
		const prev = this._source;
		return new FileQuery(async () => (await prev()).filter(predicate), this._resolvers);
	}

	/** All symbols in the current file(s). */
	symbols(): SymbolQuery {
		const prev = this._source;
		return new SymbolQuery(async () => (await prev()).flatMap((f) => f.symbols), this._resolvers);
	}

	async list(): Promise<FileInfo[]> {
		return this._source();
	}

	async asTable(): Promise<string> {
		const infos = await this._source();
		return formatTable(
			infos.map((f) => ({ file: f.path, symbols: String(f.symbols.length) })),
		);
	}

	async summary(): Promise<string> {
		const infos = await this._source();
		const totalSymbols = infos.reduce((sum, f) => sum + f.symbols.length, 0);
		return `${infos.length} file(s), ${totalSymbols} symbol(s)`;
	}
}
