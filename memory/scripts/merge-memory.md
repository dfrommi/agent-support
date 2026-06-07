# Merge Memory

Merge new structured insights into the project's memory files. The memory lives in `.agents/memory/` and is designed to stay compact enough to fit in an LLM context window alongside the current conversation.

## Memory Files

You will be given the current contents of these files (if they exist) and a set of new insights to merge in:

| File | Growth strategy | Merge rule |
|---|---|---|
| `DECISIONS.md` | Stable, capped | Update in-place if the same decision is refined. Mark superseded decisions with `[SUPERSEDED]` — never delete them. Keep the most impactful decisions; compress older ones into 1-line summaries if space is tight. |
| `PREFERENCES.md` | Stable, capped | Update in-place if the user's preference changed. Merge similar preferences. If a preference contradicts an existing one, keep the newer one (user changed their mind). |
| `CONVENTIONS.md` | Stable, capped | Merge similar conventions. Deduplicate. If a convention is a special case of an existing one, nest it. |
| `GLOSSARY.md` | Additive, capped | Add new terms. Only remove a term if explicitly corrected. If space is tight, compress less-used terms to 1-line definitions. Alphabetize. |
| `LEARNINGS.md` | Additive, age-out | Add new lessons. De-duplicate similar ones. Mark lessons that are no longer relevant with `[AGED-OUT]` (e.g., a bug that was fixed and can't recur). |

## Merge Rules

### Cap constraint

Each file must stay under **~500 words**. If merging new insights would exceed this:

1. First, compress verbose entries into tighter prose.
2. If still over, for DECISIONS/PREFERENCES/CONVENTIONS: compress the oldest/least-impactful entries into 1-line summaries under a "## Archive" section at the bottom.
3. For GLOSSARY: prefer removing example sentences over removing terms.
4. For LEARNINGS: age out the least relevant lessons first (mark `[AGED-OUT]` in an archive section).

### Provenance

Every new or updated entry must end with an HTML comment tracing it to its source session:

```
<!-- session: 019e7e5d-e532-74e0-ab65-f196a01578e4 -->
```

Keep existing provenance comments intact. If merging two entries about the same topic, keep both session references.

### De-duplication

If a new insight says essentially the same thing as an existing entry, do NOT duplicate it. Instead:
- If the new insight adds nuance, refine the existing entry and add the new session reference.
- If it's truly redundant, skip it entirely.

### INDEX.md

After updating all category files, regenerate `INDEX.md`. It serves two purposes:

1. **Table of contents** for quick navigation (one bullet per file with a 1-line summary)
2. **Usage instructions** telling the agent when to consult each file

INDEX.md must follow this structure:

```
# Project Memory

Persistent memory built from past coding sessions in this project.

## When to consult each file

- **Before making architectural or tooling decisions**: read [DECISIONS.md](DECISIONS.md) — past choices and their rationale
- **When unsure about code style or conventions**: read [CONVENTIONS.md](CONVENTIONS.md)
- **To understand how the user likes to work**: read [PREFERENCES.md](PREFERENCES.md)
- **When encountering an unfamiliar term or tool name**: check [GLOSSARY.md](GLOSSARY.md)
- **To avoid repeating past mistakes**: read [LEARNINGS.md](LEARNINGS.md)

## Contents

- [DECISIONS.md](DECISIONS.md) — <1-line summary>
- [PREFERENCES.md](PREFERENCES.md) — <1-line summary>
- [CONVENTIONS.md](CONVENTIONS.md) — <1-line summary>
- [GLOSSARY.md](GLOSSARY.md) — <1-line summary>
- [LEARNINGS.md](LEARNINGS.md) — <1-line summary>
```

Keep the entire INDEX.md under 250 words.

## Output Format

Output the **complete updated contents** of every memory file that changed, separated by file markers:

```
=== .agents/memory/DECISIONS.md ===
<full updated file contents>

=== .agents/memory/PREFERENCES.md ===
<full updated file contents>

... (one section per changed file)

=== .agents/memory/INDEX.md ===
<full updated index>
```

If a file had no changes (no new insights for that category), omit it — don't output it.

Output ONLY these file markers and contents. No preamble, no explanation, no markdown fences around the entire output.
