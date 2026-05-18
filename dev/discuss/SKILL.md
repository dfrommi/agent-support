---
name: discuss
description: >-
  Interview the user about a requested feature until a Product Requirements
  Document (PRD) is complete. Use when the user wants to stress-test an idea,
  clarify scope, or pin down a design before planning.
---
Produce a PRD by interviewing the user. Don't write code, don't write an implementation plan — only clarify intent until the PRD checklist below is fully answered.

## Process

1. **Skim the codebase first.** Look for existing conventions, similar features, naming patterns, and where comparable logic lives. Don't ask questions the code can answer — state what you found and move on.
2. **Interview.** Use the `ask_user_question` tool.
   - Batch up to 4 questions in a single call
   - Always provide your recommended answer as the first option, labelled with `(Recommended)`.
   - Keep interview depth proportionate to feature size — a one-line change does not need a 20-question interview.
3. **Stop** when every item in the PRD checklist below has an explicit answer (or an explicit "out of scope" / "deferred").
4. **Save** the PRD to `./.agents/todo/<slug>.prd.md`, then show it to the user.

## Slug convention

`<slug>` is lowercase, words joined by underscores, no dates, no extension noise. Example: `add_user_api`, `cache_invalidation_fix`. The `plan` and `implement` skills will reuse this slug.

## PRD checklist (must all be covered)

- **Problem & user** — who is this for, what pain does it solve
- **In scope** — the behavior we are committing to
- **Out of scope / deferred** — things explicitly _not_ being built now
- **User-visible interface** — CLI flags, API shape, UI sketch, config keys (whatever applies)
- **Data & state changes** — new files, schema, migrations, persisted state
- **Failure modes the user cares about** — what should happen on bad input, missing deps, partial failure
- **Success criteria** — how we'll know it works (observable behavior, not implementation detail)
- **Non-functional constraints** — perf, compatibility, dependencies allowed/forbidden
- **Open questions** — anything still unresolved at hand-off

