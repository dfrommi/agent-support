---
name: retro
description: >-
  Reflects on a completed session, extracts insights, and improves the agent's
  instructions and skills from them. Use when the user asks for a "retro" or
  wants to sharpen the agent's instructions based on a session.
---
## Core rule

Report changes, not competence. A successful practice that worked as intended is not an actionable candidate unless it exposed a gap, friction, risk, or missing capability. If nothing needs to change, report no action.

## 1. Reflection

### 1.1 Levels of insight

Use these levels as **discovery lenses**, not as a closed taxonomy. During discovery, collect candidates freely; do not assign them a level yet. The bullets are food for thought, not limits. Extend them with your own ideas.

**Level 1: Execution**

- an execution decision, check, or tool-use habit caused avoidable friction
- validation was missing, too weak, or happened too late
- a successful execution habit should be preserved

**Level 2: Repeatable workflows**

- a task sequence can be reordered, clarified, documented, or automated
- a needed source of truth, question, or validation was discovered too late
- an ambiguity should be resolved consistently in comparable tasks
- a workflow was rediscovered through exploration that a project-local skill could encode for future sessions

**Level 3: Project system**

- project-local instructions, skills, references, conventions, or scripts are missing, stale, conflicting, or difficult to discover
- a recurring project task needs a local capability, template, or automation
- repository structure or tooling makes correct work unnecessarily difficult

**Level 4: Reframing and hidden gems**

- challenge a goal, assumption, or interaction model
- identify an approach that removes a class of work rather than optimising it
- transfer a useful pattern from another domain
- capture a surprising success or failure with wider implications
- propose a promising hypothesis that needs validation

After scanning every level, make an explicit **wildcard pass**:

- invert a major decision or assumption from the session
- ask what surprisingly worked, not only what failed
- ask how a capable outsider would redesign the session from scratch
- transfer a practice from another domain or workflow
- look for a change that eliminates a class of work rather than improving it

### 1.2 Workflow-skill extraction check

For every workflow materially rediscovered during the session, explicitly ask:

- did the agent have to infer a repeatable sequence, decision rule, file location, command, or validation step?
- is that knowledge likely to recur in similar project tasks?
- is it stable enough to encode rather than rediscover?
- does an existing project-local skill already cover it?

If the first three answers are yes and no existing skill covers it, record a candidate for a new project-local workflow skill. If an existing skill covers it incompletely, record a candidate to extend that skill. Record why when the workflow is unsuitable for a skill. Do not propose a skill merely because a workflow succeeded without friction or a capability gap.

Every listed level, the wildcard pass, and the workflow-skill extraction check needs an explicit attempt. Producing nothing is valid; omitting the attempt is not.

### 1.3 Classification

After discovery, classify each candidate by the narrowest scope of change that would remove its root cause. Classification supports action selection; it does not determine whether an idea is worth considering.

If a candidate fits multiple levels, use the lowest numbered level that fully addresses the cause. Use **Novel / cross-cutting** when forcing a level would obscure the insight. Never discard a candidate merely because the current taxonomy lacks a place for it.

### 1.4 Distillation

Reflect **relentlessly** on the current session and extract insights until you cannot find more. Then revisit it from different altitudes, zooming in and out. Stop only when a complete pass produces no new, non-duplicate candidates.

Only collect candidates here; do not decide their relevance or actions yet.

**Distil each candidate down to the principle behind it.** Ask what rule, reason, or intent an event reveals, and phrase the insight as that rule — so it applies to future, different occurrences. An insight that only recounts what happened is not yet an insight; keep asking *why* until it states the underlying principle. Test: can you apply it to a situation other than the one that produced it?

Record the originating evidence beside every candidate: a user message, tool result, file, or observed workflow event. If the candidate is an innovative inference rather than a conclusion directly established by the session, label it as a **hypothesis** and state its premise.

**Treat any user correction — of the work or of the retrospective — as high-value evidence.** Analyse what it reveals about both the immediate mistake and its likely scope.

Insights do not need to be expressible as a file edit. A valid insight can be a new tool idea, a project-level improvement, a process change you cannot enact yourself, or a capability gap that should be recorded for future planning. Do not discard an insight solely because you cannot reduce it to "edit this file."

### 1.5 Candidate Insights

Present the candidates to the user in a table:

- level
- insight
- evidence

## 2. Relevance Check

Check every candidate against:

1. Relevance for future sessions
2. Improving on the optimization axes

**Every discard needs a reason.** No insight is dropped on a hand-wave. If the claim is that an insight is already covered, prove it with the exact existing wording and file path, located and verified with `rg`.

### 2.1 Future Relevance

Discard candidates that will only apply to the current task and are unlikely to matter in future sessions. For each candidate, ask: **What will future-us need? Is a future session very likely to need this?** If the answer is no, discard it with that reason.

### 2.2 Optimization Axes

Each surviving candidate must improve at least one optimization axis without significantly harming the others:

- Efficiency: reach the goal faster, in fewer turns
- Correctness: avoid mistakes, depend less on user corrections, and better align with the user's intent
- Token Usage: do the job with the smallest possible number of tokens, fewer turns, and fewer tokens for tool calls

Each surviving candidate must identify a concrete change, owner, or capability gap. Discard candidates whose only action is “preserve,” “continue,” or “keep doing”; no change is needed.

Consider dropping an improvement when it:

- increases efficiency but requires significant user correction
- creates correct results but requires the user to micro-manage or approve each change
- is correct and efficient but makes the process unaffordable through excessive token use

### 2.3 Relevance Assessment

Present the relevance outcome to the user in a table. List all candidates, not only the ones that survived the relevance check. For each candidate, list:

- level
- insight
- discarded (yes/no)
- reason for discard (if discarded)

## 3. Derive Actions

For each candidate that survived §2, select its next action and target. Do not invent a “preserve” action to fill the format: if no concrete action or target can be named, discard the candidate with that reason. Do not present a menu of possible files or leave the placement undecided. Do not modify any file without user approval.

**Recommend now** — select one concrete, **project-local** change in the narrowest authoritative home. These are selection criteria, not a priority order:

- Use `AGENTS.md` only when the knowledge applies to almost all future sessions and must be available from the start.
- Use a file already referenced by `AGENTS.md` when it is the established home for the relevant module or concern.
- Use an existing project-local skill when the knowledge applies to that task or scenario. Create a skill only when no existing skill fits.
  - Only project-local skills may be updated or created (`.agents/skills/<skill_dir>/SKILL.md`). Never modify a skill outside the project.
  - If the obvious modification would be in an external skill, identify that target and discuss it with the user.
  - For a new workflow skill, clarify with the user whether it should be model-invocable.
- Use a small code change when it directly solves the candidate.

Name the selected file and proposed change. Do not list alternatives. If the repository does not provide enough evidence to choose a target, ask the user a focused question. A candidate may require multiple changes only when they are interdependent; name each change, its target, and why one alone is insufficient.

**Plan for later** — select the owner or system that must act, then describe the concrete change and why it is valuable.

- A globally useful trait, independent of the project, belongs in the system prompt.
- Tuning a tool's schema or documentation belongs with the tool's owner.
- Describe every other non-local change in enough detail to plan later.

## 4. Final Summary

Present the final outcome to the user. List all candidates, not only the ones that survived previous steps. For each candidate, list:

- level
- insight
- evidence
- discarded (yes/no)
- reason for discard (if discarded)
- actionable (yes/no)
- selected action and target (now for actionable, later for non-actionable)

Do not list successful practices as candidates or actions. If no candidate warrants a current or later action, say explicitly: **No actions.**

Don't perform any modification without user approval.
