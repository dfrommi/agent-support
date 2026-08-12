import fs from "node:fs";
import path from "node:path";
import type { SyntaxNode } from "web-tree-sitter";
import type { Symbol } from "../model.ts";
import {
	childByName,
	extendStartOverComments,
	type ExtractionContext,
	namedChildren,
	symbolId,
} from "./helpers.ts";

// ── Container types for Rust ────────────────────────────────

const RUST_CONTAINERS = new Set([
	"struct_item",
	"enum_item",
	"trait_item",
	"impl_item",
]);

export function extractSymbols(node: SyntaxNode, ctx: ExtractionContext, containerName?: string): void {
	for (const child of namedChildren(node)) {
		if (child.type === "use_declaration") {
			extractImport(child, ctx);
			continue;
		}

		if (child.type === "function_item") {
			const name = childByName(child, "name")?.text ?? "";
			if (!name) continue;
			const id = symbolId(ctx.file, name, containerName);
			const startPos = extendStartOverComments(child);
			const sym: Symbol = {
				id,
				name,
				kind: containerName ? "method" : "function",
				file: ctx.file,
				line: startPos.row + 1,
				column: startPos.column + 1,
				endLine: child.endPosition.row + 1,
				endColumn: child.endPosition.column + 1,
				exported: isPublic(child),
				parentName: containerName,
			};
			ctx.symbols.push(sym);

			const body = childByName(child, "body");
			if (body) extractCalls(body, id, ctx);
			continue;
		}

		if (child.type === "struct_item") {
			const name = childByName(child, "name")?.text ?? "";
			if (!name) continue;
			const startPos = extendStartOverComments(child);
			ctx.symbols.push({
				id: symbolId(ctx.file, name),
				name,
				kind: "class",
				file: ctx.file,
				line: startPos.row + 1,
				column: startPos.column + 1,
				endLine: child.endPosition.row + 1,
				endColumn: child.endPosition.column + 1,
				exported: isPublic(child),
			});
			continue;
		}

		if (child.type === "enum_item") {
			const name = childByName(child, "name")?.text ?? "";
			if (!name) continue;
			const startPos = extendStartOverComments(child);
			ctx.symbols.push({
				id: symbolId(ctx.file, name),
				name,
				kind: "enum",
				file: ctx.file,
				line: startPos.row + 1,
				column: startPos.column + 1,
				endLine: child.endPosition.row + 1,
				endColumn: child.endPosition.column + 1,
				exported: isPublic(child),
			});
			continue;
		}

		if (child.type === "trait_item") {
			const name = childByName(child, "name")?.text ?? "";
			if (!name) continue;
			const startPos = extendStartOverComments(child);
			ctx.symbols.push({
				id: symbolId(ctx.file, name),
				name,
				kind: "interface",
				file: ctx.file,
				line: startPos.row + 1,
				column: startPos.column + 1,
				endLine: child.endPosition.row + 1,
				endColumn: child.endPosition.column + 1,
				exported: isPublic(child),
			});
			if (childByName(child, "body")) extractCalls(childByName(child, "body")!, "", ctx);
			continue;
		}

		if (child.type === "impl_item") {
			const typeNode = childByName(child, "type");
			const traitNode = childByName(child, "trait");
			let implName = typeNode?.text ?? "";
			if (traitNode) implName = traitNode.text + " for " + implName;
			extractSymbols(child, ctx, implName || undefined);
			continue;
		}

		if (child.type === "let_declaration") {
			const pattern = childByName(child, "pattern");
			const value = childByName(child, "value");
			const name = pattern?.text ?? "";
			if (name && value) {
				if (value.type === "closure_expression" || value.type === "function_item") {
					const id = symbolId(ctx.file, name, containerName);
					ctx.symbols.push({
						id,
						name,
						kind: "function",
						file: ctx.file,
						line: child.startPosition.row + 1,
						column: child.startPosition.column + 1,
						endLine: child.endPosition.row + 1,
						endColumn: child.endPosition.column + 1,
						exported: isPublic(child),
						parentName: containerName,
					});
					const body = childByName(value, "body");
					if (body) extractCalls(body, id, ctx);
				}
			}
			if (value) extractCalls(value, "", ctx);
			continue;
		}

		if (child.type === "mod_item") {
			const name = childByName(child, "name")?.text ?? "";
			const body = childByName(child, "body");
			if (body && name) extractSymbols(body, ctx, name);
			continue;
		}

		if (
			child.type === "block" ||
			child.type === "declaration_list" ||
			child.type === "source_file"
		) {
			extractSymbols(child, ctx, containerName);
		}
	}
}

export function extractCalls(node: SyntaxNode, callerId: string, ctx: ExtractionContext): void {
	if (node.type === "call_expression") {
		const func = childByName(node, "function");
		if (func) {
			let calleeName: string | null = null;
			if (func.type === "identifier") {
				calleeName = func.text;
			} else if (func.type === "field_expression") {
				const field = childByName(func, "field");
				calleeName = field?.text ?? null;
			} else if (func.type === "scoped_identifier") {
				const parts = func.text.split("::");
				calleeName = parts[parts.length - 1];
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

function extractImport(node: SyntaxNode, ctx: ExtractionContext): void {
	const text = node.text.replace(/^use\s+/, "").replace(/;$/, "").trim();
	const segments = text.split("::");
	const localName = segments[segments.length - 1];
	const asMatch = localName.match(/^(\w+)\s+as\s+(\w+)$/);
	if (asMatch) {
		ctx.imports.push({
			localName: asMatch[2],
			sourceFile: "",
			exportedName: segments.slice(0, -1).join("::") + "::" + asMatch[1],
		});
	} else {
		ctx.imports.push({
			localName,
			sourceFile: "",
			exportedName: text,
		});
	}
}

function isPublic(node: SyntaxNode): boolean {
	for (const child of node.children) {
		if (child?.type === "pub" || child?.type === "pub(crate)") return true;
	}
	const visibility = node.children.find((c) => c?.type === "visibility_modifier");
	if (visibility) {
		for (const child of visibility.children) {
			if (child?.type === "pub") return true;
		}
	}
	return false;
}

export function resolveRustImport(importPath: string, allFiles: string[]): string | null {
	const parts = importPath.replace(/^crate::/, "").split("::");
	const relPath = parts.join("/") + ".rs";
	for (const file of allFiles) {
		if (file.endsWith("/" + relPath) || file.endsWith(relPath)) {
			return file;
		}
	}
	const modPath = parts.join("/") + "/mod.rs";
	for (const file of allFiles) {
		if (file.endsWith("/" + modPath)) {
			return file;
		}
	}
	return null;
}
