# Instruction File Templates

## Key Principles

- **Concise**: Dense, human-readable content; one line per concept when possible
- **Actionable**: Commands should be copy-paste ready
- **Project-specific**: Document patterns unique to this project, not generic advice
- **Current**: All info should reflect actual codebase state
- **Right file**: Use [instruction-types.md](instruction-types.md) to pick the correct file type

---

## Template: Repository-Wide Instructions (`.github/copilot-instructions.md`)

### Minimal

```markdown
# <Project Name>

<One-line description>

## Commands

| Command | Description |
|---------|-------------|
| `<command>` | <description> |

## Architecture

<root>/
  <dir>/    # <purpose>
  <dir>/    # <purpose>

## Gotchas

- <gotcha>
```

### Comprehensive

```markdown
# <Project Name>

<One-line description>

## Commands

| Command | Description |
|---------|-------------|
| `<install command>` | Install dependencies |
| `<dev command>` | Start development server |
| `<build command>` | Production build |
| `<test command>` | Run tests |
| `<lint command>` | Lint/format code |

## Architecture

<root>/
  <dir>/    # <purpose>
  <dir>/    # <purpose>
  <dir>/    # <purpose>

## Key Files

- `<path>` - <purpose>
- `<path>` - <purpose>

## Code Style

- <convention>
- <convention>
- <preference over alternative>

## Environment

Required:
- `<VAR_NAME>` - <purpose>

Setup:
- <setup step>

## Testing

- `<test command>` - <what it tests>
- <testing convention>

## Gotchas

- <non-obvious thing that causes issues>
- <ordering dependency or prerequisite>
```

### Monorepo Root

```markdown
# <Monorepo Name>

<Description>

## Packages

| Package | Description | Path |
|---------|-------------|------|
| `<name>` | <purpose> | `<path>` |

## Commands

| Command | Description |
|---------|-------------|
| `<command>` | <description> |

## Cross-Package Patterns

- <shared pattern>
- <generation/sync pattern>
```

---

## Template: Path-Specific Instructions (`.github/instructions/<name>.instructions.md`)

### Language-Specific

```markdown
---
applyTo: "**/*.<ext>"
---

- <language convention>
- <preferred pattern over alternative>
- <type/import convention>
- <error handling pattern>
```

### Framework-Specific

```markdown
---
applyTo: "<framework-dir>/**/*.<ext>"
---

- <component pattern>
- <state management approach>
- <naming convention>
- <file organization rule>
```

### Test Files

```markdown
---
applyTo: "**/*.test.*,**/*.spec.*"
---

- <test structure convention>
- <mocking approach>
- <fixture/factory pattern>
- <assertion style>
```

### Directory-Specific

```markdown
---
applyTo: "<dir>/**"
---

- <directory-specific convention>
- <naming pattern for this directory>
- <relationship to other directories>
```

### With Agent Exclusion

```markdown
---
applyTo: "**/*.ts"
excludeAgent: "code-review"
---

These instructions only apply to Copilot CLI and cloud agent, not code review.

- <instruction>
```

---

## Template: Personal Instructions (`$HOME/.copilot/copilot-instructions.md`)

```markdown
- <response language preference>
- <response style preference>
- <personal workflow habit>
```

Keep this extremely minimal. It applies to every project.

---

## applyTo Glob Pattern Reference

| Pattern | Matches |
|---------|---------|
| `*` | All files in current directory |
| `**` or `**/*` | All files recursively |
| `*.py` | Python files in current directory |
| `**/*.py` | Python files recursively |
| `src/*.py` | Python files in `src/` (not nested) |
| `src/**/*.py` | Python files in `src/` (recursive) |
| `**/*.test.ts,**/*.spec.ts` | TypeScript test files |
| `**/subdir/**/*.py` | Python files under any `subdir/` |

Multiple patterns: separate with commas in the `applyTo` value.

---

## Update Principles

When updating any instruction file:

1. **Be specific**: Use actual file paths, real commands from this project
2. **Be current**: Verify info against the actual codebase
3. **Be brief**: One line per concept when possible
4. **Be useful**: Would this help Copilot work more effectively on this project?
5. **Be scoped**: Put the instruction in the file with the narrowest appropriate scope
