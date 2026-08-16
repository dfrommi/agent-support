# codelin

A pi extension that replaces `rg`/`fd` for finding code. One tool — **`code`** — returns the *verbatim, line-numbered source* you actually need, plus who calls it and what it affects, from a local code index. Line numbers locate and cite code; re-read the exact range before editing.

Built on [`@colbymchenry/codegraph`](https://www.npmjs.com/package/@colbymchenry/codegraph): 30+ languages, no language server, index built once and kept fresh by a file watcher.

## The one tool

```
code("findUser")                # symbol → its source + callers/callees/impact
code("src/service.ts")          # file → line-numbered source + dependents
code("run findUser")            # two symbols → call path (direct/static calls)
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

Line numbers use the form `<n>\t<line>` (no padding) so the agent can locate and cite code. They are for understanding — before editing, re-read the relevant range with `read(path, offset, limit)`. Containers (classes/structs/…) return a member outline instead of their full body; small containers with no indexed members return their own source.

## Why it replaces rg, not just supplements it

rg returns *lines that match*. `code` returns *the code*, line-numbered, with the surrounding structure folded in — one call instead of an rg + read loop. The literal-text fallback (`rg` under the hood) covers the cases the graph doesn't index.

## Natural-language queries (experimental planner disabled by default)

`code` accepts prose too — `code("who calls plan_for_home")` or `code("device state module")` — resolved by segment-name matching with suffix stemming (no model required).

An experimental on-device planner (`nl/`, Apple FoundationModels) can sharpen prose selection, but it is **disabled by default**: it needs macOS 26 + Apple Silicon and adds seconds of latency for marginal benefit over the deterministic matcher. To experiment, build `nl/` and set `CODELIN_NL_ENABLED=1` (see `nl/README.md`). Flow questions like "how does X reach Y" are limited to the static call graph and won't see runtime event-bus wiring either way.

## Requirements

Node ≥ 22.5 (`node:sqlite`). The first use builds `.codegraph/` in the project (dependencies and gitignored files are skipped). For huge monorepos (tens of thousands of files), launch pi's Node with `--liftoff-only --disable-warning=ExperimentalWarning` — see the code_graph README for why.

## Tests

```bash
npm test    # node --test, no test framework dependency
```

## Development

See [`DEVELOPMENT.md`](./DEVELOPMENT.md) — architecture, query-dispatch order, key tradeoffs, the four experimental runs that shaped the tool, and the gotchas that cost time (codegraph `getSegmentMatches` semantics, the disabled NL planner, stemming, etc.).
