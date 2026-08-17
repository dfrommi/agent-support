# codelin

A pi extension with two code-graph tools — **`code`** and **`callgraph`** — backed by a local [`@colbymchenry/codegraph`](https://www.npmjs.com/package/@colbymchenry/codegraph) index (30+ languages, no language server, kept fresh by a file watcher). Together they replace the `rg`+`read` loop for *understanding* code: symbols, call paths, and endpoint-to-symbol traces in one call each.

Line numbers use `<n>\t<line>` (no padding) so the agent can locate and cite code. They are for understanding — before editing, re-read the exact range with `read(path, offset, limit)`.

## The two tools

### `code` — resolve a symbol or file

```
code("CatalogService")        # symbol → source + callers/callees + type relationships
code("src/service.ts")     # file → line-numbered source + dependents
code("CatalogService", { scope: "main" })   # exclude test/generated code
```

Returns the resolved symbol's **kind and location**, its body (or member outline for containers), its immediate neighborhood (`Calls →`, `Called by ←`, `Used by ←`, `Implemented/Extended by ←`, `Extends/Implements →`), and — when the name is ambiguous — **other matches** (e.g. `field catalogService` when you asked for `interface CatalogService`).

Resolution is deterministic and kind-ranked: exact case beats case-insensitive beats substring; types (`interface`/`class`) rank above methods, which rank above fields. A single literal token that matches no symbol or file falls back to an `rg` text search. A member-qualified name like `code("CatalogService.createProduct")` resolves straight to that member (the container must be a type/namespace; matching is case-insensitive).

### `callgraph` — transitive relationships

```
callgraph(from="PartnerProductController", to="CatalogService")  # path between two symbols
callgraph(from="X")                    # what does X reach (forward)
callgraph(to="X")                      # what reaches X (backward / blast radius)
callgraph(from="@http", to="CatalogService")   # which HTTP endpoints reach this symbol?
```

- `from` + `to` → annotated path between them.
- `from` alone → forward expansion (callees).
- `to` alone → backward expansion (callers).
- `from="@http"` → resolve entry points to REST routes and trace from each.

Every hop carries its **relationship kind, file:line, and confidence**, and inferred hops (interface dispatch, framework wiring) are flagged so a static over-approximation is never presented as fact. Parameters: `maxDepth` (default 6), `scope`.

## Scope

`scope` filters which files participate in resolution and traversal:

- `main` — production source (`src/main/**`, `src/**`); excludes test/generated paths.
- `test` — test source only.
- `all` — everything (default).

Test detection is path- and filename-based (`/test/`, `/tests/`, `__tests__`, `FooTest.java`, `foo.spec.ts`, …). The symbol you asked for by exact name is always shown (with a note) even when it's outside the requested scope.

## Activation

Gated on the project root: `code`/`callgraph` register and indexing starts only when `build.gradle`, `build.gradle.kts`, or `Cargo.toml` exists at the session cwd.

## Requirements

Node ≥ 22.5 (`node:sqlite`). First use builds `.codegraph/` in the project (dependencies and gitignored files are skipped).

## Known limitations

**`out` directories are skipped.** codegraph treats a directory named `out` as build output and drops it from the index — even when it's committed application source, e.g. a hexagonal/ports-and-adapters Java layout (`src/**/adapter/out/**`). Symbols under those paths then resolve incorrectly (a same-named field instead of the class) or not at all.

To index that source, add a **negation to the repo-local `.gitignore`** (the global gitignore / `core.excludesFile` is **not** honored for re-inclusion), then let the graph re-sync:

```gitignore
!**/adapter/out/
# or, narrower:
!src/**/adapter/out/
```

Note the trailing `/` — it negates the directory itself; `!**/adapter/out/**` does not work.

## Tests

```bash
npm test    # node --test, no test framework dependency
```

See [`DEVELOPMENT.md`](./DEVELOPMENT.md) for architecture, query semantics, and the decisions that shaped the tool.
