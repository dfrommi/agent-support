import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { getGraph, type CgInstance, type CgNode, type CgEdge } from "./backend.ts";

// ── Budgets ────────────────────────────────────────────────────────────────

const MAX_BODY_LINES = 200;
const MAX_FILE_LINES = 2000;
const MAX_OUTPUT_CHARS = 40000;
const MAX_NEIGHBORS = 8;
const MAX_OTHER_MATCHES = 10;
const MAX_ROUTES = 30; // route endpoints enumerated for @http
const MAX_PATHS = 20; // distinct endpoint→symbol paths rendered
const MAX_TRAVERSE_NODES = 200; // per expansion traversal
const MAX_EXPAND_SHOWN = 60; // nodes shown in an expansion

// ── Kinds & scope ──────────────────────────────────────────────────────────

/** Node kinds that are bookkeeping, not symbols the agent wants source for. */
const NON_SYMBOL_KINDS = new Set(["file", "import", "export"]);

/** Types that contain members; member names get a `Container.name` prefix. */
const CONTAINER_KINDS = new Set([
	"class", "interface", "struct", "trait", "protocol", "enum", "union", "module", "namespace", "component",
]);

/** Resolution priority: types first, then callables, then data, then params. */
const KIND_ORDER = [
	"interface", "class", "struct", "trait", "protocol", "enum", "type_alias", "component", "union",
	"function", "method", "property", "field", "variable", "constant", "parameter",
];

const FORWARD_EDGE_KINDS = new Set(["calls", "references", "instantiates"]);
const TYPE_EDGE_KINDS = new Set(["extends", "implements"]);

export type Scope = "main" | "test" | "all";

function kindRank(kind: string): number {
	const i = KIND_ORDER.indexOf(kind);
	return i === -1 ? KIND_ORDER.length : i;
}

function isSymbolNode(n: CgNode): boolean {
	return !NON_SYMBOL_KINDS.has(n.kind);
}

