# Instruction Architecture Best Practices

## Principles

1. **Right content, right file** — Use the decision tree from [instruction-types.md](instruction-types.md) to place each instruction in the most appropriate file.
2. **No duplication** — A rule should exist in exactly one file. If both repo-wide and path-specific files need awareness, put the rule where it has the narrowest useful scope.
3. **No conflicts** — Copilot's behavior is non-deterministic when instructions conflict. Audit regularly.
4. **Concise always wins** — Instructions are injected into every relevant prompt. Every line costs context.

---

## Pattern: Standard Single-Language Project

```
.github/
  copilot-instructions.md          # Project overview, commands, architecture, standards, gotchas
```

Simple projects need only one file. Path-specific instructions are overkill when there's a single language and straightforward structure.

---

## Pattern: Multi-Language Project

```
.github/
  copilot-instructions.md          # Project overview, commands, architecture, shared standards
  instructions/
    python.instructions.md         # applyTo: "**/*.py" — Python conventions
    typescript.instructions.md     # applyTo: "**/*.ts,**/*.tsx" — TS conventions
    sql.instructions.md            # applyTo: "**/*.sql" — SQL patterns
```

Split language-specific rules into path-specific files. Keep the repo-wide file focused on shared concerns.

---

## Pattern: Monorepo

```
.github/
  copilot-instructions.md          # Monorepo overview, shared commands, cross-package patterns
  instructions/
    frontend.instructions.md       # applyTo: "packages/frontend/**" — React/TS patterns
    api.instructions.md            # applyTo: "packages/api/**" — Express/Node patterns
    shared.instructions.md         # applyTo: "packages/shared/**" — Shared lib conventions
    testing.instructions.md        # applyTo: "**/*.test.*,**/*.spec.*" — Test conventions
```

Each package gets its own path-specific file. The repo-wide file describes the monorepo structure and shared tooling.

---

## Pattern: Path-Specific for Directory Conventions

```
.github/
  copilot-instructions.md
  instructions/
    migrations.instructions.md     # applyTo: "db/migrations/**" — Migration naming, rollback rules
    api-routes.instructions.md     # applyTo: "src/routes/**" — Route handler patterns
    config.instructions.md         # applyTo: "config/**,*.config.*" — Config file conventions
```

Use directory-scoped patterns when different directories follow different conventions.

---

## Anti-Patterns

### ❌ Everything in one giant repo-wide file

**Problem:** Language-specific rules, test conventions, and component patterns all crammed into `copilot-instructions.md`. Context is wasted when working on unrelated files.

**Fix:** Extract language/path-specific content into `.instructions.md` files.

### ❌ Duplicated rules across files

**Problem:** "Use async/await" appears in both repo-wide and TypeScript-specific instructions.

**Fix:** Put it in the narrowest scope where it applies. If it's a TypeScript rule, only put it in the TypeScript file.

### ❌ Conflicting instructions

**Problem:** Repo-wide says "use tabs" but TypeScript-specific says "use 2-space indentation."

**Fix:** Audit for conflicts. The narrower file (path-specific) takes precedence, but behavior is non-deterministic.

### ❌ Overly broad applyTo patterns

**Problem:** `applyTo: "**"` on a path-specific file — it applies to everything, defeating the purpose.

**Fix:** If it applies to everything, put it in the repo-wide file instead.

### ❌ Using legacy files alongside Copilot-native files

**Problem:** `AGENTS.md` and `.github/copilot-instructions.md` both exist with overlapping content.

**Fix:** Consolidate into `.github/copilot-instructions.md` and path-specific files. Remove legacy files.

### ❌ Too many tiny instruction files

**Problem:** 20 instruction files with 2 lines each — creates overhead and fragmentation.

**Fix:** Group related rules. One file per language or major directory is usually sufficient.

---

## Sizing Guidelines

| File type | Recommended size | Why |
|-----------|-----------------|-----|
| Repo-wide (`copilot-instructions.md`) | 50-200 lines | Loaded every time — keep focused |
| Path-specific (`.instructions.md`) | 10-50 lines | Narrow scope should mean focused content |
| Personal (`$HOME/.copilot/copilot-instructions.md`) | 5-20 lines | Applies to ALL projects — keep minimal |

---

## Migration from Legacy Files

### From `CLAUDE.md` / `AGENTS.md`

1. **Audit content** — categorize each section as repo-wide vs. language/path-specific
2. **Create `.github/copilot-instructions.md`** — move repo-wide content (overview, commands, architecture, general standards)
3. **Create path-specific files** — extract language-specific rules, test conventions, directory patterns
4. **Verify** — use `/instructions` in Copilot CLI to confirm all files are detected
5. **Remove legacy files** — delete `CLAUDE.md` / `AGENTS.md` / `GEMINI.md`
6. **Test** — run a few prompts to verify Copilot follows the new instructions

### Checklist

- [ ] All content migrated from legacy file
- [ ] No duplication between new files
- [ ] `applyTo` patterns tested against actual file paths
- [ ] Legacy file deleted
- [ ] `/instructions` shows expected files
