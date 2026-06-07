---
name: wiki-ingest
description: >
  Integrate an insight document from private/insights/ into the LLM wiki —
  create or update entity/concept pages, maintain cross-references, and keep the
  index and log current. This is stage 2 of the two-stage knowledge flow; stage
  1 is wiki-insight. Use when the user says "ingest", "ingest insight", "add
  insight to wiki", "integrate this insight", "process insights", or wants
  recently created insights folded into the knowledge base.
---

# Wiki Ingest

Stage 2 of the two-stage knowledge flow: integrate an **insight document** (not a raw source) into the wiki. A single insight typically touches 3-10 wiki pages.

The insight is the source of truth for this step. The raw source has already been read and distilled by `wiki-insight`; here we work from the insight only.

## Workflow

### 1. Identify the insight

If the user hasn't named one, list recent insights:
```bash
ls -lt private/insights/ | head -20
```

Cross-check against `private/wiki/log.md` to find insights without a corresponding `ingest` entry. Confirm with the user which insight(s) to process.

Read the insight fully — frontmatter (`source`, `focus`, `tags`), Focus, Key Points, Quotes, Open Questions.

### 2. Read the current index

Read `private/wiki/index.md` to understand what pages already exist. This determines whether you create new pages or update existing ones. Pay attention to entities/concepts the insight mentions that may already have pages.

### 3. Discuss with the user (briefly)

Before writing, share:
- **Focus of the insight** in one sentence (from its `focus` field / Focus section)
- **Wiki pages you plan to create** (with proposed titles)
- **Wiki pages you plan to update** (and what will be added)
- **Any contradictions** with existing wiki content

For routine ingestions, this can be a short bullet list. Wait for user go-ahead before writing.

### 4. Create or update wiki pages

For each significant entity or concept in the **insight** (not the raw source):

**If a page already exists:** Update it with new information from this insight. Add the insight to the `## Sources` section. Preserve existing content — add to it, don't replace it. If the insight contradicts existing content, note the contradiction explicitly with citations to both sides.

**If no page exists yet:** Create one only if the entity/concept is significant enough to warrant its own page. Use the appropriate page type (entity or concept). Use a title-case filename matching the display title (e.g., `SSH Tips.md`, not `ssh-tips.md`).

**Source-summary pages:** When a source warrants its own summary page, create `private/wiki/Source <Title>.md` — but the summary reflects the **insight's focused take**, not a generic whole-document summary. The insight's focus determines the summary's angle.

Every wiki page ends with:
```markdown
## Sources

- [[YYYY-MM-DD-slug]]
```

Do **not** cite `[[<source filename>]]` directly in new wiki pages. The insight is the canonical bridge back to the raw source.

### 5. Update the index

Add new pages to the appropriate section in `private/wiki/index.md`. Update summaries of existing pages if their content changed meaningfully. For source-summary entries, include the insight reference: `(insight: [[YYYY-MM-DD-slug]])`. Keep entries alphabetically sorted within each section.

### 6. Update the log

Append an entry to `private/wiki/log.md`:
```markdown
## [YYYY-MM-DD] ingest | <insight focus phrase>
Insight: [[YYYY-MM-DD-slug]]
Pages created: [[page1]], [[page2]]
Pages updated: [[page3]], [[page4]]
```

### 7. Report to the user

Summarize what you did:
- Pages created (with links)
- Pages updated (with what changed)
- Any contradictions found
- Open Questions from the insight that might be worth exploring (suggest `wiki-query` or new sources)

## Wiki Page Format

Every wiki page follows this structure (Obsidian derives the title from the filename):

```markdown
---
type: concept
created: YYYY-MM-DD
updated: YYYY-MM-DD
tags: [tag1, tag2]
---

Brief summary paragraph.

## Content sections...

## Cross-References

- [[Related Page]] — how it relates

## Sources

- [[YYYY-MM-DD-slug]]
```

- **No `title` in frontmatter** — Obsidian uses the filename
- **No `# Title` H1 heading** — Obsidian displays the filename as the title
- **Title-case filenames** — e.g., `SSH Tips.md`, `Java and Kotlin Development.md`
- **Sources section cites insights** — use `[[YYYY-MM-DD-slug]]` wikilinks

## Guidelines

- **Insight-only.** Work from the insight document. Do not re-read the raw source to "fill in gaps" — if it's not in the insight, it's deliberately out of scope. If the insight is genuinely insufficient, stop and suggest a follow-up `wiki-insight` pass on the same source with a different focus.
- **Read before writing.** Always check the index and existing pages before creating new ones to avoid duplicates.
- **Prefer enriching over duplicating.** If a concept is already covered, update that page rather than creating a parallel one.
- **Attribute everything.** Every claim in a wiki page should trace back to an insight in `## Sources` (and via that insight, to a raw source).
- **Flag uncertainty.** If the insight makes a claim you can't cross-check from other wiki pages, note it as a single-source claim.
- **Maintain voice consistency.** Write in a neutral, encyclopedic tone across all pages.
- **Don't touch the inbox or sources.** Those are owned by `wiki-insight`. This skill only writes to `private/wiki/`.
