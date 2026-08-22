# Design — how the code is prepared for later requirements

This records the seams and decisions that keep future work additive rather than
a rewrite. It is intentionally short: each point says *why* the current shape
can absorb a later requirement and *where* the change would land.

## Layering

```
lib/            canonical model + graph + query. No LSP/tree-sitter imports.
languages/java/ language adapter: discovers files and extracts symbols via jdtls.
languages/rust/ language adapter: discovers files and extracts symbols via rust-analyzer.
lsp/            generic JSON-RPC transport (vscode-jsonrpc) + protocol types.
interfaces/     the CLI. More interfaces will sit on lib/ later.
```

The rule: language specifics never leak above `languages/`; the common layer
(`lib/`) operates only on the canonical model.

## Extension seams

### 1. More languages (Rust done, …)
New languages implement the same `LanguageAdapter` port (`discoverSourceFiles`,
`indexSymbols`, `findUsages`, `callees`, `close`) and add a `languages/<lang>/`
directory. Rust landed this way behind `languages/rust/`; the canonical
`SymbolKind` union was extended with `struct`/`trait`/`module`/`macro`/`constant`/
`enum_member` (the last shared with Java enum constants) to keep kinds faithful.

### 2. Intelligence beyond raw LSP calls
`CodeGraph` (find, filters, future impact/paths) works on `Symbol[]` and the
canonical model. It never imports LSP or tree-sitter, so reasoning code stays
language-agnostic.

### 3. Call hierarchy / callers-callees (not planned soon)
`Symbol.location` is a `DefinitionLocation` carrying `nameRange` — the anchor a
future `callers`/`callees` request would need. Adding it means new methods on
`LanguageAdapter` and `CodeGraph`; the model does not change. Deliberately
deferred: agents don't use it, but the seam is there.

### 4. Tree-sitter enrichment (implemented)
File discovery is toolchain-vetted: jdtls reports source roots
(`java.project.listSourcePaths`), and the Rust adapter walks the Cargo-standard
source dirs (`src/`, `tests/`, `examples/`, `benches/`). Tree-sitter parses
*within that vetted file set* as an enricher only — it attaches leading
annotations/doc comments to LSP symbols (matched by name + name line). It never
produces its own symbol inventory and never reintroduces naive extension
walking, so "generated under build" stays excluded by construction.

### 5. Pseudo / derived symbols (HTTP endpoints, schedulers, listeners)
`Symbol` is the single node type; derived nodes are just more `Symbol`s.
- `SymbolKind` is a closed union today but documented as extensible with
  derived kinds.
- `id` is opaque; source symbols use `${file}:${container}.${name}:${line}`,
  derived symbols may use their own scheme.
- Derivation runs after indexing and before graph construction, so the query
  layer (`find`/`where`/`inPath`) treats derived symbols uniformly with no
  change.

### 6. Enriched usages (print "class.method" per usage)
`findUsages` returns `Location[]` (uri + range). Each location can later be
resolved to its innermost containing symbol via the already-indexed definition
ranges — a pure in-memory geometry pass, no LSP call. Deferred; the data to do
it is already in the graph.

### 7. Agent / pi interface (implemented)
The `code` and `code_search` tools (`index.ts` / `render.ts`) are thin
interfaces over the lib: cached `getGraph` + resolution + scope + usage-
resolution primitives for `code` (plus `locateCallable` in `lib/locate.ts` for
`file:line` / `Class:line` location queries), and `searchSymbols` (substring/
kinds/scope/path) for `code_search`. More tools are additive interfaces, not
changes to `lib/`.

### 8. Implementations / overrides (implemented)
`LanguageAdapter.implementations()` returns implementer/subclass/overrider
locations — Java uses `typeHierarchy/subtypes` for types and `implementation`
for methods; Rust uses `implementation` for both (rust-analyzer has no
typeHierarchy). `CodeGraph.implementationsOf()` resolves them to canonical
symbols via containment, falling back to a name + file match for reference
anchors like Rust's `impl Trait for Type`. `render.ts` shows them as a dedicated
Implementations/Subclasses/Overrides section and filters those ids out of
Usages.

## Decisions held so far

- Java and Rust; LSP-first; requires a buildable Maven/Gradle or Cargo project.
- `vscode-languageserver-protocol` (types/constants) + `vscode-jsonrpc`
  (transport); deliberately not `vscode-languageclient`.
- `Location` (any occurrence) vs `DefinitionLocation` (a declaration +
  `nameRange`).
- `symbol()` is exact and returns `Symbol[]`; `find()` is fuzzy and returns a
  filterable `SymbolQuery`.
