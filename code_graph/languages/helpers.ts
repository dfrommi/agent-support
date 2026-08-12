import path from "node:path";
import { fileURLToPath } from "node:url";
import { Language, Parser, type SyntaxNode } from "web-tree-sitter";
import type { CallEdge, Symbol, SymbolKind } from "../model.ts";

// ── WASM paths ──────────────────────────────────────────────

const BASE = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "node_modules/tree-sitter-wasms/out");

export const EXTENSIONS: Record<string, string> = {
	".java": path.join(BASE, "tree-sitter-java.wasm"),
	".rs": path.join(BASE, "tree-sitter-rust.wasm"),
};

// ── Helpers ─────────────────────────────────────────────────

export function childByName(node: SyntaxNode, name: string): SyntaxNode | null {
	return (node as any).childForFieldName?.(name) ?? null;
}

/**
 * Walk backwards through a declaration's preceding siblings to include
 * comments and annotations that are not syntactically children of the node.
 * Returns the extended start position (row, column), or the node's own start if nothing to extend.
 */
export function extendStartOverComments(node: SyntaxNode): { row: number; column: number } {
	const parent = node.parent;
	if (!parent) return node.startPosition;

	const siblings = namedChildren(parent);
	const myIndex = siblings.indexOf(node);
	if (myIndex < 0) return node.startPosition;

	let extended = node.startPosition;

	// Walk backwards through preceding siblings
	for (let i = myIndex - 1; i >= 0; i--) {
		const sib = siblings[i];
		// Only extend over comments and marker annotations
		if (
			sib.type === "comment" ||
			sib.type === "block_comment" ||
			sib.type === "line_comment" ||
			sib.type === "doc_comment" ||
			sib.type === "marker_annotation" ||
			sib.type === "annotation"
		) {
			extended = sib.startPosition;
		} else {
			break; // stop at first non-comment, non-annotation sibling
		}
	}

	return extended;
}

export function namedChildren(node: SyntaxNode): SyntaxNode[] {
	return node.namedChildren.filter((c): c is SyntaxNode => c !== null);
}

export function firstChildOfType(node: SyntaxNode, type: string): SyntaxNode | null {
	return node.namedChildren.find((c) => c?.type === type) ?? null;
}

export function isExported(n: SyntaxNode): boolean {
	let curr: SyntaxNode | null = n;
	while (curr) {
		if (curr.type === "export_statement") return true;
		curr = curr.parent;
	}
	for (const child of n.children) {
		if (child?.type === "export") return true;
	}
	return false;
}

export function symbolId(file: string, name: string, parentName?: string): string {
	return parentName ? `${file}:${parentName}.${name}` : `${file}:${name}`;
}

// ── Container types ─────────────────────────────────────────

export const CONTAINERS = new Set([
	"class_declaration",
	"interface_declaration",
	"enum_declaration",
	"object_type",
]);

// ── Classification ──────────────────────────────────────────

export function classify(node: SyntaxNode): SymbolKind | null {
	switch (node.type) {
		case "function_declaration":
			return "function";
		case "class_declaration":
			return "class";
		case "interface_declaration":
			return "interface";
		case "type_alias_declaration":
			return "type";
		case "enum_declaration":
			return "enum";
		case "method_definition":
		case "method_signature":
			return "method";
		case "variable_declarator":
			return null; // handled specially
		default:
			return null;
	}
}

// ── Import/Export tracking ──────────────────────────────────

export interface ImportEntry {
	localName: string;
	sourceFile: string;
	exportedName: string;
}

export interface ReExportEntry {
	localName: string; // name in this file
	exportedName: string; // name the world sees
}

export interface ExtractionContext {
	file: string;
	symbols: Symbol[];
	edges: CallEdge[];
	imports: ImportEntry[];
	reexports: ReExportEntry[];
}

export function extractImport(node: SyntaxNode, ctx: ExtractionContext, resolveModule: (fromFile: string, specifier: string) => string | null): void {
	const source = childByName(node, "source")?.text;
	if (!source) return;
	const modulePath = source.slice(1, -1);
	const resolved = resolveModule(ctx.file, modulePath);
	if (!resolved) return;

	const clause = firstChildOfType(node, "import_clause");
	if (!clause) return;

	for (const c of namedChildren(clause)) {
		if (c.type === "identifier") {
			// Default import: import foo from './bar'
			ctx.imports.push({ localName: c.text, sourceFile: resolved, exportedName: "default" });
		} else if (c.type === "named_imports") {
			for (const spec of namedChildren(c)) {
				if (spec.type === "import_specifier") {
					const local = (childByName(spec, "alias") ?? childByName(spec, "name"))?.text;
					const exported = childByName(spec, "name")?.text;
					if (local && exported) {
						ctx.imports.push({ localName: local, sourceFile: resolved, exportedName: exported });
					}
				}
			}
		}
	}
}

export function extractReExports(node: SyntaxNode, ctx: ExtractionContext): void {
	for (const child of namedChildren(node)) {
		if (child.type === "export_statement") {
			// export { foo, bar as baz } from './module'  OR  export { foo, bar as baz }
			for (const spec of namedChildren(child)) {
				if (spec.type === "export_specifier") {
					const local = childByName(spec, "name")?.text;
					const alias = childByName(spec, "alias")?.text;
					if (local) {
						ctx.reexports.push({ localName: local, exportedName: alias ?? local });
					}
				}
			}
		}
	}
}
