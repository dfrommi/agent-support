---
description: Create an implementation plan
argument-hint: '[source]'
---
# Implementation Plan Creation

Create a self-contained implementation plan. Do not write code.

The plan is the main durable handoff artifact and must be sufficient for a fresh context or smaller model to implement via `/new + @<plan-file>.md`.
Save every plan to `./.agents/todo/<slug>.plan.md`.

## Topic

Create a plan for the current conversation.
Optional focus: $ARGUMENTS

## Requirements handling

- If requirements are too unclear to create a safe plan, stop and recommend `discuss` skill instead.
- Include a full requirements snapshot in the plan.
- Do not silently decide risky behavior. Ask first or record it as blocking.

## Plan contents

Every plan must contain:

- **Requirements snapshot** — self-contained behavior and constraints
- **Non-goals**
- **Current codebase findings**
- **Files/directories inspected**
- **Files likely to change**
- **Proposed approach**
- **Assumptions** — classify as `safe`, `risky confirmed`, or `risky unresolved`
- **Degrees of freedom and recommendations** — alternatives and recommended choice
- **Open questions** — especially blockers before implementation
- **Execution slices** suitable for fresh contexts
- **Validation steps** — exact commands/checks and expected passing signal

## Execution slice format

Each slice should include:

- **Goal**
- **Required context/files to read**
- **Allowed files to change**
- **Task instructions**
- **Validation command**
- **Stop/deviation conditions**
- **Handoff note to produce after completion**

## Rules

- Keep plans proportionate; do not over-formalize tiny tasks.
- Don't invent architecture unless requested.
- Don't add dependencies unless explicitly approved.
- Don't plan unrelated refactors or cleanup.
- Mark unresolved risky assumptions/open questions as blocking for implementation.
- If implementation later requires deviating from the accepted plan, it must stop and ask first.

