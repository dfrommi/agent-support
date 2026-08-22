import type { Location, Symbol } from "./model.ts";

/** A declaration or reference location of an implementer/subclass/overrider. */
export interface ImplementationCandidate extends Location {
	/** Simple name at the location, used to resolve reference anchors (e.g. `impl Trait for Type`). */
	name?: string;
}

/**
 * A language adapter produces a normalized symbol inventory for a project.
 * It is the only layer that knows about language servers or parsers.
 *
 * Later capabilities (references, callers/callees, …) are added here as new
 * methods — additive extensions that require no change to the common layer.
 */
export interface LanguageAdapter {
	readonly languageId: string;
	/**
	 * Relevant source files for the project, as vetted by the language
	 * toolchain (e.g. a language server's project import / source roots).
	 * Must not rely on naive extension walking.
	 */
	discoverSourceFiles(root: string): Promise<string[]>;
	/** Full symbol inventory for the given files. */
	indexSymbols(root: string, files: string[]): Promise<Symbol[]>;
	/** All usages of a symbol across the project (excluding its declaration). */
	findUsages(symbol: Symbol): Promise<Location[]>;
	/** Declaration locations (name anchors) of implementers/subclasses/overriders. */
	implementations(symbol: Symbol): Promise<ImplementationCandidate[]>;
	/** Symbols this symbol directly calls (resolved callees). */
	callees(symbol: Symbol): Promise<Symbol[]>;
	/** Release any held resources (e.g. a spawned language server). */
	close(): Promise<void>;
}
