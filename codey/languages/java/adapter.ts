import fs from "node:fs";
import path from "node:path";
import { SymbolKind as LspSymbolKind } from "vscode-languageserver-protocol";
import type { CallHierarchyItem, CallHierarchyOutgoingCall, DocumentSymbol, Range as LspRange } from "vscode-languageserver-protocol";
import type { LanguageAdapter, ImplementationCandidate } from "../../lib/adapter.ts";
import type { Location, Range, Symbol } from "../../lib/model.ts";
import { uriToFile } from "../../lib/uri.ts";
import type { LspClient } from "../../lsp/client.ts";
import { createJavaServer, languageId, lspKindToSymbolKind } from "./lsp.ts";
import { enrichSymbols } from "./treesitter.ts";

const IMPLEMENTATION_TYPE_KINDS = new Set<Symbol["kind"]>(["class", "interface", "enum"]);
const IMPLEMENTATION_CALLABLE_KINDS = new Set<Symbol["kind"]>(["method", "function"]);

export class JavaAdapter implements LanguageAdapter {
	readonly languageId = languageId;

	private client: LspClient;
	private fileContent = new Map<string, string>();
	private version = 1;

	private constructor(client: LspClient) {
		this.client = client;
	}

	static async connect(root: string): Promise<JavaAdapter> {
		const client = await createJavaServer(root);
		return new JavaAdapter(client);
	}

	async discoverSourceFiles(root: string): Promise<string[]> {
		const sourcePaths = await this.waitForSourcePaths();
		const files = new Set<string>();
		for (const p of sourcePaths) {
			collectJavaFiles(normalizeSourcePath(root, p), files);
		}
		return [...files].sort();
	}

	async indexSymbols(_root: string, files: string[]): Promise<Symbol[]> {
		await this.syncFiles(files);

		const symbols: Symbol[] = [];
		const seen = new Set<string>();
		for (const f of files) {
			const docSyms = await this.client.documentSymbols(`file://${f}`);
			const fileSymbols = flattenDocSymbols(docSyms, f, undefined, packageNameOf(docSyms));
			await enrichSymbols(f, fileSymbols);
			for (const sym of fileSymbols) {
				if (seen.has(sym.id)) continue;
				seen.add(sym.id);
				symbols.push(sym);
			}
		}
		return symbols;
	}

	async findUsages(symbol: Symbol): Promise<Location[]> {
		const pos = symbol.location.nameRange.start;
		const usages = await this.client.references(
			symbol.location.uri,
			pos.line - 1,
			pos.column - 1,
		);
		return usages.map((u) => ({
			uri: u.uri,
			range: toRange(u.range),
		}));
	}

	async callees(symbol: Symbol): Promise<Symbol[]> {
		const pos = symbol.location.nameRange.start;
		const items = await this.client.prepareCallHierarchy(
			symbol.location.uri,
			pos.line - 1,
			pos.column - 1,
		);
		if (items.length === 0) return [];
		const outgoing = await this.client.outgoingCalls(items[0]);
		return outgoing
			.map((o: CallHierarchyOutgoingCall) => callItemToSymbol(o.to))
			.filter((s): s is Symbol => s !== null);
	}

	async implementations(symbol: Symbol): Promise<ImplementationCandidate[]> {
		const pos = symbol.location.nameRange.start;
		if (IMPLEMENTATION_TYPE_KINDS.has(symbol.kind)) {
			const items = await this.client.prepareTypeHierarchy(
				symbol.location.uri,
				pos.line - 1,
				pos.column - 1,
			);
			if (items.length === 0) return [];
			const subtypes = await this.client.typeHierarchySubtypes(items[0]);
			return subtypes.map((s) => ({
				uri: s.uri,
				range: toRange(s.selectionRange ?? s.range),
				name: s.name,
			}));
		}
		if (IMPLEMENTATION_CALLABLE_KINDS.has(symbol.kind)) {
			const impls = await this.client.implementation(
				symbol.location.uri,
				pos.line - 1,
				pos.column - 1,
			);
			return impls.map((u) => ({ uri: u.uri, range: toRange(u.range) }));
		}
		return [];
	}

	/** Send didOpen for new files and didChange for files whose content changed. */
	async syncFiles(files: string[]): Promise<void> {
		const ops: Promise<void>[] = [];
		let changed = false;
		for (const f of files) {
			let text: string;
			try {
				text = fs.readFileSync(f, "utf8");
			} catch {
				continue;
			}
			const prev = this.fileContent.get(f);
			if (prev === undefined) {
				ops.push(this.client.didOpen(`file://${f}`, text, languageId));
				this.fileContent.set(f, text);
			} else if (prev !== text) {
				changed = true;
				this.version++;
				ops.push(this.client.didChange(`file://${f}`, text, this.version));
				this.fileContent.set(f, text);
			}
		}
		await Promise.all(ops);
		if (changed) {
			// Give jdtls a moment to re-parse before documentSymbols runs.
			await new Promise((r) => setTimeout(r, 400));
		}
	}

	async close(): Promise<void> {
		await this.client.shutdown();
	}

