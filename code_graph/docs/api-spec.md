# Code Graph — API Specification

## Motivation

When dropped into a codebase, an engineer spends 80% of their time answering mechanical questions: Where is the thing? What touches it? What breaks if I change it? Who changed this and why? What tests cover it?

Each answer is technically deterministic — calls are in the AST, git has the history, tests are in files. But extracting them takes 5-20 minutes of manual grep, blame, and mental call tracing.

Code Graph reduces each question to a single chain of method calls. It's not an AI that summarizes code. It's a deterministic, inspectable map where every answer has a path back to evidence: a file, a line number, a commit hash.

## Design principles

**Deterministic.** No embedded AI, no heuristics that can silently miss results. The LSP backend declares confidence (`"complete"` / `"partial"`) and warns when cross-file resolution is unavailable.

**Lazy.** Nothing executes until a terminal is called. Chains compose cheaply — filter, traverse, filter again — and only the final `.list()` or `.asTable()` triggers resolution.

**Trustworthy.** Line ranges include preceding comments and annotations (via tree-sitter, shared across both backends). An agent can `read` the exact span and construct edits with confidence.

**Two backends, one API.** The tree-sitter backend (`createGraph`) is fast for single-file queries. The LSP backend (`createLspGraph`) provides cross-file call hierarchy and references. Both implement the same `SymbolQuery` / `FileQuery` classes.

## Entry points

```typescript
// LSP backend — cross-file call hierarchy, references, all languages
const db = await createLspGraph(".")

// Tree-sitter backend — fast, single-file, sync-like
const db = await createGraph(".")
```

## Symbol discovery

### `db.symbol(name: string): SymbolQuery`

Exact name match. Returns all symbols whose name equals `name`.

Use when you know the exact symbol name — a function, class, or method you found in source.

```typescript
db.symbol("AuthService")           // → [AuthService class]
db.symbol("findById(String)")      // Java LSP includes parameter types
db.symbol("login")                 // might match multiple (overloaded methods)
```

### `db.find(pattern: string): SymbolQuery`

Case-insensitive partial match. Returns all symbols whose name contains `pattern`.

Use when you don't know the exact name, or to explore what's available.

```typescript
db.find("auth")                    // → AuthService, handleAuth, authMiddleware...
db.find("payment")                 // → processPayment, PaymentService, PaymentStatus...
```

### `db.changed(opts: { since: string }): SymbolQuery`

Symbols in files changed since a git ref. Calls `git diff --name-only <ref>` and filters the index.

Use for PR review: "what public API did I touch?" or "what breaks if I merge?"

```typescript
db.changed({ since: "main" })
  .where(s => s.exported)
  .impact()
```

### `db.all(): SymbolQuery`

Every symbol in the index.

Use as a starting point for broad surveys.

```typescript
db.all().where(s => s.kind === "class").asTable()
db.all().summary()
```

### `db.file(partialPath: string): FileQuery`

Find a file by partial path match. Returns a `FileQuery` (not `SymbolQuery`).

```typescript
db.file("auth.ts")                 // find the file
  .symbols()                        // → SymbolQuery: all symbols in that file
  .where(s => s.kind === "class")   // just the classes
```

## Filtering

All chainable, lazy, return a new `SymbolQuery`.

### `.filter(predicate: (s: Symbol) => boolean): SymbolQuery`
### `.where(predicate: (s: Symbol) => boolean): SymbolQuery`

Keep only symbols matching the predicate. `where` is an alias for readability.

```typescript
db.all().where(s => s.kind === "class" && s.exported)
```

### `.exported(): SymbolQuery`

Keep only exported symbols.

```typescript
db.file("handlers.ts").symbols().exported()
```

### `.select(columns: string[]): SymbolQuery`

Pick columns for `.asTable()` output. The data is still full symbols; only the display is trimmed.

```typescript
db.all().where(s => s.kind === "function")
  .select(["name", "file", "line"])
  .asTable()
```

## Traversal

All return a new `SymbolQuery`. Lazy — no LSP calls until a terminal is invoked.

