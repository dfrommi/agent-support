---
name: instructions-improver
description: >
  Audit and improve Copilot custom instruction files. Use when the user
  wants to check, review, audit, improve, or fix their instruction setup —
  including copilot-instructions.md, path-specific .instructions.md files,
  or the overall instruction architecture. Also triggers on "are my
  instructions any good", "instruction maintenance", or "optimize my
  Copilot setup". NOT for capturing session learnings — use
  instructions-reviser for that.
---

# Copilot Instructions Improver

Audit, score, and improve custom instruction files so Copilot has the best possible project context. This skill reads instruction files, scores them against type-specific rubrics, presents a quality report, then proposes targeted updates with user approval.

> **Scope:** This skill audits and scores existing instruction files. To capture learnings from the current session (e.g., commands discovered, gotchas hit), use the `instructions-reviser` skill instead.

## Workflow

### Phase 1: Discovery

Find all Copilot instruction files in the repository:

```bash
echo "=== Repository-wide ===" && \
ls -la .github/copilot-instructions.md 2>/dev/null || echo "  Not found" && \
echo "" && \
echo "=== Path-specific ===" && \
find .github/instructions -name "*.instructions.md" 2>/dev/null | head -30 || echo "  None found" && \
echo "" && \
echo "=== Personal ===" && \
ls -la "$HOME/.copilot/copilot-instructions.md" 2>/dev/null || echo "  Not found" && \
echo "" && \
echo "=== Legacy files (migration candidates) ===" && \
ls -la AGENTS.md CLAUDE.md GEMINI.md 2>/dev/null || echo "  None found"
```

**File Types & Locations:**

| Type | Location | Purpose |
|------|----------|---------|
| Repository-wide | `.github/copilot-instructions.md` | Primary project context — always loaded, broadest tool support |
| Path-specific | `.github/instructions/<name>.instructions.md` | Scoped rules for specific file types/directories (uses `applyTo` frontmatter) |
| Personal | `$HOME/.copilot/copilot-instructions.md` | User-wide defaults across all projects (not shared) |
| Legacy | `AGENTS.md`, `CLAUDE.md`, `GEMINI.md` (root) | Migration candidates — flag for consolidation |

**Path-specific files** use `applyTo` frontmatter to scope instructions:
```yaml
---
applyTo: "**/*.ts,**/*.tsx"
---
```

See [references/instruction-types.md](references/instruction-types.md) for full details on each type, precedence rules, and the decision tree for content placement.

### Phase 2: Quality Assessment

For each instruction file, evaluate against type-specific quality criteria. See [references/quality-criteria.md](references/quality-criteria.md) for detailed rubrics.

**Assessment by file type:**

**Repository-wide** (`.github/copilot-instructions.md`):

| Criterion | Weight | Check |
|-----------|--------|-------|
| Commands/workflows documented | High (20pts) | Are build/test/deploy commands present? |
| Architecture clarity | High (20pts) | Can Copilot understand the codebase structure? |
| Non-obvious patterns | Medium (15pts) | Are gotchas and quirks documented? |
| Conciseness | Medium (15pts) | No verbose explanations or obvious info? |
| Currency | High (15pts) | Does it reflect current codebase state? |
| Actionability | High (15pts) | Are instructions executable, not vague? |

**Path-specific** (`.github/instructions/*.instructions.md`):

| Criterion | Weight | Check |
|-----------|--------|-------|
| applyTo correctness | High (20pts) | Do glob patterns match intended files? |
| Scope appropriateness | High (20pts) | Is content genuinely path-specific? |
| Specificity | High (20pts) | Concrete rules for matched files? |
| Conciseness | Medium (20pts) | Focused, no filler? |
| No conflicts | High (20pts) | No contradictions with other instruction files? |

**Instruction architecture** (cross-file):

| Criterion | Weight | Check |
|-----------|--------|-------|
| Content placement | High (25pts) | Is each instruction in the right file type? |
| Coverage completeness | High (25pts) | All major areas covered? |
| No duplication | High (25pts) | Zero redundancy across files? |
| No conflicts | High (25pts) | All files mutually consistent? |

**Quality Scores:**
- **A (90-100)**: Comprehensive, current, actionable
- **B (70-89)**: Good coverage, minor gaps
- **C (50-69)**: Basic info, missing key sections
- **D (30-49)**: Sparse or outdated
- **F (0-29)**: Missing or severely outdated

### Phase 3: Quality Report Output

