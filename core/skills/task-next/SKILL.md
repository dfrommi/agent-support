---
name: task-next
description: >-
  Activate the next task in a workflow, loading its context and details for
  implementation. Use when user want to proceed to the next task in a workflow.
disable-model-invocation: true
---
## Goal

Put the next task of a multi-task workflow into context for implementation, loading its details and requirements.

After successful activation, you...

- MUST only work on that particular task until it explicitly gets marked as done (via `/task-done` skill)
- MUST NOT work on any other task in the workflow

# Preconditions

Make sure you know the `slug` of the workflow that is currently worked on. If not, ask.

*Working directory:* `.scratch/todo/<slug>/`

## Constraints

The following constraints apply to this skill and are valid only until the task is activated by loading it into context:

- MUST stop and ask if the workflow directory or files are missing or ambiguous
- MUST only read workflow/task content that is not already known from the conversation
- MUST NOT mark the task as done
- MUST NOT read source code, tests, or implementation files
- MUST NOT start implementation

## Process

1. Load or use the known `workflow.md`.
2. Select the first `- [ ]` (open) task in workflow order.
3. Load or use the known task detail file.
4. Report the activated workflow and task.

## Final response

After loading and selecting the task, report:

- workflow file loaded
- task detail file loaded
- selected task title
- one sentence summary of the task goal

This invalidates the `Constraints` section above, and you can again read, write, and implement.
But don't start with it right away, wait for me to ask for the next step.