### `.callers(options?): SymbolQuery`

Symbols that call any of the current set. With `{ transitive: true }`, BFS follows the call graph recursively.

Use to answer "who depends on this?" and "what's the blast radius?"

```typescript
db.symbol("hashPassword").callers()                        // direct
db.symbol("User.email").callers({ transitive: true })      // all layers
db.symbol("User.email").callers({ transitive: true, maxDepth: 3 })  // bounded
```

### `.callees(options?): SymbolQuery`

Symbols called by the current set. Transitive mode follows outgoing calls.

Use to answer "what does this need?" and trace execution paths.

```typescript
db.symbol("handleWebhook").callees()                       // direct
db.symbol("handleWebhook").callees({ transitive: true })   // full chain
```

### `.references(): SymbolQuery`

All references (reads, writes, calls) to the current symbol. Requires a single symbol — use `.where()` to narrow first.

LSP-backed; tree-sitter backend returns empty.

```typescript
db.symbol("User.email").references()
```

### `.file(): FileQuery`

The file(s) containing the current symbols. Bridges from symbol-space to file-space.

```typescript
db.symbol("AuthService").file().symbols()  // all symbols in auth.ts
```

## Terminals

Trigger resolution. All return Promises.

### `.list(): Promise<Symbol[]>`

Raw array of symbols. Use when you need to iterate programmatically.

### `.asTable(): Promise<string>`

Pretty-printed table with aligned columns.

```typescript
db.all().where(s => s.kind === "class").asTable()
// name           kind   file                line
// ─────────────  ─────  ──────────────────  ────
// AuthService    class  src/auth/auth.ts    12
// LoginController class  src/auth/login.ts  5
```

### `.tree(): Promise<string>`

Symbols grouped by file with indentation. Best for understanding file structure at a glance.

```typescript
db.file("auth.ts").symbols().tree()
// 📄 src/auth/auth.ts
//   AuthService → login (method) :15
//   AuthService → logout (method) :22
//   hashPassword (function) :30
```

### `.count(): Promise<number>`

Number of matching symbols. Use for quick "how many?" checks.

### `.first(): Promise<Symbol | undefined>`

First matching symbol or undefined. Use when you expect exactly one result.

### `.summary(): Promise<string>`

Distribution by kind and by file.

```typescript
db.all().summary()
// 42 symbol(s)
//
// By kind:
//   class: 5
//   method: 18
//   function: 12
//   variable: 7
//
// By file:
//   src/auth/auth.ts: 8
//   src/auth/login.ts: 12
//   ...
```

### `.explain(): Promise<string>`

The killer method. Full breakdown of a single symbol: what it is, who calls it, what it calls, references, last git change, related tests, and confidence.

Use when you encounter an unfamiliar symbol and need the full picture in one shot.

```typescript
db.symbol("findById(String)").explain()
// findById(String) (method of UserRepository) — UserRepository.java:4-6
//   Exported: yes
//   Last changed: a3f2c1 Mar 10, 2024: Fix NPE when user not found
//   Called by (1): findUser(String) : User
//   Calls (1): User(String, String)
//   References: 1 location(s)
//   Tests: 2 test file(s)
```

### `.impact(): Promise<string>`

Blast radius analysis. Finds all transitive callers and groups them by file. Shows which files would be affected if the current symbol(s) change.

Use during refactoring or PR review: "what breaks if I touch this?"

```typescript
db.symbol("User.email").impact()
// Impact: 5 caller(s) across 3 file(s)
//
//   src/auth/login.ts: handleLogin, validateSession
//   src/profile/update.ts: updateEmail, syncProfile
//   src/admin/users.ts: adminResetEmail
```

### `.callTree(options?): Promise<string>`

Hierarchical call tree using Unicode box-drawing characters. Shows callees as an indented tree up to `maxDepth` (default 3).

Use to visualize execution flow from an entry point.

