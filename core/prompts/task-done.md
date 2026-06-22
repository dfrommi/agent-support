---
description: Mark one reviewed task workflow item done
---
# Task Workflow Done

Mark one reviewed workflow task as done and record its durable handoff.

## Load and identify

1. Identify `workflow.md` file and the target task from the task just worked in this same context.
2. Confirm the task is valid and not already `done`; if ambiguous, ask.

## Collect handoff

Record a compact final handoff in a new section of `workflow.md` with:

- completed work summary;
- changed files;
- notable artifacts — new interfaces, exports, patterns, or decisions that downstream tasks may depend on;
- validation run/result;
- deviations or approvals;

Prefer updating only `workflow.md`. Do not update task detail files unless the existing workflow format explicitly requires final notes there and the update will not create duplicated drift.

## Update workflow

Update `workflow.md` only to:

- change the selected task's `- [ ]` to `- [x]`;
- add the compact handoff for that task;
- keep other open tasks unchanged.

Update `workflow.json` only to set the selected task's status to `done: true`

Do not start the next task automatically. Do not implement code. Do not create commits.

## Finalize feature

If no pending tasks remain in the workflow, move the entire feature directory from `.agents/todo` to `.agents/done`.

## Final response

Report:

- task marked done;
- workflow file changed;
- validation or checks performed.
- pending tasks or feature completion

