---
name: prd
description: >-
  Create a durable requirements document from the current conversation, notes,
  issue text, or a previous discussion. Use when requirements need to survive
  beyond the current context or the feature is product-heavy, broad, or
  ambiguous.
---
Create a PRD. Do not write code and do not write an implementation plan.

Save the PRD to `./.agents/todo/<slug>.prd.md`.

## Slug convention

`<slug>` is lowercase, words joined by underscores, no dates, no extension noise. Example: `add_user_api`, `cache_invalidation_fix`. The `plan` skill should reuse this slug.

## Process

1. Gather requirements from the current conversation, notes, issue text, or previous discussion.
2. Skim relevant code only when it helps clarify product behavior, constraints, or existing terminology.
3. Ask only for requirements that materially affect scope, user-visible behavior, data/state, failure modes, or success criteria.
4. If important requirements remain unknown, include them as open questions rather than inventing answers.
5. Write the PRD to `./.agents/todo/<slug>.prd.md` and summarize it for the user.

## PRD contents

Include:

- **Problem / user** — who this is for and what pain it solves
- **In scope**
- **Out of scope**
- **User-visible behavior** — UI, CLI, API, config, workflow, or observable behavior
- **Data/state changes** — persisted state, files, schema, migrations, caches, or none
- **Failure modes** — expected behavior for bad input, missing dependencies, partial failure, etc.
- **Success criteria** — observable outcomes, not implementation details
- **Non-functional constraints** — performance, compatibility, dependencies, security, accessibility, etc.
- **Open questions**

A PRD is optional in the overall workflow; create one only when durable requirements are useful.
