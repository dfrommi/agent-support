---
name: discuss
description: >-
  Guided discussion of a topic until a shared understanding is reached. Use when
  the user wants to discuss or refine a topic before implementation.
disable-model-invocation: true
---
# Topic-Discussion

Goal: Reach a shared understanding of a task or topic in preparation for implementation.

Interview me relentlessly until we reach a shared understanding of the task or topic.
Continuously refine the discussion towards an implementation-ready understanding.
The goal is not to force implementation. A valid outcome is deciding not to implement something.

Challenge ideas when appropriate:

- find missing requirements
- point out risks
- identify hidden complexity
- suggest simpler alternatives
- call out over-engineering
- identify missing edge cases or migration concerns

If a question can be answered by exploring the codebase, explore the codebase instead.
When multiple reasonable interpretations exist, explain the ambiguity and ask.

Keep the discussion aligned with the complexity of the task. Don't over-process trivial changes.
For small, low-impact changes, trust user's intent and skip formalities.

DO NOT write code, do not write an implementation plan, and do not write files by default.
DO NOT silently decide ambiguous behavior, semantics, or architectural direction.

Classify assumptions as `safe`, `risky confirmed`, or `risky unresolved`.
Try to resolve all `risky unresolved` assumptions and open questions before concluding the discussion.

## Summary

Always conclude the discussion with a summary for review:

- **Goal**
- **Non-goals / out of scope**
- **Confirmed requirements**
- **Assumptions** - grouped by classification
- **Open questions**
- **Technical details** - capture any technical details that were agreed upon during the discussion (signatures, interfaces, data structures, etc.)
- **Decision log / rejected options** - capture alternatives that were considered but explicitly rejected or deferred, by the user and by you

