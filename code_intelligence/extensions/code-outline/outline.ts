import fs from "node:fs";
import { glob } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Language, type Node, Parser } from "web-tree-sitter";

const WASM = path.join(
	path.dirname(fileURLToPath(import.meta.url)),
	"node_modules/tree-sitter-wasms/out/tree-sitter-java.wasm",
);

const CONTAINERS = new Set([
	"class_declaration",
	"interface_declaration",
	"enum_declaration",
	"record_declaration",
	"annotation_type_declaration",
]);

const MEMBERS = new Set([
	"method_declaration",
	"constructor_declaration",
	"compact_constructor_declaration",
	"annotation_type_element_declaration",
	"enum_constant",
]);

const FIELDS = new Set(["field_declaration", "constant_declaration"]);

/** A single rendered line of the outline. */
interface Entry {
	line: number; // 1-indexed
	depth: number;
	text: string;
}

let parser: Parser | undefined;

async function getParser(): Promise<Parser> {
	if (!parser) {
		await Parser.init();
		const p = new Parser();
		p.setLanguage(await Language.load(WASM));
		parser = p;
	}
	return parser;
}

const named = (n: Node): Node[] => n.namedChildren.filter((c): c is Node => c !== null);

/**
 * Literal nodes whose inner whitespace is data, not formatting, and must survive
 * signature collapsing. `text_block` is deliberately excluded: it spans multiple
 * lines, so preserving it would break the one-line-per-member layout.
 */
const LITERALS = new Set(["string_literal", "character_literal"]);

function literalRanges(node: Node, end: number, out: Array<[number, number]> = []) {
	for (const c of named(node)) {
		if (c.startIndex >= end) break;
		if (LITERALS.has(c.type)) out.push([c.startIndex, Math.min(c.endIndex, end)]);
		else literalRanges(c, end, out);
	}
	return out;
}

/**
 * Source text from `node.startIndex` to `end` with whitespace collapsed, except
 * inside string and character literals.
 */
function slice(src: string, node: Node, end: number): string {
	const parts: string[] = [];
	let pos = node.startIndex;
	for (const [s, e] of literalRanges(node, end)) {
		parts.push(src.slice(pos, s).replace(/\s+/g, " "), src.slice(s, e));
		pos = e;
	}
	parts.push(src.slice(pos, end).replace(/\s+/g, " "));
	return parts.join("").trim();
}

/** Declaration text up to the body (or up to the terminating `;` when there is none). */
function declaration(src: string, node: Node): string {
	const body = node.childForFieldName("body");
	return slice(src, node, body ? body.startIndex : node.endIndex).replace(/;$/, "").trim();
}

/** One line per declarator: `private final IPimService iPimService` (initializer dropped). */
function fieldLines(src: string, node: Node): string[] {
	const type = node.childForFieldName("type");
	const prefix = slice(src, node, type?.startIndex ?? node.endIndex);
	return named(node)
		.filter((c) => c.type === "variable_declarator")
		.map((d) => {
			const name = d.childForFieldName("name")?.text ?? d.text;
			const dims = named(d)
				.filter((c) => c.type === "dimensions")
				.map((c) => c.text)
				.join("");
			return [prefix, type?.text ?? "", name + dims].filter(Boolean).join(" ");
		});
}

/** Direct members of a container, flattening the `enum_body_declarations` wrapper. */
function membersOf(container: Node): Node[] {
	const body = container.childForFieldName("body");
	if (!body) return [];
	return named(body).flatMap((c) => (c.type === "enum_body_declarations" ? named(c) : [c]));
}

function walk(src: string, node: Node, depth: number, out: Entry[]): void {
	for (const m of membersOf(node)) {
		const line = m.startPosition.row + 1;
		if (CONTAINERS.has(m.type)) {
			out.push({ line, depth, text: declaration(src, m) });
			walk(src, m, depth + 1, out);
		} else if (MEMBERS.has(m.type)) {
			out.push({ line, depth, text: declaration(src, m) });
		} else if (FIELDS.has(m.type)) {
			for (const text of fieldLines(src, m)) out.push({ line, depth, text });
		}
	}
}

