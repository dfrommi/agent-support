# Instruction Update Guidelines

## Core Principle

Only add information that will genuinely help Copilot work more effectively. The context window is precious — every line must earn its place.

## What TO Add

### 1. Commands/Workflows Discovered

```markdown
## Build

`npm run build:prod` - Full production build with optimization
`npm run build:dev` - Fast dev build (no minification)
```

Why: Saves future sessions from discovering these again.

### 2. Gotchas and Non-Obvious Patterns

```markdown
## Gotchas

- Tests must run sequentially (`--runInBand`) due to shared DB state
- `yarn.lock` is authoritative; delete `node_modules` if deps mismatch
```

Why: Prevents repeating debugging sessions.

### 3. Package Relationships

```markdown
## Dependencies

The `auth` module depends on `crypto` being initialized first.
Import order matters in `src/bootstrap.ts`.
```

Why: Architecture knowledge that isn't obvious from code.

### 4. Testing Approaches That Worked

```markdown
## Testing

For API endpoints: Use `supertest` with the test helper in `tests/setup.ts`
Mocking: Factory functions in `tests/factories/` (not inline mocks)
```

Why: Establishes patterns that work.

### 5. Configuration Quirks

```markdown
## Config

- `NEXT_PUBLIC_*` vars must be set at build time, not runtime
- Redis connection requires `?family=0` suffix for IPv6
```

Why: Environment-specific knowledge.

## What NOT to Add

### 1. Obvious Code Info

Bad:
```markdown
The `UserService` class handles user operations.
```

The class name already tells us this.

### 2. Generic Best Practices

Bad:
```markdown
Always write tests for new features.
Use meaningful variable names.
```

This is universal advice, not project-specific.

### 3. One-Off Fixes

Bad:
```markdown
We fixed a bug in commit abc123 where the login button didn't work.
```

Won't recur; clutters the file.

### 4. Verbose Explanations

Bad:
```markdown
The authentication system uses JWT tokens. JWT (JSON Web Tokens) are
an open standard (RFC 7519) that defines a compact and self-contained
way for securely transmitting information between parties as a JSON
object. In our implementation, we use the HS256 algorithm which...
```

Good:
```markdown
Auth: JWT with HS256, tokens in `Authorization: Bearer <token>` header.
```

---

## Deciding Which File to Update

For each piece of information, ask:

| Question | Target File |
|----------|-------------|
| Does it apply to ALL tasks in this repo? | `.github/copilot-instructions.md` |
| Does it apply only to specific file types? | `.github/instructions/<name>.instructions.md` |
| Is it a personal preference? | `$HOME/.copilot/copilot-instructions.md` |

See [instruction-types.md](instruction-types.md) for the full decision tree.

**Common placements:**
- Build/test/deploy commands → repo-wide (`copilot-instructions.md`)
- Architecture overview → repo-wide
- TypeScript conventions → path-specific (`typescript.instructions.md` with `applyTo: "**/*.ts,**/*.tsx"`)
- React patterns → path-specific (`react.instructions.md` with `applyTo: "src/components/**/*.tsx"`)
- Test conventions → path-specific (`testing.instructions.md` with `applyTo: "**/*.test.*,**/*.spec.*"`)
- Personal response style → personal (`$HOME/.copilot/copilot-instructions.md`)

---

## Diff Format for Updates

For each suggested change:

### 1. Identify the File and Rationale

```
File: .github/copilot-instructions.md
Section: Commands (new section after ## Architecture)
```

### 2. Show the Change

```diff
 ## Architecture
 ...

+## Commands
+
+| Command | Purpose |
+|---------|---------|
+| `npm run dev` | Dev server with HMR |
+| `npm run build` | Production build |
+| `npm test` | Run test suite |
```

### 3. Explain Why

> **Why this helps:** The build commands weren't documented, causing
> confusion about how to run the project. This saves future sessions
> from needing to inspect `package.json`.

---

## Validation Checklist

Before finalizing an update, verify:

- [ ] Each addition is project-specific
- [ ] No generic advice or obvious info
- [ ] Commands are tested and work
- [ ] File paths are accurate
- [ ] Would Copilot find this helpful for future tasks?
- [ ] Is this the most concise way to express the info?
- [ ] Is this in the RIGHT instruction file? (see decision tree)
- [ ] No duplication with existing content in other instruction files
- [ ] No conflicts with other instruction files
- [ ] `applyTo` patterns are correct (for path-specific files)
