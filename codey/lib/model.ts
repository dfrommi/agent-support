// Canonical, language-agnostic code model.
//
// This layer must stay free of any LSP or tree-sitter imports: language
// adapters translate their native formats into these types, and the common
// layer operates on them.

/** Source declaration kinds. Derived kinds (e.g. HTTP endpoints) extend this set later. */
export type SymbolKind =
	| "class"
	| "interface"
	| "enum"
	| "struct"
	| "trait"
	| "module"
	| "method"
	| "constructor"
	| "field"
	| "function"
	| "variable"
	| "constant"
	| "enum_member"
	| "macro"
	| "type";

/** 1-indexed position in a source file. */
export interface Position {
	line: number;
	column: number;
}

export interface Range {
	start: Position;
	end: Position;
}

export interface Location {
	/** file:// URI */
	uri: string;
	range: Range;
}

/** Location of a symbol's definition; adds the name anchor on top of a plain Location. */
export interface DefinitionLocation extends Location {
	/** Range of just the symbol's name — the anchor for usages/reference queries. */
	nameRange: Range;
}

export interface Symbol {
	/** Opaque, stable identity within a project. Source symbols use `${file}:${container}.${name}:${line}`; derived symbols may use other schemes. */
	id: string;
	/** Simple name, e.g. `findById` (signatures live in `signature`). */
	name: string;
	/** Human-readable signature, e.g. `User findById(String id)`. */
	signature?: string;
	kind: SymbolKind;
	/** Absolute filesystem path (no file:// prefix). */
	file: string;
	location: DefinitionLocation;
	/** Enclosing type, e.g. `UserService`; undefined for top-level symbols. */
	containerName?: string;
	/** Package/namespace, e.g. `com.example`; undefined for default-package or non-Java symbols. */
	packageName?: string;
	/** Leading annotations, e.g. `["@Override"]`. */
	annotations?: string[];
	/** Leading documentation comment (Javadoc), if any. */
	doc?: string;
	/** Additional exported names, e.g. `proc_macro_derive`/`proc_macro_attribute` names. */
	aliases?: string[];
}

export interface ProjectStats {
	files: number;
	symbols: number;
}
