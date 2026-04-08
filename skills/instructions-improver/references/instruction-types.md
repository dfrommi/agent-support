# Copilot CLI Instruction Types

## Overview

Copilot CLI reads custom instructions from several file types. Each has a distinct scope, precedence, and best use case.

## Instruction File Types

### 1. Repository-Wide Instructions

**File:** `.github/copilot-instructions.md`

**Scope:** All requests made in the context of this repository. Loaded automatically by Copilot CLI, VS Code, cloud agent, and code review.

**Best for:**
- Project overview and purpose
- Build, test, lint, deploy commands
- Architecture and directory structure
- Coding standards and conventions
- Framework and library versions
- Environment setup and required variables
- Gotchas and non-obvious patterns

**Characteristics:**
- Always loaded — every prompt sees these instructions
- Broadest tool support (CLI, VS Code, JetBrains, cloud agent, code review)
- Keep concise — this is sent with every interaction
- Should contain info relevant to **most** tasks, not niche/language-specific rules

**Example:**
```markdown
# Project Overview

Task management API built with Express + TypeScript, MongoDB storage.

## Commands

| Command | Description |
|---------|-------------|
| `pnpm install` | Install dependencies |
| `pnpm dev` | Dev server on port 3000 |
| `pnpm test` | Run test suite |
| `pnpm lint` | ESLint + Prettier |

## Architecture

src/
  routes/     # Express route handlers
  models/     # Mongoose models
  services/   # Business logic
  middleware/  # Auth, validation, error handling

## Coding Standards

- Use early returns
- Prefer async/await over .then() chains
- All API responses use `{ data, error, meta }` envelope

## Gotchas

- Tests must run sequentially (`--runInBand`) due to shared DB state
- `MONGO_URI` must be set before `pnpm dev`
```

---

### 2. Path-Specific Instructions

**File:** `.github/instructions/<NAME>.instructions.md`

**Scope:** Only requests involving files that match the `applyTo` glob pattern in frontmatter. Supported by CLI, VS Code, cloud agent, and code review.

**Best for:**
- Language-specific coding conventions
- Framework-specific patterns (React, Vue, etc.)
- Test file conventions
- Directory-specific rules (API routes, database migrations)
- Component patterns for specific file types

**Characteristics:**
- Loaded only when working on matching files — keeps context focused
- Uses `applyTo` frontmatter with glob patterns
- Avoids bloating repo-wide instructions with niche rules
- Higher precedence than repo-wide when both apply
- Can use `excludeAgent` to limit to specific Copilot features

**Frontmatter format:**
```yaml
---
applyTo: "**/*.ts,**/*.tsx"
---
```

**Glob patterns:**
- `**/*.py` — all Python files recursively
- `src/components/**/*.tsx` — React components in src
- `tests/**/*` — all test files
- `**/*.test.ts,**/*.spec.ts` — test files by naming convention
- `db/migrations/**` — database migrations

**Example — TypeScript conventions:**
```markdown
---
applyTo: "**/*.ts,**/*.tsx"
---

- Use `interface` over `type` for object shapes
- Prefer `unknown` over `any`
- Use strict null checks — no non-null assertions (`!`)
- Zod for runtime validation, TypeScript types derived from schemas
```

**Example — React component patterns:**
```markdown
---
applyTo: "src/components/**/*.tsx"
---

- Functional components only, no class components
- Use named exports, not default exports
- Props interface named `<ComponentName>Props`
- Use `cn()` utility for conditional classNames (Tailwind)
- Colocate styles: `Component.tsx` + `Component.module.css`
```

**Example — Test conventions:**
```markdown
---
applyTo: "**/*.test.ts,**/*.spec.ts"
---

- Use `describe` / `it` structure (not `test`)
- Factory functions in `tests/factories/` for test data
- Prefer `toEqual` over `toBe` for objects
- Mock external services, never hit real APIs
- Each test file mirrors source: `src/foo.ts` → `tests/foo.test.ts`
```

---

### 3. Personal/Local Instructions

**File:** `$HOME/.copilot/copilot-instructions.md`

**Scope:** All repositories, local to the user. Not checked into git.

**Best for:**
- Personal response style preferences
- Language preferences (e.g., "Always respond in German")
- Editor/tool preferences
- Personal workflow habits

**Characteristics:**
- User-wide, applies everywhere
- Not shared with team
- Keep very minimal — applies to ALL projects

---

### 4. Environment Variable Directories

**Variable:** `COPILOT_CUSTOM_INSTRUCTIONS_DIRS`

**Scope:** Additional directories Copilot scans for `.github/instructions/**/*.instructions.md` files.

**Best for:**
- Shared team instructions outside the repo
- Organization-wide standards stored in a central location
- Cross-repo instruction reuse

---

## Legacy Files (Migration Candidates)

The following files are read by Copilot CLI but are **not recommended** for new setups:

| File | Status | Migration target |
|------|--------|-----------------|
| `AGENTS.md` | Supported but broader than needed | `.github/copilot-instructions.md` for always-on; path-specific `.instructions.md` for scoped rules |
| `CLAUDE.md` | Claude Code specific, also read by Copilot | `.github/copilot-instructions.md` |
| `GEMINI.md` | Gemini specific, also read by Copilot | `.github/copilot-instructions.md` |

**Why migrate?** `.github/copilot-instructions.md` has the broadest tool support (CLI, VS Code, JetBrains, cloud agent, code review) and is the Copilot-native format. Path-specific `.instructions.md` files give you scoping that `AGENTS.md` cannot.

---

## Precedence Rules

When multiple instruction files apply, Copilot uses this precedence (highest first):

1. **Path-specific** instructions (`.github/instructions/**/*.instructions.md`) — for matching files
2. **Repository-wide** instructions (`.github/copilot-instructions.md`)
3. **Agent instructions** (`AGENTS.md`, etc.) — if present

Conflicting instructions across files are resolved non-deterministically — avoid conflicts.

---

## Decision Tree: Where Should This Instruction Go?

```
Does it apply to EVERY task in this repo?
├─ YES → .github/copilot-instructions.md
│        (project overview, build commands, general standards)
│
└─ NO → Does it apply only to specific file types or directories?
         ├─ YES → .github/instructions/<name>.instructions.md
         │        (language rules, component patterns, test conventions)
         │
         └─ NO → Is it a personal preference?
                  ├─ YES → $HOME/.copilot/copilot-instructions.md
                  │        (response style, language, personal habits)
                  │
                  └─ NO → Consider a skill instead
                           (task-specific workflows, not always-on)
```
