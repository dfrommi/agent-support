import fs from "node:fs";
import path from "node:path";
import { getGraph } from "./lib/session.ts";
import type { CodeGraph } from "./lib/graph.ts";
import type { Symbol, SymbolKind } from "./lib/model.ts";
import { findFiles, resolveSymbol, type ResolvedSymbol } from "./lib/resolve.ts";
import { locateCallable, type LineSpan } from "./lib/locate.ts";
import { inScope, type Scope } from "./lib/scope.ts";
import { kindHistogram, searchSymbols } from "./lib/search.ts";
import { resolveUsageSymbols, type ResolvedUsage } from "./lib/usages.ts";
import { uriToFile } from "./lib/uri.ts";
import { detectLanguage } from "./languages/detect.ts";

// ── Budgets ────────────────────────────────────────────────────────────────

const MAX_BODY_LINES = 200;
const MAX_OUTPUT_CHARS = 40000;
const MAX_USAGES = 20;
const MAX_CALLEES = 20;
const MAX_MEMBERS = 50;
const MAX_OTHER_MATCHES = 10;
const MAX_SEARCH_RESULTS = 40;
const MAX_IMPLEMENTATIONS = 20;

const CONTAINER_KINDS = new Set<SymbolKind>(["class", "interface", "enum", "struct", "trait", "module"]);
const CALLEE_KINDS = new Set<SymbolKind>(["method", "constructor", "function"]);
const IMPLEMENTATION_KINDS = new Set<SymbolKind>(["class", "interface", "enum", "struct", "trait", "module", "method", "function"]);

// ── Helpers ────────────────────────────────────────────────────────────────

function displayName(s: Symbol): string {
	if (!s.containerName || s.name === s.containerName) return s.name;
	return `${s.containerName}.${s.name}`;
}

/** Root-relative when the file is inside the project, absolute otherwise. */
function displayPath(file: string, root: string): string {
	const rel = path.relative(root, file);
	return rel && !rel.startsWith("..") && !path.isAbsolute(rel) ? rel : file;
}

function indent(text: string, prefix: string): string {
	return text.split("\n").map((l) => prefix + l).join("\n");
}

function capOutput(text: string): string {
	if (text.length <= MAX_OUTPUT_CHARS) return text;
	const cut = text.slice(0, MAX_OUTPUT_CHARS);
	const boundary = cut.lastIndexOf("\n\n");
	const safe = boundary > MAX_OUTPUT_CHARS * 0.5 ? cut.slice(0, boundary) : cut.slice(0, cut.lastIndexOf("\n"));
	return safe + `\n\n… (output truncated; re-query with a more specific name for the remainder)`;
}

// ── Rendering ──────────────────────────────────────────────────────────────

function byLocation(a: ResolvedUsage, b: ResolvedUsage): number {
	const fa = uriToFile(a.location.uri);
	const fb = uriToFile(b.location.uri);
	return fa.localeCompare(fb) ||
		a.location.range.start.line - b.location.range.start.line ||
		a.location.range.start.column - b.location.range.start.column;
}

function formatCallees(callees: Symbol[], root: string): string {
	if (callees.length === 0) return "Callees: (none)";
	const list = callees.slice(0, MAX_CALLEES).map(
		(c) => `- ${displayName(c)} (${c.kind}) — ${displayPath(c.file, root)}:${c.location.nameRange.start.line}`,
	);
	const more = callees.length > MAX_CALLEES ? `\n- … +${callees.length - MAX_CALLEES} more` : "";
	return `Callees (${callees.length}):\n${list.join("\n")}${more}`;
}

function implementationLabel(kind: SymbolKind): string {
	if (kind === "method" || kind === "function") return "Overrides";
	if (kind === "interface" || kind === "trait") return "Implementations";
	return "Subtypes";
}

function usageLabel(kind: SymbolKind): string {
	return kind === "method" || kind === "function" ? "Callers" : "Usages";
}

