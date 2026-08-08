---
name: review-skill
description: >-
  Grades a SKILL.md against skill-writing best practice: ten core items plus
  type-specific checks (knowledge skills, bundled scripts), the weakest clause,
  and ranked directive fixes. Run with the path to a skill folder or SKILL.md to
  review.
disable-model-invocation: true
---
# Skill Review

Grade the skill at the given path against the core rubric and return a scored
review. If the target is not a skill, stop and say so.

## Input

Take the target path from the command argument; if no argument was given, take
it from the conversation. If no path can be found, ask which skill to review.

## 1. Inventory the target

1. Read the target SKILL.md in full.
2. Classify it: workflow (mostly steps), knowledge (mostly reference), or hybrid.
3. List its resources — `references/`, `scripts/`, `assets/` — with one line on each.
4. Read every reference file the body points at, plus one representative file from each resource folder.

Done when you can name the target's type, its three clauses, and its resources.

## 2. Grade the core items

Score each item 0 or 1 with a one-line justification that quotes the target as
evidence. Grade the description, then the body, then the resources. Then apply
the type-specific checks (items 11–12) where the inventory says they apply.

### Description — the trigger

1. **Intent, not implementation.** Does the description name user goals ("tracked changes, comments, formatting") and when to use the skill, rather than its internals?
2. **Boundaries.** Does it say when not to use the skill?
3. **Near-miss proof.** Invent two prompts that share keywords but need a different task; would they fail to trigger this skill?
4. **Lean.** Under 1,024 characters with no filler.

### Body — the instructions

1. **Master test.** Does every line pass "would the agent get this wrong without it?"
2. **Directives, not prose.** Imperative sentences the agent can act on, not descriptions of what the skill does.
3. **Freedom calibrated to fragility.** Goals and constraints for flexible steps; exact sequences only where order matters.
4. **Completion criteria.** Every step ends checkable. Hunt the fuzzy words: deep, enough, safe, properly, correctly, appropriate, carefully, ensure quality.
5. **One term per concept.** No synonym drift.

### Resources — on-demand depth

1. **Lean top, loaded on demand.** SKILL.md under 500 lines; dense material in `references/` with explicit "read X if Y" pointers; fragile or repetitive operations in tested scripts.

### Type-specific checks

1. **Knowledge lens** (apply when the target is knowledge or hybrid). Does it pass the adapted master test — "would the agent get this wrong without consulting this document?" Are headings an index in the vocabulary the agent searches with? Is one concept co-located under one heading? Any sprawl, scattering, or cache (restating what the environment already says)? Does an exhaustiveness line bind the rules ("apply every rule in this document")?

2. **Scripts lens** (apply when the target bundles `scripts/`). Non-interactive — no TTY prompts? Three channels clean: structured data to stdout, diagnostics to stderr, meaningful exit codes? Do error messages state what went wrong, what was expected, and what to try? Is `--help` present and concise?

Done when all applicable items have a score and a one-line justification.

## 3. Diagnose the weakest clause

Map the failures: never fires → description; fires on everything →
description; fires and flails → body; fires but hallucinates details →
resources. Name the single weakest clause and the item that cost the most score.

Done when the weakest clause and its costliest item are named.

## 4. Write the review

Use exactly this structure:

```markdown
## Score
N/10 core — {great | functional | rewrite}; type checks X/Y where applicable

## What's already great
- {up to three strengths, quoted from the target}

## Findings, ranked by leverage
1. {item} — {what's wrong in one sentence}. Fix: {directive}. Why: {one clause}.
2. …

## Weakest clause
{one sentence}

## Priority fix
{the single change that moves the score most}
```

Verdict bands: 8–10 great; 5–7 functional, fix the weakest clause; under 5
rewrite, don't patch.

Done when the review names a score, a weakest clause, and at least one
directive fix.

## Edge cases

- Path missing → ask which skill to review.
- Target has no SKILL.md → stop; it is not a skill.
- Dangling reference pointers → report them as a finding under item 10.
- Target over 500 lines → review proceeds; note the sprawl under item 10.
- Target is knowledge or hybrid → item 11 applies; pure workflow → mark N/A.
- Target bundles `scripts/` → item 12 applies; a script that blocks on input is a finding under item 12.

