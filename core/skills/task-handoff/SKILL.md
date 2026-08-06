---
name: task-handoff
description: Compact the current coding session into a handoff document for another agent to pick up.
disable-model-invocation: true
---

## Goal

Write exactly one concise Markdown handoff to the user's OS temporary directory. It must let a fresh agent continue an approved `refine` session without rereading the conversation.

## Preconditions

- An ordered split is agreed.
- Record whether the handoff is **between slices** or **during a slice**.
- At a boundary, the next slice is **not started**; do not call it current or in progress.

## Required content

Use this structure:

```markdown
# <title>

## Goal

## Confirmed requirements

## Non-goals and constraints

## Refinement state

- Split approved: yes
- Handoff point: between slices | during slice
- Active slice: none | <number and title>
- Active slice status: not applicable | in progress
- Next slice: <number and title>
- Completed slices: <numbers>
- Pending slices: <numbers>

## Ordered split

| Slice | Purpose | Completion / validation |
|---|---|---|
| 01 | ... | ... |
| 02 | ... | ... |

## Implementation state

### Completed

### Active slice or next action

### Current slice acceptance

- ...

### Focused files and tests

- ...

### Correctness traps

- ...

### Pending

## Key technical facts

## Decisions and rejected alternatives

## Changed files

## Validation

## Deviations, blockers, and open questions

## Split execution contract

This is an approved `refine` (task-splitting) continuation. Load and follow the `refine` skill's execution contract. Do not create a new split.

- During a slice: resume the active slice immediately.
- Between slices: start the next slice immediately; it is not yet in progress.
- Work on one slice only.
- After completing it, report changes, validation, deviations, and questions, then stop for confirmation before continuing.

## Next action

State the immediate action explicitly. At a slice boundary, it must start the next slice; during a slice, it must resume the active slice.

<read-files>
...
</read-files>

<modified-files>
...
</modified-files>
```

## Content rules

- State the active/next distinction explicitly.
- For a boundary handoff, write `Start the next slice immediately after loading this handoff.`
- For an in-progress handoff, write `Resume the active slice immediately after loading this handoff.`
- Never require an extra start command for the next slice.
- Describe every slice with its purpose and validation boundary.
- State what is implemented, what is connected to runtime, and what remains unchanged.
- For the active/next slice, list acceptance checks, focused files/tests, and correctness traps.
- Preserve exact names, interfaces, commands, test results, and relevant unrelated failures.
- Include policy matrices or other decisions a fresh agent cannot safely infer from file paths alone.
- Reference existing artifacts instead of duplicating them.
- Do not include speculative plans.

After writing, report the path.
