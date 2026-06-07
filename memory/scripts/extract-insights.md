
# Extract Insights

Extract structured, actionable insights from a compressed agent session log (JSONL with `role`, `content`, `session`, `ts` fields).

## Categories

Extract insights into exactly five categories. Only extract what is **explicitly stated or clearly demonstrated** in the conversation — do not infer, guess, or generalize beyond the evidence.

### 1. DECISIONS

Choices made during the session, with rationale. Each decision should answer: what was decided, why, and what alternatives were considered.

**Example:**
> "Use AGENTS.md instead of copilot-instructions.md for root instructions, because it follows the Agent Skills standard and is harness-agnostic."

Trigger signals: "let's go with", "we'll use", "I've decided", "let's do X instead of Y", "migration plan:", "summary of changes:"

### 2. PREFERENCES

The user's working style, communication preferences, or tool choices. These are about *how the user likes to work*, not about the project itself.

**Example:**
> "User prefers being asked before the agent makes assumptions. Wants clarification when choices are ambiguous."

Trigger signals: "I prefer", "don't assume", "always ask me before", "I like to", "my workflow is"

### 3. CONVENTIONS

Project-specific patterns, standards, naming rules, directory structures, or technical practices that were established or reinforced.

**Example:**
> "Skills live in skills/ directory, linked into ~/.agents/skills/ or .agents/skills/. Individual skills use the agentskills.io spec with YAML frontmatter."

Trigger signals: "the convention is", "we follow", "the pattern here is", "always use", "standard practice", directory layout discussions

### 4. GLOSSARY

Terms, tools, acronyms, or concepts that were introduced, defined, or clarified. Include the term and a concise definition.

**Example:**
> "Agent Skills standard (agentskills.io): Open specification for portable agent skill definitions using YAML frontmatter and markdown content."

Trigger signals: "X is a", "X means", "X stands for", "defined as", first introduction of a tool or concept name

### 5. LEARNINGS

Gotchas, surprises, mistakes, bugs discovered, or lessons that would be expensive to re-learn.

**Example:**
> "youtube-search skill had a broken reference to ~/.claude/skills/.../format_results.py — the script never existed. When migrating skills, check that referenced scripts actually exist."

Trigger signals: "turns out", "I discovered", "the issue was", "watch out for", "lesson learned", "note to self", "this broke because"

## Output Format

Output exactly one JSON object per line (JSONL). Each line:

```json
{"category":"decision","content":"<concise insight, 1-3 sentences>","evidence":"<short supporting quote from the transcript>","session":"<session uuid>","ts":"<timestamp>"}
```

## Rules

- **Be concise.** Each insight should be 1-3 sentences. If you can't capture it in 3 sentences, it's probably multiple insights — split it.
- **Don't force it.** If a session has no new glossary terms, don't invent one. Output only what's genuinely present.
- **Evidence is required.** Every insight must include a brief supporting quote from the transcript so a reviewer can verify it.
- **One insight per line.** Don't combine multiple insights into one JSON object. Each distinct observation gets its own line.
- **Preserve session UUID and timestamp** from the input data — don't make them up.
- **Output ONLY the JSONL.** No preamble, no markdown fences, no explanation. Just the lines of JSON.