function renderImplementations(sym: Symbol, implementations: Symbol[], error: string | undefined, root: string): string {
	const label = implementationLabel(sym.kind);
	if (error) return `${label}: (unavailable — ${error})`;
	if (implementations.length === 0) return `${label}: (none)`;
	const shown = implementations.slice(0, MAX_IMPLEMENTATIONS);
	const lines = shown.map(
		(s) => `- ${displayName(s)} (${s.kind}) — ${displayPath(s.file, root)}:${s.location.nameRange.start.line}`,
	);
	const more = implementations.length > MAX_IMPLEMENTATIONS ? `\n- … +${implementations.length - MAX_IMPLEMENTATIONS} more` : "";
	return `${label} (${implementations.length}):\n${lines.join("\n")}${more}`;
}

function formatUsages(usages: ResolvedUsage[], label: string, root: string): string {
	if (usages.length === 0) return `${label}: (none)`;
	const sorted = [...usages].sort(byLocation);
	const shown = sorted.slice(0, MAX_USAGES);
	const lines = shown.map((u) => {
		const where = `${displayPath(uriToFile(u.location.uri), root)}:${u.location.range.start.line}`;
		if (u.symbol) return `- ${displayName(u.symbol)} (${u.symbol.kind}) — ${where}`;
		const snippet = readLineSnippet(u.location.uri, u.location.range.start.line);
		return snippet ? `- ${where} — ${snippet}` : `- ${where}`;
	});
	const more = usages.length > MAX_USAGES ? `\n- … +${usages.length - MAX_USAGES} more` : "";
	return `${label} (${usages.length}):\n${lines.join("\n")}${more}`;
}

interface SymbolSections {
	members?: Symbol[];
	callees: Symbol[];
	calleeError?: string;
	implementations: Symbol[];
	implError?: string;
	usages: ResolvedUsage[];
	usageError?: string;
}

function summaryLine(sym: Symbol, s: SymbolSections): string {
	const segs: string[] = [];
	if (s.members !== undefined) segs.push(`Members ${s.members.length}`);
	if (CALLEE_KINDS.has(sym.kind)) segs.push(s.calleeError ? "Callees ?" : `Callees ${s.callees.length}`);
	segs.push(s.usageError ? `${usageLabel(sym.kind)} ?` : `${usageLabel(sym.kind)} ${s.usages.length}`);
	if (IMPLEMENTATION_KINDS.has(sym.kind)) segs.push(s.implError ? `${implementationLabel(sym.kind)} ?` : `${implementationLabel(sym.kind)} ${s.implementations.length}`);
	return segs.join(" · ");
}

function readRange(file: string, startLine: number, endLine: number): string | null {
	try {
		const lines = fs.readFileSync(file, "utf8").replace(/\n$/, "").split("\n");
		return lines.slice(startLine - 1, endLine).join("\n");
	} catch {
		return null;
	}
}

function readLineSnippet(uri: string, line: number): string | null {
	try {
		const lines = fs.readFileSync(uriToFile(uri), "utf8").split("\n");
		const text = lines[line - 1]?.trim();
		return text ? text : null;
	} catch {
		return null;
	}
}

function renderBody(code: string, languageId: string): string[] {
	const lines = code.replace(/\n$/, "").split("\n");
	const truncated = lines.length > MAX_BODY_LINES;
	const out = ["```" + languageId, lines.slice(0, MAX_BODY_LINES).join("\n"), "```"];
	if (truncated) {
		out.push(`(first ${MAX_BODY_LINES} of ${lines.length} lines — query a member or read the file for the rest)`);
	}
	return out;
}

