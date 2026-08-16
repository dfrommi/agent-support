# codelin — Development Notes

Durable context for working on the `codelin` pi extension (the `code` tool) again in the future. This file exists because the session context that produced these decisions is gone — read this before changing behavior.

## What it is (honest positioning)

`code` is a **symbol & call-structure lookup tool** backed by a local codegraph index. It is *not* a grep replacement and *not* a natural-language answer engine. The reliable core is:

- **Symbol by name** → line-numbered source + `Calls →` / `Called by ←` / `Used by ←` / impact (8/10 reliable — the core value).
- **File by path** → line-numbered source + dependents.
- **Two symbols** → static call path (direct/static calls only).
- **Single literal token** → `rg` text search.
- **Prose** → deterministic segment matching + suffix stemming (best-effort).

Everything else was measured, found weak, and either de-scoped or disabled (see below).

## Architecture

| File | Responsibility |
|---|---|
| `index.ts` | pi tool registration: name, description, `promptSnippet`, `promptGuidelines`, parameter schema, `execute` |
| `explore.ts` | Query dispatch + rendering. All routing logic lives here. |
| `backend.ts` | codegraph lifecycle: `getGraph` (cached per root), `warmup`, `resetGraph`, debounced sync |
| `nl/` | **Disabled** Swift FoundationModels planner (see NL planner section) |
| `test/` | node:test suite with fixture repos (`fixture-ts`, `fixture-java`) |

## Query dispatch order (`explore.ts` → `explore()`)

Order matters. Each stage has a reason:

1. **Exact symbol name** (`getNodesByName`) — cheapest, most precise.
2. **Disabled NL planner** — only runs if `CODELIN_NL_ENABLED=1` (see below).
3. **Deterministic segment search** — multi-word prose → `getSegmentMatches` with `recallWords` (stemming); single token → FTS `searchNodes`.
4. **File path** (`findFiles`) — exact → basename → substring.
5. **`rg` literal fallback** — single tokens only.
6. **"No match"** message.

Why segment-before-FTS (critical): FTS prefix-matches each prose token across names/signatures/docstrings and keeps camelCase names as *single* tokens, so `"data"` matches `DataFrame` methods. A non-empty FTS result masked the better segment-derived matches — the Run 1 bug. Multi-word prose must go to segment matching first; single tokens keep FTS.

## Key decisions & tradeoffs

1. **Output is understanding-only.** pi's `read` returns raw text (no line numbers); pi's `edit` matches `oldText` as exact bytes with uniqueness + fuzzy normalization. So `code`'s numbered output must never be pasted into `edit`. Guidance: re-read the exact range with `read(path, offset, limit)` before editing. (Earlier "edit-without-reread" positioning was wrong and removed.)
2. **No index-drift fix is needed.** `getPendingFiles()` is populated at fs-event time (not debounce time), so the existing `getPendingFiles().length > 0 → sync()` already collapses the debounce window. Don't add drift handling.
3. **Guidance must push on a *precondition*, not mandate the tool.** Mandating "use code for call-structure questions" made the agent quote the rule and flag *correct* grep+read work as a miss (false guilt) — see Run 3. The working shape: a strong imperative scoped to "you know a symbol name", plus an explicit blessing of `rg`/`fd` for discovery so there's no guilt for document-first tracing.
4. **Call paths are static-only.** codegraph's call graph does not model runtime `subscribe()`/`emit()`/event-bus wiring (verified: `findPath` returns none for the main Rust data flow). This is upstream, not fixable in codelin. When no path exists, `renderTrace` returns both endpoint symbols + an honest note instead of dead-ending.
5. **Never mention `grep`/`find` in agent-facing text** — use `rg`/`fd`. (The tool description/guidelines/README were scrubbed accordingly.)
6. **Activation is gated on root build files.** The extension registers `code` and starts `warmup` only when `build.gradle`, `build.gradle.kts`, or `Cargo.toml` exists at the session cwd (top level, not nested). Registration happens in `session_start` (where `ctx.cwd` is available), not at factory time, so arbitrary repos never get indexed.

## The four experimental runs (what we learned)

Real-repo probes against a Rust event-driven codebase (`rusty-home`). These drove every change:

