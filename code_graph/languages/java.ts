import fs from "node:fs";
import path from "node:path";
import type { SyntaxNode } from "web-tree-sitter";
import type { Symbol } from "../model.ts";
import {
	childByName,
	CONTAINERS,
	extendStartOverComments,
	type ExtractionContext,
	isExported,
	namedChildren,
	symbolId,
} from "./helpers.ts";

// ── Container / member types for Java ───────────────────────

const JAVA_CONTAINERS = new Set([
	"class_declaration",
	"interface_declaration",
	"enum_declaration",
	"record_declaration",
	"annotation_type_declaration",
]);

const JAVA_MEMBERS = new Set([
	"method_declaration",
	"constructor_declaration",
	"compact_constructor_declaration",
	"annotation_type_element_declaration",
]);

/**
 * Extract symbols from a Java AST.
 */
export function extractSymbols(node: SyntaxNode, ctx: ExtractionContext, containerName?: string): void {
	for (const child of namedChildren(node)) {
		if (child.type === "import_declaration") {
			extractImport(child, ctx);
			continue;
		}

		if (JAVA_CONTAINERS.has(child.type)) {
			const name = childByName(child, "name")?.text ?? "";
			if (!name) continue;
			const kind = containerTypeToKind(child.type);
			const id = symbolId(ctx.file, name);
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
				exported: isPublic(child),
				parentName: undefined,
			};
			ctx.symbols.push(sym);

			const body = childByName(child, "body");
			if (body) extractSymbols(body, ctx, name);
			continue;
		}

		if (JAVA_MEMBERS.has(child.type)) {
			const name = childByName(child, "name")?.text ?? "";
			if (!name) continue;
			const isConstructor = child.type === "constructor_declaration" || child.type === "compact_constructor_declaration";
			const kind = isConstructor ? "method" : "method";
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
				exported: isPublic(child),
				parentName: containerName,
			};
			ctx.symbols.push(sym);

			const body = childByName(child, "body");
			if (body) extractCalls(body, id, ctx);
			continue;
		}

		if (child.type === "field_declaration" || child.type === "constant_declaration") {
			for (const decl of namedChildren(child)) {
				if (decl.type === "variable_declarator") {
					const name = childByName(decl, "name")?.text ?? "";
					if (!name) continue;
					const id = symbolId(ctx.file, name, containerName);
					ctx.symbols.push({
						id,
						name,
						kind: "variable",
						file: ctx.file,
						line: decl.startPosition.row + 1,
						column: decl.startPosition.column + 1,
						endLine: decl.endPosition.row + 1,
						endColumn: decl.endPosition.column + 1,
						exported: isPublic(child),
						parentName: containerName,
					});
				}
			}
			continue;
		}

		if (child.type === "enum_constant") {
			const name = childByName(child, "name")?.text ?? child.text;
			if (!name) continue;
			ctx.symbols.push({
				id: symbolId(ctx.file, name, containerName),
				name,
				kind: "variable",
				file: ctx.file,
				line: child.startPosition.row + 1,
				column: child.startPosition.column + 1,
				endLine: child.endPosition.row + 1,
				endColumn: child.endPosition.column + 1,
				exported: true,
				parentName: containerName,
			});
			continue;
		}

		// Recurse into blocks and other wrappers
		if (
			child.type === "class_body" ||
			child.type === "interface_body" ||
			child.type === "enum_body" ||
			child.type === "block" ||
			child.type === "enum_body_declarations"
		) {
			extractSymbols(child, ctx, containerName);
		}
	}
}

/**
 * Extract method/constructor call edges from a subtree.
 */
export function extractCalls(node: SyntaxNode, callerId: string, ctx: ExtractionContext): void {
	if (node.type === "method_invocation") {
		let calleeName: string | null = null;

		// Method invocation: obj.method() or just method()
		// The structure is: (method_invocation object:... name: (identifier) arguments:...)
		const nameNode = childByName(node, "name");
		if (nameNode && nameNode.type === "identifier") {
			calleeName = nameNode.text;
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

	if (node.type === "object_creation_expression") {
		// new Foo() — the type is in a child named 'type' or 'type_identifier'
		const typeNode = childByName(node, "type") ??
			node.namedChildren.find((c) => c.type === "type_identifier");
		if (typeNode) {
			const calleeName = typeNode.text;
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

// ── Helpers ─────────────────────────────────────────────────

function containerTypeToKind(type: string): Symbol["kind"] {
	switch (type) {
		case "class_declaration": return "class";
		case "interface_declaration": return "interface";
		case "enum_declaration": return "enum";
		case "record_declaration": return "class";
		case "annotation_type_declaration": return "interface";
		default: return "class";
	}
}

function isPublic(node: SyntaxNode): boolean {
	// Java: modifiers are inside a 'modifiers' child, e.g., (modifiers public)
	const modifiers = node.children.find((c) => c?.type === "modifiers");
	if (modifiers) {
		for (const child of modifiers.children) {
			if (child?.type === "public") return true;
		}
	}
	// Also check direct children (some grammars)
	for (const child of node.children) {
		if (child?.type === "public" || child?.type === "protected") return true;
	}
	return false;
}

// ── Import tracking ─────────────────────────────────────────

function extractImport(node: SyntaxNode, ctx: ExtractionContext): void {
	// Java imports: `import com.example.Foo;` or `import com.example.*;`
	// The tree-sitter structure: (import_declaration ... (scoped_identifier) ...)
	let importPath = "";
	for (const child of namedChildren(node)) {
		if (child.type === "scoped_identifier" || child.type === "identifier") {
			importPath = child.text;
		}
	}
	// Also handle wildcard: `import com.example.*;`
	const isWildcard = node.text.includes("*");

	if (importPath) {
		ctx.imports.push({
			localName: importPath.split(".").pop()!, // last segment: "Foo" from "com.example.Foo"
			sourceFile: "", // resolved later via classpath search
			exportedName: importPath,
		});
	}
}

// ── Module resolution for Java ──────────────────────────────

/**
 * Resolve a Java import to a file path.
 * `com.example.Foo` → look for `com/example/Foo.java` under the source root.
 */
export function resolveJavaImport(importPath: string, allFiles: string[]): string | null {
	const relPath = importPath.replace(/\./g, "/") + ".java";
	for (const file of allFiles) {
		if (file.endsWith(relPath) || file.endsWith("/" + relPath)) {
			return file;
		}
	}
	return null;
}
