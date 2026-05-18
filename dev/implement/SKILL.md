---
name: implement
description: >-
  Execute an accepted implementation plan from ./.agents/todo/<slug>.plan.md.
  Use when the user wants the plan turned into code.
---
Implement the accepted plan. Don't redesign it.

## Process

1. **Load the plan** from `./.agents/todo/<slug>.plan.md`. If the slug is ambiguous, ask. If no plan exists, offer to run the `plan` skill first.
2. **Block on open questions.** If the plan's "Open questions" section has unanswered items, stop and ask before writing code.
3. **Execute steps in order.** After each step, run the validation defined for it (or the plan's overall validation steps if per-step validation isn't given).
4. **Deviation rule.** If implementation requires anything not in the plan — new files, new dependencies, a different approach, touching files not listed — stop and ask. Do not silently expand scope.

## Applicable principles

- **Simplicity First** — minimum code that satisfies the plan; no speculative additions.
- **Surgical Changes** — touch only what the plan calls out; match existing style and patterns; remove only orphans your changes created.
- **Goal-Driven Execution** — use the plan's validation steps as the loop condition.

The test for every changed line: it traces directly to a step in the plan.

