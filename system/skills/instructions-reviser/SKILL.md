---
name: instructions-reviser
description: >
  Capture session learnings into Copilot instruction files. Use when the user
  wants to save what was learned, update instructions after a coding session,
  capture discoveries, or says "let's remember this for next time". Also
  triggers on "revise instructions" or "what should we add to our instructions".
  NOT for auditing or scoring existing instruction quality — use
  instructions-improver for that.
---
# Capture Session Learnings into Instructions

Review the current session for useful context and update instruction files so future sessions start with better knowledge. Focus on things Copilot got wrong or had to discover the hard way — those are the highest-value additions.

> **Scope:** This skill captures learnings from the current session. To audit and score existing instruction files for quality, use the `instructions-improver` skill instead.

## Step 1: Reflect

What context was missing that would have helped Copilot work more effectively?

- Bash commands that were used or discovered
- Code style patterns followed
- Testing approaches that worked
- Environment/configuration quirks
- Warnings or gotchas encountered
- Architecture or dependency relationships
- Framework-specific patterns

## Step 2: Find Instruction Files

```bash
echo "=== Repository-wide ===" && \
cat .github/copilot-instructions.md 2>/dev/null || echo "  Not found — consider creating" && \
echo "" && \
echo "=== Path-specific ===" && \
find .github/instructions -name "*.instructions.md" -exec echo "  {}" \; 2>/dev/null || echo "  None found" && \
echo "" && \
echo "=== Personal ===" && \
ls -la "$HOME/.copilot/copilot-instructions.md" 2>/dev/null || echo "  Not found" && \
echo "" && \
echo "=== Legacy files ===" && \
ls AGENTS.md CLAUDE.md GEMINI.md 2>/dev/null && echo "  ⚠ Consider migrating to .github/copilot-instructions.md" || echo "  None"
```

## Step 3: Decide Placement

Use the decision tree in [instructions-improver/references/instruction-types.md](../instructions-improver/references/instruction-types.md) to determine the right file for each learning. Quick summary:

- **Every task in this repo?** → `.github/copilot-instructions.md`
- **Specific file types/directories?** → `.github/instructions/<name>.instructions.md`
- **Personal preference?** → `$HOME/.copilot/copilot-instructions.md`

## Step 4: Draft Additions

Brevity matters — instructions are injected into every relevant prompt, so each line competes for context. One line per concept.

Format: `<command or pattern>` - `<brief description>`

Ask yourself: "Would Copilot get this wrong without this instruction?" If no, skip it.

## Step 5: Show Proposed Changes

For each addition:

```
### Update: .github/copilot-instructions.md

**Why:** [one-line reason]

```diff
+ [the addition - keep it brief]
```

```

Or for new path-specific files:

```

### Create: .github/instructions/<name>.instructions.md

**Why:** [one-line reason]

```markdown
---
applyTo: "<glob pattern>"
---

[instructions]
```

```

## Step 6: Apply with Approval

Ask if the user wants to apply the changes. Only edit files they approve.

For new path-specific files, create the directory first:
```bash
mkdir -p .github/instructions
```