function isTestPath(fp: string): boolean {
	if (/(^|\/)(test|tests|testcomponent|componenttest|__tests__|__mocks__|spec)\//i.test(fp)) return true;
	const base = path.posix.basename(fp);
	return /(Test|Tests|Spec|IT|ITCase|TestCase)\.[A-Za-z0-9]+$/.test(base);
}

function isGeneratedPath(fp: string): boolean {
	return /(^|\/)generated\//i.test(fp);
}

function inScope(fp: string, scope: Scope): boolean {
	if (scope === "all") return true;
	if (scope === "main") return !isTestPath(fp) && !isGeneratedPath(fp);
	if (scope === "test") return isTestPath(fp) && !isGeneratedPath(fp);
	return true;
}

// ── Formatting helpers ──────────────────────────────────────────────────────

/** Read-parity line numbers: `<n>\t<line>`, no padding — same shape as read. */
function numberLines(code: string, startLine: number): string {
	return code
		.replace(/\n$/, "")
		.split("\n")
		.map((line, i) => `${startLine + i}\t${line}`)
		.join("\n");
}

/** `Container.name` for members, so `createProduct` reads as `CatalogService.createProduct`. */
function displayName(cg: CgInstance, n: CgNode): string {
	if (n.kind === "route" || CONTAINER_KINDS.has(n.kind)) return n.name;
	for (const a of cg.getAncestors(n.id)) {
		if (CONTAINER_KINDS.has(a.kind)) return `${a.name}.${n.name}`;
	}
	return n.name;
}

function capOutput(text: string): string {
	if (text.length <= MAX_OUTPUT_CHARS) return text;
	const cut = text.slice(0, MAX_OUTPUT_CHARS);
	const boundary = cut.lastIndexOf("\n\n");
	const safe = boundary > MAX_OUTPUT_CHARS * 0.5 ? cut.slice(0, boundary) : cut.slice(0, cut.lastIndexOf("\n"));
	return safe + `\n\n… (output truncated to budget; re-query with a more specific name for the remainder)`;
}

// ── Edge evidence ───────────────────────────────────────────────────────────

/** A hop's relationship is "direct" unless codegraph resolved it by inference. */
function isInferredEdge(e: CgEdge): boolean {
	const m = e.metadata;
	if (!m) return false;
	if (typeof m.synthesizedBy === "string") return true; // interface-impl dispatch
	if (m.resolvedBy === "framework" || m.resolvedBy === "fuzzy") return true;
	return false;
}

/** Direct/confidence label for a hop: the edge kind plus how it was resolved. */
function hopLabel(e: CgEdge, inferred: boolean): string {
	const m = e.metadata;
	const c = typeof m?.confidence === "number" ? m.confidence : undefined;
	if (m?.synthesizedBy === "interface-impl") return "inferred · interface dispatch";
	if (inferred) return e.kind === "implements" ? "inferred · interface→impl" : "inferred · type dispatch";
	if (m?.resolvedBy === "framework") return `inferred · framework${c !== undefined ? ` ${c.toFixed(2)}` : ""}`;
	if (m?.resolvedBy === "fuzzy") return `low${c !== undefined ? ` ${c.toFixed(2)}` : ""}`;
	if (c !== undefined && c < 0.9) return `medium · ${c.toFixed(2)}`;
	return "high";
}

// ── Symbol resolution ───────────────────────────────────────────────────────

interface Candidate {
	node: CgNode;
	tier: 0 | 1 | 2 | 3; // exact | case-insensitive | substring | fuzzy
	exactCase: boolean;
}

function collectCandidates(cg: CgInstance, query: string): Candidate[] {
	const seen = new Set<string>();
	const out: Candidate[] = [];
	const push = (nodes: CgNode[], tier: 0 | 1 | 2 | 3) => {
		for (const n of nodes) {
			if (!isSymbolNode(n) || seen.has(n.id)) continue;
			seen.add(n.id);
			out.push({ node: n, tier, exactCase: n.name === query });
		}
	};
	const lower = query.toLowerCase();
	push(cg.getNodesByName(query), 0);
	push(cg.getNodesByNameSubstring(query, { limit: 60 }).filter((n) => n.name.toLowerCase() === lower), 1);
	push(cg.getNodesByNameSubstring(query, { limit: 60 }), 2);
	if (!/\s/.test(query)) push(cg.searchNodes(query, { limit: 20 }).map((h) => h.node), 3);
	out.sort(
		(a, b) =>
			a.tier - b.tier ||
			(b.exactCase ? 1 : 0) - (a.exactCase ? 1 : 0) ||
			kindRank(a.node.kind) - kindRank(b.node.kind) ||
			a.node.startLine - b.node.startLine ||
			a.node.filePath.localeCompare(b.node.filePath),
	);
	return out;
}

/**
 * Resolve a member-qualified query (`Container.member`, optionally nested like
 * `Outer.Inner.member`) to the member node, or `null` when the query has no
 * qualifying dot or doesn't resolve. The container must be a type/namespace
 * (CONTAINER_KINDS) and is matched case-insensitively via the normal candidate
 * ranking with the fuzzy tier excluded; the member is a direct child.
 */
function resolveQualified(
	cg: CgInstance,
	query: string,
	scope: Scope,
): { node: CgNode; tier: 0 | 1; outOfScope: boolean } | null {
	const dot = query.lastIndexOf(".");
	if (dot <= 0 || dot >= query.length - 1) return null;
	const containerPart = query.slice(0, dot);
	const memberPart = query.slice(dot + 1);

	let container: CgNode | undefined;
	let outOfScope = false;
	const nested = resolveQualified(cg, containerPart, scope);
	if (nested) {
		container = nested.node;
		outOfScope = nested.outOfScope;
	} else {
		const c = collectCandidates(cg, containerPart).find(
			(cand) => cand.tier <= 2 && CONTAINER_KINDS.has(cand.node.kind),
		);
		if (c) {
			container = c.node;
			outOfScope = !inScope(c.node.filePath, scope);
		}
	}
	if (!container) return null;

	const member = cg
		.getChildren(container.id)
		.filter(isSymbolNode)
		.find((m) => m.name.toLowerCase() === memberPart.toLowerCase());
	if (!member) return null;
	return {
		node: member,
		tier: member.name === memberPart ? 0 : 1,
		outOfScope: outOfScope || !inScope(member.filePath, scope),
	};
}

/** Best-match symbol for a name, with alternatives; `null` when nothing matches. */
function resolveSymbol(
	cg: CgInstance,
	query: string,
	scope: Scope,
): { primary: CgNode; others: CgNode[]; tier: 0 | 1 | 2 | 3; outOfScope: boolean } | null {
	// Member-qualified form (`Container.member`, optionally nested) wins over a
	// plain lookup of the whole dotted string, which never matches anything.
	const qualified = resolveQualified(cg, query, scope);
	if (qualified) {
		return { primary: qualified.node, others: [], tier: qualified.tier, outOfScope: qualified.outOfScope };
	}
	const candidates = collectCandidates(cg, query);
	if (candidates.length === 0) return null;
	const scoped = candidates.filter((c) => inScope(c.node.filePath, scope));
	const primary = scoped[0] ?? candidates[0]!;
	// Alternatives are in-scope symbols whose SIMPLE name contains the query —
	// members of the primary (`Container.member` via qualified-name match) are noise.
	const others = candidates
		.filter((c) => c.node.id !== primary.node.id)
		.filter((c) => inScope(c.node.filePath, scope))
		.filter((c) => c.node.name.toLowerCase().includes(query.toLowerCase()))
		.map((c) => c.node);
	return { primary: primary.node, others, tier: primary.tier, outOfScope: scoped.length === 0 };
}

/** A container plus its members, so "reach CatalogService" includes its methods. */
function expandRoot(cg: CgInstance, node: CgNode): CgNode[] {
	if (!CONTAINER_KINDS.has(node.kind)) return [node];
	return [node, ...cg.getChildren(node.id).filter(isSymbolNode)];
}

/** Callable members of a container — methods/functions, excluding constructors
 * and data (fields). These are the leaves a "reach <type>" query targets. */
function callableMembers(cg: CgInstance, node: CgNode): CgNode[] {
	return cg.getChildren(node.id).filter(
		(n) => (n.kind === "method" || n.kind === "function") && n.name !== node.name,
	);
}

/** Members of a container target. The declaration node itself is not a leaf:
 * reaching a type means reaching what it does. Falls back to the node when it
 * has no callable members. */
function targetMembers(cg: CgInstance, node: CgNode): CgNode[] {
	if (!CONTAINER_KINDS.has(node.kind)) return [node];
	const members = callableMembers(cg, node);
	return members.length > 0 ? members : [node];
}

// ── Neighborhood & body rendering ───────────────────────────────────────────

function renderBody(node: CgNode, code: string): string[] {
	const lines = code.replace(/\n$/, "").split("\n");
	const truncated = lines.length > MAX_BODY_LINES;
	const numbered = numberLines(lines.slice(0, MAX_BODY_LINES).join("\n"), node.startLine);
	const out = ["```" + (node.language ?? ""), numbered, "```"];
	if (truncated) {
		out.push(`(first ${MAX_BODY_LINES} of ${lines.length} lines — query a member or read the file for the rest)`);
	}
	return out;
}

function neighborText(cg: CgInstance, r: { node: CgNode; edge: CgEdge }, evidenceFile: string): string {
	const label = isInferredEdge(r.edge) ? `${r.edge.kind} (inferred)` : r.edge.kind;
	return `${displayName(cg, r.node)} (${r.node.filePath}:${r.node.startLine}) [${label}]`;
}

async function renderSymbol(cg: CgInstance, node: CgNode, scope: Scope, withImpact: boolean): Promise<string> {
	const locText = node.endLine && node.endLine !== node.startLine ? `:${node.startLine}-${node.endLine}` : `:${node.startLine}`;
	const parts: string[] = [`**${node.name}** (${node.kind}) — ${node.filePath}${locText}`];
	if (node.signature) parts.push(`\`${node.signature}\``);

	if (node.kind === "route") {
		// Routes are entry points, not source-bearing symbols — show the annotation line.
		const code = await cg.getCode(node.id);
		if (code) parts.push(...renderBody(node, code));
	} else if (CONTAINER_KINDS.has(node.kind)) {
		const children = cg.getChildren(node.id).filter(isSymbolNode).sort((a, b) => a.startLine - b.startLine);
		if (children.length > 0) {
			parts.push(`Members (${children.length}):`);
			for (const c of children.slice(0, 50)) {
				const sig = c.signature ? ` — \`${c.signature.replace(/\s+/g, " ").trim()}\`` : "";
				parts.push(`- \`${c.name}\` (${c.kind}) :${c.startLine}${sig}`);
			}
			if (children.length > 50) parts.push(`- … +${children.length - 50} more`);
		} else {
			const code = await cg.getCode(node.id);
			if (code) parts.push(...renderBody(node, code));
		}
	} else {
		const code = await cg.getCode(node.id);
		if (code) parts.push(...renderBody(node, code));
	}

	parts.push(renderNeighborhood(cg, node, scope, withImpact));
	return parts.join("\n");
}

function renderNeighborhood(cg: CgInstance, node: CgNode, scope: Scope, withImpact: boolean): string {
	const ctx = cg.getContext(node.id);
	const lines: string[] = [];
	const scopeNode = (n: CgNode) => inScope(n.filePath, scope);

	const out = ctx.outgoingRefs.filter((r) => isSymbolNode(r.node) && scopeNode(r.node));
	const calls = out.filter((r) => r.edge.kind === "calls").slice(0, MAX_NEIGHBORS);
	const refs = out.filter((r) => r.edge.kind === "references").slice(0, MAX_NEIGHBORS);
	const inst = out.filter((r) => r.edge.kind === "instantiates").slice(0, MAX_NEIGHBORS);
	const types = out.filter((r) => TYPE_EDGE_KINDS.has(r.edge.kind)).slice(0, MAX_NEIGHBORS);
	if (calls.length > 0) lines.push(`Calls → ${calls.map((r) => neighborText(cg, r, node.filePath)).join(", ")}`);
	if (refs.length > 0) lines.push(`References → ${refs.map((r) => neighborText(cg, r, node.filePath)).join(", ")}`);
	if (inst.length > 0) lines.push(`Instantiates → ${inst.map((r) => neighborText(cg, r, node.filePath)).join(", ")}`);
	if (types.length > 0) lines.push(`Extends/Implements → ${types.map((r) => neighborText(cg, r, node.filePath)).join(", ")}`);

	const inn = ctx.incomingRefs.filter((r) => isSymbolNode(r.node) && scopeNode(r.node));
	const calledBy = inn.filter((r) => r.edge.kind === "calls").slice(0, MAX_NEIGHBORS);
	const usedBy = inn.filter((r) => r.edge.kind === "references" || r.edge.kind === "instantiates").slice(0, MAX_NEIGHBORS);
	const implBy = inn.filter((r) => TYPE_EDGE_KINDS.has(r.edge.kind)).slice(0, MAX_NEIGHBORS);
	if (calledBy.length > 0) lines.push(`Called by ← ${calledBy.map((r) => neighborText(cg, r, r.node.filePath)).join(", ")}`);
	if (usedBy.length > 0) lines.push(`Used by ← ${usedBy.map((r) => neighborText(cg, r, r.node.filePath)).join(", ")}`);
	if (implBy.length > 0) lines.push(`Implemented/Extended by ← ${implBy.map((r) => neighborText(cg, r, r.node.filePath)).join(", ")}`);

	if (withImpact) {
		try {
			const impact = cg.getImpactRadius(node.id, 2);
			const impacted = [...impact.nodes.values()].filter((n) => n.id !== node.id);
			if (impacted.length > 0) {
				const files = new Set(impacted.map((n) => n.filePath));
				lines.push(`Impact: ${impacted.length} dependent(s) across ${files.size} file(s)`);
			}
		} catch { /* impact is best-effort */ }
	}
	return lines.join("\n");
}

// ── File & literal fallback ─────────────────────────────────────────────────

function findFiles(cg: CgInstance, query: string): string[] {
	const norm = query.toLowerCase().replace(/\\/g, "/").replace(/^\.?\/+/, "").replace(/\/+$/, "");
	const files = cg.getFiles().map((f) => f.path);
	const exact = files.filter((f) => f.toLowerCase() === norm);
	if (exact.length > 0) return exact;
	const basename = files.filter((f) => path.posix.basename(f).toLowerCase() === norm);
	if (basename.length > 0) return basename;
	return files.filter((f) => f.toLowerCase().includes(norm));
}

function fileLanguage(filePath: string): string {
	const ext = path.extname(filePath).slice(1);
	if (!ext) return "";
	const map: Record<string, string> = {
		ts: "typescript", tsx: "tsx", js: "javascript", jsx: "jsx",
		java: "java", rs: "rust", py: "python", go: "go", rb: "ruby",
		php: "php", cs: "csharp", c: "c", cpp: "cpp", h: "c", hpp: "cpp",
		swift: "swift", kt: "kotlin", scala: "scala", dart: "dart",
	};
	return map[ext] ?? ext;
}

function renderFile(cg: CgInstance, filePath: string, root: string): string {
	const nodes = cg.getNodesInFile(filePath).filter((n) => n.kind !== "file" && n.kind !== "import" && n.kind !== "export").sort((a, b) => a.startLine - b.startLine);
	const dependents = cg.getFileDependents(filePath);
	const depSummary = dependents.length > 0
		? `used by ${dependents.length} file(s): ${dependents.slice(0, 8).join(", ")}${dependents.length > 8 ? `, +${dependents.length - 8} more` : ""}`
		: "no other indexed file depends on it";

	const abs = path.join(root, filePath);
	let content: string;
	try {
		content = fs.readFileSync(abs, "utf8");
	} catch {
		return `**${filePath}** — could not read from disk (moved since indexing?). ${nodes.length} symbol(s) · ${depSummary}`;
	}

	const lines = content.split("\n");
	const truncated = lines.length > MAX_FILE_LINES;
	const numbered = numberLines(lines.slice(0, MAX_FILE_LINES).join("\n"), 1);
	const header = `**${filePath}** — ${lines.length} lines, ${nodes.length} symbol(s) · ${depSummary}`;
	const out = [header, "", "```" + fileLanguage(filePath), numbered, "```"];
	if (truncated) out.push(`(first ${MAX_FILE_LINES} of ${lines.length} lines — narrow with a symbol instead)`);
	return out.join("\n");
}

function rgFallback(root: string, query: string): string {
	let raw: string;
	try {
		raw = execFileSync(
			"rg",
			["--line-number", "--no-heading", "--color", "never", "--fixed-strings", "--max-count", "100", "--", query, root],
			{ encoding: "utf8", maxBuffer: 1024 * 1024, timeout: 8000 },
		);
	} catch {
		return "(no matches)";
	}
	// rg is given the absolute root, so it emits absolute paths — strip that
	// prefix to keep output repo-relative, matching the graph-derived locations.
	const prefix = root.endsWith(path.sep) ? root : root + path.sep;
	const lines = raw
		.trimEnd()
		.split("\n")
		.filter(Boolean)
		.slice(0, 200)
		.map((line) => (line.startsWith(prefix) ? line.slice(prefix.length) : line));
	if (lines.length === 0) return "(no matches)";
	return `Literal matches (${lines.length} shown):\n${lines.join("\n")}`;
}

// ── `code` tool: resolve + immediate neighborhood ───────────────────────────

/**
 * Resolve a query to a symbol (source + call/type neighborhood), a file
 * (Read-parity), or a literal text match. Deterministic dispatch only — no
 * natural-language or flow guessing (those live in `callgraph`).
 */
export async function explore(root: string, query: string, scope: Scope = "all"): Promise<string> {
	const cg = await getGraph(root);
	const q = query.trim().replace(/^@/, "");
	if (!q) return "(empty query)";

	// A whitespace query is either a file path or not a symbol — no prose parsing.
	if (!/\s/.test(q)) {
		const res = resolveSymbol(cg, q, scope);
		if (res) return await renderResolved(cg, res, q, scope);
	}

	const fileOut = renderFileQuery(cg, q, root);
	if (fileOut) return fileOut;

	if (!/\s/.test(q)) return rgFallback(root, q);
	return `No indexed symbol or file matches "${q}". For a call path or reachability question, use callgraph(from=…, to=…). For a symbol or file, give its name or path.`;
}

async function renderResolved(cg: CgInstance, res: { primary: CgNode; others: CgNode[]; tier: 0 | 1 | 2 | 3; outOfScope: boolean }, query: string, scope: Scope): Promise<string> {
	const { primary, others, tier, outOfScope } = res;

	if (tier === 3) {
		// Fuzzy only — don't commit to a body; suggest instead.
		const list = [primary, ...others].slice(0, MAX_OTHER_MATCHES).map((n) => `- ${displayName(cg, n)} (${n.kind}) — ${n.filePath}:${n.startLine}`).join("\n");
		return `No exact match for "${query}". Possible matches:\n${list || "(none)"}`;
	}

	const tierNote = tier === 1 ? " (case-insensitive match)" : tier === 2 ? " (substring match)" : "";
	const scopeNote = outOfScope ? ` (outside scope "${scope}")` : "";
	const body = await renderSymbol(cg, primary, scope, true);
	const note = [tierNote, scopeNote].filter(Boolean).join("");
	const sections = [note ? `${body}\n${note}` : body];

	if (others.length > 0) {
		const shown = others.slice(0, MAX_OTHER_MATCHES);
		sections.push(`Other matches:\n${shown.map((n) => `- ${displayName(cg, n)} (${n.kind}) — ${n.filePath}:${n.startLine}`).join("\n")}${others.length > MAX_OTHER_MATCHES ? `\n- … +${others.length - MAX_OTHER_MATCHES} more` : ""}`);
	}

	return capOutput(sections.join("\n\n"));
}

function renderFileQuery(cg: CgInstance, q: string, root: string): string | null {
	const files = findFiles(cg, q);
	if (files.length === 1) return capOutput(renderFile(cg, files[0]!, root));
	if (files.length > 1) {
		const listed = files.slice(0, 20).map((f) => `- ${f}`).join("\n");
		const more = files.length > 20 ? `\n- … +${files.length - 20} more` : "";
		return `"${q}" matches ${files.length} files — narrow the path:\n${listed}${more}`;
	}
	return null;
}

// ── `callgraph` tool: transitive relations ─────────────────────────────────

export interface CallgraphParams {
	from?: string;
	to?: string;
	maxDepth?: number;
	scope?: Scope;
}

interface Neighbor {
	node: CgNode;
	edge: CgEdge;
	inferred: boolean;
	evidenceFile: string; // file owning the reference site (edge.source's file)
}

/** Forward neighbors: what this node calls/references/instantiates, plus
 * type-dispatch (implementors/subtypes) when it's a type. */
function forwardNeighbors(cg: CgInstance, node: CgNode): Neighbor[] {
	const ctx = cg.getContext(node.id);
	const out: Neighbor[] = [];
	for (const r of ctx.outgoingRefs) {
		if (FORWARD_EDGE_KINDS.has(r.edge.kind) || TYPE_EDGE_KINDS.has(r.edge.kind)) {
			out.push({ node: r.node, edge: r.edge, inferred: isInferredEdge(r.edge), evidenceFile: node.filePath });
		}
	}
	// Interface/class → its implementors/subclasses (reverse implements/extends).
	if (CONTAINER_KINDS.has(node.kind)) {
		for (const r of ctx.incomingRefs) {
			if (TYPE_EDGE_KINDS.has(r.edge.kind)) {
				out.push({ node: r.node, edge: r.edge, inferred: true, evidenceFile: r.node.filePath });
			}
		}
	}
	return out;
}

/** Backward neighbors: who calls/references/instantiates this node. */
function backwardNeighbors(cg: CgInstance, node: CgNode): Neighbor[] {
	const ctx = cg.getContext(node.id);
	const out: Neighbor[] = [];
	for (const r of ctx.incomingRefs) {
		if (FORWARD_EDGE_KINDS.has(r.edge.kind)) {
			out.push({ node: r.node, edge: r.edge, inferred: isInferredEdge(r.edge), evidenceFile: r.node.filePath });
		}
	}
	return out;
}

/** Shortest path from any `froms` seed to any `toIds` target; null when unreachable.
 * Bidirectional BFS: expands the smaller frontier from both ends, so a deep-but-
 * narrow target (`@http` → `CatalogService`) isn't lost in the `@http` fan-out. */
function findPathBetween(
	cg: CgInstance,
	froms: CgNode[],
	toIds: Set<string>,
	barrierIds: Set<string>,
	scope: Scope,
	maxDepth: number,
): { path: { nodes: CgNode[]; edges: (CgEdge | null)[]; inferred: boolean[]; evidence: string[] } | null; hitLimit: boolean } {
	for (const f of froms) {
		if (toIds.has(f.id)) return { path: { nodes: [f], edges: [null], inferred: [false], evidence: [""] }, hitLimit: false };
	}
	const targets = [...toIds].map((id) => cg.getNode(id)).filter((n): n is CgNode => !!n);
	if (targets.length === 0) return { path: null, hitLimit: false };

	const rootIds = new Set(froms.map((f) => f.id));
	const cameFrom = new Map<string, { from: string; edge: CgEdge; inferred: boolean; evidence: string }>();
	const cameTo = new Map<string, { to: string; edge: CgEdge; inferred: boolean; evidence: string }>();
	const fDepth = new Map<string, number>();
	const bDepth = new Map<string, number>();
	const fQueue: Array<{ node: CgNode; depth: number }> = froms.map((f) => ({ node: f, depth: 0 }));
	const bQueue: Array<{ node: CgNode; depth: number }> = targets.map((n) => ({ node: n, depth: 0 }));
	for (const f of froms) fDepth.set(f.id, 0);
	for (const n of targets) bDepth.set(n.id, 0);

	const rebuild = (meetId: string): { nodes: CgNode[]; edges: (CgEdge | null)[]; inferred: boolean[]; evidence: string[] } => {
		const forwardIds: string[] = [meetId];
		let cur = meetId;
		let guard = 0;
		while (!rootIds.has(cur) && guard++ < maxDepth + 2) {
			const step = cameFrom.get(cur)!;
			forwardIds.unshift(step.from);
			cur = step.from;
		}
		const backwardIds: string[] = [];
		cur = meetId;
		guard = 0;
		while (cameTo.has(cur) && guard++ < maxDepth + 2) {
			const step = cameTo.get(cur)!;
			backwardIds.push(step.to);
			cur = step.to;
		}
		const ids = [...forwardIds, ...backwardIds];
		const nodes = ids.map((id) => (rootIds.has(id) ? froms.find((f) => f.id === id)! : cg.getNode(id)!));
		const edges: (CgEdge | null)[] = [null];
		const inferred = [false];
		const evidence = [""];
		const fwdHops = forwardIds.length - 1;
		for (let i = 0; i < ids.length - 1; i++) {
			const s = i < fwdHops ? cameFrom.get(ids[i + 1]!)! : cameTo.get(ids[i]!)!;
			edges.push(s.edge);
			inferred.push(s.inferred);
			evidence.push(s.evidence);
		}
		return { nodes, edges, inferred, evidence };
	};

	while (fQueue.length > 0 && bQueue.length > 0 && fDepth.size + bDepth.size < MAX_TRAVERSE_NODES) {
		if (fQueue.length <= bQueue.length) {
			const { node: cur, depth } = fQueue.shift()!;
			if (depth >= maxDepth) continue;
			for (const nb of forwardNeighbors(cg, cur)) {
				if (!isSymbolNode(nb.node) || fDepth.has(nb.node.id)) continue;
				if (barrierIds.has(nb.node.id)) continue;
				if (!inScope(nb.node.filePath, scope)) continue;
				cameFrom.set(nb.node.id, { from: cur.id, edge: nb.edge, inferred: nb.inferred, evidence: `${nb.evidenceFile}${nb.edge.line ? `:${nb.edge.line}` : ""}` });
				fDepth.set(nb.node.id, depth + 1);
				fQueue.push({ node: nb.node, depth: depth + 1 });
				const bd = bDepth.get(nb.node.id);
				if (bd !== undefined && depth + 1 + bd <= maxDepth) return { path: rebuild(nb.node.id), hitLimit: false };
			}
		} else {
			const { node: cur, depth } = bQueue.shift()!;
			if (depth >= maxDepth) continue;
			for (const nb of backwardNeighbors(cg, cur)) {
				if (!isSymbolNode(nb.node) || bDepth.has(nb.node.id)) continue;
				if (barrierIds.has(nb.node.id)) continue;
				if (!inScope(nb.node.filePath, scope)) continue;
				cameTo.set(nb.node.id, { to: cur.id, edge: nb.edge, inferred: nb.inferred, evidence: `${nb.evidenceFile}${nb.edge.line ? `:${nb.edge.line}` : ""}` });
				bDepth.set(nb.node.id, depth + 1);
				bQueue.push({ node: nb.node, depth: depth + 1 });
				const fd = fDepth.get(nb.node.id);
				if (fd !== undefined && fd + depth + 1 <= maxDepth) return { path: rebuild(nb.node.id), hitLimit: false };
			}
		}
	}
	return { path: null, hitLimit: fDepth.size + bDepth.size >= MAX_TRAVERSE_NODES };
}

function resolveEndpoint(cg: CgInstance, token: string, scope: Scope): { nodes: CgNode[]; error?: string } {
	if (token.startsWith("@")) {
		if (token === "@http") return { nodes: cg.getNodesByKind("route").filter((n) => inScope(n.filePath, scope)).slice(0, MAX_ROUTES) };
		return { nodes: [], error: `Unknown entry-point root "${token}". Supported: @http.` };
	}
	const res = resolveSymbol(cg, token, scope);
	return res ? { nodes: [res.primary] } : { nodes: [] };
}

/** `code`-style transitive-relations tool: path, forward, or backward expansion. */
export async function callgraph(root: string, params: CallgraphParams): Promise<string> {
	const cg = await getGraph(root);
	const scope: Scope = params.scope ?? "all";
	const maxDepth = Math.min(Math.max(params.maxDepth ?? 6, 1), 12);
	const from = params.from?.trim();
	const to = params.to?.trim();

	if (!from && !to) return "callgraph needs at least one of `from` or `to` (e.g. from=\"CatalogService\", to=\"@http\").";

	const fromRes = from ? resolveEndpoint(cg, from, scope) : undefined;
	const toRes = to ? resolveEndpoint(cg, to, scope) : undefined;
	if (fromRes?.error) return fromRes.error;
	if (toRes?.error) return toRes.error;
	if (from && fromRes && fromRes.nodes.length === 0) return `No indexed symbol or entry-point matches from="${from}".`;
	if (to && toRes && toRes.nodes.length === 0) return `No indexed symbol or entry-point matches to="${to}".`;

	if (from && to) return renderPaths(cg, fromRes!.nodes, toRes!.nodes, scope, maxDepth);
	if (from) return renderExpansion(cg, fromRes!.nodes, "down", scope, maxDepth);
	return renderExpansion(cg, toRes!.nodes, "up", scope, maxDepth);
}

async function renderPaths(cg: CgInstance, fromNodes: CgNode[], toNodes: CgNode[], scope: Scope, maxDepth: number): Promise<string> {
	const targets = toNodes.slice(0, 3);
	const sections: string[] = [];
	const seen = new Set<string>();
	const reached = new Set<string>(); // target ids (members or the container itself) reached from some endpoint
	let found = 0;
	let hitLimit = false;

	for (const fn of fromNodes.slice(0, MAX_ROUTES)) {
		const seeds = expandRoot(cg, fn);
		for (const tn of targets) {
			// Each member is its own leaf. Sibling members form a barrier so a path
			// stops at the FIRST member it reaches — an internal call
			// (createProduct → validateProduct) must not surface as a longer trace.
			const members = targetMembers(cg, tn);
			const memberIds = new Set(members.map((m) => m.id));
			for (const leaf of members) {
				if (found >= MAX_PATHS) break;
				const barrier = new Set(memberIds);
				barrier.delete(leaf.id);
				const res = findPathBetween(cg, seeds, new Set([leaf.id]), barrier, scope, maxDepth);
				if (res.hitLimit) hitLimit = true;
				if (!res.path || res.path.nodes.length < 2) continue;
				reached.add(leaf.id);
				const key = res.path.nodes.map((n) => n.id).join(">");
				if (seen.has(key)) continue;
				seen.add(key);
				sections.push(renderPath(cg, fn, leaf, res.path));
				found++;
			}
			if (found >= MAX_PATHS) break;
		}
		if (found >= MAX_PATHS) break;
	}

	if (hitLimit) {
		return `Traversal budget exhausted (${MAX_TRAVERSE_NODES} nodes/search) — result would be incomplete, so none is shown. Narrow the query (a more specific from/to, or a smaller maxDepth).`;
	}

	if (sections.length === 0) {
		const fromLabel = fromNodes.length === 1 ? displayName(cg, fromNodes[0]!) : `"${fromNodes.length} endpoint(s)"`;
		const toLabel = targets.length === 1 ? displayName(cg, targets[0]!) : `"${targets.length} target(s)"`;
		return `No static path between ${fromLabel} and ${toLabel} within depth ${maxDepth}. The wiring may be runtime (event bus, reflection, conditional beans) or the endpoint does not reach the target.`;
	}

	// Call out container members no endpoint reached, so a multi-method target
	// isn't silently reduced to the methods that happen to be wired to HTTP.
	// Only trust `reached` when the enumeration finished (didn't hit MAX_PATHS).
	if (found < MAX_PATHS) {
		const fromLabel = fromNodes.length === 1 ? displayName(cg, fromNodes[0]!) : `"${fromNodes.length} endpoint(s)"`;
		for (const tn of targets) {
			if (!CONTAINER_KINDS.has(tn.kind)) continue;
			const members = callableMembers(cg, tn);
			if (members.length === 0) continue;
			const missing = members.filter((l) => !reached.has(l.id));
			if (missing.length > 0) {
				sections.push(`No path from ${fromLabel} to ${displayName(cg, tn)}.${missing.map((m) => m.name).join(", ")} within depth ${maxDepth}.`);
			}
		}
	}

	return capOutput(sections.join("\n\n---\n\n"));
}

function renderPath(cg: CgInstance, from: CgNode, to: CgNode, path: { nodes: CgNode[]; edges: (CgEdge | null)[]; inferred: boolean[]; evidence: string[] }): string {
	const lines: string[] = [`**${displayName(cg, from)} → ${displayName(cg, to)}** (${path.nodes.length - 1} hop${path.nodes.length - 1 === 1 ? "" : "s"}):`];
	for (let i = 0; i < path.nodes.length; i++) {
		const n = path.nodes[i]!;
		if (i === 0) {
			lines.push(`  ${displayName(cg, n)} (${n.filePath}:${n.startLine})`);
		} else {
			const e = path.edges[i]!;
			const inferred = path.inferred[i]!;
			const ev = path.evidence[i]!;
			lines.push(`    ↓ ${e.kind} · ${ev} · ${hopLabel(e, inferred)}`);
			lines.push(`  ${displayName(cg, n)} (${n.filePath}:${n.startLine})`);
		}
	}
	return lines.join("\n");
}

async function renderExpansion(cg: CgInstance, roots: CgNode[], direction: "down" | "up", scope: Scope, maxDepth: number): Promise<string> {
	const neighborFn = direction === "down" ? forwardNeighbors : backwardNeighbors;
	const seen = new Map<string, { node: CgNode; depth: number; edge?: CgEdge; inferred?: boolean; evidence?: string }>();
	const queue: Array<{ node: CgNode; depth: number }> = [];
	const seed = (n: CgNode, depth: number) => {
		if (!seen.has(n.id)) {
			seen.set(n.id, { node: n, depth });
			queue.push({ node: n, depth });
		}
	};
	for (const r of roots) {
		seed(r, 0);
		if (CONTAINER_KINDS.has(r.kind)) {
			for (const c of cg.getChildren(r.id)) if (isSymbolNode(c)) seed(c, 0);
		}
	}

	while (queue.length > 0 && seen.size < MAX_TRAVERSE_NODES) {
		const { node, depth } = queue.shift()!;
		if (depth >= maxDepth) continue;
		for (const nb of neighborFn(cg, node)) {
			if (!isSymbolNode(nb.node) || seen.has(nb.node.id)) continue;
			if (!inScope(nb.node.filePath, scope)) continue;
			seen.set(nb.node.id, {
				node: nb.node,
				depth: depth + 1,
				edge: nb.edge,
				inferred: nb.inferred,
				evidence: `${nb.evidenceFile}${nb.edge.line ? `:${nb.edge.line}` : ""}`,
			});
			queue.push({ node: nb.node, depth: depth + 1 });
		}
	}

	const label = direction === "down" ? "reaches" : "is reached by";
	const rootLabel = roots.map((r) => displayName(cg, r)).join(", ");
	const byDepth = new Map<number, CgNode[]>();
	for (const { node, depth } of seen.values()) {
		if (depth === 0) continue;
		if (!byDepth.has(depth)) byDepth.set(depth, []);
		byDepth.get(depth)!.push(node);
	}

	const lines: string[] = [`**${rootLabel}** ${label} (depth ≤ ${maxDepth}):`];
	let shown = 0;
	for (const depth of [...byDepth.keys()].sort((a, b) => a - b)) {
		if (shown >= MAX_EXPAND_SHOWN) break;
		const nodes = byDepth.get(depth)!;
		lines.push(`depth ${depth}:`);
		for (const n of nodes) {
			if (shown >= MAX_EXPAND_SHOWN) break;
			const s = seen.get(n.id)!;
			const kind = s.edge ? `${s.edge.kind} · ${hopLabel(s.edge, s.inferred ?? false)}` : undefined;
			lines.push(`  ${displayName(cg, n)} (${n.filePath}:${n.startLine})${kind ? ` [${kind}]` : ""}`);
			shown++;
		}
	}
	if (seen.size >= MAX_TRAVERSE_NODES) lines.push(`(traversal capped at ${MAX_TRAVERSE_NODES} nodes — narrow with from/to or maxDepth)`);
	if (byDepth.size === 0) lines.push(`  (no ${direction === "down" ? "outgoing" : "incoming"} relationships indexed)`);
	return capOutput(lines.join("\n"));
}
