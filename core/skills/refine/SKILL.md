---
name: refine
description: >-
  Decide and agree on an ordered implementation split for a coding task. Use when
  the user wants to divide work into reviewable slices before implementation.
disable-model-invocation: true
---

## Goal

Reach agreement on an ordered sequence of implementation slices.

## 1. Discovery

- Use the current conversation and optional argument as the source of requirements.
- End discovery as soon as you can propose a split and run the stop-and-ask checklist below against it; read no further.
- If you lack a common understanding with the user about the task that can't be resolved from code, stop and suggest the `discuss` skill instead.
- If a question can be answered by reading local files, inspect the codebase instead of asking.
- Stop and ask if there are unresolved risky assumptions, blocking open questions, unclear acceptance criteria, overwrite conflicts, or a need to add dependencies or change architecture beyond the approved discussion.

## 2. Task Splitting Guidelines

- Identify *coherent vertical slices* that can be reviewed independently.
- Consider *requirement-driven*, *code-driven*, and *architecture-driven* split options.
- Optimize for *low mental load*, *independent value* where possible, *meaningful review*, and subtasks that keep the *build stable*.
- Consider whether a *refactoring slice* is needed before a functional slice.
- Check that each slice has a *clear boundary* and that later slices can build on earlier ones.
- If working on a ticket, use its subtasks as hint for functional split.
- Don't force a split if the task is easy enough to be implemented in one slice.

## 3. Split decision

Present one recommended ordered split and, only when meaningfully different alternatives exist, concise alternatives. Explain the trade-offs briefly and ask the user to confirm or adjust the split.

The split output must contain only the information needed to agree on sequencing:

- overall goal
- ordered slice titles/topics
- one-sentence purpose per slice
- dependencies and ordering constraints
- notable risks or transitional states
- validation boundary for each slice

## Execution contract

Once the user confirms the split, activate the first slice and work only on it.

- Do not implement, plan, or investigate later slices except where necessary to validate the current boundary.
- Keep the ordered split list in the conversation and track completed/current/pending slices explicitly.
- At the end of the active slice, stop and report the changed files, validation, deviations, and review questions.
- Wait for explicit user confirmation. When the user confirms the active slice, commit it and immediately start the next pending slice.
- A confirmation such as "continue", "next", or equivalent advances exactly one slice; otherwise ask for clarification.
- Do not use words like "slice" or "step" in commit messages.
- Do not automatically start the next slice after reporting completion.
