---
name: extend-agent
description: >-
  Entry point for extending the agent or harness. Use when the user wants to
  create or update a skill, write an extension, add a theme or custom tool,
  integrate the SDK, add a provider, or otherwise extend pi. Branches into skill
  authoring, or into pi's docs (pi-context) for everything skills cannot do.
---
# Extend the Agent

Entry point for anything that extends the agent or harness. Branch first, then
follow the relevant path.

## If it's a skill

Create, update, or review a skill:

1. **Choose the strategy** — read `../skill-patterns/SKILL.md` and pick the
   patterns that match how the skill should steer the agent.
2. **Write it** — follow the `writing-for-agents` skill for the craft: context
   pointers, the two loads, progressive disclosure, completion criteria, leading
   words, pruning.
3. **Check it** — read `../review-skill/SKILL.md` and grade the result before
   finishing.
4. **Platform mechanics** — read `../pi-context/SKILL.md` and follow its pointer
   to `docs/skills.md` for frontmatter, invocation, and locations.

## If skills can't do it

Extensions, themes, SDK integrations, custom tools, providers, keybindings,
models, packages, environment variables:

- Read `../pi-context/SKILL.md` — it resolves pi's on-disk `docs/` and maps each
  topic to the right file.

Skip a step only when its concern does not apply.
