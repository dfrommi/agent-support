import type { CodeGraph } from "./graph.ts";
import type { Symbol, SymbolKind } from "./model.ts";

const CALLABLE_KINDS = new Set<SymbolKind>(["method", "function", "constructor"]);

export interface LineSpan {
	startLine: number;
	endLine: number;
}

/**
 * Outermost callable (method/function/constructor) whose definition range fully
 * contains `span`. When `within` is given, the callable must also fall inside it
 * (used to honor a `Class:line` qualifier). Returns `null` when no callable fits.
 */
export function locateCallable(graph: CodeGraph, file: string, span: LineSpan, within?: LineSpan): Symbol | null {
	let best: Symbol | null = null;
	let bestSpan = -1;
	for (const s of graph.symbols) {
		if (s.file !== file || !CALLABLE_KINDS.has(s.kind)) continue;
		const r = s.location.range;
		if (r.start.line > span.startLine || r.end.line < span.endLine) continue;
		if (within && (r.start.line < within.startLine || r.end.line > within.endLine)) continue;
		const len = r.end.line - r.start.line;
		if (len > bestSpan) {
			bestSpan = len;
			best = s;
		}
	}
	return best;
}
