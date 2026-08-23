import fs from "node:fs";
import path from "node:path";
import type { CallHierarchyItem, CallHierarchyOutgoingCall, DocumentSymbol, Range as LspRange } from "vscode-languageserver-protocol";
import type { LanguageAdapter, ImplementationCandidate } from "../../lib/adapter.ts";
import type { Location, Range, Symbol } from "../../lib/model.ts";
import { uriToFile } from "../../lib/uri.ts";
import type { LspClient } from "../../lsp/client.ts";
import { createRustServer, languageId, lspKindToSymbolKind } from "./lsp.ts";
import { enrichSymbols } from "./treesitter.ts";

const CONTAINER_KINDS = new Set<Symbol["kind"]>(["struct", "trait", "enum", "module"]);
const CALLEE_KINDS = new Set<Symbol["kind"]>(["method", "constructor", "function"]);
const IMPLEMENTATION_KINDS = new Set<Symbol["kind"]>(["trait", "method", "function"]);

export class RustAdapter implements LanguageAdapter {
	readonly languageId = languageId;

	private client: LspClient;
	private fileContent = new Map<string, string>();
	private version = 1;

	private constructor(client: LspClient) {
		this.client = client;
	}

	static async connect(root: string): Promise<RustAdapter> {
		const client = await createRustServer(root);
		return new RustAdapter(client);
	}

	/** Cargo-standard source roots; workspaces and custom `[lib] path` are deferred. */
	async discoverSourceFiles(root: string): Promise<string[]> {
		const files = new Set<string>();
		for (const dir of ["src", "tests", "examples", "benches"]) {
			collectRustFiles(path.join(root, dir), files);
		}
		return [...files].sort();
	}

