---
name: skill-patterns
description: >-
  Design patterns for writing AI agent skills: reusable strategies for how a
  skill steers the agent's approach to the work. Use when creating, designing,
  writing, or reviewing a skill, or choosing how it should guide the agent.
  Covers strategy patterns only — craft-of-writing lives in writing-for-agents,
  well-formedness checks in review-skill.
---
# Skill Patterns

A reference of design patterns for writing agent skills. Each pattern names a
recurring way a skill steers the agent's approach to the work — not the craft
of writing the document, and not one-off tactics.

Out of scope here:

- **Document craft** — context pointers, progressive disclosure, completion
  criteria, leading words, pruning; see the `writing-for-agents` skill.
- **Well-formedness** — whether the skill is lean, directive, and correctly
  scoped; see the `review-skill` skill.

Each pattern has four fields: **Intent** (the problem it solves), **The
pattern** (its shape), **When to use**, and **Tension** (the opposing pattern,
and when *not* to apply it).

## Discovery — gathering understanding

### Deferred Judgment

- **Intent** — collect candidates before deciding which matter, so the first
  plausible answer doesn't lock out the real one.
- **The pattern** — run a divergent pass that gathers candidates freely and
  forbids evaluation during collection; then run a convergent pass that filters
  against explicit criteria. Never classify or reject during the divergent pass.
  For example, a retrospective that first lists every candidate insight without
  judging, then filters the list against relevance criteria.
- **When to use** — tasks where the best outcome is rarely the first one found:
  reflection, discussion, inventory, review. Where aiming straight at a target
  risks missing the actual issue.
- **Tension** — explore directly toward a target. When the goal is a single
  known fact, deferring judgment wastes turns; go straight there. Divergence
  pays only when the candidate space is genuinely open.

### Question Triage

- **Intent** — ask the human only what only the human knows.
- **The pattern** — before asking, classify each question: can code, files, or
  context answer it? If yes, investigate instead of asking. Ask the user only
  for decisions, intent, and facts that live only in their head. Present
  ambiguity with the options spelled out, not as an open "what do you want?".
- **When to use** — any skill that questions the user, especially when the
  codebase already holds the answer.
- **Tension** — ask everything upfront in one shot. That is right when every
  answer is human-only and cheap to batch (e.g., a provisioning skill collecting
  service name, stages, and secrets at once). Triage is right when the
  environment holds most of the answers. Never interrogate for what a file
  already says.

### Cheapest Check First

- **Intent** — spend investigation effort in the order most likely to change the
  decision, and stop early.
- **The pattern** — order checks by cost-to-value; run the cheapest check that
  could change the outcome first; stop as soon as further evidence cannot change
  the decision. Gates that must be satisfied before a phase begins mark the
  early-exit points. For example, before a deep code dive, first confirm the
  dependency is even in the runtime graph — the cheapest check that can already
  end the investigation.
- **When to use** — investigative or triage skills where evidence is costly and
  the decision space is finite, so "would this change the answer?" is
  answerable.
- **Tension** — exhaustive investigation. When a wrong call is expensive or the
  consumer demands full coverage, cheap-first under-collects. It only works when
  you can name the decision the next check would move.

## Decision — making the call

### Finite Verdict Space

- **Intent** — force the outcome into a closed, named set of verdicts instead of
  free-form prose.
- **The pattern** — define up front the exact conclusions, actions, and
  confidence levels the agent may produce, with the conditions for each. The
  agent maps evidence onto one of them rather than writing an essay; confidence
  is stated separately from the claim. For example, a triage skill with exactly
  four verdicts — exposed / risk-accepted / not-present / unresolved — each
  paired with a confidence level.
- **When to use** — skills that must produce comparable, checkable outcomes:
  triage, review, grading, classification.
- **Tension** — open-ended analysis. Where the answer is genuinely novel or the
  space cannot be enumerated, a fixed menu truncates it. Use free prose only
  when no finite set captures the outcomes.

### Complexity Ladder

- **Intent** — match the approach to the problem's real complexity, climbing
  only as far as needed.