async function renderSymbol(graph: CodeGraph, sym: Symbol, languageId: string, root: string, scope: Scope): Promise<string> {
	const start = sym.location.nameRange.start.line;
	const end = sym.location.range.end.line;
	const loc = end !== start ? `${start}-${end}` : `${start}`;
	const ofContainer = sym.containerName && sym.name !== sym.containerName ? ` of ${sym.containerName}` : "";
	const parts = [`**${sym.name}** (${sym.kind}${ofContainer}) — ${displayPath(sym.file, root)}:${loc}`];

	const sections: SymbolSections = { callees: [], implementations: [], usages: [] };

	if (CONTAINER_KINDS.has(sym.kind)) {
		sections.members = graph.members(sym.name).list().sort(
			(a, b) => a.location.nameRange.start.line - b.location.nameRange.start.line,
		);
	}

	if (CALLEE_KINDS.has(sym.kind)) {
		try {
			const all = await graph.calleesOf(sym);
			// Callees are project-only: drop library callees and respect scope.
			sections.callees = all.filter(
				(c) => graph.files.includes(c.file) && inScope(c.file, scope, c.containerName, root),
			);
		} catch (e) {
			sections.calleeError = (e as Error).message;
		}
	}

	if (IMPLEMENTATION_KINDS.has(sym.kind)) {
		try {
			sections.implementations = await graph.implementationsOf(sym);
		} catch (e) {
			sections.implError = (e as Error).message;
		}
	}

	try {
		const raw = await graph.findUsagesOf(sym);
		const resolved = resolveUsageSymbols(graph, raw);
		const excludeIds = new Set(sections.implementations.map((s) => s.id));
		sections.usages = excludeIds.size > 0
			? resolved.filter((u) => !u.symbol || !excludeIds.has(u.symbol.id))
			: resolved;
	} catch (e) {
		sections.usageError = (e as Error).message;
	}

	parts.push(summaryLine(sym, sections));

	if (sym.signature) parts.push(`\`${sym.signature}\``);
	if (sym.annotations?.length) parts.push(`annotations: ${sym.annotations.join(", ")}`);
	if (sym.doc) parts.push(`doc:\n${indent(sym.doc.trim(), "  ")}`);

	if (sections.members !== undefined) {
		const members = sections.members;
		if (members.length === 0) {
			parts.push("Members: (none)");
		} else {
			parts.push(`Members (${members.length}):`);
			for (const m of members.slice(0, MAX_MEMBERS)) {
				const sig = m.signature ? ` — \`${m.signature.replace(/\s+/g, " ").trim()}\`` : "";
				const start = m.location.range.start.line;
				const count = m.location.range.end.line - start + 1;
				const length = count === 1 ? "1 line" : `${count} lines`;
				parts.push(`- \`${m.name}\` (${m.kind}) :${start} (${length})${sig}`);
			}
			if (members.length > MAX_MEMBERS) parts.push(`- … +${members.length - MAX_MEMBERS} more`);
		}
	} else {
		const body = readRange(sym.file, sym.location.nameRange.start.line, sym.location.range.end.line);
		if (body) parts.push(...renderBody(body, languageId));
	}

	const usagesLabel = usageLabel(sym.kind);
	if (CALLEE_KINDS.has(sym.kind)) {
		parts.push(sections.calleeError ? `Callees: (unavailable — ${sections.calleeError})` : formatCallees(sections.callees, root));
	}
	parts.push(sections.usageError ? `${usagesLabel}: (unavailable — ${sections.usageError})` : formatUsages(sections.usages, usagesLabel, root));
	if (IMPLEMENTATION_KINDS.has(sym.kind)) {
		parts.push(renderImplementations(sym, sections.implementations, sections.implError, root));
	}

	return parts.join("\n");
}

