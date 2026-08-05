---
name: task-done
description: Mark one reviewed task workflow item done. Use when the user confirms that the task is completed.
disable-model-invocation: true
---
## Goal

Mark one reviewed workflow task as done and record its durable handoff.

## Constraints

- MUST only change `workflow.md` file
- MUST NOT change any task's detail file
- MUST NOT start the next task automatically
- MUST NOT change any other task's status

## Preconditions

1. Identify `workflow.md` file and the target task from the active task just worked in this conversation. If not clear, ask for clarification.
2. Confirm the task is valid and not already `done`; if ambiguous, ask.

## Process

Update `workflow.md` to:

- change the selected task's `- [ ]` to `- [x]`
- add the compact handoff for that task

If no pending tasks remain in the workflow, move the entire feature directory from `.scratch/todo` to `.scratch/done`.

### Handoff format

Create a compact final handoff with:

- completed work summary
- changed files
- notable artifacts — new interfaces, exports, patterns, or decisions that downstream tasks may depend on
- validation run/result
- deviations or approvals

## Final response

Report:

- task marked done;
- workflow file changed;
- validation or checks performed.
- pending tasks or feature completion
