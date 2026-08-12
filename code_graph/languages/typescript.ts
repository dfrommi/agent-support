import fs from "node:fs";
import path from "node:path";
import type { SyntaxNode } from "web-tree-sitter";
import type { Symbol } from "../model.ts";
import {
	childByName,
	classify,
	CONTAINERS,
	extendStartOverComments,
	type ExtractionContext,
	extractImport,
	isExported,
	namedChildren,
	symbolId,
} from "./helpers.ts";

/**
 * Extract all symbols from a TypeScript/JavaScript AST.
 * Walks top-level declarations, class bodies, etc.
 */
export function extractSymbols(node: SyntaxNode, ctx: ExtractionContext, containerName?: string): void {
	for (const child of namedChildren(node)) {
		if (child.type === "import_statement") {
			extractImport(child, ctx, resolveModule);
			continue;
		}

		const kind = classify(child);
		if (kind) {
			const name = childByName(child, "name")?.text ?? child.firstChild?.text ?? "";
			if (!name) continue;
			const id = symbolId(ctx.file, name, containerName);
			const startPos = extendStartOverComments(child);
			const sym: Symbol = {
				id,
				name,
				kind,
				file: ctx.file,
				line: startPos.row + 1,
				column: startPos.column + 1,
				endLine: child.endPosition.row + 1,
				endColumn: child.endPosition.column + 1,
				exported: isExported(child),
				parentName: containerName,
			};
			ctx.symbols.push(sym);

			if (CONTAINERS.has(child.type)) {
				const body = childByName(child, "body");
				if (body) extractSymbols(body, ctx, name);
			}
			if (child.type === "method_definition" || child.type === "function_declaration") {
				const body = childByName(child, "body");
				if (body) extractCalls(body, id, ctx);
			}
			continue;
		}

		if (child.type === "variable_declarator") {
			const name = childByName(child, "name")?.text ?? "";
			if (!name) continue;
			const value = childByName(child, "value");
			const isArrow = value?.type === "arrow_function";
			const id = symbolId(ctx.file, name, containerName);
			const sym: Symbol = {
				id,
				name,
				kind: isArrow ? "function" : "variable",
				file: ctx.file,
				line: child.startPosition.row + 1,
				column: child.startPosition.column + 1,
				endLine: child.endPosition.row + 1,
				endColumn: child.endPosition.column + 1,
				exported: isExported(child),
				parentName: containerName,
			};
			ctx.symbols.push(sym);

			if (isArrow && value) {
				const body = childByName(value, "body");
				if (body) extractCalls(body, id, ctx);
			}
			if (value) extractCalls(value, "", ctx);
			continue;
		}

		// Handle re-exports: export { foo, bar as baz }
		if (child.type === "export_statement") {
			extractReExports(child, ctx);
		}

		// Recurse into wrapper nodes
		if (
			child.type === "export_statement" ||
			child.type === "lexical_declaration" ||
			child.type === "variable_declaration" ||
			child.type === "expression_statement" ||
			child.type === "statement_block"
		) {
			extractSymbols(child, ctx, containerName);
		}
	}
}

/** Extract re-exports: `export { foo, bar as baz }` */
function extractReExports(node: SyntaxNode, ctx: ExtractionContext): void {
	for (const spec of namedChildren(node)) {
		if (spec.type === "export_specifier") {
			const local = childByName(spec, "name")?.text;
			const alias = childByName(spec, "alias")?.text;
			if (local) {
				ctx.reexports.push({ localName: local, exportedName: alias ?? local });
			}
		}
	}
}

/**
 * Extract call edges from a subtree (e.g., a function body).
 */
export function extractCalls(node: SyntaxNode, callerId: string, ctx: ExtractionContext): void {
	if (node.type === "call_expression") {
		const func = childByName(node, "function");
		if (func) {
			let calleeName: string | null = null;
			if (func.type === "identifier") {
				calleeName = func.text;
			} else if (func.type === "member_expression") {
				const prop = childByName(func, "property");
				calleeName = prop?.text ?? null;
			}
			if (calleeName) {
				ctx.edges.push({
					callerId,
					calleeId: "",
					calleeName,
					line: node.startPosition.row + 1,
				});
			}
		}
	}

	// Also track new expressions: new Foo() calls the constructor
	if (node.type === "new_expression") {
		const ctor = childByName(node, "constructor");
		if (ctor) {
			let calleeName: string | null = null;
			if (ctor.type === "identifier") {
				calleeName = ctor.text;
			} else if (ctor.type === "member_expression") {
				const prop = childByName(ctor, "property");
				calleeName = prop?.text ?? null;
			}
			if (calleeName) {
				ctx.edges.push({
					callerId,
					calleeId: "",
					calleeName,
					line: node.startPosition.row + 1,
				});
			}
		}
	}

	for (const child of namedChildren(node)) {
		extractCalls(child, callerId, ctx);
	}
}

// ── Module resolution ───────────────────────────────────────

function resolveModule(fromFile: string, moduleSpecifier: string): string | null {
	if (!moduleSpecifier.startsWith(".")) return null;
	const fromDir = path.dirname(fromFile);
	const resolved = path.resolve(fromDir, moduleSpecifier);

	// If it already has an extension and the file exists, use it
	if (fs.existsSync(resolved) && !fs.statSync(resolved).isDirectory()) return resolved;

	// If the specifier has a .js/.jsx extension, also try .ts/.tsx (TypeScript convention)
	const altExts = resolved.endsWith(".js") ? ["", ".ts", ".tsx"]
		: resolved.endsWith(".jsx") ? ["", ".tsx", ".ts"]
		: [];

	for (const ext of [".ts", ".tsx", ".js", ".jsx", "/index.ts", "/index.tsx", "/index.js", "/index.jsx"]) {
		const candidate = resolved + ext;
		if (fs.existsSync(candidate)) return candidate;
	}
	// Try alt extensions (replace .js with .ts etc.)
	for (const alt of altExts) {
		if (alt === "") continue;
		const candidate = resolved.replace(/\.(js|jsx)$/, alt);
		if (fs.existsSync(candidate)) return candidate;
		const indexCandidate = resolved.replace(/\.(js|jsx)$/, "") + "/index" + alt;
		if (fs.existsSync(indexCandidate)) return indexCandidate;
	}

	return null;
}
