---
description: Split a discussed task into a small-context workflow
argument-hint: '[focus]'
---
# Task Workflow Split

Create a durable small-context workflow for the current discussion.
Optional source or focus: $ARGUMENTS

## Purpose

Split feature work into independently executable subtasks that future fresh contexts can run one at a time.
Do not implement code during this command.

## Discovery

- Use the current conversation and optional argument as the source of requirements.
- If a question can be answered by reading local files, inspect the codebase instead of asking.
- Read only enough context to split safely.
- Consider requirement-driven, code-driven, and architecture-driven split options.
- If working on a ticket, use its subtasks as hint for functional split - if existing.
- Optimize for low mental load, independent value where possible, and subtasks that keep the build usable.
- Avoid over-processing trivial changes.

## Before writing files

Propose the slice boundaries first and wait for explicit user approval before creating files.
Use `ask_user_question` when multiple meaningful choices must be resolved.
Stop rather than silently decide risky behavior, ambiguous architecture, or missing acceptance criteria.

Choose a descriptive filesystem-safe slug based on the feature/topic. The workflow folder is:

```text
.agents/todo/<slug>/
  workflow.md
  tasks/
    01-short-task-name.md
    02-short-task-name.md
```

If the target folder exists or any file would be overwritten, stop and ask.

## File format to create after approval

Create `.agents/todo/<slug>/workflow.md` as the compact entry point. Include:

- feature title and slug;
- compact requirements snapshot;
- non-goals / out of scope;
- important assumptions and decisions;
- ordered task queue using `- [ ]` / `- [x]` checkbox markers for `open` / `done` status;
- one-sentence description per task;
- link to each `tasks/NN-*.md` detail file;

Create one `tasks/NN-*.md` file per subtask. Each task file must include:

- goal;
- why this slice exists / value delivered;
- dependencies on previous subtasks, if any;
- what you need to know — key facts discovered during splitting that would be wasteful to re-investigate (API endpoints, existing patterns to follow, file paths, non-obvious constraints). One or two sentences of context plus terse bullet points for key facts;
- files in scope — which files or modules the task operates within. For new files, state where they go. Do not specify exact changes;
- scope and constraints — what the task must achieve and what it must NOT do. If a downstream task depends on specific capabilities exposed by this task, state them as prose contracts (e.g. "task 02 will need the nuki executor to be accessible from CommandService"), not as code;
- validation commands and expected passing signal;
- stop/deviation conditions;
- expected handoff content;

A task file sets boundaries for a fresh context, not a pre-written implementation plan.
Do not include implementation code or step-by-step instructions — the next context decides how to implement within the given scope.
Discovered facts and boundary contracts are the exception: share what you found and what downstream tasks need, but not how to build it.

Do not duplicate the full feature discussion into every task.

## Stop conditions

Stop and ask before writing if there are unresolved risky assumptions, blocking open questions, unclear acceptance criteria, overwrite conflicts, or a need to add dependencies or change architecture beyond the approved discussion.

## Final response

After writing files, report:

- workflow folder path;
- created files;
- task list with checkbox statuses;
- validation or static checks performed;
- next recommended command, usually `/task-next .agents/todo/<slug>/workflow.md`.

