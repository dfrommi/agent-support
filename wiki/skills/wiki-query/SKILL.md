---
name: wiki-query
description: >
  Answer questions using the wiki as the primary knowledge source — search the
  index, read relevant pages, and synthesize grounded answers with citations.
  Use when the user asks a question about wiki content, says "query the wiki",
  "search the wiki", or asks any question that could be answered   pages. Don't
  use without the user mentioning the wiki, don't use by your own initiative.our
  own initiative.
---
Answer questions by searching the wiki, reading relevant pages, and synthesizing grounded answers. Good answers can be filed back into the wiki so explorations compound into the knowledge base.

## Preconditions

You have to know the wiki base directory, further referred to as `<wiki-base>`. If not provided, ask the user to specify it.
  
## Workflow

### 1. Understand the question

Parse what the user is actually asking. Identify:

- **Key entities/concepts** to search for
- **Type of answer needed** — factual lookup, synthesis across sources, comparison, timeline, analysis
- **Scope** — everything we know, or a focused slice?

### 2. Search the wiki

Start by reading `<wiki-base>/wiki/index.md` to identify candidate pages. Then read the most relevant pages.

For broad questions, read more pages to ensure coverage. For focused questions, read fewer but more targeted pages.

If the index alone isn't sufficient, search wiki files directly:

```bash
rp -lF "search term" <wiki-base>/wiki/
```

### 3. Synthesize the answer

Compose an answer grounded in wiki content. Key rules:

- **Cite your sources.** Reference wiki pages so the user can follow up. For claims traceable to raw sources, cite the wiki pages and their insight citations.
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

If the user agrees, create the page following wiki conventions, update `<wiki-base>/wiki/index.md`, and append to `<wiki-base>/wiki/log.md`:

```markdown
## [YYYY-MM-DD] synthesis | Question summary | <synthesis-page-name>
```

If the answer is a simple lookup, just log the query without creating a page.

## Guidelines

- **Wiki-first.** Ground answers in wiki content, not general knowledge. The wiki is the source of truth for this knowledge base.
- **Transparent gaps.** Explicitly state when the wiki lacks information rather than filling gaps from general knowledge.
- **Suggest next steps.** After answering, suggest related questions the user might want to explore, sources that could strengthen weak areas, or active insights that may need `/wiki-ingest`.
- **Compound the knowledge.** Proactively suggest saving answers that represent genuine new synthesis. The goal is that every interaction makes the wiki richer.
