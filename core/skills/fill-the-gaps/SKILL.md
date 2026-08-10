---
name: fill-the-gaps
description: Complete a user-started implementation without changing the design intent expressed in its code.
disable-model-invocation: true
---

Complete the task end-to-end from the user's partial implementation.

The partial code is an **intent map**, not a patch boundary. It shows which
decisions the user has already made and where the agent has freedom to finish
the work.

Use this skill when the user has supplied partial implementation as a guide.
Do not use it for greenfield work or when no user-authored implementation is
available.

## 1. Read the intent map

Read the task and the user-provided code before planning.

Treat `git diff HEAD` only as a way to locate candidate code. Do not assume all
diffed code was written by the user; ask when ownership is unclear.

Classify each relevant code fragment by the intent it carries:

- **anchor** — a deliberate design decision: for example a business rule,
  query shape, API shape, control flow, domain model, or explicit comment.
  Preserve its behavior and shape. Do not change it without user approval.
- **seam** — incomplete code that reveals a required interaction or contract:
  for example a dummy getter, stub, placeholder, incomplete branch, or
  temporary return value. Replace or adjust it as needed while preserving the
  intent it reveals. Check all usages before changing its shape.
- **open work** — missing work for which the code expresses no design choice.
  Choose the implementation freely, following the task and existing project
  conventions.

Do not treat an anchor as unfinished merely because you would have designed it
differently. Stop and ask when the task cannot be completed without changing an
anchor, or when it is unclear whether code is an anchor or a seam.

Done when every required part of the supplied code has an anchor, seam, or open
work classification.

## 2. Trace outward

For every anchor and seam, trace the code outward through its callers, callees,
types, persistence, APIs, configuration, and tests as applicable.

Infer the work needed to make the intended behavior real. Do not stop at the
explicit stubs or TODOs: implement every layer required to complete the task.

This may include error handling, persistence, migrations, API or controller
code, service wiring, validation, tests, and other supporting code.

Done when the complete path from the user’s intended behavior to its external
effects is accounted for.

## 3. Plan and implement

Present a plan that names:

1. the anchors that will remain unchanged;
2. the contracts inferred from each seam;
3. the open work and supporting layers needed to complete the task.

Ask for approval before implementation.

After approval:

- keep anchors unchanged;
- implement or adjust seams without violating their inferred contracts;
- implement all open and supporting work needed for the task;
- add tests that verify the requested behavior and preserve anchor behavior.

Stop and ask before any change that alters an anchor or a seam’s inferred
contract.

Done when the task is complete, all required layers are connected, the relevant
tests pass, and every anchor remains unchanged unless the user approved it.
