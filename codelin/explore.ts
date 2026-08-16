import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { getGraph, type CgInstance, type CgNode, type CgEdge } from "./backend.ts";

const MAX_SYMBOLS = 5;
const MAX_BODY_LINES = 200;
const MAX_FILE_LINES = 2000;
const MAX_OUTPUT_CHARS = 40000;

const CONTAINER_KINDS = new Set([
	"class", "interface", "struct", "trait", "protocol", "enum", "union", "module", "namespace", "component",
]);

/** Node kinds that are bookkeeping, not symbols the agent wants source for. */
const NON_SYMBOL_KINDS = new Set(["file", "import", "export"]);

const FLOW_SEPARATORS = new Set([
	"to", "->", "→", "⇒", "into", "reaches", "reach", "flow", "path", "through", "via",
]);

/** Read-parity line numbers: `<n>\t<line>`, no padding — same shape as the read tool. */
function numberLines(code: string, startLine: number): string {
	return code
		.replace(/\n$/, "")
		.split("\n")
		.map((line, i) => `${startLine + i}\t${line}`)
		.join("\n");
}

function edgeLabel(e: CgEdge): string | null {
	if (e.kind === "calls") return null;
	if (e.metadata?.fnRef === true) return "callback registration";
	if (e.kind === "instantiates") return "instantiation";
	if (e.kind === "references") return "reference";
	if (e.kind === "imports") return "import";
	return e.kind;
}

function nodeLoc(n: CgNode): string {
	return n.kind === "file" ? n.filePath : `${n.name} (${n.filePath}:${n.startLine})`;
}

function fmtEdge(e: { node: CgNode; edge: CgEdge }): string {
	const label = edgeLabel(e.edge);
	return label ? `${nodeLoc(e.node)} [${label}]` : nodeLoc(e.node);
}

