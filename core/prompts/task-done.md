---
description: Mark one reviewed task workflow item done
argument-hint: '<workflow.md> [task-id]'
---
# Task Workflow Done

Mark one reviewed workflow task as done and record its durable handoff.
Input: $ARGUMENTS

## Load and identify

1. Load the provided `workflow.md`. If it is missing or ambiguous, stop and ask.
2. Identify the target task from the explicit task id, or from the task just worked in this same context.
3. Confirm the task is valid and not already `done`; if ambiguous, ask.
4. Require user review/approval before marking the task done.

## Collect handoff

Record a compact final handoff in `workflow.md` with:

- completed work summary;
- changed files;
- notable artifacts — new interfaces, exports, patterns, or decisions that downstream tasks may depend on;
- validation run/result;
- deviations or approvals;
- warning if uncommitted changes existed when marking done.

Prefer updating only `workflow.md`. Do not update task detail files unless the existing workflow format explicitly requires final notes there and the update will not create duplicated drift.

## Git checks

Check for uncommitted changes:

```bash
git status --short
```

If uncommitted changes exist, warn the user and still mark the task done. Record that uncommitted changes existed.

Never run `git commit`. Do not require a clean working tree. Do not record or infer commit hashes.

## Update workflow

Update `workflow.md` only to:

- change the selected task's `- [ ]` to `- [x]`;
- add the compact handoff for that task;
- keep other open tasks unchanged.

Do not start the next task automatically. Do not implement code. Do not create commits.

## Final response

Report:

- task marked done;
- workflow file changed;
- uncommitted-change warning, if any;
- validation or checks performed.