	async indexSymbols(_root: string, files: string[]): Promise<Symbol[]> {
		await this.waitForWorkspace();
		await this.syncFiles(files);

		const symbols: Symbol[] = [];
		const seen = new Set<string>();
		for (const f of files) {
			const docSyms = await this.client.documentSymbols(`file://${f}`);
			const fileSymbols = flattenDocSymbols(docSyms, f);
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
		const usages = await this.retryRequest(() =>
			this.client.references(symbol.location.uri, pos.line - 1, pos.column - 1),
		);
		return usages.map((u) => ({
			uri: u.uri,
			range: toRange(u.range),
		}));
	}

	async callees(symbol: Symbol): Promise<Symbol[]> {
		if (!CALLEE_KINDS.has(symbol.kind)) return [];
		const pos = symbol.location.nameRange.start;
		// call hierarchy lags documentSymbols on a cold start: prepare may error
		// with "content modified" or return empty until the workspace settles.
		for (let attempt = 0; attempt < 3; attempt++) {
			try {
				const items = await this.client.prepareCallHierarchy(
					symbol.location.uri,
					pos.line - 1,
					pos.column - 1,
				);
				if (items.length > 0) {
					const outgoing = await this.client.outgoingCalls(items[0]);
					return outgoing
						.map((o: CallHierarchyOutgoingCall) => callItemToSymbol(o.to))
						.filter((s): s is Symbol => s !== null);
				}
			} catch {
				// transient "content modified" — retry below
			}
			await new Promise((r) => setTimeout(r, 300));
		}
		return [];
	}

	async implementations(symbol: Symbol): Promise<ImplementationCandidate[]> {
		if (!IMPLEMENTATION_KINDS.has(symbol.kind)) return [];
		const pos = symbol.location.nameRange.start;
		// rust-analyzer has no typeHierarchy; implementation covers both types
		// (the type name in `impl Trait for Type`) and methods (the override).
		const impls = await this.retryRequest(() =>
			this.client.implementation(symbol.location.uri, pos.line - 1, pos.column - 1),
		);
		return impls.map((u) => {
			const range = toRange(u.range);
			return { uri: u.uri, range, name: this.nameAt(u.uri, range) };
		});
	}

	/** Simple name at a 1-indexed model range, read from the cached file content. */
	private nameAt(uri: string, range: Range): string | undefined {
		const text = this.fileContent.get(uriToFile(uri));
		if (!text) return undefined;
		const line = text.split("\n")[range.start.line - 1];
		if (!line) return undefined;
		return line.slice(range.start.column - 1, range.end.column - 1).trim() || undefined;
	}

	/** Retry a request a few times; rust-analyzer can error transiently while loading. */
	private async retryRequest<T>(fn: () => Promise<T>): Promise<T> {
		let lastError: unknown;
		for (let attempt = 0; attempt < 3; attempt++) {
			try {
				return await fn();
			} catch (e) {
				lastError = e;
				await new Promise((r) => setTimeout(r, 300));
			}
		}
		throw lastError;
	}

	/** Send didOpen for new files and didChange for files whose content changed. */
	async syncFiles(files: string[]): Promise<void> {
		const ops: Promise<void>[] = [];
		let opened = false;
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
				opened = true;
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
		if (opened || changed) {
			// rust-analyzer resolves references only after it has ingested the
			// opened/updated documents; documentSymbols works immediately.
			await new Promise((r) => setTimeout(r, 400));
		}
	}

	async close(): Promise<void> {
		await this.client.shutdown();
	}

	/**
	 * Poll rust-analyzer's analyzerStatus until the Cargo workspace is loaded.
	 * documentSymbols can return a partial outline while the workspace is still
	 * being discovered, so indexing before this point is racy.
	 */
	private async waitForWorkspace(): Promise<void> {
		const deadline = Date.now() + 30_000;
		while (Date.now() < deadline) {
			try {
				const status = await this.client.request("rust-analyzer/analyzerStatus", {}, 3_000);
				if (typeof status === "string" && !status.includes("No workspaces")) return;
			} catch {
				// not ready yet — retry
			}
			await new Promise((r) => setTimeout(r, 150));
		}
		// Fall through: even without a clear status, indexing may still work.
	}
}

// ── documentSymbols flattening ──────────────────────────────

function flattenDocSymbols(docSyms: DocumentSymbol[], file: string, containerName?: string): Symbol[] {
	const out: Symbol[] = [];
	for (const d of docSyms) {
		// rust-analyzer reports `impl User` / `impl Trait for Type` as kind Object.
		// The impl itself is not a symbol; its contents belong to the target type.
		const implTarget = parseImplTarget(d.name);
		if (implTarget !== null) {
			out.push(...flattenDocSymbols(d.children ?? [], file, implTarget));
			continue;
		}

		const kind = lspKindToSymbolKind(d.kind, d.detail);
		if (!kind) {
			// Unknown/non-symbol kind — keep descending under the current container.
			out.push(...flattenDocSymbols(d.children ?? [], file, containerName));
			continue;
		}

		const sym = toSymbol(d, kind, file, containerName);
		if (sym) out.push(sym);
		const isContainer = CONTAINER_KINDS.has(kind);
		out.push(...flattenDocSymbols(d.children ?? [], file, isContainer ? d.name : containerName));
	}
	return out;
}

function toSymbol(d: DocumentSymbol, kind: Symbol["kind"], file: string, containerName?: string): Symbol | null {
	if (!d.name) return null;
	const range = toRange(d.range);
	// LSP's selectionRange is the symbol name — model it as nameRange.
	const nameRange = d.selectionRange ? toRange(d.selectionRange) : range;
	const signature = d.detail?.trim() || undefined;
	const prefix = containerName ? `${containerName}.` : "";
	return {
		id: `${file}:${prefix}${d.name}:${nameRange.start.line}`,
		name: d.name,
		signature,
		kind,
		file,
		location: { uri: `file://${file}`, range, nameRange },
		containerName,
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
	const kind = lspKindToSymbolKind(item.kind, item.detail);
	if (!kind) return null;
	const file = uriToFile(item.uri);
	const range = toRange(item.range);
	const nameRange = item.selectionRange ? toRange(item.selectionRange) : range;
	return {
		id: `${file}:${item.name}:${nameRange.start.line}`,
		name: item.name,
		signature: item.detail?.trim() || undefined,
		kind,
		file,
		location: { uri: item.uri, range, nameRange },
	};
}

// ── Source path handling ────────────────────────────────────

/** "impl User" → "User"; "impl Auditable for AuditLogger" → "AuditLogger"; non-impl → null. */
function parseImplTarget(name: string): string | null {
	if (!name.startsWith("impl ")) return null;
	const body = name.slice("impl ".length);
	const target = body.includes(" for ") ? body.slice(body.lastIndexOf(" for ") + " for ".length) : body;
	const stripped = stripGenerics(target).trim();
	return stripped || null;
}

function stripGenerics(s: string): string {
	let out = s.trim();
	if (out.startsWith("<")) {
		const close = out.indexOf(">");
		if (close !== -1) out = out.slice(close + 1).trim();
	}
	return out.replace(/<.*>$/, "").trim();
}

function collectRustFiles(dir: string, out: Set<string>): void {
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
			collectRustFiles(full, out);
		} else if (e.isFile() && path.extname(e.name) === ".rs") {
			out.add(full);
		}
	}
}