function renderTrail(cg: CgInstance, node: CgNode, withImpact: boolean): string {
	const lines: string[] = [];

	const callees = cg.getCallees(node.id, 1);
	const calls = callees.filter((e) => e.edge.kind === "calls").slice(0, 8);
	const refs = callees.filter((e) => e.edge.kind !== "calls").slice(0, 8);
	if (calls.length > 0) lines.push(`Calls → ${calls.map((e) => nodeLoc(e.node)).join(", ")}`);
	if (refs.length > 0) lines.push(`References → ${refs.map(fmtEdge).join(", ")}`);

	const callers = cg.getCallers(node.id, 1);
	const calledBy = callers.filter((e) => e.edge.kind === "calls").slice(0, 8);
	const usedBy = callers.filter((e) => e.edge.kind !== "calls").slice(0, 8);
	if (calledBy.length > 0) lines.push(`Called by ← ${calledBy.map((e) => nodeLoc(e.node)).join(", ")}`);
	if (usedBy.length > 0) lines.push(`Used by ← ${usedBy.map(fmtEdge).join(", ")}`);

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

async function renderSymbol(cg: CgInstance, node: CgNode, withImpact: boolean): Promise<string> {
	const loc = node.endLine && node.endLine !== node.startLine ? `:${node.startLine}-${node.endLine}` : `:${node.startLine}`;
	const parts: string[] = [`**${node.name}** (${node.kind}) — ${node.filePath}${loc}`];

	if (node.signature) parts.push(`\`${node.signature}\``);

	if (CONTAINER_KINDS.has(node.kind)) {
		const children = cg.getChildren(node.id)
			.filter((c) => c.kind !== "import" && c.kind !== "export")
			.sort((a, b) => a.startLine - b.startLine);
		if (children.length > 0) {
			parts.push(`Members (${children.length}):`);
			for (const c of children.slice(0, 50)) {
				const sig = c.signature ? ` — \`${c.signature.replace(/\s+/g, " ").trim()}\`` : "";
				parts.push(`- \`${c.name}\` (${c.kind}) :${c.startLine}${sig}`);
			}
			if (children.length > 50) parts.push(`- … +${children.length - 50} more`);
		} else {
			// Some containers (e.g. small TS interfaces) have no indexed children —
			// fall back to their own source so the answer is still Read-equivalent.
			const code = await cg.getCode(node.id);
			if (code) parts.push(...renderBody(node, code));
		}
	} else {
		const code = await cg.getCode(node.id);
		if (code) parts.push(...renderBody(node, code));
	}

	const trail = renderTrail(cg, node, withImpact);
	if (trail) parts.push(trail);

	return parts.join("\n");
}

function segmentSearch(cg: CgInstance, words: string[]): CgNode[] {
	const out: CgNode[] = [];
	for (const m of cg.getSegmentMatches(words, 6)) {
		for (const n of cg.getNodesByName(m.name)) out.push(n);
	}
	return out.filter((n) => !NON_SYMBOL_KINDS.has(n.kind));
}

function searchSymbols(cg: CgInstance, query: string): CgNode[] {
	const exact = cg.getNodesByName(query).filter((n) => !NON_SYMBOL_KINDS.has(n.kind));
	if (exact.length > 0) return exact;

	const words = query.split(/[^A-Za-z0-9_]+/).filter((w) => w.length >= 2);

	// Natural-language queries (≥2 words): map prose words onto the repo's own
	// symbol names via segment co-occurrence. This runs BEFORE the FTS text
	// search because FTS prefix-matches each prose token across
	// names/signatures/docstrings (e.g. "data" matches DataFrame methods) and a
	// non-empty result would otherwise mask these better, name-derived matches.
	// recallWords adds stemmed forms ("planning" → "plan") to the segment lookup.
	if (words.length >= 2) return segmentSearch(cg, recallWords(query));

	// Single-token symbol-ish query: fuzzy text search.
	return cg.searchNodes(query, { limit: 10 })
		.map((h) => h.node)
		.filter((n) => !NON_SYMBOL_KINDS.has(n.kind));
}

/** Strip a common inflectional suffix, then collapse a doubled consonant. */
function stemWord(w: string): string {
	let out = w;
	let stripped = false;
	if (out.endsWith("ing") && out.length >= 7) { out = out.slice(0, -3); stripped = true; }
	else if (out.endsWith("ed") && out.length >= 6) { out = out.slice(0, -2); stripped = true; }
	else if (out.endsWith("es") && out.length >= 6) { out = out.slice(0, -2); stripped = true; }
	else if (out.endsWith("s") && out.length >= 5 && !out.endsWith("ss")) { out = out.slice(0, -1); stripped = true; }
	// planning → plann → plan, running → runn → run (only after a suffix strip)
	if (stripped && out.length >= 3) {
		const last = out[out.length - 1];
		if (last === out[out.length - 2] && !/[aeiou]/.test(last)) out = out.slice(0, -1);
	}
	return out;
}

/** Prose words plus their stemmed forms, for segment-based recall. */
export function recallWords(query: string): string[] {
	const words = query.split(/[^A-Za-z0-9_]+/).map((w) => w.toLowerCase()).filter((w) => w.length >= 2);
	const out = new Set<string>();
	for (const w of words) {
		out.add(w);
		const stem = stemWord(w);
		if (stem !== w && stem.length >= 3) out.add(stem);
	}
	return [...out];
}

/** Broad recall for the planner: segment co-occurrence + FTS, deduped and capped. */
function buildCandidates(cg: CgInstance, query: string): CgNode[] {
	const out: CgNode[] = [];
	for (const m of cg.getSegmentMatches(recallWords(query), 24)) {
		for (const n of cg.getNodesByName(m.name)) out.push(n);
	}
	for (const h of cg.searchNodes(query, { limit: 15 })) out.push(h.node);
	return dedupe(out).filter((n) => !NON_SYMBOL_KINDS.has(n.kind)).slice(0, 40);
}

/** Look up exact symbol names selected by the planner. */
function nodesByName(cg: CgInstance, names: string[]): CgNode[] {
	const out: CgNode[] = [];
	for (const name of names) {
		for (const n of cg.getNodesByName(name)) {
			if (!NON_SYMBOL_KINDS.has(n.kind)) out.push(n);
		}
	}
	return dedupe(out);
}

/** The model sometimes echoes the whole `name (kind)` line — keep only the name. */
function parseSelectedNames(selected: string): string[] {
	return selected.split(",").map((s) => s.replace(/\s*\([^)]*\)\s*$/, "").trim()).filter(Boolean);
}

