import type { LanguageAdapter } from "./adapter.ts";
import type { Location, ProjectStats, Symbol, SymbolKind } from "./model.ts";
import { SymbolQuery } from "./query.ts";
import { containingSymbol } from "./usages.ts";
import { uriToFile } from "./uri.ts";

/** Disambiguates a simple name that matches multiple symbols. */
export interface SymbolSelector {
	container?: string;
	kind?: SymbolKind;
	signature?: string;
}

/**
 * In-memory index over a normalized symbol inventory. Pure — operates only on
 * the canonical model; all language specifics live behind a LanguageAdapter.
 */
export class CodeGraph {
	readonly symbols: Symbol[];
	readonly files: string[];
	private adapter?: LanguageAdapter;

	constructor(symbols: Symbol[], files: string[], adapter?: LanguageAdapter) {
		this.symbols = symbols;
		this.files = files;
		this.adapter = adapter;
	}

	/** Exact simple-name match. */
	symbol(name: string): Symbol[] {
		return this.symbols.filter((s) => s.name === name);
	}

	/** Case-insensitive substring match over symbol names. Returns a filterable query. */
	find(pattern: string): SymbolQuery {
		const lower = pattern.toLowerCase();
		return new SymbolQuery(this.symbols.filter((s) => s.name.toLowerCase().includes(lower)));
	}

	/** Symbols whose enclosing type name matches exactly. */
	members(containerName: string): SymbolQuery {
		return new SymbolQuery(this.symbols.filter((s) => s.containerName === containerName));
	}

	/** Symbols in files whose path contains the given substring. */
	file(partialPath: string): SymbolQuery {
		return new SymbolQuery(this.symbols.filter((s) => s.file.includes(partialPath)));
	}

	/**
	 * All usages of the symbol with this exact name. When the name is ambiguous,
	 * narrow with `selector` (container, kind, and/or signature); otherwise a
	 * descriptive error lists the candidates.
	 */
	async findUsages(name: string, selector?: SymbolSelector): Promise<Location[]> {
		const matches = this.symbol(name).filter((s) =>
			(!selector?.container || s.containerName === selector.container) &&
			(!selector?.kind || s.kind === selector.kind) &&
			(!selector?.signature || s.signature === selector.signature),
		);
		if (matches.length !== 1) {
			throw new Error(describeMatches(name, matches));
		}
		return this.findUsagesOf(matches[0]);
	}

	/** All usages of a specific symbol. */
	async findUsagesOf(symbol: Symbol): Promise<Location[]> {
		if (!this.adapter) {
			throw new Error("findUsages is unavailable: no language adapter");
		}
		return this.adapter.findUsages(symbol);
	}

	/** Symbols this specific symbol directly calls. */
	async calleesOf(symbol: Symbol): Promise<Symbol[]> {
		if (!this.adapter) {
			throw new Error("callees are unavailable: no language adapter");
		}
		const callees = await this.adapter.callees(symbol);
		// Reconcile with the indexed inventory so container names and ids match
		// the rest of the graph (e.g. simple `UserService`, not `com.example.UserService`).
		return callees.map(
			(c) =>
				this.symbols.find(
					(s) =>
						s.file === c.file &&
						s.name === c.name &&
						s.location.nameRange.start.line === c.location.nameRange.start.line,
				) ?? c,
		);
	}

	/** Implementers/subclasses/overriders of a symbol, resolved to canonical indexed symbols. */
	async implementationsOf(symbol: Symbol): Promise<Symbol[]> {
		if (!this.adapter) {
			throw new Error("implementations are unavailable: no language adapter");
		}
		const candidates = await this.adapter.implementations(symbol);
		const seen = new Set<string>();
		const out: Symbol[] = [];
		for (const cand of candidates) {
			// Declaration anchors resolve by containment; reference anchors (e.g.
			// Rust `impl Trait for Type`) fall back to a name + file match.
			const s = containingSymbol(this, cand) ??
				(cand.name ? this.symbols.find((x) => x.file === uriToFile(cand.uri) && x.name === cand.name) : undefined);
			// A symbol is never its own subtype/override.
			if (s && s.id !== symbol.id && !seen.has(s.id)) {
				seen.add(s.id);
				out.push(s);
			}
		}
		return out;
	}

	stats(): ProjectStats {
		return { files: this.files.length, symbols: this.symbols.length };
	}
}

function describeMatches(name: string, matches: Symbol[]): string {
	if (matches.length === 0) return `no symbol named "${name}" matches`;
	const lines = matches.map((s) => {
		const qualifier = s.containerName ? ` of ${s.containerName}` : "";
		const sig = s.signature ? ` ${s.signature}` : "";
		const file = s.file.split("/").pop();
		return `  ${s.name} (${s.kind}${qualifier})${sig} — ${file}:${s.location.nameRange.start.line}`;
	});
	return `${matches.length} symbols named "${name}"; narrow with kind/container/signature:\n${lines.join("\n")}`;
}

/** Build a graph from a project using the given language adapter. */
export async function createGraph(root: string, adapter: LanguageAdapter): Promise<CodeGraph> {
	const files = await adapter.discoverSourceFiles(root);
	const symbols = await adapter.indexSymbols(root, files);
	return new CodeGraph(symbols, files, adapter);
}
