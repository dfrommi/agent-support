---
name: wiki-insight
description: >
  Distill a source document from private/inbox/ into a focused insight document
  in private/insights/, in dialog with the user about scope and POV. Use when the
  user says "distill", "create an insight", "process inbox", "what's in the
  inbox", "let's look at this source", or drops a new document into
  private/inbox/ and wants to capture what matters from it. This is stage 1 of
  the two-stage knowledge flow; stage 2 is wiki-ingest.
---

# Wiki Insight

Stage 1 of the two-stage knowledge flow: turn a raw source into a focused, dated insight document. The insight captures **what matters about this source, from which angle, and why** — so that the later `wiki-ingest` step can integrate a clean, focused contribution into the wiki rather than a diluted whole-document summary.

## Workflow

### 1. Identify the source

If the user hasn't named a file, list what's waiting in the inbox:
```bash
ls -lt private/inbox/ | head -20
```

Pick (or accept the user's pick) and read it **fully** before proceeding. For long sources (transcripts, papers), do not skim — you need to see what's actually there before deciding what to focus on.

### 2. Discuss focus with the user

This is the heart of the skill. Briefly summarize the source (2-3 sentences), then engage the user on **anything non-obvious**:

- **Aspect / POV** — What angle should this insight take? (e.g. "the security implications" vs. "the UX critique" vs. "the historical context")
- **Scope** — The whole document, or a specific section/timestamp/chapter?
- **Question being answered** — Is the user reading this to answer a particular question? Capture it.
- **What to deliberately ignore** — Filler, tangents, parts already well-covered elsewhere in the wiki.
- **Connections** — Does this source confirm, extend, or contradict existing wiki content?

For obvious cases (a short technical how-to with one clear topic), keep the dialog brief. For rich sources (podcast transcripts, long essays, multi-topic articles), iterate until the focus is genuinely sharp.

### 3. Draft the insight

Once focus is agreed, draft the insight document. Show the draft to the user and iterate.

Filename: `private/insights/YYYY-MM-DD-slug.md`
- Date is today.
- Slug is lowercase-kebab, derived from the focus (not the source title) — e.g. `2026-04-21-llm-context-rot.md`, not `2026-04-21-podcast-episode-247.md`.

Format:
```markdown
---
type: insight
created: YYYY-MM-DD
source: "[[<source filename>]]"
focus: short phrase describing the angle/scope
tags: [tag1, tag2]
---

## Focus
What aspect, POV, section, or question this insight zooms in on, and why
(captured from the dialog). 2-4 sentences.

## Key Points
- Distilled claims/observations relevant to the focus.
- Be faithful to the source — don't inject outside knowledge.
- Cite section/timestamp when relevant.

## Quotes / Evidence
Optional verbatim excerpts that anchor the key points.

## Open Questions
Things worth exploring further, revisiting in another insight, or researching
in adjacent sources.

## Source
[[<source filename>]]
```

Guidelines for the insight body:
- **Faithful to the source.** Don't inject outside knowledge.
- **Focused.** If a key point isn't in scope of the agreed focus, drop it (or move it to Open Questions).
- **Actionable for ingest.** The downstream `wiki-ingest` step will read this insight, not the raw source — make sure it stands on its own.
- **Concise.** Aim for ~300-800 words. A well-focused insight is much shorter than a whole-document summary.

### 4. Move the source

After the user approves the insight and it's saved:
```bash
mv "private/inbox/<filename>" "private/sources/<filename>"
```

The `source:` frontmatter link in the insight now resolves correctly. The inbox stays clean — only undistilled material lives there.

### 5. Log the operation

Append to `private/wiki/log.md`:
```markdown
## [YYYY-MM-DD] insight | <focus phrase>
Source: [[<filename>]]
Insight: [[YYYY-MM-DD-slug]]
```

### 6. Suggest next step

Tell the user the insight is ready and offer to run `wiki-ingest` to integrate it into the wiki — either now or later. Ingestion is a separate step deliberately, so the user can batch insights or review them first.

## Guidelines

- **Dialog before drafting.** The point of this skill is to capture human focus. Don't draft a generic summary and call it done.
- **One insight per source by default.** A second insight on the same source is allowed when a genuinely different angle warrants it; name it with a different slug.
- **The insight is a contract.** Whatever ends up in the wiki later will be derived from the insight, not the raw source. So if it's not in the insight, it won't be in the wiki.
- **Don't touch the wiki.** This skill never edits `private/wiki/` (except `log.md`). Wiki changes happen in `wiki-ingest`.