	/** Poll jdtls until its Maven/Gradle import reports source paths. */
	private async waitForSourcePaths(): Promise<string[]> {
		const deadline = Date.now() + 60_000;
		while (Date.now() < deadline) {
			try {
				const paths = await this.listSourcePaths();
				if (paths.length > 0) return paths;
			} catch {
				// import not ready yet — retry
			}
			await new Promise((r) => setTimeout(r, 500));
		}
		throw new Error(
			"jdtls did not report source paths within 60s. " +
			"Ensure the project has a standard Maven/Gradle layout and builds successfully.",
		);
	}

	private async listSourcePaths(): Promise<string[]> {
		const result = await this.client.request("workspace/executeCommand", {
			command: "java.project.listSourcePaths",
		}, 5_000);
		return extractSourcePaths(result);
	}
}

// ── documentSymbols flattening ──────────────────────────────

/** Java package name from the top-level `package` node, e.g. `com.example`. */
function packageNameOf(docSyms: DocumentSymbol[]): string | undefined {
	const pkg = docSyms.find((d) => d.kind === LspSymbolKind.Package);
	return pkg?.name || undefined;
}

function flattenDocSymbols(docSyms: DocumentSymbol[], file: string, containerName?: string, packageName?: string): Symbol[] {
	const out: Symbol[] = [];
	for (const d of docSyms) {
		const kind = lspKindToSymbolKind(d.kind);
		if (!kind) continue; // package/module/etc — not a code symbol
		const isContainer = kind === "class" || kind === "interface" || kind === "enum";
		const sym = toSymbol(d, kind, file, containerName, packageName);
		if (sym) out.push(sym);
		if (d.children?.length) {
			out.push(...flattenDocSymbols(d.children, file, isContainer ? d.name : containerName, packageName));
		}
	}
	return out;
}

function toSymbol(d: DocumentSymbol, kind: Symbol["kind"], file: string, containerName?: string, packageName?: string): Symbol | null {
	if (!d.name) return null;
	// jdtls reports methods as "findById(String)" — split into a simple name
	// and keep the parameterized form as the signature.
	const rawName = d.name;
	const name = rawName.split("(")[0];
	const signature = rawName !== name ? rawName : (d.detail?.trim() || undefined);
	const range = toRange(d.range);
	// LSP's selectionRange is the symbol name — model it as nameRange.
	const nameRange = d.selectionRange ? toRange(d.selectionRange) : range;
	const prefix = containerName ? `${containerName}.` : "";
	return {
		id: `${file}:${prefix}${name}:${nameRange.start.line}`,
		name,
		signature,
		kind,
		file,
		location: { uri: `file://${file}`, range, nameRange },
		containerName,
		packageName,
	};
}

function toRange(r: LspRange): Range {
	return {
		start: { line: r.start.line + 1, column: r.start.character + 1 },
		end: { line: r.end.line + 1, column: r.end.character + 1 },
	};
}

function callItemToSymbol(item: CallHierarchyItem): Symbol | null {
	if (!item.name) return null;
	const kind = lspKindToSymbolKind(item.kind);
	if (!kind) return null;
	const file = uriToFile(item.uri);
	const rawName = item.name;
	const name = rawName.split("(")[0];
	const signature = rawName !== name ? rawName : undefined;
	const range = toRange(item.range);
	const nameRange = item.selectionRange ? toRange(item.selectionRange) : range;
	const containerName = item.detail?.trim() || undefined;
	const prefix = containerName ? `${containerName}.` : "";
	return {
		id: `${file}:${prefix}${name}:${nameRange.start.line}`,
		name,
		signature,
		kind,
		file,
		location: { uri: item.uri, range, nameRange },
		containerName,
	};
}

// ── Source path handling ────────────────────────────────────

function normalizeSourcePath(root: string, p: string): string {
	let s = p;
	if (s.startsWith("file://")) s = s.slice("file://".length);
	return path.isAbsolute(s) ? s : path.resolve(root, s);
}

function collectJavaFiles(dir: string, out: Set<string>): void {
	let entries: fs.Dirent[];
	try {
		entries = fs.readdirSync(dir, { withFileTypes: true });
	} catch {
		return;
	}
	for (const e of entries) {
		if (e.name.startsWith(".")) continue;
		const full = path.join(dir, e.name);
		if (e.isDirectory()) {
			collectJavaFiles(full, out);
		} else if (e.isFile() && path.extname(e.name) === ".java") {
			out.add(full);
		}
	}
}

function extractSourcePaths(result: unknown): string[] {
	const paths: string[] = [];
	const collect = (v: unknown): void => {
		if (typeof v === "string") {
			paths.push(v);
		} else if (Array.isArray(v)) {
			for (const item of v) collect(item);
		} else if (v && typeof v === "object" && typeof (v as any).path === "string") {
			paths.push((v as any).path);
		}
	};

	if (Array.isArray(result)) {
		collect(result);
	} else if (result && typeof result === "object") {
		const obj = result as Record<string, unknown>;
		for (const key of ["data", "sourcePaths", "paths"]) collect(obj[key]);
		if (paths.length === 0) for (const v of Object.values(obj)) collect(v);
	}
	return [...new Set(paths)];
}
