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

### 3. Callers / callees (implemented; transitive callgraph deferred)
`Symbol.location` is a `DefinitionLocation` carrying `nameRange` — the request
anchor. `LanguageAdapter.findUsages` (incoming references) and `callees`
(outgoing LSP call hierarchy) power the Callers/Usages and Callees sections via
`CodeGraph.findUsagesOf` / `calleesOf`. A *transitive/recursive* callgraph tool
is deliberately deferred (agents use direct edges, not the full hierarchy), but
the seam — additive `LanguageAdapter`/`CodeGraph` methods — is unchanged.

### 4. Tree-sitter enrichment (implemented)
File discovery is toolchain-vetted: jdtls reports source roots
(`java.project.listSourcePaths`), and the Rust adapter walks the Cargo-standard
source dirs (`src/`, `tests/`, `examples/`, `benches/`). Tree-sitter parses
*within that vetted file set* as an enricher only — it attaches leading
annotations/doc comments to LSP symbols (matched by name + name line). It also
extracts `#[proc_macro_derive(Name)]` / `#[proc_macro_attribute(Name)]` into
`Symbol.aliases` so derive names are searchable. It never
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

### 6. Enriched usages (implemented)
`findUsages` returns `Location[]` (uri + range). `resolveUsageSymbols` resolves
each location to its innermost containing symbol via the already-indexed
definition ranges — a pure in-memory geometry pass, no LSP call — and the usage
sections render them as `Container.member`.

### 7. Agent / pi interface (implemented)
The `code` and `code_search` tools (`index.ts` / `render.ts`) are thin
interfaces over the lib: cached `getGraph` + resolution + scope + usage-
resolution primitives for `code` (plus `locateCallable` in `lib/locate.ts` for
`file:line` / `Class:line` location queries), and `searchSymbols` (substring/
kinds/scope/path) for `code_search`. Callers/Usages render as a ranked,
deduped sample by default (`usages="summary"`); `usages="full"` lists every
call site. Grouping/ranking live as pure functions in `lib/usages.ts`. More
tools are additive interfaces, not changes to `lib/`.

### 8. Implementations / overrides (implemented)
`LanguageAdapter.implementations()` returns implementer/subclass/overrider
locations — Java uses `typeHierarchy/subtypes` for types and `implementation`
for methods; Rust uses `implementation` for both (rust-analyzer has no
typeHierarchy). `CodeGraph.implementationsOf()` resolves them to canonical
symbols via containment, falling back to a name match for reference anchors
like Rust's `impl Trait for Type` (normalizing generic self types
`DataFrame<T>` → `DataFrame`, then name + file, then a global name match so
impls in a different file than the type still resolve). `render.ts` shows them
as a dedicated
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
