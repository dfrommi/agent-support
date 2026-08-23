import type { CodeGraph } from "./graph.ts";
import type { Symbol, SymbolKind } from "./model.ts";
import { inScope, type Scope } from "./scope.ts";

export interface ResolvedSymbol {
	primary: Symbol;
	others: Symbol[];
	/** 0 = exact, 1 = case-insensitive, 2 = substring. */
	tier: 0 | 1 | 2;
	outOfScope: boolean;
}

const CONTAINER_KINDS = new Set<SymbolKind>(["class", "interface", "enum", "struct", "trait", "module"]);

/** Resolution priority: types first, then constructors/callables, then data. */
const KIND_ORDER: SymbolKind[] = [
	"interface", "class", "struct", "trait", "enum", "module", "type",
	"constructor", "method", "function", "macro",
	"field", "variable", "constant", "enum_member",
];

export function kindRank(kind: SymbolKind): number {
	const i = KIND_ORDER.indexOf(kind);
	return i === -1 ? KIND_ORDER.length : i;
}

interface Candidate {
	symbol: Symbol;
	tier: 0 | 1 | 2;
	exactCase: boolean;
}

/** `com.example.UserService` / `com.example.UserService.findUser`; undefined without a package. */
function packageQualifiedName(s: Symbol): string | undefined {
	if (!s.packageName) return undefined;
	const member = s.containerName && s.containerName !== s.name ? `${s.containerName}.${s.name}` : s.name;
	return `${s.packageName}.${member}`;
}

function collectCandidates(graph: CodeGraph, query: string): Candidate[] {
	const seen = new Set<string>();
	const out: Candidate[] = [];
	const push = (syms: Symbol[], tier: 0 | 1 | 2) => {
		for (const s of syms) {
			if (seen.has(s.id)) continue;
			seen.add(s.id);
			out.push({ symbol: s, tier, exactCase: s.name === query || packageQualifiedName(s) === query });
		}
	};
	const lower = query.toLowerCase();
	push(graph.symbol(query), 0);
	push(graph.find(query).list().filter((s) => s.name.toLowerCase() === lower), 1);
	push(graph.find(query).list(), 2);
	// Package-qualified matches: `com.example.UserService` or `com.example.UserService.findUser`.
	push(graph.symbols.filter((s) => packageQualifiedName(s) === query), 0);
	push(graph.symbols.filter((s) => packageQualifiedName(s)?.toLowerCase() === lower), 1);
	out.sort(
		(a, b) =>
			a.tier - b.tier ||
			(b.exactCase ? 1 : 0) - (a.exactCase ? 1 : 0) ||
			kindRank(a.symbol.kind) - kindRank(b.symbol.kind) ||
			a.symbol.location.nameRange.start.line - b.symbol.location.nameRange.start.line ||
			a.symbol.file.localeCompare(b.symbol.file),
	);
	return out;
}

/** Resolve `Container.member` (optionally nested) to the member symbol. */
function resolveQualified(graph: CodeGraph, query: string, scope: Scope, root?: string): ResolvedSymbol | null {
	const dot = query.lastIndexOf(".");
	if (dot <= 0 || dot >= query.length - 1) return null;
	const containerPart = query.slice(0, dot);
	const memberPart = query.slice(dot + 1);

	let container: Symbol | undefined;
	let outOfScope = false;
	const nested = resolveQualified(graph, containerPart, scope, root);
	if (nested) {
		container = nested.primary;
		outOfScope = nested.outOfScope;
	} else {
		const c = collectCandidates(graph, containerPart).find(
			(cand) => CONTAINER_KINDS.has(cand.symbol.kind),
		);
		if (c) {
			container = c.symbol;
			outOfScope = !inScope(c.symbol.file, scope, c.symbol.containerName, root);
		}
	}
	if (!container) return null;

	const member = graph.members(container.name).list().find(
		(m) => m.name.toLowerCase() === memberPart.toLowerCase() && m.packageName === container.packageName,
	);
	if (!member) return null;
	return {
		primary: member,
		others: [],
		tier: member.name === memberPart ? 0 : 1,
		outOfScope: outOfScope || !inScope(member.file, scope, member.containerName, root),
	};
}

/** Best-match symbol for a name; `null` when nothing matches. */
export function resolveSymbol(graph: CodeGraph, query: string, scope: Scope, root?: string): ResolvedSymbol | null {
	// Accept Rust's `::` (e.g. `TadoIncomingDataSource::new`) as the member separator.
	const q = query.trim().replace(/^@/, "").replace(/::/g, ".");
	if (!q) return null;

	const qualified = resolveQualified(graph, q, scope, root);
	if (qualified) return qualified;

	const candidates = collectCandidates(graph, q);
	if (candidates.length === 0) return null;
	const scoped = candidates.filter((c) => inScope(c.symbol.file, scope, c.symbol.containerName, root));
	const primary = scoped[0] ?? candidates[0];
	const others = candidates
		.filter((c) => c.symbol.id !== primary.symbol.id)
		.filter((c) => inScope(c.symbol.file, scope, c.symbol.containerName, root))
		.filter((c) => c.symbol.name.toLowerCase().includes(q.toLowerCase()))
		.map((c) => c.symbol);
	return { primary: primary.symbol, others, tier: primary.tier, outOfScope: scoped.length === 0 };
}

/** Files matching a query: exact/basename match first, then substring. */
export function findFiles(graph: CodeGraph, query: string): string[] {
	const norm = query.replace(/\\/g, "/").replace(/^\.?\/+/, "").replace(/\/+$/, "").toLowerCase();
	const files = graph.files;
	const basename = (f: string) => f.split("/").pop()!.toLowerCase();
	const exact = files.filter((f) => basename(f) === norm || f.toLowerCase().endsWith("/" + norm));
	if (exact.length > 0) return exact;
	return files.filter((f) => f.toLowerCase().includes(norm));
}
