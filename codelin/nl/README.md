# nl-query

Experimental on-device planner for the `codelin` extension's natural-language path. **Disabled by default** — `codelin` ignores it unless `CODELIN_NL_ENABLED=1` is set. Given a prose query and a list of candidate symbols, it picks the exact symbols that answer the query — using Apple's `FoundationModels` 3B model (Neural Engine). No cloud, no API keys.

When enabled, `codelin` finds the binary via the `CODELIN_NL_QUERY` environment variable, then `nl-query` on `PATH`. If absent or disabled, `codelin` uses its deterministic heuristics — this component is strictly optional.

## Requirements

- macOS 26 (Tahoe) with Apple Intelligence enabled
- Apple Silicon (for Neural Engine performance)
- Xcode 16.4+ / Swift 6.2+

## Build

```bash
cd codelin/nl
swift build -c release
# binary: .build/release/nl-query
```

## Wire it up

It is **disabled by default**. To enable:

```bash
# 1. make the binary findable — either on PATH...
ln -s "$(pwd)/.build/release/nl-query" /usr/local/bin/nl-query

#    ...or point codelin at it explicitly
export CODELIN_NL_QUERY="$(pwd)/.build/release/nl-query"

# 2. and opt in
export CODELIN_NL_ENABLED=1
```

## Usage

```bash
nl-query --json "how does home assistant reach the planning
Candidate symbols:
- HomeAssistant (enum_member)
- plan_for_home (function)
- HomeAssistantSettings (struct)"
```

Output (machine-readable):

```json
{"intent":"path","selected":"HomeAssistant,plan_for_home","reasoning":"..."}
```

Intents: `symbol` (show the selected symbols), `path` (trace between two selected symbols), `none` (no candidate is relevant).

## Debug

```bash
nl-query --tokens "<prompt>"   # context-window token breakdown
nl-query --text "<prompt>"     # human-readable instead of JSON
```

## Notes

- Generation uses **greedy sampling** and a **256-token response cap**. This matters: the 3B model's context window is 4096 tokens, and non-greedy sampling drifted into trailing garbage (broken JSON) while uncapped reasoning blew the window.
- The candidate list must stay terse (`name (kind)` lines, ≤ ~40 candidates) — it rides in the prompt, and the whole input is ~800 of 4096 tokens.
