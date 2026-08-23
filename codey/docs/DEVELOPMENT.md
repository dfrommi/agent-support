# codey — Durable Development Context

Read this before changing `codey/` again. It captures the decisions,
rationale, and non-obvious gotchas from the rebuild conversation — the things
the code alone won't tell you. `design.md` is the sibling doc for extension
seams; this one is the fuller working memory.

## Current state (snapshot)

`codey/` is a **Java + Rust code-understanding lib + CLI + pi extension**:

- Lib (`lib/`) is language-agnostic and pure (no LSP/tree-sitter imports).
- Language layers (`languages/java/`, `languages/rust/`) talk to **jdtls** /
  **rust-analyzer** (LSP) and **tree-sitter** (enrichment only).
- Interfaces: a thin **CLI** (testing only, not a perf target) and a pi
  extension exposing a single **`code`** tool.

45 tests green (`npm test`), fixtures under `test/fixture-java` (Maven) and
`test/fixture-rust` (Cargo).

## Layer map

| File | Responsibility |
| --- | --- |
| `lib/model.ts` | Canonical types: `Symbol`, `Location`, `DefinitionLocation`, `ProjectStats` |
| `lib/adapter.ts` | `LanguageAdapter` port: `discoverSourceFiles`, `indexSymbols`, `findUsages`, `callees`, `close` |
| `lib/graph.ts` | `CodeGraph`: `symbol`, `find`, `members`, `file`, `findUsages`/`findUsagesOf`, `calleesOf`, `stats`; `createGraph` |
| `lib/query.ts` | `SymbolQuery` (`where`, `inPath`, `list`, `count`) |
| `lib/scope.ts` | `Scope = "main" | "test" | "all"`,`inScope` |
| `lib/resolve.ts` | `resolveSymbol`, `findFiles` (deterministic, kind-ranked resolution) |
| `lib/usages.ts` | `containingSymbol`, `resolveUsageSymbols` (location → innermost symbol) |
| `lib/session.ts` | cached `getGraph(root, factory)`, `resetGraphs()` |
| `lib/uri.ts` | `uriToFile` (normalized `file://` → path) |
| `lsp/client.ts` | generic JSON-RPC client on `vscode-jsonrpc` + protocol types; timeouts |
| `lsp/findBinary.ts` | binary resolution |
| `languages/java/lsp.ts` | jdtls startup (lazy launcher) + `lspKindToSymbolKind` |
| `languages/java/adapter.ts` | `JavaAdapter`: LSP discovery/indexing, usages, callees, `syncFiles` |
| `languages/java/treesitter.ts` | `enrichSymbols`: annotations + Javadoc only |
| `languages/rust/lsp.ts` | rust-analyzer startup (lazy launcher) + `lspKindToSymbolKind` |
| `languages/rust/adapter.ts` | `RustAdapter`: Cargo-layout discovery/indexing, usages, callees, `syncFiles` |
| `languages/rust/treesitter.ts` | `enrichSymbols`: attributes + `///` docs only |
| `languages/detect.ts` | marker → `{ adapterFactory, languageId }` |
| `interfaces/cli.ts` | CLI (testing) |
| `index.ts` | pi extension: registers `code`, lifecycle warmup/shutdown |
| `render.ts` | `explore(root, query, scope, usages)` — all resolution + rendering |

## Glossary (precise meanings)

- **Symbol** — a declaration. `name` is the *simple* name (`findById`);
  `signature` carries the parameterized form (`findById(String)`). `containerName`
  is the *immediate* enclosing type's simple name (`UserService`), not qualified.
- **Location** — `{ uri, range }`; any occurrence (a usage).
- **DefinitionLocation** — `Location` + `nameRange`; a symbol's definition.
- **range** (on a symbol) — full definition span. **jdtls includes leading
  Javadoc/annotations in `range`**; `nameRange` is just the name token.
- **nameRange** — the name token range; the anchor for LSP calls
  (`references`, `prepareCallHierarchy`).
- **findUsages** — editor "Find Usages" / find-references (incoming
  occurrences), `includeDeclaration: false`. Returns `Location[]`.
- **callees** — direct outgoing calls (LSP `outgoingCalls`), resolved to
  symbols. *Not* transitive callgraph.
- **resolveSymbol** — deterministic name resolution, tiers exact →
  case-insensitive → substring, kind-ranked, supports `Container.member`.

