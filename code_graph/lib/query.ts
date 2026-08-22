import type { Symbol, SymbolKind } from "./model.ts";

/**
 * A filterable set of symbols. Returned by exploratory entry points like
 * `CodeGraph.find()`; refined with `where` / `inPath`, then materialized with
 * `list` / `count`. Purely in-memory — no language or I/O concerns.
 */
export class SymbolQuery {
	readonly symbols: Symbol[];

	constructor(symbols: Symbol[]) {
		this.symbols = symbols;
	}

	/** Keep only symbols of the given kind. */
	where(kind: SymbolKind): SymbolQuery {
		return new SymbolQuery(this.symbols.filter((s) => s.kind === kind));
	}

	/** Keep only symbols whose file path matches a glob (`**` = any depth). */
	inPath(pattern: string): SymbolQuery {
		const rx = globToRegex(pattern);
		return new SymbolQuery(this.symbols.filter((s) => rx.test(s.file)));
	}

	list(): Symbol[] {
		return this.symbols;
	}

	count(): number {
		return this.symbols.length;
	}
}

/** Minimal glob→regex: `**` (any depth) and `*` (within a segment). */
export function globToRegex(pattern: string): RegExp {
	let rx = "";
	let i = 0;
	while (i < pattern.length) {
		if (pattern[i] === "*" && pattern[i + 1] === "*") {
			if (pattern[i + 2] === "/") {
				rx += "(?:.*/)?";
				i += 3;
			} else {
				rx += ".*";
				i += 2;
			}
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
