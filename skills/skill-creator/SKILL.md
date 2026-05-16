---
name: skill-creator
description: Create new agent skills and improve existing ones. Use when users want to create a skill from scratch, update or optimize an existing skill, turn a workflow into a reusable skill, or refine a skill's description for better triggering accuracy.
---

# Skill Creator

A skill for creating new agent skills and iteratively improving them, following the [Agent Skills](https://agentskills.io) open standard.

At a high level, the process of creating a skill goes like this:

- Decide what you want the skill to do and roughly how it should do it
- Write a draft of the skill
- Share it with the user for review
- Improve the skill based on user feedback
- Repeat until you're satisfied

Your job is to figure out where the user is in this process and help them progress. Maybe they say "I want to make a skill for X" — help narrow down what they mean and write a solid draft. Or maybe they already have a draft — go straight to the review/iterate loop.

Be flexible and responsive to what the user actually needs. After the skill is done, you can also help optimize the description for better triggering.

## Communicating with the user

Pay attention to context cues to understand the user's technical level. It's OK to briefly explain terms if you're in doubt — for instance, don't assume the user knows what "YAML frontmatter" means without some signal.

---

## Creating a skill

### Capture Intent

Start by understanding the user's intent. Skills are most effective when grounded in real expertise, not generic LLM knowledge. There are two common starting points:

**Extract from a hands-on task.** The current conversation might already contain a workflow the user wants to capture (e.g., they say "turn this into a skill"). If so, extract answers from the conversation history — the tools used, the sequence of steps, corrections the user made, input/output formats observed. Pay attention to what worked, what the user corrected, and what context they provided that the agent wouldn't have known on its own.

**Synthesize from existing artifacts.** The user may have internal docs, runbooks, API specs, code review comments, or incident reports that encode the real expertise. Skill content synthesized from project-specific material outperforms generic "best practices" because it captures actual schemas, failure modes, and conventions.

Either way, confirm the following with the user before proceeding:

1. What should this skill enable the agent to do?
2. When should this skill trigger? (what user phrases/contexts)
3. What's the expected output format?

### Interview and Research

Proactively ask questions about edge cases, input/output formats, example files, success criteria, and dependencies. Come prepared with context to reduce burden on the user.

If useful, check available tools/MCP servers for research (searching docs, finding similar skills, looking up best practices).

### Write the SKILL.md

Based on the user interview, create the skill directory and SKILL.md. Follow the [Agent Skills specification](https://agentskills.io/specification).

---

## Skill Writing Guide

### Anatomy of a Skill

```
skill-name/
├── SKILL.md (required)
│   ├── YAML frontmatter (name, description required)
│   └── Markdown body with instructions
└── Bundled Resources (optional)
    ├── scripts/    - Executable code for deterministic/repetitive tasks
    ├── references/ - Docs loaded into context as needed
    └── assets/     - Files used in output (templates, icons, fonts)
```

### YAML Frontmatter

The frontmatter is how the agent decides whether to load a skill. Fields defined by the spec:

- **name** (required): 1–64 chars, lowercase letters/digits/hyphens only, no leading/trailing or consecutive hyphens. Must match the parent directory name.
- **description** (required): 1–1024 chars. What the skill does and when the agent should use it. This is the primary triggering mechanism — see "Description Optimization" below.
- **license** (optional): License name or reference to a bundled license file.
- **compatibility** (optional, ≤500 chars): Environment requirements (intended product, system packages, network access, etc.). Only include if the skill has such requirements.
- **metadata** (optional): Arbitrary string-to-string map for client-specific properties.
- **allowed-tools** (optional, experimental): Space-separated list of tools the skill is pre-approved to use. Support varies between agents. Only pre-approve tools like `shell`/`bash` if the skill and any referenced scripts are fully trusted.

**Example frontmatter:**
```yaml
---
name: github-actions-failure-debugging
description: Guide for debugging failing GitHub Actions workflows. Use this when asked to debug failing GitHub Actions workflows.
---
```

**Example with allowed-tools:**
```yaml
---
name: image-convert
description: Converts SVG images to PNG format. Use when asked to convert SVG files.
allowed-tools: shell
---
```

### Where Skills Live

Conventions vary by agent, but a common, agent-agnostic layout is:

**Project skills** — specific to a single repository:
- `.agents/skills/<skill-name>/SKILL.md`

**Personal skills** — shared across all projects:
- `~/.agents/skills/<skill-name>/SKILL.md`

When creating a skill, ask the user whether it should be project-scoped or personal. Default to personal skills for general-purpose workflows, and project skills for repo-specific ones. If the user's agent expects a different directory (some agents look in their own dedicated path), use that location instead.

### Progressive Disclosure

Skills use a three-level loading system:
1. **Metadata** (name + description) — Always in context (~100 tokens)
2. **SKILL.md body** — Loaded when the skill triggers (<500 lines / 5000 tokens recommended)
3. **Bundled resources** — Loaded as needed (scripts can execute without being read into context)

**Key patterns:**
- Keep SKILL.md under 500 lines; if approaching this limit, split into reference files with clear pointers from SKILL.md on when to read them
- For large reference files (>300 lines), include a table of contents

**Domain organization** — when a skill supports multiple domains/frameworks, organize by variant:
```
cloud-deploy/
├── SKILL.md (workflow + selection logic)
└── references/
    ├── aws.md
    ├── gcp.md
    └── azure.md
```
The agent reads only the relevant reference file.

### Including Scripts

When a skill is invoked, the agent discovers files in the skill's directory and makes them available. For comprehensive guidance, see [Using scripts in skills](https://agentskills.io/skill-creation/using-scripts).

#### One-off commands

When an existing package already does what you need, reference it directly in SKILL.md without bundling a script. Use auto-resolving runners and pin versions for reproducibility:

- `uvx ruff@0.8.0 check .` (Python, via uv)
- `npx eslint@9 --fix .` (Node.js, via npm)
- `go run golang.org/x/tools/cmd/goimports@v0.28.0 .` (Go)

State prerequisites in SKILL.md (e.g., "Requires Node.js 18+") rather than assuming the environment has them.

#### Bundled scripts

When you need reusable logic, bundle a script in `scripts/` that declares its own dependencies inline. Treat `scripts/` as the default location for bundled executables. Do not place scripts beside `SKILL.md` unless the user explicitly wants that layout or there is a strong reason to diverge. Several languages support this:

- **Python** (PEP 723): Inline `# /// script` metadata block, run with `uv run scripts/extract.py`
- **Node/Bun**: Version specifiers in imports, run with `npx` or `bun run`
- **Deno**: `npm:` and `jsr:` import specifiers, run with `deno run`

Reference scripts from SKILL.md using relative paths from the skill directory root:
```markdown
## Available scripts
- **`scripts/validate.sh`** — Validates configuration files
- **`scripts/process.py`** — Processes input data

## Workflow
1. Run validation: `bash scripts/validate.sh "$INPUT_FILE"`
2. Process results: `uv run scripts/process.py --input results.json`
```

#### Designing scripts for agentic use

Scripts run by agents need different design considerations than interactive tools:

- **No interactive prompts.** Agents cannot respond to TTY prompts. Accept all input via CLI flags, env vars, or stdin. Print a clear usage message on missing arguments.
- **Include `--help`.** This is the primary way an agent learns a script's interface. Keep it concise — it enters the context window.
- **Helpful error messages.** Say what went wrong, what was expected, and what to try. "Error: --format must be one of: json, csv, table. Received: xml" beats "Error: invalid input."
- **Structured output.** Prefer JSON/CSV over free-form text. Send data to stdout, diagnostics to stderr.
- **Idempotent operations.** Agents may retry. "Create if not exists" is safer than "create and fail on duplicate."
- **Dry-run support.** For destructive operations, a `--dry-run` flag lets the agent preview what will happen.
- **Predictable output size.** Many agent harnesses truncate output beyond ~10-30K chars. Default to summaries and support `--output <file>` for large results.

### Security

Skills must not contain malware, exploit code, or content that could compromise system security. A skill's contents should not surprise the user in their intent if described. Don't create misleading skills or skills designed to facilitate unauthorized access or data exfiltration.

### Spending Context Wisely

Once a skill activates, its full SKILL.md body loads into the agent's context alongside conversation history and other active skills. Every token competes for attention.

- **Add what the agent lacks, omit what it knows.** Focus on project-specific conventions, domain procedures, non-obvious edge cases, and particular tools/APIs to use. Don't explain what a PDF is or how HTTP works — the agent already knows. Ask: "Would the agent get this wrong without this instruction?" If no, cut it.
- **Design coherent units.** A skill should encapsulate a coherent unit of work that composes well with other skills. Too narrow forces multiple skills to load for one task; too broad makes it hard to trigger precisely.
- **Aim for moderate detail.** Concise, stepwise guidance with a working example tends to outperform exhaustive documentation. When covering every edge case, consider whether most are better handled by the agent's own judgment.

### Calibrating Control

Not every part of a skill needs the same level of prescriptiveness. Match specificity to the fragility of the task.

**Give the agent freedom** when multiple approaches are valid and variation is tolerable. Explaining *why* is more effective than rigid directives — an agent that understands purpose makes better context-dependent decisions.

**Be prescriptive** when operations are fragile, consistency matters, or a specific sequence must be followed. Most skills have a mix — calibrate each part independently.

When multiple tools or approaches could work, pick a default and mention alternatives briefly rather than presenting them as equal options.

### Favor Procedures Over Declarations

A skill should teach the agent *how to approach* a class of problems, not *what to produce* for a specific instance:

```markdown
<!-- Specific answer — only useful for this exact task -->
Join the `orders` table to `customers` on `customer_id`, filter where
`region = 'EMEA'`, and sum the `amount` column.

<!-- Reusable method — works for any analytical query -->
1. Read the schema from `references/schema.yaml` to find relevant tables
2. Join tables using the `_id` foreign key convention
3. Apply any filters from the user's request as WHERE clauses
4. Aggregate numeric columns as needed
```

The approach should generalize even when individual details (output templates, constraints like "never output PII") are specific.

### Writing Patterns

Prefer the imperative form in instructions.

**Defining output formats:**
```markdown
## Report structure
Use this template:
# [Title]
## Executive summary
## Key findings
## Recommendations
```

**Examples pattern:**
```markdown
## Commit message format
**Example 1:**
Input: Added user authentication with JWT tokens
Output: feat(auth): implement JWT-based authentication
```

**Gotchas sections** — Often the highest-value content. These are environment-specific facts that defy reasonable assumptions:
```markdown
## Gotchas
- The `users` table uses soft deletes. Queries must include
  `WHERE deleted_at IS NULL` or results will include deactivated accounts.
- The `/health` endpoint returns 200 even if the database is down.
  Use `/ready` to check full service health.
```

**Checklists** — Help the agent track progress in multi-step workflows:
```markdown
## Workflow
- [ ] Step 1: Analyze the input (run `scripts/analyze.py`)
- [ ] Step 2: Validate results (run `scripts/validate.py`)
- [ ] Step 3: Generate output (run `scripts/generate.py`)
```

**Validation loops** — Instruct the agent to validate its own work before moving on:
```markdown
1. Make your edits
2. Run validation: `python scripts/validate.py output/`
3. If validation fails, fix the issues and run validation again
4. Only proceed when validation passes
```

### Writing Style

Explain to the model *why* things are important rather than relying on heavy-handed MUSTs. LLMs have good theory of mind — when given reasoning, they go beyond rote instructions and produce better results. If you find yourself writing ALWAYS or NEVER in all caps, that's a yellow flag. Reframe with reasoning instead.

Make skills general rather than super-narrow to specific examples. Write a draft, then look at it with fresh eyes and improve it.

---

## Improving the skill

After sharing the draft with the user, work together to refine it. Even a single pass of real execution followed by revision noticeably improves quality — run the skill against a real task, then feed the results back into the process.

1. **Generalize, don't overfit.** Skills are meant to work across many different prompts and contexts. Rather than fiddly overfitty changes, try different metaphors or recommend different patterns of working.

2. **Keep it lean.** Remove instructions that aren't pulling their weight. If the agent handles something fine without explicit guidance, cut the instruction.

3. **Explain the why.** Transmit understanding into instructions rather than rigid rules. This produces more humane, powerful, and effective skills.

4. **Bundle repeated work.** If the skill leads the agent to independently write similar helper scripts each time, write it once and put it in `scripts/`.

---

## Description Optimization

The description field is the primary mechanism that determines whether an agent invokes a skill. After creating or improving a skill, offer to help optimize the description. For a deep dive, see [Optimizing skill descriptions](https://agentskills.io/skill-creation/optimizing-descriptions).

### How skill triggering works

Skills appear in the agent's available skills list with their name + description. The agent decides whether to consult a skill based on that description matching the user's prompt. Agents typically only consult skills for tasks they can't easily handle on their own — simple one-step queries may not trigger a skill even if the description matches. Complex, multi-step, or specialized queries reliably trigger skills when the description matches.

Many agent harnesses also let users force a skill explicitly (e.g. by name or via a prefix). Check the host agent's docs if relevant.

### Writing good descriptions

- **Use imperative phrasing.** Frame as an instruction: "Use this skill when…" rather than "This skill does…" — the agent is deciding whether to act.
- **Focus on user intent, not implementation.** Describe what the user is trying to achieve, not the skill's internal mechanics.
- **Be a little "pushy."** Explicitly list contexts where the skill applies, including cases where the user doesn't name the domain directly.
- **Stay within the 1024-character limit** enforced by the [Agent Skills spec](https://agentskills.io/specification).
- **Watch for near-misses.** Consider cases where a naive keyword match would trigger but shouldn't — these help you find the right boundary.

**Before and after:**
```yaml
# Before
description: Process CSV files.

# After
description: >
  Analyze CSV and tabular data files — compute summary statistics,
  add derived columns, generate charts, and clean messy data. Use this
  skill when the user has a CSV, TSV, or Excel file and wants to
  explore, transform, or visualize the data, even if they don't
  explicitly mention "CSV" or "analysis."
```

---

## Further Reading

- [Agent Skills specification](https://agentskills.io/specification) — Format, frontmatter fields, directory layout
- [Best practices for skill creation](https://agentskills.io/skill-creation/best-practices) — Patterns and anti-patterns
- [Optimizing skill descriptions](https://agentskills.io/skill-creation/optimizing-descriptions) — Systematic description testing
- [Using scripts in skills](https://agentskills.io/skill-creation/using-scripts) — One-off commands, self-contained scripts, agentic design
- [Evaluating skill output quality](https://agentskills.io/skill-creation/evaluating-skills) — Structured evals for iterating on skills

---

Good luck!