- **Run 1 — NL garbage.** `"how does home assistant reach planning"` returned irrelevant symbols because FTS ran before segment matching. Fixed by reordering dispatch (segment co-occurrence before FTS).
- **Runs 2–3 — agent ignored `code` even with concrete guidance.** Diagnosis: the tool requires a known symbol name (chicken-and-egg in document-first discovery), and grep+read is *adequate* there. Also, imperative guidance caused the agent to self-flagellate for correct behavior. Conclusion: guidance is a weak lever; scope the push to the "known symbol name" trigger only.
- **Run 4 — structural limit exposed.** The flow is `EventBus::subscribe()`/`emit()` pairs wired at runtime in `main.rs`; the static call graph cannot traverse listener registrations. `code('A B')` will never answer "how does X reach Y" in such codebases. NL rated 2/10.

## NL planner (`nl/`) — disabled, kept for reference

An optional on-device planner using Apple's `FoundationModels` 3B model (macOS 26 + Apple Silicon). **Disabled by default**; enable with `CODELIN_NL_ENABLED=1` plus the binary (`CODELIN_NL_QUERY` env var, or `nl-query` on `PATH`). Why disabled: its marginal value over deterministic segment-matching+stemming (cleaner selection, intent detection) didn't justify the cost — macOS-only, a compiled binary, and 2–5s latency per prose query. Flow questions still can't be answered regardless.

If re-enabling, the hard-won specifics:

- **Context window is 4096 tokens.** Measured input: system prompt 258 + schema 194 + query+40 candidates 339 = **791/4096**. Candidate lists must stay terse (`name (kind)`, ≤40).
- **Two flakiness causes, both fixed:**
  - *No response cap* → the model rambled and blew the context window (`Exceeded model context window size`). Fix: `GenerationOptions(maximumResponseTokens: 256)`.
  - *Non-greedy sampling* → valid JSON followed by trailing garbage (`}}``` ```js` + tabs) → `Failed to deserialize`. Fix: `GenerationOptions(sampling: .greedy)`.
- **Field discipline is weak.** The 3B model over-fills "not applicable" fields and echoes the whole `name (kind)` line. Fixes: a 3-field schema (`intent | selected | reasoning`), and TS-side `parseSelectedNames` strips a trailing `(kind)` suffix. Keep the "fill intent first, reasoning last" prompt order matching the struct order.
- **Intent classification is reliable** (symbol/path/none); **selection is the weak part** — the model picks literal word matches but often misses semantic ones (e.g. "planning" → `plan_for_home`).

## Gotchas that cost real time

- **`getSegmentMatches(words, limit)` semantics:** Tier A = co-occurrence (≥2 distinct prompt words in one name, up to 24 candidates). Tier B = a single *rare* word, **only when Tier A returned nothing**: word ≥5 chars, segment appears in ≥2 names and ≤ `SEGMENT_RARITY_CEILING`, candidate name has ≥2 segments. So passing one short word (`"user"`, 4 chars) yields nothing.
- **`splitIdentifierSegments` is not publicly exported** by the codegraph SDK (only in `lib/dist/search/identifier-segments.js`). It splits camelCase/snake/kebab and acronym runs. Don't rely on it from codelin.
- **`segmentLookupVariants` only does plural folding** (`services`→`service`) — no camelCase splitting, no stemming. That's why `"planning"` never matched `plan_for_home`'s `plan` segment, and why we added our own `recallWords`/`stemWord` in `explore.ts` (suffix strip + doubled-consonant collapse; the `-ss` guard prevents `class`→`clas`).
- **Node ≥ 22.5** is required (`node:sqlite`).
- **Tests use a fake binary seam.** NL-planner tests point `CODELIN_NL_QUERY` at a throwaway shell script emitting canned JSON, plus `CODELIN_NL_ENABLED=1`. One test asserts the planner is *ignored* when not opted in — keep it if you touch the gate.

## Testing

```bash
cd codelin && npm test   # node --test, no framework
```

Fixtures are copied to a temp dir per run so indexing never touches the repo. Add tests that verify **intent** (what behavior is guaranteed), not just output shape. The fake-binary seam is the pattern for optional/external dependencies.
