---
description: Work exactly one task from a task workflow
argument-hint: '<workflow.md> [task-id]'
---
# Task Workflow Work

Work exactly one open subtask from a small-context workflow.
Input: $ARGUMENTS

## Load and select

1. Load the provided `workflow.md`. If it is missing or ambiguous, stop and ask.
2. If a task id is provided, select that task only if it is valid and `open`.
3. If no task id is provided, select the first `- [ ]` (open) task in workflow order.
4. Load the selected `tasks/NN-*.md` detail file.
5. Read only the required/relevant context and code files for this one task.
6. Ignore git dirty-state checks at startup; cleanliness is the user's responsibility.

## Block before editing

Stop before editing if any of these are true:

- the task is missing, not `open`, or has no readable detail file;
- required context, allowed files, validation, or acceptance criteria are missing;
- there are unresolved risky assumptions or blocking open questions;
- the work would require files outside the task's allowed scope;
- the task is too large, wrong, unsafe, or no longer matches the workflow.

If the selected task is too large or wrong, stop and recommend resplitting instead of doing partial work.

If the task detail file conflicts with the workflow.md requirements snapshot or decisions log, treat workflow.md as authoritative and stop to resolve the conflict before editing.

## Mini-plan approval

Before editing, present a concise mini-plan and wait for explicit user approval. Cover:

- selected task id/title;
- intended scope and non-scope;
- files expected to change;
- key risks or assumptions;
- validation command(s) to run.

Do not edit until approval is given.

## Execute

After approval:

- implement only this subtask;
- change only files allowed by the task detail file;
- preserve existing behavior outside the approved scope;
- do not refactor, reformat, or clean up code unrelated to the task;
- stop and ask before any deviation, dependency, destructive action, or user-visible behavior/API/schema/auth/permission change not covered by the task;
- safe assumptions are allowed and should be reported: decisions that match existing patterns, naming/style/test conventions, preserve existing behavior, or use existing utilities/dependencies;
- run the specified validation where possible.

## Do not update workflow docs

Do not mark the task done. Do not update `workflow.md` or task docs. Do not start or prepare the next task. `/task-done` records completion after user review.

