---
description: Extract source-backed focused insight files from inbox/ into insights/
argument-hint: '<source> [focus/direction/POV]'
---
# Extract Wiki Insights

Turn one raw source into one or more focused, source-backed insight files, then archive when done.

Source file: `$1`
Optional focus/direction/POV: `${@:2}`

## Insight rules

Insight rules:

- Each insight must be a focused claim. Do not include insights that are only source summaries.
- Stay faithful to the source; do not inject unsupported claims.
- Preserve provenance and enough context for later use.
- Prefer quoted or specific evidence over vague paraphrase.
- Capture caveats and uncertainty in `Open Questions`.

## Access restrictions

You may only perform these writes during this workflow:

1. Create approved insight files under `insights/`.
2. Create or append to `wiki/log.md` with one entry per approved insight.
3. Move the processed source from `inbox/` to `archive/sources/` after final approval.

## Workflow

### 1. Read and process the complete source

Read the full source before deciding what the insights are.

For long transcripts or large files:

- Read sequential chunks until the entire source has been processed.
- Keep notes across chunks.
- Track evidence locations such as headings, timestamps, sections, pages, or line ranges when available.
- Do not propose candidates until all chunks have been processed.

If the source format cannot be read sufficiently, stop and ask how to proceed.

### 2. Align on direction/focus/POV

After processing the full source, briefly summarize it and align with the user on:

- Direction/focus/POV.
- Scope.
- What to ignore.
- Specific questions the user wants answered.

Keep this brief for obvious sources. Spend more time for rich, multi-topic, or ambiguous sources.

### 3. Work insight-by-insight

Work through insight by insight with the user:

1. Confirm whether to proceed with that candidate.
2. Discuss the candidate only if needed to sharpen the claim, focus, evidence, or tags.
3. Show the target path and full markdown content.
4. Wait for explicit approval before writing.
5. After approval, write the file under `insights/`.
6. Append one entry to `wiki/log.md`.
7. Ask whether to continue to the next candidate, revise the queue, add another candidate, or finish.

Continue until the last insight is done.

### 4. Archive the source

Archive the source only after the user says the final insight is done:

- Move `inbox/<source-filename>` to `archive/sources/`.

## Insight file format

Use this target filename pattern:

```text
insights/YYYY-MM-DD-slug.md
```

The slug must be derived from the focused claim, not merely from the source title.

Use this markdown structure exactly:

```markdown
---
type: insight
created: YYYY-MM-DD
source: "[[original-name.ext]]"
focus: short phrase describing the focused claim
tags: [tag1, tag2]
---

## Claim

A focused, source-backed claim.

## Evidence

Quoted or specific evidence from the source. Include timestamp, section, heading, page, or location when available.

## Context

Why the claim matters, what it affects, and enough surrounding context for the insight to stand alone.

## Open Questions

- Unknowns, caveats, follow-ups, or adjacent questions.
```

## Log entry format

Append one entry per approved insight to `wiki/log.md`. Create if missing.

Format:

```markdown
## [YYYY-MM-DD] insight | <focus phrase>
Source: [[original-name.ext]]
Insight: [[YYYY-MM-DD-slug]]
```

