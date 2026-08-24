---
name: wiki-lint
description: >
  Health-check and maintain the LLM wiki. Use when the user says "lint", "health
  check", "check the wiki", "clean up", "find problems", "audit", "maintain", or
  "review wiki quality". Also triggers on "are there any contradictions",
  "what's missing", or "what should we add next".
disable-model-invocation: true
---
# Wiki Lint

Audit the wiki for structural and content issues, then report findings and optionally fix them. Think of this as a code linter but for a knowledge base.

## Preconditions

You have to know the wiki base directory, further referred to as `<wiki-base>`. If not provided, ask the user to specify it.

## Workflow

### 1. Scan the wiki

Read `<wiki-base>/wiki/index.md` and then scan all wiki pages to build a picture of the current state:

```bash
fd -e md -E 'index.md' -E 'log.md' . '<wiki-base>/wiki/' | sort
```

Read each page's frontmatter and content. Track:

- All `[[wikilinks]]` — where they point, whether the target exists
- All pages listed in the index vs. pages that actually exist on disk
- All tags used across pages
- Insight references — which insights are cited from the wiki, which aren't
- Page freshness — `updated` dates in frontmatter

Also scan the supporting directories:

```bash
ls <wiki-base>/inbox/ <wiki-base>/insights/ <wiki-base>/archive/insights/ <wiki-base>/archive/sources/
```

### 2. Check for issues

Run these checks and collect findings:

**Structural issues:**

- **Orphan pages** — wiki pages with no inbound links from other pages
- **Broken links** — `[[wikilinks]]` pointing to pages that don't exist
- **Index drift** — pages on disk not listed in the index, or index entries pointing to missing pages
- **Missing frontmatter** — pages lacking required YAML fields (type, tags)
- **Oversized pages** — pages exceeding ~2000 words that should be split
- **Naming issues** — wiki pages not using title-case filenames, or pages with redundant `title` frontmatter or H1 headings
- **Missing Sources section** — pages without a `## Sources` section at the end

**Content issues:**

- **Contradictions** — pages making conflicting claims about the same topic (look for overlapping entity/concept coverage with different conclusions)
- **Stale content** — pages whose source documents have been superseded by newer sources
- **Single-source claims** — significant claims backed by only one source (fragile knowledge)
- **Thin pages** — pages with very little content that could be merged into related pages

**Knowledge gaps:**

- **Mentioned but missing** — entities or concepts frequently mentioned across pages but lacking their own dedicated page
- **Undistilled inbox** — files in `<wiki-base>/inbox/` that haven't been turned into insights yet (suggest `wiki-insight`)
- **Un-ingested insights** — files in `<wiki-base>/insights/` with no corresponding `ingest` entry in `<wiki-base>/wiki/log.md` and not cited from any wiki page (suggest `wiki-ingest`)
- **Sources without insights** — files in `<wiki-base>/archive/sources/` not referenced by any active or archived insight's `source:` frontmatter (legacy raw imports; consider distilling)
- **Weak areas** — topics with few sources compared to others, suggesting areas where more research would help

**Insight-specific issues:**

- **Broken `source:` links** — insight frontmatter pointing to a non-existent file in `<wiki-base>/archive/sources/`
- **Malformed active insight filenames** — files in `<wiki-base>/insights/` not matching `YYYY-MM-DD-slug.md`
- **Missing active insight frontmatter** — insights in `<wiki-base>/insights/` lacking `type: insight`, `source:`, or `focus`
- **Missing archived ingested insights** — wiki `## Sources` insight links whose files cannot be found in `<wiki-base>/archive/insights/` or `<wiki-base>/insights/`

### 3. Report findings

Present findings organized by severity:

```markdown
## Wiki Health Report

### Issues (should fix)
- 🔴 2 broken links: [[Missing Page]] referenced from Page A.md, Page B.md
- 🟡 3 orphan pages: Page X.md, Page Y.md, Page Z.md
- 🟡 1 index drift: Page Q.md exists but isn't in the index

### Warnings (worth reviewing)
- ⚠️ 1 potential contradiction: Page A.md and Page B.md disagree on X
- ⚠️ 2 thin pages: Page M.md (47 words), Page N.md (62 words)

### Suggestions (optional improvements)
- 💡 "Machine Learning" is mentioned in 8 pages but has no dedicated page
- 💡 3 files in inbox/ haven't been distilled into insights yet
- 💡 2 insights in insights/ haven't been ingested into the wiki
- 💡 The "AI Safety" topic has only 1 source — consider adding more
```

### 4. Fix issues (with permission)

Ask the user which issues to fix. For each approved fix:

- **Broken links** → create stub pages or fix the link target
- **Orphan pages** → add cross-references from related pages
- **Index drift** → update the index to match reality
- **Missing frontmatter** → add it based on page content
- **Thin pages** → merge into related pages (confirm with user first)

After fixing, update `<wiki-base>/wiki/log.md`:

```markdown
## [YYYY-MM-DD] lint | Health check
Found: 2 broken links, 3 orphan pages, 1 contradiction.
Fixed: 2 broken links, 3 orphan pages.
Deferred: 1 contradiction (needs user review).
```

### 5. Suggest next actions

Based on the audit, recommend:

- **Inbox files to distill** (run `wiki-insight`)
- **Insights to ingest** (run `wiki-ingest`)
- **Topics to research** (weak areas with few sources)
- **Questions to explore** (connections between pages that haven't been analyzed)
- **Pages to split** (oversized pages covering multiple topics)

## Guidelines

- **Non-destructive by default.** Report issues but don't fix without permission. Deleting or merging pages requires explicit user approval.
- **Prioritize real problems.** Focus on issues that affect wiki usability (broken links, contradictions) over style nitpicks.
- **Be specific.** Don't just say "some pages have issues" — name the pages, quote the conflicting claims, show the broken links.
- **Track progress.** If the user runs lint regularly, compare against previous lint entries in the log to show improvement.