Present the quality report before proposing any changes — the user needs to see the assessment to make informed decisions about what to update.

Format:

```
## Instruction Quality Report

### Summary
- Instruction files found: X
- Legacy files found: X (migration recommended)
- Average score: X/100
- Files needing update: X

### File-by-File Assessment

#### 1. .github/copilot-instructions.md (Repository-wide)
**Score: XX/100 (Grade: X)**

| Criterion | Score | Notes |
|-----------|-------|-------|
| Commands/workflows | X/20 | ... |
| Architecture clarity | X/20 | ... |
| Non-obvious patterns | X/15 | ... |
| Conciseness | X/15 | ... |
| Currency | X/15 | ... |
| Actionability | X/15 | ... |

**Issues:**
- [List specific problems]

**Recommended additions:**
- [List what should be added]

#### 2. .github/instructions/typescript.instructions.md (Path-specific)
**Score: XX/100 (Grade: X)**

| Criterion | Score | Notes |
|-----------|-------|-------|
| applyTo correctness | X/20 | ... |
| Scope appropriateness | X/20 | ... |
| Specificity | X/20 | ... |
| Conciseness | X/20 | ... |
| No conflicts | X/20 | ... |

**Issues:**
- [List specific problems]

#### 3. Instruction Architecture (Cross-file)
**Score: XX/100 (Grade: X)**

| Criterion | Score | Notes |
|-----------|-------|-------|
| Content placement | X/25 | ... |
| Coverage completeness | X/25 | ... |
| No duplication | X/25 | ... |
| No conflicts | X/25 | ... |

**Architecture issues:**
- [e.g., "TypeScript rules in repo-wide file should be in path-specific"]
- [e.g., "No path-specific files for test conventions"]

### Legacy File Migration
[If legacy files found:]
- `AGENTS.md` found — recommend migrating content to `.github/copilot-instructions.md` and path-specific files
```

### Phase 4: Targeted Updates

After outputting the quality report, ask user for confirmation before updating.

Every proposed change should earn its place — instruction files are injected into every prompt, so wasted lines cost context across all future sessions.

1. **Focus on what Copilot would get wrong without.** Commands it wouldn't know, gotchas it would hit, patterns it would violate. Skip anything obvious from the code itself.

2. **Place content in the right file** — use the decision tree:
   - Universal project info → `.github/copilot-instructions.md`
   - Language/path-specific rules → `.github/instructions/<name>.instructions.md`
   - Personal preferences → `$HOME/.copilot/copilot-instructions.md`

3. **Show diffs** for each change — which file, the addition, and a one-line reason why it helps.

**Diff Format:**

```markdown
### Update: .github/copilot-instructions.md

**Why:** Build command was missing, causing confusion about how to run the project.

```diff
+ ## Quick Start
+
+ ```bash
+ npm install
+ npm run dev  # Start development server on port 3000
+ ```
```
```

```markdown
### Create: .github/instructions/testing.instructions.md

**Why:** Test conventions should be scoped to test files only, not loaded for every prompt.

```markdown
---
applyTo: "**/*.test.ts,**/*.spec.ts"
---

- Use `describe` / `it` structure
- Factory functions in `tests/factories/` for test data
- Mock external services, never hit real APIs
```
```

### Phase 5: Apply Updates

After user approval, apply changes. Preserve existing content structure.

For new path-specific files, ensure the `.github/instructions/` directory exists:

```bash
mkdir -p .github/instructions
```

## Templates

See [references/templates.md](references/templates.md) for instruction file templates by project type.

## Best Practices

See [references/best-practices.md](references/best-practices.md) for instruction architecture patterns (monorepo, multi-language, etc.).

## Common Issues to Flag

- **Stale commands** — build/test commands that no longer work
- **Misplaced content** — language rules crammed into repo-wide instead of path-specific
- **Missing path-specific files** — multi-language project with no scoped instructions
- **Legacy files** — `AGENTS.md`/`CLAUDE.md`/`GEMINI.md` without a `.github/copilot-instructions.md`
- **Conflicting instructions** — contradictions across files
- **Outdated architecture** — file structure or tech stack that's changed
- **Undocumented gotchas** — non-obvious patterns that Copilot would get wrong

## Tips to Surface

Mention these when relevant — they help users maintain instructions over time:

- `/instructions` shows and toggles active instruction files in the CLI
- Path-specific files (`.github/instructions/`) keep language-specific rules from bloating every prompt
- `$HOME/.copilot/copilot-instructions.md` is for personal cross-project preferences
