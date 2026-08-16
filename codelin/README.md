# codelin

A pi extension that replaces `grep`/`find`/`read` for finding and reading code. One tool — **`code`** — returns the *verbatim, line-numbered source* you actually need, plus who calls it and what it affects, from a local code index.

Built on [`@colbymchenry/codegraph`](https://www.npmjs.com/package/@colbymchenry/codegraph): 30+ languages, no language server, index built once and kept fresh by a file watcher.

## The one tool

```
code("findUser")                # symbol → its source + callers/callees/impact
code("src/service.ts")          # file → Read-parity source + dependents
code("how does auth work?")     # question → relevant symbols with source
code("run findUser")            # two symbols → the call path between them
code("some_literal_token")      # no symbol/file match → literal text search (rg)
```

## What it returns

For a symbol, a section like:

```markdown
**findUser** (function) — src/service.ts:3-5
`(id: string): User | null`

```typescript
3	export function findUser(id: string): User | null {
4		return findUser(id);
5	}
```

Calls → findUser (src/repo.ts:6)
Called by ← run (src/main.ts:3)
Impact: 2 dependent(s) across 1 file(s)
```

Line numbers are **Read-parity** (`<n>\t<line>`, no padding), so the agent can cite and edit from the result without re-reading the file. Containers (classes/structs/…) return a member outline instead of their full body; small containers with no indexed members return their own source.

## Why it replaces grep, not just supplements it

grep returns *lines that match*. `code` returns *the code*, already read and line-numbered, with the surrounding structure folded in — one call instead of a grep + read loop. The literal-text fallback (`rg` under the hood) covers the cases the graph doesn't index.

## Requirements

Node ≥ 22.5 (`node:sqlite`). The first use builds `.codegraph/` in the project (dependencies and gitignored files are skipped). For huge monorepos (tens of thousands of files), launch pi's Node with `--liftoff-only --disable-warning=ExperimentalWarning` — see the code_graph README for why.

## Tests

```bash
npm test    # node --test, no test framework dependency
```
