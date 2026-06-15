---
name: wiki-query
description: >
  Answer questions using the LLM wiki as the primary knowledge source — search
  the index, read relevant pages, and synthesize grounded answers with citations.
  Optionally save valuable answers back into the wiki as new synthesis pages. Use
  when the user asks a question about wiki content, says "what do we know about",
  "query the wiki", "search the wiki", "synthesize", "compare", or asks any
  question that could be answered from existing wiki pages. Also triggers on
  requests to create comparisons, analyses, or summaries from wiki content.
---

# Wiki Query

Answer questions by searching the wiki, reading relevant pages, and synthesizing grounded answers. Good answers can be filed back into the wiki so explorations compound into the knowledge base.

## Workflow

### 1. Understand the question

Parse what the user is actually asking. Identify:
- **Key entities/concepts** to search for
- **Type of answer needed** — factual lookup, synthesis across sources, comparison, timeline, analysis
- **Scope** — everything we know, or a focused slice?

### 2. Search the wiki

Start by reading `wiki/index.md` to identify candidate pages. Then read the most relevant pages.

For broad questions, read more pages to ensure coverage. For focused questions, read fewer but more targeted pages.

If the index alone isn't sufficient, search wiki files directly:
```bash
grep -rl "search term" wiki/
```

When a question's answer is plausibly in active raw material that hasn't been integrated yet, also search active insights — insights often contain finer-grained detail than the wiki pages they will feed into:
```bash
grep -rl "search term" insights/
```
If a relevant active insight exists in `insights/`, mention that it may need `/wiki-ingest` before it becomes durable wiki knowledge. Archived ingested insight files live under `archive/insights/`, but wiki-first querying should rely on the wiki pages unless the user explicitly asks about archived workflow artifacts.

### 3. Synthesize the answer

Compose an answer grounded in wiki content. Key rules:

- **Cite your sources.** Reference wiki pages with `[[wikilinks]]` so the user can follow up. For claims traceable to raw sources, cite the wiki pages and their insight citations.
- **Don't hallucinate.** If the wiki doesn't contain enough information to answer fully, say so. Identify what's missing and suggest sources that could fill the gap.
- **Note confidence levels.** Distinguish between claims backed by multiple sources vs. single-source claims.
- **Surface contradictions.** If wiki pages disagree on something relevant to the question, present both sides.

### 4. Choose the output format

Match the format to the question:

- **Factual lookup** → concise paragraph with citations
- **Synthesis** → structured markdown with sections and citations
- **Comparison** → table or side-by-side format
- **Timeline** → chronological list with dates and citations
- **Analysis** → structured argument with evidence from wiki pages

### 5. Offer to save valuable answers

If the answer represents significant synthesis work (combining multiple pages, creating a comparison, drawing non-obvious connections), offer to save it as a new wiki page:

- **Synthesis pages** (`type: synthesis`) for cross-cutting analyses, comparisons, and summaries.
- Use tags for finer distinctions such as comparison, timeline, or analysis.

If the user agrees, create the page following wiki conventions, update `wiki/index.md`, and append to `wiki/log.md`:

```markdown
## [YYYY-MM-DD] query | Question summary
Answer was filed as [[Page Name]].
Pages referenced: [[page1]], [[page2]], [[page3]]
```

If the answer is a simple lookup, just log the query without creating a page.

## Guidelines

- **Wiki-first.** Ground answers in wiki content, not general knowledge. The wiki is the source of truth for this knowledge base.
- **Transparent gaps.** Explicitly state when the wiki lacks information rather than filling gaps from general knowledge.
- **Suggest next steps.** After answering, suggest related questions the user might want to explore, sources that could strengthen weak areas, or active insights that may need `/wiki-ingest`.
- **Compound the knowledge.** Proactively suggest saving answers that represent genuine new synthesis. The goal is that every interaction makes the wiki richer.