function plannerPrompt(query: string, candidates: CgNode[]): string {
	const list = candidates.map((n) => `- ${n.name} (${n.kind})`).join("\n");
	return `${query}\nCandidate symbols:\n${list}`;
}

type QueryPlanIntent = "symbol" | "path" | "none";
type QueryPlan = { intent: QueryPlanIntent; selected: string; reasoning: string };

const NL_INTENTS: ReadonlySet<string> = new Set(["symbol", "path", "none"]);

/** Ask the optional on-device planner (Apple FoundationModels) to pick symbols. */
function queryPlan(prompt: string): QueryPlan | null {
	const bin = process.env.CODELIN_NL_QUERY?.trim() || "nl-query";
	let raw: string;
	try {
		raw = execFileSync(bin, ["--json", prompt], {
			encoding: "utf8",
			maxBuffer: 64 * 1024,
			timeout: 10000,
			stdio: ["ignore", "pipe", "ignore"],
		});
	} catch {
		return null;
	}
	try {
		const obj = JSON.parse(raw) as Record<string, unknown>;
		if (typeof obj.intent !== "string" || !NL_INTENTS.has(obj.intent)) return null;
		return {
			intent: obj.intent as QueryPlanIntent,
			selected: typeof obj.selected === "string" ? obj.selected : "",
			reasoning: typeof obj.reasoning === "string" ? obj.reasoning : "",
		};
	} catch {
		return null;
	}
}

function dedupe(nodes: CgNode[]): CgNode[] {
	const seen = new Set<string>();
	return nodes.filter((n) => (seen.has(n.id) ? false : (seen.add(n.id), true)));
}

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
	const nodes = cg.getNodesInFile(filePath)
		.filter((n) => n.kind !== "file" && n.kind !== "import" && n.kind !== "export")
		.sort((a, b) => a.startLine - b.startLine);
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
	if (truncated) {
		out.push(`(first ${MAX_FILE_LINES} of ${lines.length} lines — narrow with a symbol instead)`);
	}
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
		return "(no matches)"; // rg missing (ENOENT) or exits 1 on zero matches
	}

	const lines = raw.trimEnd().split("\n").filter(Boolean).slice(0, 200);
	if (lines.length === 0) return "(no matches)";
	return `Literal matches (${lines.length} shown):\n${lines.join("\n")}`;
}

function nodeNamed(cg: CgInstance, token: string): CgNode | undefined {
	const exact = cg.getNodesByName(token).find((n) => !NON_SYMBOL_KINDS.has(n.kind));
	if (exact) return exact;
	const lower = token.toLowerCase();
	const hit = cg.searchNodes(token, { limit: 1 })[0];
	if (hit && hit.node.name.toLowerCase() === lower && !NON_SYMBOL_KINDS.has(hit.node.kind)) {
		return hit.node;
	}
	return undefined;
}

/** Detect "how does A reach B"-style queries: two symbol names plus a separator. */
function extractFlowTargets(cg: CgInstance, query: string): [CgNode, CgNode] | null {
	const tokens = query.split(/[^A-Za-z0-9_]+/).filter(Boolean);
	if (tokens.length < 2) return null;

	const named: CgNode[] = [];
	for (const t of tokens) {
		const n = nodeNamed(cg, t);
		if (n && !named.some((x) => x.id === n.id)) named.push(n);
	}
	if (named.length < 2) return null;

	const hasSep = tokens.some((t) => FLOW_SEPARATORS.has(t.toLowerCase()));
	if (hasSep || tokens.length <= 3) return [named[0], named[1]];
	return null;
}

