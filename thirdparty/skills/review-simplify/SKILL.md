---
name: review-simplify
description: >-
  Code review focused exclusively on over-engineering and unnecessary complexity.
  Use when the user says "review for simplicity", "review for over-engineering",
  "what can we delete", "is this over-engineered", "simplify review", or any
  request to hunt complexity bloat. Complements correctness-focused review —
  this one only hunts what to cut.
---

# Review for Simplicity

Review for unnecessary complexity. One finding per section: location, what to
cut, what replaces it. Show actual code so the suggestion is self-evident.

The best outcome is getting shorter.

## Format

```
## <finding number> <tag> <file>:L<line>
*From:* <what>
<short code snippet in context>

*To:* <replacement>
<short code snippet in context>
```

Tags:

- `delete:` dead code, unused flexibility, speculative feature. Replacement: nothing.
- `stdlib:` hand-rolled thing the standard library ships. Name the function.
- `native:` dependency or code doing what the platform already does. Name the feature.
- `yagni:` abstraction with one implementation, config nobody sets, layer with one caller.
- `shrink:` same logic, fewer lines. Show the shorter form.

## Examples

❌ "This EmailValidator class might be more complex than necessary, have you
considered whether all these validation rules are needed at this stage?"

✅ `L12-38: stdlib: 27-line validator class. "@" in email, 1 line, real validation is the confirmation mail.`

✅ `L4: native: moment.js imported for one format call. Intl.DateTimeFormat, 0 deps.`

✅ `repo.py:L88: yagni: AbstractRepository with one implementation. Inline it until a second one exists.`

✅ `L52-71: delete: retry wrapper around an idempotent local call. Nothing replaces it.`

✅ `L30-44: shrink: manual loop builds dict. dict(zip(keys, values)), 1 line.`

## Scoring

End with the only metric that matters: `net: -<N> lines possible.`

If there is nothing to cut, say `Lean already. Ship.` and stop.

## Boundaries

Scope: over-engineering and complexity only.
Out of scope: Correctness bugs, security holes, and performance are explicitly out of scope.

A single smoke test or assert-based self-check is the minimum, not bloat — never
flag it for deletion.

You *MUST NOT* apply the fixes, only list them. Don't write any new code beyond
the `*To:*` snippet.

## Validation

Check the effect of each suggestion on the entire codebase, not just the given scope.
Make sure it doesn't break anything. If it does, it's not a valid simplification.
