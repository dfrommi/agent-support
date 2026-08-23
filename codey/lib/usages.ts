import type { CodeGraph } from "./graph.ts";
import type { Location, Position, Range, Symbol, SymbolKind } from "./model.ts";
import { uriToFile } from "./uri.ts";

export interface ResolvedUsage {
	location: Location;
	/** Innermost symbol containing the usage, when it's inside the indexed project. */
	symbol?: Symbol;
}

/** One collapsed call site: a containing symbol (or external location) with all its occurrences. */
export interface UsageGroup {
	/** Innermost containing symbol; undefined for library/external references. */
	symbol?: Symbol;
	/** Representative location (first occurrence). */
	location: Location;
	/** Number of collapsed occurrences in this group. */
	count: number;
}

/** Ranked, capped sample of usage groups for a collapsed summary. */
export interface UsageSample {
	shown: UsageGroup[];
	/** Number of additional groups not shown (i.e. `total - shown.length`). */
	hidden: number;
}

/** Resolve each usage location to the innermost symbol that contains it. */
export function resolveUsageSymbols(graph: CodeGraph, usages: Location[]): ResolvedUsage[] {
	return usages.map((location) => ({ location, symbol: containingSymbol(graph, location) }));
}

/** Innermost symbol whose definition range contains `pos` (smallest line span wins). */
export function containingSymbol(graph: CodeGraph, location: Location): Symbol | undefined {
	const file = uriToFile(location.uri);
	const pos = location.range.start;
	let best: Symbol | undefined;
	let bestSpan = Infinity;
	for (const s of graph.symbols) {
		if (s.file !== file) continue;
		if (!contains(s.location.range, pos)) continue;
		const span = s.location.range.end.line - s.location.range.start.line;
		if (span < bestSpan) {
			bestSpan = span;
			best = s;
		}
	}
	return best;
}

function contains(range: Range, pos: Position): boolean {
	if (pos.line < range.start.line || pos.line > range.end.line) return false;
	if (pos.line === range.start.line && pos.column < range.start.column) return false;
	if (pos.line === range.end.line && pos.column > range.end.column) return false;
	return true;
}

/** Collapse usages into one group per distinct call site (containing symbol, or file:line for external refs). */
export function groupUsages(usages: ResolvedUsage[]): UsageGroup[] {
	const groups = new Map<string, UsageGroup>();
	for (const u of usages) {
		const key = u.symbol?.id ?? `${uriToFile(u.location.uri)}:${u.location.range.start.line}`;
		const existing = groups.get(key);
		if (existing) {
			existing.count += 1;
		} else {
			groups.set(key, { symbol: u.symbol, location: u.location, count: 1 });
		}
	}
	return [...groups.values()];
}

const CALLABLE_KINDS = new Set<SymbolKind>(["method", "constructor", "function"]);

/**
 * Rank usage groups for a collapsed sample: call sites inside a callable body
 * first (real consumers), then other declarations (fields, etc.), then
 * module-level references (imports/type annotations). Within each tier,
 * cross-file callers sort before same-file ones, then line/column.
 */
export function rankUsages(groups: UsageGroup[], definitionFile: string): UsageGroup[] {
	const context = (g: UsageGroup): number => {
		if (!g.symbol) return 2; // module-level reference (import/type annotation)
		return CALLABLE_KINDS.has(g.symbol.kind) ? 0 : 1;
	};
	const external = (g: UsageGroup): number => (uriToFile(g.location.uri) === definitionFile ? 1 : 0);
	return [...groups].sort((a, b) => {
		return (
			context(a) - context(b) ||
			external(a) - external(b) ||
			a.location.range.start.line - b.location.range.start.line ||
			a.location.range.start.column - b.location.range.start.column ||
			uriToFile(a.location.uri).localeCompare(uriToFile(b.location.uri))
		);
	});
}

/** Rank and cap usage groups for a collapsed summary. */
export function sampleUsages(usages: ResolvedUsage[], definitionFile: string, max: number): UsageSample {
	const ranked = rankUsages(groupUsages(usages), definitionFile);
	const shown = ranked.slice(0, max);
	return { shown, hidden: ranked.length - shown.length };
}
