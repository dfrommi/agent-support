# codelin — Development Notes

Durable context for working on the `codelin` pi extension again in the future. Read before changing behavior.

## What it is

Two deterministic tools over a local codegraph index — no natural-language parsing, no free-text intent guessing:

- **`code`** — resolve a symbol/file and show source + immediate neighborhood (callers/callees/type relationships) + alternatives. The read-equivalent core.
- **`callgraph`** — transitive relationships: path (`from`+`to`), forward expansion (`from`), backward expansion (`to`), and HTTP-entrypoint reachability (`from="@http"`).

## Architecture

| File | Responsibility |
|---|---|
| `index.ts` | Tool registration: names, descriptions, `promptGuidelines`, TypeBox schemas, `execute`. Both tools gate on the root marker in `session_start`. |
| `explore.ts` | All resolution + traversal + rendering. `explore()` = `code`; `callgraph()` = `callgraph`. |
| `backend.ts` | codegraph lifecycle: `getGraph` (cached per root), `warmup`, `resetGraph`, debounced sync; the `CgInstance` type. |
| `test/` | node:test suite over fixture repos (`fixture-ts`, `fixture-java`) copied to temp per run. |

## Key semantics

### `code` resolution (deterministic, kind-ranked)

Tiers, in order: **exact name → case-insensitive name → substring → fuzzy FTS**. Within and across tiers, sort by `exactCase` then kind priority (`interface`/`class`/… > `function`/`method` > `field`/`variable`/`parameter`). The resolved symbol's `Others` are filtered to in-scope nodes whose *simple* name contains the query — this drops the noise where `getNodesByNameSubstring` matches `qualified_name` and drags in a container's members.

**Member-qualified** (`Container.member`, optionally nested `Outer.Inner.member`) is tried first: split on the last dot, resolve the container via the normal ranking (fuzzy tier excluded, container kinds only), then pick the matching direct child. Returns `tier 0` (exact) or `1` (case-insensitive). Falls back to the plain dotted-string lookup when it doesn't resolve.

### `callgraph` semantics

- `from` + `to` → BFS shortest path (`forwardNeighbors`), allowing `calls`/`references`/`instantiates`/`extends`/`implements` forward, **plus reverse `implements`/`extends`** (interface/class → implementors/subclasses) marked inferred.
- `from` only → forward expansion; `to` only → backward expansion (`backwardNeighbors`).
- Containers seed their members too, so "reach CatalogService" and "reach PartnerProductController" include their methods.

### Scope

`main`/`test`/`all`, path- and filename-based test detection (`/test/`, `__tests__`, `FooTest.java`, `foo.spec.ts`, …). Applied to alternatives, neighborhoods, and traversal hops. The exact-name primary is always shown (with a note) even out of scope.

## Decisions worth remembering (including recent, possibly controversial ones)

1. **The NL planner is gone — not just disabled.** `explore.ts` no longer reads `CODELIN_NL_ENABLED`/`CODELIN_NL_QUERY`. The `nl/` Swift package is now **orphaned dead code** (nothing invokes it); delete it or leave it for reference, but don't assume it's wired up.
2. **`@main` was dropped; `@entrypoints` deferred.** `main()` is a symbol — query it by name (`from="main"`). A full `@entrypoints` root (scheduled jobs, JMS/Kafka/event listeners) needs *upstream* extraction; codegraph has no listener/scheduled-annotation nodes. Only `@http` ships (resolves to codegraph `route` nodes).
3. **Interface→implementation dispatch needs no upstream change.** codegraph synthesizes `calls` edges from interface method → impl method (`metadata.synthesizedBy === "interface-impl"`). Verified against `fixture-java`. codelin labels these hops `inferred · interface dispatch`.
4. **Constructor injection is only partially traceable.** codegraph emits `references` edges from a field/constructor-param to its declared interface type, so "controller → interface → impl" works via `references` + reverse-`implements`. But `type_of` edges are declared in codegraph's `types.ts` and **never emitted** — there is no field/param→type edge. True DI tracing would need an upstream change.
5. **Reverse type dispatch is a codelin addition.** `findPath` upstream only follows outgoing edges, so interface→implementor requires codelin's own BFS (`forwardNeighbors`) over `getContext` incoming/outgoing refs. Marked `inferred`/`interface→impl`.
6. **Evidence comes from edge metadata.** Resolved edges carry `line`, `column`, and `metadata.confidence` + `metadata.resolvedBy` (`exact-match`/`framework`/`fuzzy`/…). `hopLabel()` maps these to `high`/`medium 0.xx`/`low`/`inferred · …`. `getContext` is the one-shot neighborhood + BFS primitive (it returns incoming/outgoing refs with edges, excluding `contains`).
7. **Two tools beat one `mode` enum.** Tool *selection* from the catalog is cheaper and more reliable than setting a discriminator correctly on an overloaded tool; the `description`/`promptGuidelines` are the strongest prompt lever.
8. **Output is understanding-only** — re-read the exact range with `read` before editing. Never emit node IDs; resolve by name and return `file:line`.

## Gotchas that cost time

- **`getNodesByName` is exact-case** (`WHERE name = ?`). **`getNodesByNameSubstring` matches `qualified_name`**, so it returns a container's members — hence the simple-name filter for alternatives.
- **The watcher keeps the process alive.** Tests must `resetGraph()` (and await `getGraph(root)` first) or the node process never exits. `resetGraph` only closes instances already in `backends`; an in-flight `CodeGraph.open` completes *after* a synchronous `resetGraph` and leaks a watcher.
- **Spring route extraction requires Spring detection.** It triggers on `build.gradle`/`pom.xml` containing spring, or any `.java` with `@RestController`/`@Service`/`@Repository`/`@SpringBootApplication`. Route nodes are kind `route`, named `VERB /path`, with a `references` edge to the decorated method.
- **`findPath`/`getCallees`/`getCallers` hardcode edge kinds** (`calls`/`references`/`imports`/`instantiates`) and can't be given custom kinds — that's why `callgraph` runs its own BFS on `getContext`.
- **Node ≥ 22.5** required (`node:sqlite`).

## Testing

```bash
cd codelin && npm test   # node --test, no framework
```

Fixtures are copied to a temp dir per run so indexing never touches the repo. Add tests that verify **intent** (resolution ranking, inferred-hop labeling, scope exclusion, endpoint traces), not just output shape.
