---
name: refine
description: >-
  Asses the complexity of a task and decide how to approach implementation. By
  direct one-shot, or by ticket with optional subtasks. Then create required
  assets. Use when the user wants to refine a task or create tickets.
disable-model-invocation: true
---
## Goal

Decide how to approach implementation of a task, whether to split it into multiple sub-tasks and create required files.

## Workflow

1. Gather a deep understanding of the task and its complexity via `Discovery`.
2. Consider how to split the task into subtasks via `Task Splitting Guidelines`.
3. Decide on the implementation type via `Implementation Type Decision`.
4. Depending on the outcome, either implement or create the required files via `Task Creation`.

## Discovery

- Use the current conversation and optional argument as the source of requirements.
- Gather a deep understanding of the task and its complexity.
- Stop and ask if there are unresolved risky assumptions, blocking open questions, unclear acceptance criteria, overwrite conflicts, or a need to add dependencies or change architecture beyond the approved discussion.
- If a question can be answered by reading local files, inspect the codebase instead of asking.
- Read only enough context to split safely.

## Task Splitting Guidelines

- Consider *upfront refactoring* as a dedicated subtask if it will make the implementation of the main task easier.
- Consider *requirement-driven*, *code-driven*, and *architecture-driven* split options.
- Strongly prefer splitting into *coherent vertical slices* over horizontal slices.
- Optimize for *low mental load*, *independent value* where possible, *meaningful review*, and subtasks that keep the *build stable*.
- If working on a ticket, use its subtasks as hint for functional split.
- Avoid over-processing trivial changes.

## Implementation Type Decision

Depending on the expected complexity of the task, and the potential of detecting unkonwn unknowns, assign the task to each of these categories:

- **Direct one-shot implementation**: Task is small and straight forward. Low risk of unexpected increase in complexity.
- **Single-task implementation**: Task seems small and ready for one-shot, but the risk of unexpected increase in complexity is significant. Doing full ceremony is preferrable due to possible additional efforts.
- **Multi-task implementation**: Task is complex or has an upfront refactoring. Implementation with subtasks is recommended. Provide multiple possible splits with different granularity, unless only one split makes sense.

Present it to me and ask me to choose the approach. Never continue without my clear constent.
If I choose multi-task implementation, ask me to choose a split.

Then perform the next step. If I choose...

- `Direct one-shot` implementation: implement the task in a single step and don't continue with the instructions in this document.
- `Single-task` or `Multi-Task` implementation: continue with the creation of tasks before starting implementation.

## Task Creation

Choose a descriptive filesystem-safe `slug` based on the feature/topic.

### File Structure

Target dirctory structure:

```text
.scratch/todo/<slug>/
  workflow.md
  01-short-task-name.md
  02-short-task-name.md
```

If the target folder exists or any file would be overwritten, stop and ask.

### Workflow File

Create `workflow.md` as the compact entry point. Include:

- **Feature title and slug**
- **Goal**
- **Non-goals / out of scope**
- **Confirmed requirements**
- **Assumptions** - classified as `safe`, `risky confirmed`, or `risky unresolved`
- **Open questions**
- **Technical details** - capture any technical details that were agreed upon during the discussion (signatures, interfaces, data structures, etc.)
- **Decision log / rejected options** - capture alternatives that were considered but explicitly rejected or deferred, by the user and by you
- **Ordered task queue**
  - ordered by execution sequence
  - using `- [ ]` / `- [x]` checkbox markers for `open` / `done` status
  - one-sentence description per task
  - link to each `NN-*.md` detail file

### Task Files

Create one `NN-*.md` file per subtask. Each task file must include:

- **Goal**
- **Why this slice exists / value delivered**
- **Dependencies on previous subtasks** - if any
- **What you need to know** - key facts discovered during splitting that would be wasteful to re-investigate (API endpoints, existing patterns to follow, file paths, non-obvious constraints). One or two sentences of context plus terse bullet points for key facts
- **Files in scope** — which files or modules the task operates within. For new files, state where they go. Do not specify exact changes
- **Scope and Constraints** — what the task must achieve and what it must NOT do. If a downstream task depends on specific capabilities exposed by this task, state them as prose contracts (e.g. "task 02 will need the job executor to be accessible from CommandService"), not as code
- **Validation commands and expected passing signal**
- **Stop/deviation conditions**
- **Expected handoff content**

A task file sets boundaries for implementation. It's not a pre-written implementation plan.
Do not include implementation code or step-by-step instructions.
Exception: Discovered facts and boundary contracts. Share what you found and what downstream tasks need, but not how to build it.

Do not duplicate the full feature discussion into every task.

## Final response

After writing files, report:

- slug
- workflow folder path;
- created files;
- task list
- next recommended command, usually `/task-next .scratch/todo/<slug>/workflow.md`.