/** Token-efficient file view: nested symbol outline, no bodies. `read` owns full source. */
function renderOutline(graph: CodeGraph, file: string, root: string): string {
	const syms = graph.symbols
		.filter((s) => s.file === file)
		.sort((a, b) => a.location.nameRange.start.line - b.location.nameRange.start.line);
	if (syms.length === 0) return `**${displayPath(file, root)}** — (no symbols)`;

	const byContainer = new Map<string, Symbol[]>();
	for (const s of syms) {
		if (!s.containerName) continue;
		const list = byContainer.get(s.containerName) ?? [];
		list.push(s);
		byContainer.set(s.containerName, list);
	}

	const lines: string[] = [];
	const rendered = new Set<string>();
	const render = (s: Symbol, depth: number): void => {
		rendered.add(s.id);
		const sig = s.signature ? ` — \`${s.signature.replace(/\s+/g, " ").trim()}\`` : "";
		const start = s.location.range.start.line;
		const count = s.location.range.end.line - start + 1;
		const length = count === 1 ? "1 line" : `${count} lines`;
		lines.push(`${"  ".repeat(depth)}- \`${s.name}\` (${s.kind}) :${start} (${length})${sig}`);
		const children = (byContainer.get(s.name) ?? []).sort(
			(a, b) => a.location.nameRange.start.line - b.location.nameRange.start.line,
		);
		for (const c of children) render(c, depth + 1);
	};

	for (const s of syms) {
		if (!s.containerName) render(s, 0);
	}
	for (const s of syms) {
		if (!rendered.has(s.id)) render(s, 0);
	}

	return [`**${displayPath(file, root)}** — ${syms.length} symbol(s)`, "", ...lines].join("\n");
}

function renderFileQuery(graph: CodeGraph, query: string, root: string): string | null {
	const files = findFiles(graph, query);
	if (files.length === 0) return null;
	if (files.length === 1) return capOutput(renderOutline(graph, files[0], root));
	const list = files.slice(0, 20).map((f) => `- ${displayPath(f, root)}`).join("\n");
	const more = files.length > 20 ? `\n- … +${files.length - 20} more` : "";
	return `"${query}" matches ${files.length} files — narrow the path:\n${list}${more}`;
}

async function renderResolved(graph: CodeGraph, res: ResolvedSymbol, scope: Scope, languageId: string, root: string): Promise<string> {
	const { primary, others, tier, outOfScope } = res;
	const tierNote = tier === 1 ? " (case-insensitive match)" : tier === 2 ? " (substring match)" : "";
	const scopeNote = outOfScope ? ` (outside scope "${scope}")` : "";
	const body = await renderSymbol(graph, primary, languageId, root, scope);
	const note = [tierNote, scopeNote].filter(Boolean).join("");
	const sections = [note ? `${body}\n${note}` : body];

	if (others.length > 0) {
		const shown = others.slice(0, MAX_OTHER_MATCHES);
		const lines = shown.map((n) => `- ${displayName(n)} (${n.kind}) — ${displayPath(n.file, root)}:${n.location.nameRange.start.line}`);
		const more = others.length > MAX_OTHER_MATCHES ? `\n- … +${others.length - MAX_OTHER_MATCHES} more` : "";
		sections.push(`Other matches:\n${lines.join("\n")}${more}`);
	}
	return capOutput(sections.join("\n\n"));
}

const LOCATION_RE = /^(.+?):(\d+)(?:-(\d+)|:(\d+))?$/;
const SOURCE_FILE_RE = /\.(java|rs)$/i;

interface LocationQuery {
	target: string;
	startLine: number;
	endLine: number;
}

/** `file:line`, `file:start-end`, or `file:line:col` (column ignored). */
function parseLocation(query: string): LocationQuery | null {
	const m = LOCATION_RE.exec(query);
	if (!m) return null;
	const target = m[1];
	const startLine = Number(m[2]);
	const endLine = m[3] !== undefined ? Number(m[3]) : startLine;
	if (!target || startLine < 1 || endLine < startLine) return null;
	return { target, startLine, endLine };
}

function looksLikeFile(target: string): boolean {
	return target.includes("/") || SOURCE_FILE_RE.test(target);
}

