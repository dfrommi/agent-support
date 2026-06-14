---
description: Activate exactly one task from a task workflow
argument-hint: <workflow.md>
---
# Task Workflow Activation

Activate exactly one task from a task workflow. Don't start with the implementation yet, just load it into context.
`workflow.md` file: `$1`

## Load and select

1. Load the `workflow.md`. If it is missing or ambiguous, stop and ask.
2. Select the first `- [ ]` (open) task in workflow order.
3. Load the task detail file for the selected task (e.g., `tasks/01-*.md`).
4. Do not read any source code files — source reading happens during implementation, not during task selection.

## Block before editing

Stop before editing if any of these are true:

- the task is missing, not `open`, or has no readable detail file;
- required context, allowed files, validation, or acceptance criteria are missing;
- there are unresolved risky assumptions or blocking open questions;
- the work would require files outside the task's allowed scope;
- the task is too large, wrong, unsafe, or no longer matches the workflow.

If the selected task is too large or wrong, stop and recommend resplitting instead of doing partial work.

If the task detail file conflicts with the workflow.md requirements snapshot or decisions log, treat workflow.md as authoritative and stop to resolve the conflict before editing.

## Final response

After loading and selecting the task, report:

- workflow file loaded
- task detail file loaded
- selected task title
- one sentence summary of the task goal

## Do not update workflow docs

Do not mark the task done. Do not update `workflow.md` or task docs. Do not start or prepare the next task. `/task-done` records completion after user review.

