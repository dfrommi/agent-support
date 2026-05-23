---
name: discuss
description: >-
  Refine a requested feature or change before planning. Use when the user wants
  to stress-test an idea, clarify scope, identify risks, or pin down behavior
  without yet producing a PRD or implementation plan.
---
Refine the request. Do not write code, do not write an implementation plan, and do not write files by default.

## Process

1. **Skim relevant code when useful.** Look for existing conventions, similar features, naming patterns, and likely constraints. Don't over-invest for tiny tasks.
2. **Find material gaps.** Detect risky missing requirements, ambiguity, hidden edge cases, scope issues, and decisions that would affect user-visible behavior or implementation safety.
3. **Ask only what matters.** Use `ask_user_question` when clarification is needed.
   - Batch up to 4 questions in a single call.
   - Put your recommended answer first and label it `(Recommended)` when you have one.
   - Keep interview depth proportionate to task size.
4. **If clear, say so.** Do not force questions or formal artifacts for straightforward work.
5. **Delegate durable docs.** If requirements should survive beyond the current context, recommend the `prd` skill. If implementation is ready, recommend `plan` or a small implementation/micro-plan as appropriate.

## Refinement summary

End with a concise summary:

- **Goal**
- **Confirmed requirements**
- **Non-goals / out of scope**
- **Assumptions** — separate safe assumptions from risky ones when relevant
- **Open questions**
- **Recommended next step** — `plan`, `prd`, or implementation/micro-plan

