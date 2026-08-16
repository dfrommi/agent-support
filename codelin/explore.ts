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

function searchSymbols(cg: CgInstance, query: string): CgNode[] {
	const exact = cg.getNodesByName(query).filter((n) => !NON_SYMBOL_KINDS.has(n.kind));
	if (exact.length > 0) return exact;

	const hits = cg.searchNodes(query, { limit: 10 })
		.map((h) => h.node)
		.filter((n) => !NON_SYMBOL_KINDS.has(n.kind));
	if (hits.length > 0) return hits;

	// Natural-language query: map prose words onto the repo's own symbol names.
	const words = query.split(/[^A-Za-z0-9_]+/).filter((w) => w.length >= 2);
	if (words.length >= 2) {
		const out: CgNode[] = [];
		for (const m of cg.getSegmentMatches(words, 6)) {
			for (const n of cg.getNodesByName(m.name)) out.push(n);
		}
		if (out.length > 0) return out.filter((n) => !NON_SYMBOL_KINDS.has(n.kind));
	}
	return [];
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

function grepFallback(root: string, query: string): string {
	let raw: string;
	try {
		raw = execFileSync(
			"rg",
			["--line-number", "--no-heading", "--color", "never", "--fixed-strings", "--max-count", "100", "--", query, root],
			{ encoding: "utf8", maxBuffer: 1024 * 1024, timeout: 8000 },
		);
	} catch (e) {
		const err = e as NodeJS.ErrnoException;
		if (err.code === "ENOENT") {
			try {
				raw = execFileSync(
					"grep",
					["-rnIF", "--", query, root],
					{ encoding: "utf8", maxBuffer: 1024 * 1024, timeout: 8000 },
				);
			} catch {
				return "(no matches)";
			}
		} else {
			return "(no matches)"; // rg exits 1 on zero matches
		}
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
		return `No call path found between ${from.name} (${from.filePath}:${from.startLine}) and ${to.name} (${to.filePath}:${to.startLine}).`;
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

	const symbols = dedupe(searchSymbols(cg, q));
	if (symbols.length > 0) {
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

	const files = findFiles(cg, q);
	if (files.length === 1) return capOutput(renderFile(cg, files[0], root));
	if (files.length > 1) {
		const listed = files.slice(0, 20).map((f) => `- ${f}`).join("\n");
		const more = files.length > 20 ? `\n- … +${files.length - 20} more` : "";
		return `"${q}" matches ${files.length} files — narrow the path:\n${listed}${more}`;
	}

	// No symbol or file: fall back to a literal text search (single tokens only —
	// a prose question that matched nothing is better answered with a symbol name).
	if (!/\s/.test(q)) {
		return grepFallback(root, q);
	}
	return `No indexed symbol or file matches "${q}". Try a symbol name, file path, or a single literal term.`;
}
