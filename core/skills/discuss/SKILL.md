---
name: discuss
description: Guided discussion of a topic until a shared understanding is reached. Use when the user want to discuss or refine a topic before implementation.
disable-model-invocation: true
---
# Topic-Discussion

Interview me until we reach a shared understanding of the topic. Continuously refine the discussion towards an implementation-ready understanding.
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

Prefer structured questions over open-ended discussion whenever possible (use `ask_user_question` tool). Keep options meaningfully different.

Keep the discussion aligned with the complexity of the task. Don't over-process trivial changes. For small, low-impact changes, trust user intent and skip formalities.

DO NOT write code, do not write an implementation plan, and do not write files by default.
DO NOT silently decide ambiguous behavior, semantics, or architectural direction.

Try to resolve all `risky unresolved` assumptions and open questions before concluding the discussion.

## Summary

Add a summary only if explicitly requested by the user:

- **Goal**
- **Confirmed requirements**
- **Non-goals / out of scope**
- **Assumptions** — classify as `safe`, `risky confirmed`, or `risky unresolved`
- **Open questions**
- **Affected code areas** - add relevant code locations that were already discovered as part of the discussion to support planning and implementation and avoid rediscovery later
- **Decision log / rejected options** - capture alternatives that were considered but explicitly rejected or deferred, so future sessions do not reopen them accidentally.
