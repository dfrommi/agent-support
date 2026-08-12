# Code Graph — API Reference

A codebase graph explorer that answers structural questions — who calls this, what's the blast radius, which symbols changed — without grep or manual tracing.

**LSP-first.** Cross-file call hierarchy, references, and impact analysis via language servers. Tree-sitter available as a fast local fallback for single-file queries.

**Deterministic.** No AI, no heuristics. Every result comes from the language server or tree-sitter AST. Missing data causes a clear error, not silent gaps.

## Entry points

All queries start from a `Graph`, created by `createLspGraph(root)` (LSP) or `createTreeSitterGraph(root)` (tree-sitter). The Pi extension uses LSP.

```typescript
const db = await createLspGraph(".")

db.symbol("UserService")           // Exact name
db.find("user")                    // Case-insensitive partial
db.all()                           // Every symbol
db.file("UserService.java")        // File → FileQuery
db.files()                         // All files → FileQuery
db.changed({ since: "main" })      // Symbols in files changed since git ref
db.stats()                         // { files, symbols }
```

## Filtering

Filters are chainable and lazy — nothing executes until a terminal is called.

```typescript
db.all()
  .inPath("src/main/**/*.java")    // Limit to files matching glob
  .where(s => s.kind === "class")  // Predicate filter
  .asTable()
```

### `.where(predicate)` / `.filter(predicate)`

Filter by any symbol property.

```typescript
db.all().where(s => s.kind === "method" && s.parentName === "UserService")
```

### `.inPath(glob)`

Limit to symbols in files matching a glob pattern.

```typescript
db.all().inPath("src/main/**/*.java")
db.all().inPath("**/UserService.java")
```

### `.select(columns)`

Pick columns for table output.

```typescript
db.symbol("UserService").select(["name", "kind", "line"]).asTable()
```

## Traversal

Traversal methods return a new `SymbolQuery` — chainable, lazy.

### `.callers(options?)`

Who calls these symbols?

```typescript
// Direct callers
db.symbol("findById").callers().asTable()

// Transitive callers (BFS), prune test code
db.symbol("findById").callers({
  transitive: true,
  scope: { exclude: ["**/test/**"] }
}).asTable()
```

### `.callees(options?)`

What do these symbols call?

```typescript
db.symbol("findUser").callees().asTable()
db.symbol("findUser").callees({ transitive: true }).asTable()
```

### `.references()`

All references to a symbol (LSP only).

```typescript
db.symbol("User").references().asTable()
```

### `.file()`

Get the file(s) containing the current symbols.

```typescript
db.symbol("UserService").file().symbols().asTable()
```

## Terminals

Terminals trigger execution and return a Promise. Every chain must end with one.

### `.explain()`

Full breakdown of a single symbol: callers, callees, references, git history, file location.

```typescript
db.symbol("UserService").explain()
// UserService (class) — .../UserService.java:10-45
//   Last changed: a3f2c1 Mar 10, 2024: Add user audit logging
//   Called by (2): createController, AdminEndpoint
//   Calls (4): findById → validateId → auditLog → save
//   References: 5 location(s)
```

### `.impact(options?)`

Blast radius analysis: transitive callers grouped by file.

```typescript
db.symbol("findById").impact()
// Impact: 5 caller(s) across 3 file(s)
//   .../UserService.java: findUser, createUser +1 more
//   .../AdminController.java: handleRequest
//   .../BatchProcessor.java: processBatch

db.symbol("findById").impact({ scope: { exclude: ["**/test/**"] } })
```

### `.pathsTo(target, options?)`

Find call paths between symbols (BFS).

```typescript
db.symbol("findUser").pathsTo(
  s => s.name === "auditLog",
  { direction: "callees" }
)
// findUser → createUser → auditLog
```

### `.callTree(options?)`

Hierarchical call tree.

```typescript
db.symbol("findUser").callTree({ maxDepth: 2 })
// findUser (method of UserService) — UserService.java:15-25
//   ├─ validateId (method of UserService) — UserService.java:30-35
//   └─ findById (method of UserRepository) — UserRepository.java:10-13
```

### `.asTable()`

Pretty-printed table.

```typescript
db.file("UserService.java").symbols().where(s => s.kind === "method").asTable()
// name        kind    file                                   line
// ─────────── ──────  ─────────────────────────────────────  ────
// findUser    method  .../UserService.java                   15
// createUser  method  .../UserService.java                   22
```

### `.tree()`

Grouped by file.

```typescript
db.find("User").tree()
// 📄 .../User.java
//   User (class) :5
//   getId (method) :10
// 📄 .../UserService.java
//   UserService (class) :8
```

### `.list()`

Raw symbol array.

### `.count()`

Number of results.

### `.first()`

First result or undefined.

### `.summary()`

Distribution by kind and file.

### `.why()`

Git blame for the symbol's source line.

```typescript
db.symbol("findById").why()
// a3f2c1 Mar 10, 2024: Add repository lookup
```

## Scope filtering

The `scope: { exclude: string[] }` option on `callers()`, `callees()`, `impact()`, and `pathsTo()` prunes the BFS frontier. Excluded nodes are invisible — never returned, never traversed through.

Patterns use glob syntax: `**` for any depth, `*` within a segment.

```typescript
db.symbol("findById").callers({
  transitive: true,
  scope: { exclude: ["**/test/**", "**/node_modules/**", "**/*.test.java"] }
})
```

This is the recommended pattern: explore main code first, widen to tests only when needed.

## Java conventions

jdtls reports method names with parameter types: `findById(String)`, `createUser(User)`. Use `db.find("findById")` (partial match) for discovery, not `db.symbol("findById")` (exact match).