```typescript
db.symbol("handleWebhook").callTree({ maxDepth: 2 })
// handleWebhook (function) — webhooks/handler.ts:42
// ├─ verifySignature (function) — webhooks/crypto.ts:15
// │  └─ timingSafeEqual (function) — webhooks/crypto.ts:8
// ├─ processEvent (function) — events/processor.ts:30
// │  ├─ upsertSubscription (method of SubscriptionService) — billing/subscriptions.ts:55
// │  └─ sendNotification (function) — notifications/sender.ts:12
// └─ logAuditEvent (function) — audit/trail.ts:20
```

### `.pathsTo(predicate, options?): Promise<string>`

Find call paths from the current symbol(s) to symbols matching a predicate. BFS, returns shortest paths. Default direction is `"callees"` (follow outgoing calls); use `"callers"` to trace inbound.

Use to answer "how does the HTTP handler reach the database?"

```typescript
db.symbol("handleCheckout").pathsTo(
  s => s.name.includes("executeQuery"),
  { maxDepth: 10 }
)
// handleCheckout (handlers/checkout.ts:42)
//   → processOrder (services/order.ts:15)
//   → insertOrder (repositories/order.ts:8)
//   → executeQuery (db/client.ts:55)
```

### `.why(): Promise<string>`

Git archaeology. Runs `git blame` on the symbol's line and shows the last commit: short hash, date, message. No author (the hash is enough to look up details).

Use when you encounter confusing code and need context: "is this a recent hotfix or ancient original code?"

```typescript
db.symbol("retryWithBackoff").why()
// a3f2c1 Mar 10, 2024: Fix race condition in payment retry
```

### `.tests(): Promise<string>`

Find test files that exercise the current symbol. Three strategies:
1. Filename convention (`foo.test.ts`, `fooTest.java`)
2. Symbol name mentions in test directories
3. Source module imports in test files

Use to find tests to run before/after a change, or to understand expected behavior.

```typescript
db.symbol("createGraph").tests()
// 3 test file(s) found:
//   test/graph.test.ts (matched filename, mentions symbol, imports module)
//   test/lsp.test.ts (imports module)
//   test/integration.test.ts (mentions symbol)
```

## File-level operations

### `db.files(): FileQuery`

All indexed files.

### `FileQuery.symbols(): SymbolQuery`

All symbols in the matched file(s).

### `FileQuery.filter(predicate): FileQuery`

Filter files by predicate.

### `FileQuery.list(): Promise<FileInfo[]>`

### `FileQuery.asTable(): Promise<string>`

### `FileQuery.summary(): Promise<string>`

## Introspection

### `db.stats()`

```typescript
db.stats()
// { files: 403, symbols: 13365, confidence: "complete" }
```

`confidence` is `"complete"` when the LSP project imported successfully (cross-file call hierarchy available) or `"partial"` for tree-sitter (dynamic calls not tracked).

### `db.close(): Promise<void>`

Shut down the LSP server. Call when done to free resources.

## Symbol shape

```typescript
interface Symbol {
  name: string;
  kind: "function" | "class" | "method" | "variable" | "interface" | "type" | "enum";
  file: string;       // absolute path
  line: number;        // 1-indexed, extended over preceding comments
  column: number;      // 1-indexed
  endLine?: number;    // 1-indexed, end of the declaration body
  endColumn?: number;  // 1-indexed
  exported: boolean;
  parentName?: string; // class name for methods
}
```

The `line`-`endLine` range includes the full declaration body (closing brace) and is extended upward over preceding comments and annotations. An agent can `read file line-endLine` to get the complete definition with all context.

## Backends

### LSP (`createLspGraph`)
- Cross-file call hierarchy, references via LSP
- Auto-detects language: TypeScript, Java, Rust
- Confidence: `"complete"` when project import succeeds
- LSP client cached across calls; symbols re-indexed fresh each call
- Line ranges extended via tree-sitter (lazy, once per session)

### Tree-sitter (`createGraph`)
- Fast, synchronous-like resolution via precomputed edge list
- Cross-file edges rely on import resolution (best-effort)
- Confidence: `"partial"` (dynamic calls, reflection not tracked)
- Good for single-file queries and unit tests
