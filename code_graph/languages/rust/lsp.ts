/**
 * rust-analyzer startup for headless use.
 *
 * Far simpler than jdtls: a single stdio process over the workspace root, no
 * import options and no external data dir. The only operational gotcha is that
 * rust-analyzer returns "content modified" for `references` on files that were
 * never opened, so the adapter must didOpen every indexed file first.
 */

import os from "node:os";
import path from "node:path";
import { SymbolKind as LspSymbolKind } from "vscode-languageserver-protocol";
import { LspClient } from "../../lsp/client.ts";
import { findBinary } from "../../lsp/findBinary.ts";
import type { SymbolKind } from "../../lib/model.ts";

// Resolve the launcher lazily so importing this module never throws just
// because rust-analyzer is not installed; it only throws on connect.
let rustAnalyzerBinary: string | null = null;
function getRustAnalyzer(): string {
	if (rustAnalyzerBinary) return rustAnalyzerBinary;
	rustAnalyzerBinary = findBinary("rust-analyzer", [
		"/opt/homebrew/opt/rustup/bin/rust-analyzer",
		path.join(os.homedir(), ".cargo/bin/rust-analyzer"),
		path.join(os.homedir(), ".local/share/nvim/mason/packages/rust-analyzer/rust-analyzer"),
		"/usr/local/bin/rust-analyzer",
	]);
	return rustAnalyzerBinary;
}

export async function createRustServer(root: string): Promise<LspClient> {
	const client = new LspClient(getRustAnalyzer(), [], root);
	await client.initialize(`file://${root}`);
	await client.initialized();
	return client;
}

export const languageId = "rust";

/**
 * Map an LSP SymbolKind to the canonical SymbolKind, or null for non-symbols.
 *
 * `detail` is only consulted for LSP Function: rust-analyzer reports ordinary
 * fns with a `fn(...)` detail and `macro_rules!` definitions with an empty
 * detail, so the latter are classified as `macro`.
 */
export function lspKindToSymbolKind(kind: number, detail?: string): SymbolKind | null {
	switch (kind) {
		case LspSymbolKind.Struct: return "struct";
		case LspSymbolKind.Interface: return "trait";
		case LspSymbolKind.Enum: return "enum";
		case LspSymbolKind.Module: return "module";
		case LspSymbolKind.Method: return "method";
		case LspSymbolKind.Constructor: return "constructor";
		case LspSymbolKind.Function: return detail ? "function" : "macro";
		case LspSymbolKind.Field: return "field";
		case LspSymbolKind.Constant: return "constant";
		case LspSymbolKind.EnumMember: return "enum_member";
		case LspSymbolKind.TypeParameter: return "type";
		case LspSymbolKind.Variable: return "variable";
		// Non-code symbols: Object (impl blocks), File, Namespace, Package, ...
		default: return null;
	}
}