## Decisions worth remembering (and why)

1. **LSP-first, Java and Rust.** jdtls requires a *buildable* Maven/Gradle
   project (standard layout); rust-analyzer requires a Cargo project. Loose
   source files are out of scope and would need a tree-sitter-only path.
2. **File discovery is toolchain-vetted, not naive extension walking.**
   `java.project.listSourcePaths` tells us the real Java source roots;
   rust-analyzer has no equivalent, so the Rust adapter walks the Cargo-standard
   source dirs (`src/`, `tests/`, `examples/`, `benches/`). Generated files under
   `target/` stay excluded *by construction* either way.
3. **Tree-sitter is an enricher, never a second inventory.** It only attaches
   `annotations` and `doc` to LSP symbols (matched by name + name line). LSP
   owns identity and ranges. Tree-sitter never reintroduces naive walking.
4. **Simple name + separate signature.** jdtls reports methods as
   `findById(String)`; we split at `(` so agents get clean names and the
   parameterized form is preserved in `signature`.
5. **Naming.** `Location` vs `DefinitionLocation` (rejected `SourceLocation`
   because "source" describes the domain, not the purpose). `nameRange` (not
   LSP's `selectionRange` — "we are not selecting anything").
6. **`findUsages`, not `references`.** Matches editor "Find Usages" semantics
   and avoids the caller/callee confusion (`references` in LSP is *incoming
   locations*, not target symbols).
7. **`vscode-languageserver-protocol` + `vscode-jsonrpc`**, deliberately **not**
   `vscode-languageclient` (editor-oriented lifecycle, too much machinery for a
   headless indexer).
8. **One `code` tool**, modeled on `codelin`'s interface (see below). Fixed
   multi-tool APIs were considered and rejected for now; "two tools beat one
   `mode` enum" applies when there's a second genuinely different operation.
9. **File queries return a symbol outline, not full source.** `read` owns full
   source. The outline is token-efficient and complements `read`. The line
   format is **`:start (N lines)`** so it maps directly to
   `read(offset: start, limit: N)` with no arithmetic. Rejected `:start-end`
   (needs `end-start+1`) and `:start +N` (token-cheaper but the user worried
   agents wouldn't parse it).
10. **Outgoing edges = direct LSP `outgoingCalls`** (resolved callees), not a
    recursive callgraph. The user clarified: "agents don't use hierarchy" meant
    the *recursive* tool, not direct edges. `calleesOf` reconciles LSP results
    against the indexed inventory so containers read `UserService`, not
    `com.example.UserService`.
11. **No transitive/recursive callgraph tool.** Deferred; the seam exists
    (`nameRange`, additive adapter methods).
12. **Pseudo-symbols (endpoints, schedulers, listeners) are a long-term goal,
    not now.** The model already accommodates them: `Symbol` is the single node
    type, `id` is opaque, `SymbolKind` is documented as extensible, and a future
    derivation step would run after indexing before graph construction.
13. **Rust is implemented**, behind the same `LanguageAdapter` port. Rust
    constructs map onto the canonical model: struct/trait/module/macro/constant
    are their own `SymbolKind`s; enum variants and Java enum constants share
    `enum_member`; `impl` blocks are grouping only and their methods get
    `containerName` = the implemented type.
14. **CLI is for testing only.** The pi extension is the real interface; LSP
    should be started at session start and kept running ("start, keep running,
    stop").
15. **Asymmetry is intentional:** `symbol()` returns `Symbol[]` (exact lookup);
    `find()`/`members()`/`file()` return `SymbolQuery` (exploratory, chainable).
16. **Activation** gates on `Cargo.toml` / `pom.xml` / `build.gradle(.kts)` at
    session cwd; `Cargo.toml` wins when both are present.
17. **Caching** (`lib/session.ts`): cached per root; mtime invalidation
    triggers an *incremental* re-index of only added/changed files through the
    running adapter (see #22); usages/callees are **never cached** (always live
    LSP). An `opening` map dedupes concurrent `getGraph` calls so warmup + first
    tool call don't spawn two language servers.
18. **Usages render as a ranked sample by default.** `code` takes
    `usages: "summary" | "full"` (default `summary`). Summary dedupes call sites
    by containing symbol (`(×N)`), ranks different-file callers first, caps at
    `MAX_USAGE_SAMPLE` (5), and prints a `use usages="full"` hint when something
    is hidden. Grouping/ranking are pure functions in `lib/usages.ts`
    (`groupUsages`, `rankUsages`, `sampleUsages`), unit-tested without LSP.
19. **`code_search` ranks by similarity (`fuzzysort`).** The substring filter
    is unchanged (only *what* matches); results are then ordered by
    `fuzzysort` score (max over bare + qualified name, across OR'd substrings)
    desc, then `kindRank`. `fuzzysort@4.0.2` is the one dependency added for
    this: 0-dep, camelCase/snake_case/dot-boundary aware — chosen over
    `fast-fuzzy` whose edit-distance ties + earliness tie-break misrank
    mid-word matches (e.g. `Id` → `HumidityPoint` above `MetricId`).
20. **Proc-macro derive/attribute names are searchable aliases.** The Rust
    tree-sitter enricher extracts `#[proc_macro_derive(Name)]` /
    `#[proc_macro_attribute(Name)]` into `Symbol.aliases`; `searchSymbols`
    matches and scores aliases alongside bare + qualified names, and `search`
    renders them as `alias: Name`. So `code_search("StateEnumDerive")` returns
    `state_enum_derive`. (`aliases` is a canonical model field — language
    specifics stay in the Rust enricher.)
21. **Generic trait impls resolve to their implementing type.** For reference
    anchors, `implementationsOf` normalizes `DataFrame<T>` → `DataFrame`
    (`plainTypeName`) and, after the name + file match, falls back to a global
    name match so an impl in a different file than the type still resolves
    (`code(DataFrameStatsExt)` → `Implementations (1): DataFrame`). Residual
    edge: duplicate simple type names across modules could match the wrong one;
    a rust-analyzer `definition` on the self-type token would resolve exactly,
    if that ever bites.
22. **Incremental re-index (`lib/session.ts`).** `getGraph` diffs discovered
    files against the cached mtimes and re-indexes only added/changed files via
    the running adapter, dropping symbols of removed files and merging the rest.
    `indexSymbols` already worked on a subset, so this is a session-layer change
    only. Covered by `test/session-incremental.test.ts` (fake adapter, no LSP).
23. **LSP requests are cancellable on timeout (`lsp/client.ts`).** `request`
    passes a `CancellationTokenSource` to `connection.sendRequest` and cancels
    it on timeout, so vscode-jsonrpc sends `$/cancelRequest` and drops its
    pending bookkeeping instead of accumulating it.
24. **Java packages are captured on symbols (`Symbol.packageName`).** The Java
    adapter reads the top-level `package` node (kind 4) from `documentSymbols`
    and threads it through `flattenDocSymbols`/`toSymbol`, so every symbol in a
    packaged file carries its package. `render.ts` prepends it in `code_search`
    results and `code` "Other matches" via `qualifiedDisplayName`.
    `resolveSymbol` also accepts package-qualified queries
    (`com.example.UserService`, `com.example.UserService.findUser`) via
    `packageQualifiedName`, so search output feeds straight back into `code`.
25. **Rust `::` is accepted as the member separator.** `resolveSymbol` and
    `searchSymbols` normalize `::` → `.` at their entry points, so
    `code("User::new")` and `code_search("User::new")` behave like the
    `Container.member` forms. Full module paths (`crate::foo::Bar::new`) are
    still unsupported pending Rust module resolution.

## Non-obvious gotchas

- **`java.project.listSourcePaths`** returns
  `{ data: [{ path, displayPath, classpathEntry, projectName, projectType }], status: true }`.
  Parse `path` from `data`.
- **jdtls `documentSymbols`:** method `name` includes parameters
  (`findById(String)`); `detail` is *only* the return type (`: User`); the
  `selectionRange` is the name token; `range` includes leading Javadoc.
- **jdtls call hierarchy `detail`** is the *fully-qualified* container
  (`com.example.UserService`) — reconcile against the inventory for simple names.
- **jdtls startup pitfalls** (documented in `languages/java/lsp.ts`): data dir
  outside project root; `JAVA_HOME` 21+ for the process; Maven/Gradle import
  must be enabled via `initializationOptions`; `workspaceFolders` must be sent;
  standard layout + buildable project required.
- **rust-analyzer startup** (`languages/rust/lsp.ts`): poll
  `rust-analyzer/analyzerStatus` until it stops reporting "No workspaces"
  before indexing — documentSymbols can be empty/partial while the Cargo
  workspace is still loading. `references` returns "content modified" on files
  that were never `didOpen`ed, and call hierarchy lags documentSymbols on a
  cold start; the adapter retries transient "content modified"/empty prepare.
- **rust-analyzer `documentSymbols`:** `impl User` / `impl Trait for Type` are
  kind Object (skip them; their children belong to the implemented type);
  functions/methods carry `detail` like `fn(&self) -> String`; `macro_rules!`
  is reported as LSP Function with empty detail (classified `macro`).
- **rust-analyzer call hierarchy `detail`** is the signature
  (`fn name(...) -> ...`), not the container — reconcile against the inventory.
- **web-tree-sitter node wrappers are not stable** across separate child
  accesses — match by `node.id`, never `indexOf`.
- **Node type-strip mode:** no TS parameter properties, no `enum` — keep source
  erasable.
- **Tree-sitter deps are exact-pinned** (`web-tree-sitter@0.25.10` +
  `tree-sitter-wasms@0.1.13`); 0.26+ has an ABI mismatch.
- **jdtls launcher is resolved lazily** (`getJdtlsLauncher()`) so importing the
  extension never throws when jdtls is absent; it only throws on connect.
- **`vscode-jsonrpc` requests need a timeout wrapper** (`Promise.race` +
  swallow late settle); `shutdown` uses a 3s timeout, `listSourcePaths` polls at 5s.
- **URI↔path:** always normalize with `fileURLToPath` (`lib/uri.ts`), not
  string `replace("file://","")` — LSP may percent-encode.
- **`didChange` needs a short delay before `documentSymbols`** so jdtls
  re-parses (400ms currently).
- **Fixture `.class` files** under `target/` were tracked and got dirtied by
  jdtls recompiles; `target/` is now gitignored and the binaries untracked.

## Testing

- `npm test` → `node --test 'test/*.test.ts'`; no framework.
- `test/lib.test.ts` is **pure** (no LSP): scope, resolution, usage→symbol.
- `test/java-symbol.test.ts` and `test/render.test.ts` spawn real jdtls;
  `test/rust-symbol.test.ts` and `test/rust-render.test.ts` spawn real
  rust-analyzer. The suite is slow by design; CLI perf is out of scope.
- `fixture-java` is a Maven project; `fixture-rust` is a Cargo project. The
  cached-graph tests mutate a source file and restore it in `finally`.
- `index.ts` is **not** importable in node tests (peer deps `@earendil-works/pi-coding-agent`,
  `typebox`); its logic is covered via `render.ts` + `lib`.

## Prompt/interface notes

The `code` tool's description/`promptSnippet`/`promptGuidelines` are modeled on
`codelin` (which the user found "very good at convincing agents"). The winning
phrases to keep:

- "Prefer this over rg-then-read whenever you know a name."
- "…rg returns only the text line." / "Do not reconstruct by hand from rg hits."
- "Use rg/fd only to discover names you don't yet know … then switch to code."
- "code output is for understanding only. Before editing, re-read the exact range."
- "Use `code(file)` to survey a file's symbols as an outline … then read only
  the ranges you need."

Output is for agents, not humans: resolved qualified names, `file:line`,
never node ids.

## Open items / future directions (deferred, with reason)

- **Outgoing field/type references** (`References →`) — `callees` covers method
  calls only; type/field outgoing would likely be tree-sitter.
- **Project/package overview** — no way to enumerate top-level types without a
  known name.
- **Type relationships** (extends/implements) — not extracted yet.
- **Rust module paths (qualified names)** — Java packages are captured
  (`Symbol.packageName`, see #24); Rust qualified paths would need module
  resolution across files.
- **Pseudo-symbols** (HTTP endpoints from `@RequestMapping`, etc.) — long-term;
  annotations are already captured.
- **Rust workspaces + custom `[lib] path`** — the adapter walks the standard
  single-crate layout (`src/`, `tests/`, `examples/`, `benches/`) only.
- **`#[cfg(test)]` scope detection** — a container named `test`/`tests` counts
  as test scope; nested helper modules under it still count as `main`.
- **Usage resolution is O(usages × symbols)** — indexable by file later.
- **`getGraph` re-runs `listSourcePaths` every call** — acceptable now.
- **Empty container renders no body** (only header + usages).
- **`resolve.ts` calls `graph.find(query).list()` twice** — minor.