async function renderLocation(graph: CodeGraph, loc: LocationQuery, scope: Scope, languageId: string, root: string): Promise<string> {
	const span: LineSpan = { startLine: loc.startLine, endLine: loc.endLine };
	let file: string;
	let within: LineSpan | undefined;

	if (looksLikeFile(loc.target)) {
		const files = findFiles(graph, loc.target);
		if (files.length === 0) return `No indexed file matches "${loc.target}".`;
		if (files.length > 1) {
			const hits = files.filter((f) => locateCallable(graph, f, span) !== null);
			if (hits.length !== 1) return `"${loc.target}" matches ${files.length} files — narrow the path.`;
			file = hits[0];
		} else {
			file = files[0];
		}
	} else {
		const res = resolveSymbol(graph, loc.target, scope, root);
		if (res) {
			file = res.primary.file;
			if (CONTAINER_KINDS.has(res.primary.kind)) {
				within = { startLine: res.primary.location.range.start.line, endLine: res.primary.location.range.end.line };
			}
		} else {
			const files = findFiles(graph, loc.target);
			if (files.length === 1) {
				file = files[0];
			} else if (files.length > 1) {
				return `"${loc.target}" matches ${files.length} files — narrow the path.`;
			} else {
				return `No indexed symbol or file matches "${loc.target}".`;
			}
		}
	}

	const sym = locateCallable(graph, file, span, within);
	if (!sym) {
		const where = loc.endLine > loc.startLine ? `lines ${loc.startLine}-${loc.endLine}` : `line ${loc.startLine}`;
		return `${where} of ${displayPath(file, root)} is not inside a method/function — location queries resolve only lines inside methods. Use code(<Class>) for class-level output or code(<file>) for a file outline.`;
	}
	return capOutput(await renderSymbol(graph, sym, languageId, root, scope));
}

/** Resolve a symbol or file to a single read-equivalent text block. */
export async function explore(root: string, query: string, scope: Scope = "all"): Promise<string> {
	const resolved = path.resolve(root);
	const { factory, languageId } = detectLanguage(resolved);
	const graph = await getGraph(resolved, factory);
	const q = query.trim().replace(/^@/, "");
	if (!q) return "(empty query)";

	if (!/\s/.test(q)) {
		const loc = parseLocation(q);
		if (loc) return await renderLocation(graph, loc, scope, languageId, resolved);
		const res = resolveSymbol(graph, q, scope, resolved);
		if (res) return await renderResolved(graph, res, scope, languageId, resolved);
	}

	const fileOut = renderFileQuery(graph, q, resolved);
	if (fileOut) return fileOut;

	return `No indexed symbol or file matches "${q}".`;
}

export interface SearchParams {
	substrings: string[];
	includeKinds?: SymbolKind[];
	excludeKinds?: SymbolKind[];
	scope?: Scope;
	path?: string;
}

/** List ranked symbol matches for one or more substrings. */
export async function search(root: string, params: SearchParams): Promise<string> {
	const resolved = path.resolve(root);
	const graph = await getGraph(resolved, detectLanguage(resolved).factory);
	const substrings = (params.substrings ?? []).map((s) => s.trim()).filter(Boolean);
	if (substrings.length === 0) return "(empty query — provide at least one non-empty substring)";

	const symbols = searchSymbols(graph, {
		substrings,
		includeKinds: params.includeKinds,
		excludeKinds: params.excludeKinds,
		scope: params.scope ?? "all",
		path: params.path,
		root: resolved,
	});

	if (symbols.length === 0) {
		return `No symbols match ${substrings.map((s) => `"${s}"`).join(" or ")} (scope: ${params.scope ?? "all"}).`;
	}

	const shown = symbols.slice(0, MAX_SEARCH_RESULTS);
	const lines = shown.map((s) => {
		const where = `${displayPath(s.file, resolved)}:${s.location.nameRange.start.line}`;
		const sig = s.signature ? ` — \`${s.signature.replace(/\s+/g, " ").trim()}\`` : "";
		return `- ${displayName(s)} (${s.kind}) — ${where}${sig}`;
	});
	if (symbols.length > MAX_SEARCH_RESULTS) {
		lines.push(`… +${symbols.length - MAX_SEARCH_RESULTS} more (by kind: ${kindHistogram(symbols)}) — narrow with includeKinds/excludeKinds/path or more specific substrings`);
	}

	const header = `${symbols.length} match${symbols.length === 1 ? "" : "es"} for ${substrings.map((s) => `"${s}"`).join(" or ")} (scope: ${params.scope ?? "all"})`;
	return [header, ...lines].join("\n");
}
