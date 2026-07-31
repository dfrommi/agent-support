---
name: discuss
description: Guided discussion of a topic until a shared understanding is reached. Use when the user wants to discuss or refine a topic before implementation.
disable-model-invocation: true
---
# Topic-Discussion

Interview me relentlessly until we reach a shared understanding of the topic.
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

Keep the discussion aligned with the complexity of the task. Don't over-process trivial changes. For small, low-impact changes, trust user intent and skip formalities.

DO NOT write code, do not write an implementation plan, and do not write files by default.
DO NOT silently decide ambiguous behavior, semantics, or architectural direction.

Classify Assumptions as `safe`, `risky confirmed`, or `risky unresolved`.
Try to resolve all `risky unresolved` assumptions and open questions before concluding the discussion.
When concluding the discussion, list all assumptions, their classification and any open questions.

## Summary

Create a full summary only if I ask for it.
Make sure that no detail is lost. Include all relevant information in a structured format, including:

- **Goal**
- **Confirmed requirements**
- **Non-goals / out of scope**
- **Assumptions**
- **Open questions**
- **Affected code areas** - add relevant code locations that were already discovered as part of the discussion to support planning and implementation and avoid rediscovery later
- **Decision log / rejected options** - capture alternatives that were considered but explicitly rejected or deferred, so future sessions do not reopen them accidentally.
