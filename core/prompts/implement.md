---
description: Implement a plan
argument-hint: <slug>
---
# Plan Implemention

Implement the accepted plan. Do not redesign it.

## Process

1. **Load the plan** from `./.agents/todo/$1.plan.md`. If the slug or slice is ambiguous, ask. If no plan exists, offer to run the `plan` skill first.
2. **Load referenced PRD.** If the plan references a PRD, load it too. Treat the plan as the operational contract; if the plan conflicts with the PRD, treat the PRD as authoritative and stop to resolve the conflict.
3. **Choose scope.** Implement either the whole plan or one named/numbered execution slice, as requested. For slice work, use only that slice plus required shared context.
4. **Block on unsafe gaps.** Stop before editing if there are unresolved risky assumptions, blocking open questions, or missing acceptance criteria for the requested scope.
5. **Execute exactly.** Follow the plan/slice instructions, allowed files, and validation steps.
6. **Produce a handoff note** after each slice or whole-plan completion.

## Deviation rule

Do not silently deviate. Stop and ask if implementation requires:

- touching files not listed as allowed/likely to change
- adding dependencies
- changing user-visible behavior, APIs, persistence, schemas, auth, or permissions beyond the plan
- expanding scope or choosing a different architecture
- destructive behavior or migration not explicitly approved

Safe implementation assumptions may be made and reported when they match existing patterns, naming/style/test conventions, preserve existing behavior, or use existing utilities/dependencies.

## Handoff note

After each slice, report:

- **Completed work**
- **Changed files**
- **Validation run/result**
- **Deviations** — if any, including approvals
- **Next recommended slice**

The test for every changed line: it traces directly to the accepted plan or selected execution slice.