- **The pattern** — present the available approaches as an ordered ladder from
  simplest to most complex, each rung with its conditions, and default to the
  simplest rung that models the problem. Escalate only when a rung demonstrably
  fails, and state explicitly that starting simple and iterating is fine. For
  example, for a continuous-input calculation: direct mapping → physics formula
  → smooth function → fitted model → state machine, climbing only when the
  previous rung under-models the phenomenon.
- **When to use** — implementation skills where a spectrum of techniques exists
  and the temptation is to reach for the heavy one.
- **Tension** — one-size-fits-all, in both directions. Don't over-simplify
  continuous relationships into if-chains, and don't force math where simple
  logic suffices. The ladder's value is the explicit rungs, not the slogan "keep
  it simple".

### Attempted Refutation

- **Intent** — earn confidence by trying to kill your own findings before
  asserting them.
- **The pattern** — for every finding or candidate, actively try to disprove it
  before accepting: is it reachable, pre-existing, covered elsewhere, stylistic?
  Discard with an explicit reason; keep only what survives. Report changes, not
  competence.
- **When to use** — skills whose output is claims that must be right: review,
  retro, triage, diagnosis. Where false positives are costly.
- **Tension** — reporting volume. Disproving every candidate is work; skip it
  when the output is exploratory and false positives are cheap. The inverse
  failure is hand-waving a discard — "already covered" must be proven against
  the exact existing wording, not assumed.

## Delivery — structuring work & output

### Propose, then execute

- **Intent** — never mutate or act irreversibly without explicit approval, while
  keeping the ask at the right granularity.
- **The pattern** — work read-only and freely, but stop and ask before any
  modifying or irreversible action. Gather, derive, and prepare everything
  first, then present the complete action for a single approval — one ask at the
  point of action, not a question per step.
- **When to use** — skills that can change files, data, or systems, especially
  when the change is hard to undo.
- **Tension** — over-gating. Don't ask before non-mutating steps, and don't
  fragment one action into a per-step checklist ("should I do 1? then 2?"). Two
  things are exempt: scratch files written to capture output for a *potential*
  action, and artifacts that are themselves the deliverable (a plan, a report) —
  asking to produce the thing the skill exists to produce is noise.

### Fixed Output Contract

- **Intent** — make the deliverable's shape known before the work starts, so the
  consumer knows exactly what they'll get.
- **The pattern** — fix the output format up front: sections, fields, order,
  severity labels. The agent fills it. The contract is the last thing written
  but the first thing specified; deviations are surfaced, not silent. For
  example, a handoff document whose sections (goal, state, decisions, next
  action) are fixed before any work is done.
- **When to use** — any skill that produces a document, report, or summary
  handed to a human or another agent, especially a handoff.
- **Tension** — exploratory output. When the shape depends on what is found, a
  rigid template forces square pegs into round holes. Even then, pin the
  skeleton (goal, evidence, decision) and leave only the findings list open.

## Selection guide

To pick patterns for a new skill, ask in order:

1. **Does it investigate or gather understanding?** → Discovery:
   - open candidate space → *Deferred Judgment*
   - human vs environment questions → *Question Triage*
   - costly evidence, finite decision → *Cheapest Check First*
2. **Does it make calls or rank?** → Decision:
   - comparable, checkable outcomes → *Finite Verdict Space*
   - a spectrum of approaches → *Complexity Ladder*
   - claims that must be right → *Attempted Refutation*
3. **Does it change files, data, or systems?** → *Propose, then execute*.
4. **Does it produce a fixed artifact?** → *Fixed Output Contract*.

No pattern is mandatory; a skill may use one, several, or none. Apply a pattern
only when its **Tension** does not describe your situation.

Patterns compose. A triage skill can stack *Cheapest Check First* + *Finite
Verdict Space* + *Fixed Output Contract*; a retrospective can stack *Deferred
Judgment* + *Attempted Refutation* + *Fixed Output Contract*. *Propose, then
execute* is orthogonal — it gates any mutating skill and composes with the
rest. This catalog itself follows *Fixed Output Contract*: one consistent shape
per pattern.
