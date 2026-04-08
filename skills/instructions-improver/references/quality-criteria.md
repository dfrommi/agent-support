# Instruction Quality Criteria

## Scoring System

Quality scores use an A-F scale:
- **A (90-100)**: Comprehensive, current, actionable, well-architected
- **B (70-89)**: Good coverage, minor gaps
- **C (50-69)**: Basic info, missing key sections
- **D (30-49)**: Sparse or outdated
- **F (0-29)**: Missing or severely lacking

---

## Rubric: Repository-Wide Instructions (`.github/copilot-instructions.md`)

### 1. Commands/Workflows (20 points)

| Score | Criteria |
|-------|----------|
| 20 | All essential commands (build, test, lint, deploy) with context and options |
| 15 | Most commands present, some missing context |
| 10 | Basic commands only, no workflow |
| 5 | Few commands, many missing |
| 0 | No commands documented |

### 2. Architecture Clarity (20 points)

| Score | Criteria |
|-------|----------|
| 20 | Key directories explained, module relationships clear, entry points identified |
| 15 | Good structure overview, minor gaps |
| 10 | Basic directory listing only |
| 5 | Vague or incomplete |
| 0 | No architecture info |

### 3. Non-Obvious Patterns (15 points)

| Score | Criteria |
|-------|----------|
| 15 | Gotchas, workarounds, edge cases, "why we do it this way" documented |
| 10 | Some patterns documented |
| 5 | Minimal pattern documentation |
| 0 | No patterns or gotchas |

### 4. Conciseness (15 points)

| Score | Criteria |
|-------|----------|
| 15 | Dense, valuable — no filler, each line adds value, no code-comment redundancy |
| 10 | Mostly concise, some padding |
| 5 | Verbose in places |
| 0 | Mostly filler or restates obvious code |

### 5. Currency (15 points)

| Score | Criteria |
|-------|----------|
| 15 | Reflects current codebase — commands work, file refs accurate, tech stack current |
| 10 | Mostly current, minor staleness |
| 5 | Several outdated references |
| 0 | Severely outdated |

### 6. Actionability (15 points)

| Score | Criteria |
|-------|----------|
| 15 | Instructions are executable — commands copy-pasteable, paths real, steps concrete |
| 10 | Mostly actionable |
| 5 | Some vague instructions |
| 0 | Vague or theoretical |

---

## Rubric: Path-Specific Instructions (`.github/instructions/*.instructions.md`)

### 1. applyTo Correctness (20 points)

| Score | Criteria |
|-------|----------|
| 20 | Glob patterns are accurate, match intended files, no over-matching or under-matching |
| 15 | Patterns mostly correct, minor scope issues |
| 10 | Patterns work but overly broad |
| 5 | Patterns miss many intended files |
| 0 | Missing or broken applyTo |

### 2. Scope Appropriateness (20 points)

| Score | Criteria |
|-------|----------|
| 20 | Content is genuinely path-specific, wouldn't belong in repo-wide instructions |
| 15 | Mostly appropriate, some content could be repo-wide |
| 10 | Mix of path-specific and generic content |
| 5 | Mostly generic content that should be repo-wide |
| 0 | Entirely misplaced content |

### 3. Specificity (20 points)

| Score | Criteria |
|-------|----------|
| 20 | Concrete patterns, conventions, and rules specific to the matched files |
| 15 | Mostly specific, some vague guidance |
| 10 | Mix of specific and generic |
| 5 | Mostly generic advice |
| 0 | No useful specificity |

### 4. Conciseness (20 points)

| Score | Criteria |
|-------|----------|
| 20 | Tight, focused — every line relevant to the matched files |
| 15 | Mostly concise |
| 10 | Some padding |
| 5 | Verbose |
| 0 | Mostly filler |

### 5. No Conflicts (20 points)

| Score | Criteria |
|-------|----------|
| 20 | No contradictions with repo-wide instructions or other path-specific files |
| 15 | Minor overlap but no conflicts |
| 10 | Some redundancy with repo-wide |
| 5 | Potential conflicts |
| 0 | Direct contradictions with other instruction files |

---

## Rubric: Instruction Architecture (Cross-File Assessment)

This assesses whether content is in the RIGHT files, not just whether the content is good.

### 1. Content Placement (25 points)

| Score | Criteria |
|-------|----------|
| 25 | Every instruction is in the most appropriate file type for its scope |
| 20 | Most content well-placed, minor misplacements |
| 15 | Some content in wrong files (e.g., language rules in repo-wide) |
| 10 | Significant misplacement |
| 0 | Instructions scattered without logic |

### 2. Coverage Completeness (25 points)

| Score | Criteria |
|-------|----------|
| 25 | All major areas covered: commands, architecture, standards, language-specific rules |
| 20 | Good coverage, minor gaps |
| 15 | Several important areas missing |
| 10 | Only basic coverage |
| 0 | Minimal or no coverage |

### 3. No Duplication (25 points)

| Score | Criteria |
|-------|----------|
| 25 | Zero redundancy across files |
| 20 | Minor overlap, not conflicting |
| 15 | Some duplicated content |
| 10 | Significant duplication |
| 0 | Same content repeated across files |

### 4. No Conflicts (25 points)

| Score | Criteria |
|-------|----------|
| 25 | All files are mutually consistent |
| 20 | No direct conflicts, minor ambiguity |
| 15 | Some potentially conflicting guidance |
| 10 | Clear conflicts in some areas |
| 0 | Widespread contradictions |

---

## Assessment Process

1. Discover all instruction files (see [instruction-types.md](instruction-types.md))
2. Read each file completely
3. Cross-reference with actual codebase:
   - Verify documented commands work
   - Check if referenced files/paths exist
   - Validate `applyTo` patterns match intended files
   - Verify architecture descriptions
4. Score each file against its type-specific rubric
5. Score the overall instruction architecture
6. Calculate totals and assign grades
7. List specific issues found
8. Propose concrete improvements

## Red Flags

- Commands that would fail (wrong paths, missing deps)
- References to deleted files/folders
- Outdated tech versions
- Copy-paste from templates without customization
- Generic advice not specific to the project
- `applyTo` patterns that match nothing or match too broadly
- Conflicting instructions across files
- Language-specific rules crammed into repo-wide file
- Legacy files (`AGENTS.md`, `CLAUDE.md`, `GEMINI.md`) present without `.github/copilot-instructions.md`
- Duplicate content across instruction files
