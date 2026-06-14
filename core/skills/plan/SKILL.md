---
name: plan
description: >-
  Create a self-contained implementation plan from the current conversation. Use
  when the user asks to create a plan, plan out work, make a plan, or design a
  plan for a feature or change. Do not use for discussion or requirements
  gathering.
---
# Implementation Plan Creation

Create a self-contained implementation plan from the current conversation. Do not write code.
The plan is the main durable handoff artifact and must be sufficient for a fresh context with a smaller model to implement the change.

## Requirements handling

- If requirements are too unclear to create a safe plan, stop and recommend the `discuss` skill instead.
- Include a full requirements snapshot in the plan.
- Do not silently decide risky behavior. Ask first or record it as blocking.

## Plan contents

Every plan must contain:

- **Source context** — active workflow.md path + task id, or external ticket reference, if any were present at plan creation time
- **Requirements snapshot** — self-contained behavior and constraints
- **Non-goals**
- **Current codebase findings**
- **Files/directories inspected**
- **Files likely to change**
- **Proposed approach**
- **Assumptions** — classify as `safe`, `risky confirmed`, or `risky unresolved`
- **Degrees of freedom and recommendations** — alternatives and recommended choice
- **Open questions** — especially blockers before implementation
- **Validation steps** — exact commands/checks and expected passing signal
- **Implementation contract** — guardrails for the implementation phase (see below)

## Implementation contract

Append a short section to the plan that a fresh context can follow without a separate prompt. Include:

- Do not redesign the plan.
- Stop and ask before: touching files not listed as likely to change, adding dependencies, changing APIs, schemas, auth, or permissions beyond the plan, expanding scope, or destructive changes.
- Every changed line must trace to the plan.
- After completion, report: completed work, changed files, validation results, and any deviations.

## Rules

- Keep plans proportionate; do not over-formalize tiny tasks.
- Don't invent architecture unless requested.
- Don't add dependencies unless explicitly approved.
- Don't plan unrelated refactors or cleanup.
- Mark unresolved risky assumptions/open questions as blocking for implementation.
- If implementation later requires deviating from the accepted plan, it must stop and ask first.