function render(entries: Entry[]): string {
	const width = Math.max(...entries.map((e) => String(e.line).length), 2);
	const lines = entries.map(
		(e) => `${String(e.line).padStart(width)}  ${"  ".repeat(e.depth)}${e.text}`,
	);
	return ["[Language: Java]", "", ...lines].join("\n");
}

/** Render the outline of a Java source string. */
export async function outlineSource(src: string): Promise<string> {
	const tree = (await getParser()).parse(src);
	if (!tree) throw new Error("Failed to parse source");
	try {
		if (tree.rootNode.hasError) {
			throw new Error("Source contains syntax errors and cannot be outlined");
		}

		const entries: Entry[] = [];
		for (const top of named(tree.rootNode)) {
			if (!CONTAINERS.has(top.type)) continue;
			entries.push({ line: top.startPosition.row + 1, depth: 0, text: declaration(src, top) });
			walk(src, top, 1, entries);
		}
		if (entries.length === 0) return "[Language: Java]\n\n(no declarations)";
		return render(entries);
	} finally {
		// Release the WASM-side tree; pi is a long-lived process.
		tree.delete();
	}
}

/** Refuse to outline more than this many files in one call. */
const MAX_FILES = 50;

const isGlob = (s: string): boolean => /[*?[\]{}]/.test(s);

async function outlineFile(file: string): Promise<string> {
	if (path.extname(file) !== ".java") {
		throw new Error(`Unsupported file type "${path.extname(file) || file}": only .java is supported`);
	}
	if (!fs.existsSync(file)) throw new Error(`File not found: ${file}`);
	return outlineSource(fs.readFileSync(file, "utf8"));
}

/** Expand one entry into concrete `.java` paths. Non-glob entries pass through unchecked. */
async function resolve(entry: string): Promise<string[]> {
	if (!isGlob(entry)) {
		if (fs.existsSync(entry) && fs.statSync(entry).isDirectory()) {
			throw new Error(
				`"${entry}" is a directory. Use a glob, e.g. "${entry}/*.java" for that package or "${entry}/**/*.java" to include subpackages.`,
			);
		}
		return [entry];
	}
	const matched: string[] = [];
	for await (const f of glob(entry)) if (path.extname(f) === ".java") matched.push(f);
	if (matched.length === 0) throw new Error(`No .java files matched: ${entry}`);
	return matched;
}

/**
 * Outline every `.java` file named by `paths`. Each entry is either a file path
 * or a glob. Unparseable files are reported inline rather than failing the call.
 */
export async function outline(paths: string[]): Promise<string> {
	if (paths.length === 0) throw new Error("No paths given");

	const resolved = new Set<string>();
	for (const entry of paths) {
		for (const f of await resolve(entry.replace(/^@/, ""))) resolved.add(f);
	}
	const files = [...resolved].sort();
	if (files.length > MAX_FILES) {
		throw new Error(`${files.length} files matched, limit is ${MAX_FILES}. Narrow the paths.`);
	}

	const sections = await Promise.all(
		files.map(async (f) => {
			try {
				const body = (await outlineFile(f)).split("\n").slice(2).join("\n");
				return { text: `=== ${f}\n${body}`, error: undefined as Error | undefined };
			} catch (e) {
				return { text: `=== ${f}\n  (skipped: ${(e as Error).message})`, error: e as Error };
			}
		}),
	);
	// Containing per-file failures only makes sense when something else succeeded;
	// otherwise surface the error rather than returning a skip notice as an outline.
	const failed = sections.filter((s) => s.error);
	if (failed.length === sections.length) throw failed[0].error;

	const header = files.length === 1 ? "[Language: Java]" : `[Language: Java] ${files.length} files`;
	return [header, "", sections.map((s) => s.text).join("\n\n")].join("\n");
}
