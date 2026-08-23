import type { CodeGraph } from "./graph.ts";
import type { Location, Position, Range, Symbol } from "./model.ts";
import { uriToFile } from "./uri.ts";

export interface ResolvedUsage {
	location: Location;
	/** Innermost symbol containing the usage, when it's inside the indexed project. */
	symbol?: Symbol;
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
