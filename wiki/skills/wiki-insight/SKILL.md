---
name: wiki-insight
description: >
  Capture focused insights from the current conversation or an inbox file and
  add them to the wiki's insights directory. Use when the user says "add X to
  the wiki", "create an insight", or "note that down". Don't use when the
  request is to put or transcribe something into the wiki's inbox or to process
  an insight for ingestion.
---
Turn a source into one or more focused, source-backed insight files.

## Preconditions

- Exactly one source, clearly communicated by the user (see `Sources` below)
- Wiki base directory, further referred to as `<wiki-base>`

Preconditions are fulfilled if both were provided or are clear from the context. If not, ask the user to provide the missing information.

## Access restrictions

You may only perform these writes during this workflow:

1. Create approved insight files under `<wiki-base>/insights/`.
2. Create or append to `<wiki-base>/wiki/log.md` with one entry per approved insight.
3. Move the processed source from `<wiki-base>/inbox/` to `<wiki-base>/archive/sources/` after all insights were processed (approved or rejected).

## Sources

Source can either be a specific inbox file or the current conversation.

**File**:

- Exactly one file in the wiki's inbox directory `<wiki-base>/inbox/`.
- `<source-reference>` is the filename, e.g. `2024-06-01-meeting-notes.md`.

**Conversation**:

- The current conversation this skill is invoked in.
- `<source-reference>` is the conversation's session ID.

## Insight rules

- Each insight must be a focused claim. Do not include insights that are only source summaries.
- Stay faithful to the source; do not inject unsupported claims.
- Preserve provenance and enough context for later use.
- Prefer quoted or specific evidence over vague paraphrase.
- Capture caveats and uncertainty in `Open Questions`.

## Workflow

### 1. Read and process the complete source

For files, read the source fully before deciding what the insights are.
Track evidence locations such as headings, timestamps, sections, pages, or line ranges when available.

Do not propose candidates until the full content is known.
If the source format cannot be read sufficiently, stop and ask how to proceed.

**Done when** the full source is known.

### 2. Align on direction/focus/POV

With the full source known, make sure you have a common understanding with the user about:

- Direction/focus/POV.
- Scope.
- What to ignore.
- Specific questions the user wants answered.

If not, interview the user until a common understanding is reached.
Keep this brief for obvious sources. Spend more time for rich, multi-topic, or ambiguous sources.

**Done when** the user's intent and focus are clear.

### 3. Work insight-by-insight

Work through the current source's insight by insight with the user:

1. Confirm whether to proceed with that candidate.
2. Discuss the candidate only if needed to sharpen the claim, focus, evidence, or tags.
3. Show the target path and full markdown content.
4. Wait for explicit approval before writing.
5. After approval, write the file under `<wiki-base>/insights/` (see `Insight file format` below).
6. Append one entry to `<wiki-base>/wiki/log.md` (see `Log entry format` below).
7. Move to the next candidate insight.

**Done when** all insights were either approved or rejected by the user or the user aborts the process.

### 4. Archive the source

If source is a file and all insights were processed, move the source file from `<wiki-base>/inbox/<source-reference>` to `<wiki-base>/archive/sources/`.

**Done when** the source is moved to `<wiki-base>/archive/sources/`, or there is no file source to archive.

## Insight file format

Insight target filename pattern: `<wiki-base>/insights/YYYY-MM-DD-slug.md`

The slug must be derived from the focused claim, not merely from the source title.

Use this markdown structure exactly:

```markdown
---
type: insight
created: YYYY-MM-DD
source: "<source-reference>"
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

Append one entry per approved insight to `<wiki-base>/wiki/log.md`. Create if missing.

Format:

```markdown
[YYYY-MM-DD] insight | <source-reference> | <insight-file> | <focus phrase>
```
