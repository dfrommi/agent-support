---
name: code-review
description: >-
  High-signal review of a change across three axes — Bugs, Standards, Spec — with
  a validation pass and a Smells section for judgement-call complexity.
disable-model-invocation: true
---
# Code Review

Review the changes since a fixed point and report the short list of real,
actionable issues a senior engineer would want fixed before merge. The goal is
signal, not volume. Read only; never modify code.

## Process

### 1. Pin the scope

Pick the review target in this order:

1. Explicit target the user supplied (commit, branch, tag, PR, path).
2. Current branch against its merge base.
3. Staged and unstaged working-tree changes.
4. The most recent implementation changes relevant to the request.

Resolve the diff command and commit list, then verify the diff is non-empty
before dispatching anything:

- Fixed point: `git diff <fixed-point>...HEAD` (three-dot) · `git log <fixed-point>..HEAD --oneline`
- Working tree: `git diff HEAD` · `git diff --cached`

A bad ref or empty diff fails here, not inside four sub-agents.

### 2. Capture intent (the Spec)

Write the originating request in one sentence: what the change is supposed to
do. Take it from the conversation. If there is none, fall back in order to
commit messages, the branch name, a spec file under `docs/`, `specs/`, or
`.scratch/`, then ask the user. If none exists, the Spec reviewer reports
"no spec available".

### 3. Discover standards

List the files that document how code is written: `AGENTS.md`,
`CONTRIBUTING.md`, `CODING_STANDARDS.md`, relevant `README.md` and dev docs.
For each changed file, keep only the rules whose scope covers that file. If the
repo documents nothing, the Standards axis is the smell baseline alone.

### 4. Dispatch four reviewers in parallel

Run each reviewer as its own sub-agent. Pin it to the model this session is
already running, so a bare `pi -p` never silently falls back to a pricier
default:

```bash
pi -p --no-session \
  --provider "$PI_PROVIDER" \
  --model "$PI_MODEL" \
  --thinking "$PI_REASONING_LEVEL" \
  @<brief-file>
```

Write each reviewer's brief to a temp file and pass it with `@<path>`. Every
brief must carry the diff command, the commit list, and the concern's own
inputs — the sub-agent has nothing else. Tell it to run the diff itself and
write findings to stdout as markdown, under 400 words.

- **Spec** — include the intent sentence. Report (a) requirements missing or
  partial, (b) behaviour not asked for (scope creep), (c) requirements that look
  implemented wrong. Quote the request line for each finding.
- **Standards** — include the rules files from step 3 and the smell baseline
  below, verbatim. Report (a) each violation of a documented rule, citing the
  file and rule; (b) each baseline smell, naming it and quoting the hunk. A
  documented rule overrides the baseline; smells are judgement calls. Skip
  anything tooling enforces.
- **Bugs** — minimal context. Report correctness defects introduced by the
  change: wrong control flow or conditions, bad state transitions, missing or
  wrong error handling, invalid assumptions, resource leaks, broken invariants,
  evident API misuse, security bugs directly introduced. No general
  code-quality commentary.
- **Context** — point at `git log`, `git blame`, and comments in or around the
  changed code. Report only where history or comments materially strengthen the
  case: a reverted fix, an intentional design the change breaks, an invariant an
  earlier change established, a comment stating "must not" / "always" the change
  violates. Tag each finding with its home axis: `→ Bugs` or `→ Standards`.

Done when four briefs ran and four finding lists are in hand.

### 5. Validate and consolidate

For every finding, actively try to disprove it before accepting:

- Is the behaviour reachable, or does surrounding code invalidate it?
- Is it pre-existing, intentional, or an unrealistic hypothetical?
- Does a documented rule actually require something different?
- Does the impact follow, or is the finding stylistic?

Score each 0–100; keep only ≥80.

| Score | Meaning |
|---|---|
| 0 | false positive or pre-existing |
| 25 | plausible, unverifiable |
| 50 | probably real, weakly evidenced |
| 75 | likely real, strong evidence |
| 100 | definitely real |

Dedupe findings that describe the same issue. File Context findings under their
tagged axis. Never merge or re-rank across axes — each axis stands alone.

### 6. Report

```markdown
## Bugs
### [P1] Short description
`path/to/file:LINE` — what is wrong, why it is definitely wrong, behaviour affected.

## Standards
### [P2] Short description
`path/to/file:LINE` — rule violated (file + rule), how the change violates it.

## Spec
### [P1] Short description
`path/to/file:LINE` — requirement vs implementation, quoting the request line.

## Smells
- [smell] `path/to/file:LINE` — name, why it might apply, suggested direction.
```

Severity: **P0** catastrophic · **P1** serious · **P2** meaningful · **P3**
low-impact. Report P0–P2 normally; P3 only when unambiguous and material.
Smells carry no severity and no confidence gate — they are judgement calls.

If nothing survives validation: `No issues found. Checked for bugs, standards,
and spec compliance.` Otherwise end with one line: `Found N high-confidence
issues (Bugs X · Standards Y · Spec Z) and M smells.`

## Smell baseline

A fixed floor that applies even when a repo documents nothing. Each smell is a
labelled heuristic ("possible …"), never a violation, and a documented repo
standard overrides it. Match each against the diff:

- **Mysterious Name** — a function, variable, or type whose name doesn't reveal
  what it does. → rename it.
- **Duplicated Code** — the same logic shape appears in more than one hunk or
  file. → extract the shared shape, call it from both.
- **Feature Envy** — a method reaches into another object's data more than its
  own. → move the method onto the data it envies.
- **Data Clumps** — the same few fields or params keep travelling together. →
  bundle them into one type, pass that.
- **Primitive Obsession** — a primitive stands in for a domain concept that
  deserves its own type. → give the concept its own small type.
- **Repeated Switches** — the same `switch`/`if`-cascade on the same type recurs
  across the change. → replace with polymorphism, or one map both sites share.
- **Shotgun Surgery** — one logical change forces scattered edits across many
  files. → gather what changes together into one module.
- **Divergent Change** — one file is edited for several unrelated reasons. →
  split so each module changes for one reason.
- **Speculative Generality** — abstraction, parameters, or hooks added for needs
  the spec doesn't have. → delete it.
- **Message Chains** — long `a.b().c().d()` navigation the caller shouldn't
  depend on. → hide the walk behind one method on the first object.
- **Middle Man** — a class or function that mostly just delegates onward. →
  cut it, call the real target direct.
- **Refused Bequest** — a subclass or implementer ignores or overrides most of
  what it inherits. → drop the inheritance, use composition.
