---
name: retro
description: >-
  Reflects on a completed session, extracts insights, and improves the agent's
  instructions and skills from them. Use when the user asks for a "retro" or
  wants to sharpen the agent's instructions based on a session.
---
## 1. Reflection

### 1.1 Levels of insight

Insights appear on different levels/altidudes. You have to zoom in and out to find them all.
If an insights fits into multiple levels, place it in the lowest.

Don't restrict yourself to the existing bullet-points in the levels when searching for insights, they are just food of thought. Extend them with your own ideas.

**Level 1: Direct feedback**

- failed tool calls
- user corrections
- repeated mistakes
- user as a debugger

**Level 2: Inefficiencies**

- extensive exploration due to missing knowledge
- workflows that could have been predefined and documented
- re-reading the same files multiple times
- shell quoting friction
- tool invocation count

**Level 3: Missing agent capabilities**

- tools that would have made the session faster, cheaper, or more correct

**Level 4: Hidden Gems**

- what was strange about this session from the outside
- would a different approach have been more efficient
- question the entire process
- aim for the insight no one has had yet

### 1.2 Distillation

Reflect **relentlessly** on the current session and extract insights until you can't find more insights.
When you're done, do it again on different altitudes, zoom in and out. Keep on digging until you find nothing new.

Only collect, don't judge.

Each level needs an explicit attempt, not a skim — producing nothing at a level is a valid outcome; skipping a level is not.

**Distill each insight down to the principle behind it.** Ask what rule, reason, or intent an event reveals, and phrase the insight as that rule — so it applies to future, different occurrences. An insight that only recounts what happened is not yet an insight; keep asking *why* until it states the underlying principle. Test: can you apply it to a situation other than the one that produced it?

**Treat user corrections as the highest-value input.** When the user disputes or corrects an insight. It gives you the most significant hint not only on the what, but most importantly on the why. Analyse the user's message carefully and understand the scope it applies to.

**Insights do not need to be expressible as a file edit.** A valid insight can be a new tool idea, a project-level improvement, a process change you cannot enact yourself, or a capability gap that should be recorded for future planning. Do not discard an insight solely because you cannot reduce it to "edit this file."

## 1.3 Reflection Summary

Present the insights to the user in a table:

- level
- insight
- evidence

## 2. Relevancy Check

Each insight must be checked against

1. Relevancy for future sessions
2. Improving on the optimization axes

**Every discard needs a reason.** No insight is dropped on a hand-wave.
If the claim is, that it's already covevered, prove it by quoting file and wording, verified by `rg`.

### 2.1 Future Relevancy

Only consider insights that will be useful for future tasks, skip everything that only applies to the current task and will no longer be relevant in future sessions.
For each insight, ask yourself: **What will future-us need? Is a future session very likely to need this?**.
If the answer is no, discard it.

### 2.2 Optimization Axes

Each insight must improve at least one of the optimization axes, while not significantly harming the others:

- Efficiency: reach the goal faster, in fewer turns
- Correctness: avoid mistakes, depend less on user corrections, be better aligned with the user's intent
- Token Usage: do the job with the smallest possible number of tokens, fewer turns, fewer tokens for tool calls

Considerations for when to drop an improvement (due to the optimization axes):

- Leads to high efficiency, but the user needs to correct the outcome significantly
- Creates perfectly correct results, but the user needs to micro-manage and approve each change
- The result is 100% correct and efficient, but uses such a high number of tokens that the process is no longer affordable

## 2.3 Reflection Summary

Present the relevancy outcome to the user in a table. List all insights, not only the ones that survived the relevancy check. For each insight, list:

- level
- insight
- discarded (yes/no)
- reason for discard (if discarded)

## 3. Derive Actions

For each insight that survived §2, determine next actions.

**Act now** — apply the insight in a **project-local** file

1. If the insight is relevant for almost all future sessions and should always be available from the start, suggest adding it to `AGENTS.md`.
2. If `AGENTS.md` already references a file where the knowledge fits, suggest adding it there.
3. If it is only relevant for certain tasks or in certain scenarios, suggest creating or updating a skill.
   - Only project-local skills are allowed to be updated/created (`.agents/skills/<skill_dir>/SKILL.md`). Never touch a skill outside of the project.
   - If the obvious modification would be in an external skill, highlight and discuss with the user.
   - Update existing skills if they fit, suggest creating a new skill if they don't.
   - For new workflow skills, clarify with the user whether they should be model-invocable
4. If the insight can be solved by a small code change, suggest the proposed change to the user

- **Plan for later** — If the insight doesn't fall under "Act now", describe it in detail

1. If the suggested change is easy, but exceeds the scope of the current projects, describe the change and suggest it for later.

- a globally useful trait, independent of the project, that should always be applied, should be added to the system prompt
- tuning a tool's schema or documentation to make it more useful for future sessions

1. Everything else describe in detail to plan for later

## 4. Final Summary

Present the final outcome to the user. List all insights, not only the ones that survived previous steps. For each insight, list:

- level
- insight
- evidence
- discarded (yes/no)
- reason for discard (if discarded)
- actionable (yes/no)
- action to be taken (now for actionable, later for non-actionable)

Don't perform any modification without user approval.
