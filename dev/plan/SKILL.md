---
name: plan
description: >-
  Turn a PRD document or the current conversation into a detailed implementation
  plan. Use when the user wants to create a plan from the current context or
  from a given PRD file.
---
Turn the current conversation or a given PRD into a detailed implementation plan. Don't write any code yet — just the plan.

If no PRD exists and the feature is non-trivial, offer to run the `discuss` skill first.

Save the plan to `./.agents/todo/<slug>.plan.md`, reusing the slug of the source PRD when one exists (so `add_user_api.prd.md` → `add_user_api.plan.md`).

## Plan Contents

Every plan must contain, in this order:

- **Source PRD** — relative path to the `.prd.md`, or "(none — derived from conversation)"
- **Goal** and **non-goals**
- **Files/directories to inspect**
- **Files likely to change**
- **Proposed implementation steps** — each step small enough to be independently reviewable and committable on its own
- **Assumptions** — each tagged `safe`, `risky`, or `needs confirmation`
- **Degrees of freedom** — for each, the alternatives considered and your recommendation
- **Open questions** that must be answered before coding
- **Validation steps** — exact commands to run, what passing output looks like, which tests cover which behavior

## Rules

- Don't silently decide unclear behavior.
- Don't invent architecture unless requested.
- Don't add dependencies unless explicitly approved.
- Don't plan to refactor unrelated code or clean up outside the task's scope.
- **If any Open Question is unanswered when implementation starts, stop and ask.**
- If implementation later requires deviating from the accepted plan, stop and ask first.