async function renderTrace(cg: CgInstance, from: CgNode, to: CgNode): Promise<string> {
	const edgeKinds = ["calls", "references", "instantiates"];
	const path = cg.findPath(from.id, to.id, edgeKinds) ?? cg.findPath(to.id, from.id, edgeKinds);
	if (!path || path.length < 2) {
		// No static path — common in event-driven code (subscribe/emit wiring isn't
		// in the call graph). Still return the endpoints so the answer isn't a dead end.
		const note = `No static call path between ${from.name} (${from.filePath}:${from.startLine}) and ${to.name} (${to.filePath}:${to.startLine}) — the wiring may be runtime (event bus / subscribe).`;
		return capOutput([note, "", await renderSymbol(cg, from, false), "", await renderSymbol(cg, to, false)].join("\n"));
	}

	const hops = path.map((h) => `${h.node.name} (${h.node.filePath}:${h.node.startLine})`);
	const lines: string[] = [`Call path (${path.length - 1} hop(s)):`, hops.join("\n  → "), ""];
	lines.push(await renderSymbol(cg, path[0].node, false));
	lines.push(await renderSymbol(cg, path[path.length - 1].node, false));
	return capOutput(lines.join("\n"));
}

function capOutput(text: string): string {
	if (text.length <= MAX_OUTPUT_CHARS) return text;
	const cut = text.slice(0, MAX_OUTPUT_CHARS);
	const boundary = cut.lastIndexOf("\n\n");
	const safe = boundary > MAX_OUTPUT_CHARS * 0.5 ? cut.slice(0, boundary) : cut.slice(0, cut.lastIndexOf("\n"));
	return safe + `\n\n… (output truncated to budget; re-query with a more specific name for the remainder)`;
}

async function renderSymbols(cg: CgInstance, symbols: CgNode[]): Promise<string> {
	const shown = symbols.slice(0, MAX_SYMBOLS);
	const sections: string[] = [];
	for (let i = 0; i < shown.length; i++) {
		sections.push(await renderSymbol(cg, shown[i], i === 0));
	}
	const head = symbols.length > MAX_SYMBOLS
		? `Found ${symbols.length} symbols; showing ${shown.length}.`
		: `Found ${symbols.length} symbol(s).`;
	return capOutput([head, "", sections.join("\n\n---\n\n")].join("\n"));
}

async function renderFileQuery(cg: CgInstance, q: string, root: string): Promise<string | null> {
	const files = findFiles(cg, q);
	if (files.length === 1) return capOutput(renderFile(cg, files[0], root));
	if (files.length > 1) {
		const listed = files.slice(0, 20).map((f) => `- ${f}`).join("\n");
		const more = files.length > 20 ? `\n- … +${files.length - 20} more` : "";
		return `"${q}" matches ${files.length} files — narrow the path:\n${listed}${more}`;
	}
	return null;
}

/**
 * One entry point for finding and reading code. Resolves a query to symbols
 * (with source + call trail), a file (Read-parity), or a literal text match.
 */
export async function explore(root: string, query: string): Promise<string> {
	const cg = await getGraph(root);
	const q = query.trim().replace(/^@/, "");
	if (!q) return "(empty query)";

	const flow = extractFlowTargets(cg, q);
	if (flow) return await renderTrace(cg, flow[0], flow[1]);

	// Optional on-device query planner (Apple FoundationModels), DISABLED by
	// default — opt in with CODELIN_NL_ENABLED=1 and a built nl-query binary.
	// Only prose is sent; symbol/file/literal fast-paths stay deterministic.
	if (/\s/.test(q) && process.env.CODELIN_NL_ENABLED === "1") {
		const candidates = buildCandidates(cg, q);
		if (candidates.length > 0) {
			const plan = queryPlan(plannerPrompt(q, candidates));
			if (plan?.selected) {
				const selected = nodesByName(cg, parseSelectedNames(plan.selected));
				if (selected.length >= 2 && plan.intent === "path") {
					return await renderTrace(cg, selected[0], selected[1]);
				}
				if (selected.length > 0) {
					return await renderSymbols(cg, selected);
				}
			}
		}
	}

	const symbols = dedupe(searchSymbols(cg, q));
	if (symbols.length > 0) return await renderSymbols(cg, symbols);

	const fileOut = await renderFileQuery(cg, q, root);
	if (fileOut) return fileOut;

	// No symbol or file: fall back to a literal text search (single tokens only —
	// a prose question that matched nothing is better answered with a symbol name).
	if (!/\s/.test(q)) {
		return rgFallback(root, q);
	}
	return `No indexed symbol or file matches "${q}". Try a symbol name, file path, or a single literal term.`;
}
