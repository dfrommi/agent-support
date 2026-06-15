---
description: >-
  Integrate exactly one active insight from insights/ into the wiki, then
  archive the ingested insight.
argument-hint: <insight-file>
---
# Wiki Ingest

Integrate exactly one active insight into wiki pages.

Insight file: `$1`

## Strict scope

- Ingest exactly the one provided insight file. Stop if not provided or not existing.
- Use only the selected insight as the source of new claims.
- Do not read archived insights or archived sources for content.

## Workflow

1. Read the selected insight fully, including frontmatter, claim/focus, evidence, context, tags, and open questions.
2. Read `wiki/index.md` to understand existing pages.
3. Read only relevant existing wiki pages under `wiki/` needed to avoid duplicates, preserve existing content, or identify contradictions.
4. Create or update pages under `wiki/`.
5. Update `wiki/index.md`.
6. Append one ingest entry to `wiki/log.md`.
7. Move the selected insight from `insights/` to `archive/insights/`.
8. Report completed changes and stop.

If the selected insight is insufficient for a safe wiki update, stop and report the issue.

## Wiki page updates

For each significant entity, concept, source, or synthesis from the selected insight:

- Update an existing page when one already covers the topic.
- Create a new page only when the topic is significant enough to stand alone.
- Preserve existing content; add to it rather than replacing it.
- If the insight contradicts existing wiki content, note the contradiction explicitly with citations to the relevant wiki pages and the selected insight.
- Cite the selected insight in `## Sources`. Do not cite the raw source directly in wiki pages.

Allowed page types are only:

- `entity`
- `concept`
- `source`
- `synthesis`

Use tags for finer distinctions. Comparisons are `type: synthesis` pages with comparison-oriented tags when saved.

## Page format

Every wiki page follows this structure. Obsidian derives the page title from the filename.

```markdown
---
type: concept
created: YYYY-MM-DD
updated: YYYY-MM-DD
tags: [tag1, tag2]
---

Short lead paragraph.

## Relevant Section

...

## Cross-References

- [[Related Page]] — relationship

## Sources

- [[YYYY-MM-DD-slug]]
```

Conventions:

- No `title` frontmatter.
- No H1 heading.
- Use title-case filenames for wiki pages, for example `SSH Tips.md`.
- Use display-title wikilinks, for example `[[Page Title]]`.
- Use insight links as `[[YYYY-MM-DD-slug]]`.
- Include `## Cross-References` when meaningful.
- Always keep `## Sources` last.

## Index and log

Add new pages to the appropriate section of `wiki/index.md`. Keep entries organized in the existing style and update summaries of existing entries only when the page changed meaningfully.

Append one entry to `wiki/log.md`:

```markdown
## [YYYY-MM-DD] ingest | <insight focus phrase>
Insight: [[YYYY-MM-DD-slug]]
Pages created: [[page1]], [[page2]]
Pages updated: [[page3]], [[page4]]
```

## Completion report

After moving the selected insight to `archive/insights/`, report:

- Pages created.
- Pages updated.
- Index and log updates.
- Archived insight path.
- Any contradictions or open questions.

