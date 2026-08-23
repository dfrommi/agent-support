import fuzzysort from "fuzzysort";
import path from "node:path";
import type { CodeGraph } from "./graph.ts";
import type { Symbol, SymbolKind } from "./model.ts";
import { globToRegex } from "./query.ts";
import { kindRank } from "./resolve.ts";
import { inScope, type Scope } from "./scope.ts";

export interface SearchOptions {
	substrings: string[];
	includeKinds?: SymbolKind[];
	excludeKinds?: SymbolKind[];
	scope: Scope;
	/** Glob matched against the project-relative or absolute file path (e.g. `src/main/**`). */
	path?: string;
	root: string;
}

/** `Container.member` for members, bare name for top-level symbols. */
function qualifiedName(s: Symbol): string {
	return s.containerName && s.containerName !== s.name ? `${s.containerName}.${s.name}` : s.name;
}

/** OR semantics: a symbol matches when any substring appears in its bare, qualified, or alias names. */
function searchableNames(s: Symbol): string[] {
	return [s.name, qualifiedName(s), ...(s.aliases ?? [])];
}

function matchesAny(s: Symbol, terms: string[]): boolean {
	const haystacks = searchableNames(s).map((n) => n.toLowerCase());
	return terms.some((term) => {
		const lower = term.toLowerCase();
		return haystacks.some((h) => h.includes(lower));
	});
}

/** Best similarity score across the symbol's bare, qualified, and alias names, over all substrings. */
function matchScore(s: Symbol, terms: string[]): number {
	let best = -1;
	for (const term of terms) {
		for (const name of searchableNames(s)) {
			const r = fuzzysort.single(term, name);
			if (r && r.score > best) best = r.score;
		}
	}
	return best;
}

function pathMatcher(pattern: string, root: string): (file: string) => boolean {
	const rx = globToRegex(pattern);
	return (file) => rx.test(path.relative(root, file)) || rx.test(file);
}

/**
 * Filter and rank symbols by substring (OR), kinds, scope, and path. Purely
 * in-memory over the canonical model — no language or I/O concerns.
 */
export function searchSymbols(graph: CodeGraph, options: SearchOptions): Symbol[] {
	// Accept Rust's `::` as the member separator, same as resolution does.
	const terms = options.substrings.map((t) => t.trim().replace(/::/g, ".")).filter(Boolean);
	if (terms.length === 0) return [];

	const include = new Set(options.includeKinds ?? []);
	const exclude = new Set(options.excludeKinds ?? []);
	const pathMatches = options.path ? pathMatcher(options.path, options.root) : undefined;

	const matched = graph.symbols.filter(
		(s) =>
			matchesAny(s, terms) &&
			(include.size === 0 || include.has(s.kind)) &&
			!exclude.has(s.kind) &&
			inScope(s.file, options.scope, s.containerName, options.root) &&
			(!pathMatches || pathMatches(s.file)),
	);

	const scores = new Map<string, number>();
	for (const s of matched) scores.set(s.id, matchScore(s, terms));

	return matched.sort(
		(a, b) =>
			(scores.get(b.id) ?? -1) - (scores.get(a.id) ?? -1) ||
			kindRank(a.kind) - kindRank(b.kind) ||
			a.name.localeCompare(b.name) ||
			a.file.localeCompare(b.file) ||
			a.location.nameRange.start.line - b.location.nameRange.start.line,
	);
}

/** Compact kind breakdown, e.g. "method 120, field 90, class 12". */
export function kindHistogram(symbols: Symbol[]): string {
	const counts = new Map<SymbolKind, number>();
	for (const s of symbols) counts.set(s.kind, (counts.get(s.kind) ?? 0) + 1);
	return [...counts.entries()]
		.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
		.map(([kind, count]) => `${kind} ${count}`)
		.join(", ");
}
