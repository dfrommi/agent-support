---
name: fill-the-gaps
description: >-
  Continue work started by the user. Use when the user has provided a partial
  implementation and asks to continue and finalize it.
disable-model-invocation: true
---
The user already started the implementation of the task, and it is your job to continue and finalize it.

The provided code was carefully chosen by the user to help you, with clear intent:

- A core part should be implemented exactly as he envisioned it. And instead of trying to explain in prose, he provided the implementation. Let the code speak.
- The user also guides you the way on how to continue the implementation, with the help of dummy-methods, comments, and other hints. Follow these hints.

## 1. Precondisions

- Task provided or known from the current session
- User-provided partial implementation of the task.
  - try `git diff HEAD` if not specified by the user

**Sanity check**: Check if the provided partial implementation is not related to the task. If not, stop and ask.

## 2. Code Understanding

Read the user-provided code fully and understand its intent and how it relates to the task.

Then assign each line to one of the following categories:

- **authorative**:
  - The user expressed a clear idea on how the task should be implemented. It is his intent to implement it in this specific way, which must be honored highly.
  - *Modification constraint*: MUST not be changed without explicit user approval.
- **gap**:
  - Parts of the user's code that were not important to express the intent and to guide the way. Exception handling, logging, a specific else-branch, etc.
  - *Modification constraint*: Expected to be filled in by you
- **mock**:
  - Dummy methods, properties, or other placeholders to link the authorative parts to the rest or the code, also the one that doesn't exist yet.
  - *Modification constraint*: Allowed to be changed, but usages MUST be checked first. If the change will cause a modification of the authorative code, it must be discussed with the user first.

## 3. Review

Review the **authorative** code and check for errors, inconsistencies, and contradictions with the task.
If you find any, stop and discuss with the user.

## 4. Implementation

Create a plan how to implement the missing parts of the task. Use the provided code as a guide.
You MUST strictly follow the modification constraints of the classification of the code lines.

Take the hints the user left for you in the code as strong suggestion. Don't diverge lightly from the user's intent.
If in dobut, ask the user for clarification.

Present the plan to the user and ask for approval before starting the implementation.

