import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { Language, Parser, type SyntaxNode } from "web-tree-sitter";
import type { Symbol } from "../../lib/model.ts";

const WASM = fileURLToPath(
	new URL("../../node_modules/tree-sitter-wasms/out/tree-sitter-rust.wasm", import.meta.url),
);

const DECLARATIONS = new Set([
	"struct_item",
	"enum_item",
	"trait_item",
	"function_item",
	"const_item",
	"static_item",
	"type_item",
	"macro_definition",
	"mod_item",
	"field_declaration",
	"enum_variant",
]);

const COMMENT_TYPES = new Set(["line_comment", "block_comment"]);

const named = (n: SyntaxNode): SyntaxNode[] => n.namedChildren.filter((c): c is SyntaxNode => c !== null);

let parser: Parser | null = null;

async function getParser(): Promise<Parser> {
	if (parser) return parser;
	await Parser.init();
	const p = new Parser();
	p.setLanguage(await Language.load(WASM));
	parser = p;
	return p;
}

/**
 * Attach leading `#[…]` attributes and `///` doc comments to the given
 * symbols in a file. Tree-sitter is used only for this metadata — symbol
 * identity and ranges stay LSP-owned.
 */
export async function enrichSymbols(file: string, symbols: Symbol[]): Promise<void> {
	const text = fs.readFileSync(file, "utf8");
	const tree = (await getParser()).parse(text);
	try {
		const decls = collectDeclarations(tree.rootNode);
		for (const sym of symbols) {
			const key = `${sym.name}:${sym.location.nameRange.start.line}`;
			const meta = decls.get(key);
			if (!meta) continue;
			if (meta.attributes.length > 0) sym.annotations = meta.attributes;
			if (meta.doc) sym.doc = meta.doc;
			const aliases = procMacroNames(meta.attributes);
			if (aliases.length > 0) sym.aliases = aliases;
		}
	} finally {
		tree.delete();
	}
}

interface Meta {
	attributes: string[];
	doc?: string;
}

function collectDeclarations(root: SyntaxNode): Map<string, Meta> {
	const map = new Map<string, Meta>();
	const walk = (node: SyntaxNode): void => {
		if (DECLARATIONS.has(node.type)) {
			const nameNode = node.childForFieldName("name");
			if (nameNode) add(map, node, nameNode);
		}
		for (const c of named(node)) walk(c);
	};
	walk(root);
	return map;
}

function add(map: Map<string, Meta>, decl: SyntaxNode, nameNode: SyntaxNode): void {
	const key = `${nameNode.text}:${nameNode.startPosition.row + 1}`;
	if (!map.has(key)) map.set(key, extractMeta(decl));
}

function extractMeta(decl: SyntaxNode): Meta {
	const attributes: string[] = [];
	const comments: string[] = [];

	const parent = decl.parent;
	if (parent) {
		const siblings = named(parent);
		// node wrappers are not stable across separate child accesses — match by id.
		const idx = siblings.findIndex((s) => s.id === decl.id);
		for (let i = idx - 1; i >= 0; i--) {
			const sib = siblings[i];
			if (sib.type === "attribute_item") {
				attributes.unshift(sib.text);
			} else if (COMMENT_TYPES.has(sib.type)) {
				if (isDocComment(sib.text)) comments.unshift(sib.text);
				else break;
			} else {
				break;
			}
		}
	}

	const doc = comments.join("\n").trim();
	return { attributes, doc: doc || undefined };
}

function isDocComment(text: string): boolean {
	return text.startsWith("///") || text.startsWith("//!") || text.startsWith("/**");
}

/** `#[proc_macro_derive(Name)]` / `#[proc_macro_attribute(Name)]` → exported macro name. */
function procMacroNames(attributes: string[]): string[] {
	const names: string[] = [];
	for (const attr of attributes) {
		const m = /#\[\s*proc_macro_(?:derive|attribute)\s*\(\s*([A-Za-z_][A-Za-z0-9_]*)/.exec(attr);
		if (m) names.push(m[1]);
	}
	return names;
}
