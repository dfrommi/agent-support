---
name: zettelkasten
description: Create notes in the Obsidian Zettelkasten vault "Brain". Use this skill whenever the user wants to create a note, add something to their Zettelkasten, Second Brain, Brain, or Notes. Also trigger when the user says "remember this", "save this", "note this down", "capture this", "add to my vault", or wants to save knowledge, snippets, configurations, how-tos, or anything worth remembering. Even if the user doesn't explicitly say "note" — if they're working in this vault and want to persist information, this skill applies.
---

# Zettelkasten Note Creator

Create notes that match the conventions of this Obsidian vault. Every new note lands in the `Inbox/` folder for the user to review and file later.

**Important**: Always use the `obsidian` CLI to interact with the vault — never read, write, or modify vault files directly on the filesystem. The Obsidian CLI ensures proper indexing, sync, and plugin integration. This applies even if you are not running from the vault's directory.

This vault follows the Zettelkasten method: notes should be **atomic** (one concept per note) and **interconnected** (linked to related notes). The goal is a network of knowledge, not a collection of isolated documents.

## Step 1: Understand the Request

Identify the core concept the user wants to capture. Consider whether the request contains multiple distinct ideas — if it does, propose splitting into separate atomic notes and ask the user before proceeding. Each note should stand on its own and make sense in isolation.

Examples of when to split:
- "Save a note about SSH tunneling and also how to set up Wireguard" → two notes
- "Note about configuring Tasmota including LED settings and MQTT setup" → could be one note (closely related) or two — ask the user

## Step 2: Retrieve Existing Tags

Before choosing tags, fetch the current tag list from the vault. Use the `obsidian:obsidian-cli` skill:

```bash
obsidian tags sort=count counts
```

This returns all tags with usage counts. When tagging the new note:
- **Strongly prefer existing tags** over creating new ones. If "network" already exists, don't create "networking". If "config" exists, don't create "configuration".
- Look at hierarchical tags — the vault uses `device/<name>` for device-specific notes (e.g., `device/tasmota`, `device/enigma2`, `device/kindle`). Follow this pattern for new devices.
- Tags are lowercase, use hyphens for multi-word tags (e.g., `smart-home`), and forward slashes for hierarchy.
- Aim for 2-4 tags per note. Every note should have at least one topic tag and optionally a type tag (like `snippet`, `reference`, `fix`, `config`, `hack`).
- If you genuinely need a new tag that no existing tag covers, go ahead — but flag it to the user in your confirmation message so they're aware.

## Step 3: Search for Related Notes

Find existing notes that relate to the new content. Use the `obsidian:obsidian-cli` skill to run 2-3 searches with different key terms:

```bash
obsidian search query="<term>" limit=10
```

Search for the main topic, technology names, or related concepts. The results are candidates for wikilinks. Only link to notes that are genuinely related — a link should be useful for someone reading either note.

Also check for **potential duplicates**: if a note with a very similar title or topic already exists, inform the user and ask whether to update the existing note or create a new one.

## Step 4: Choose a Filename

The filename IS the title — there is no H1 header inside the note. Follow these conventions:

- **Descriptive and specific**: "Execute after Transaction Commit in Spring" not "Spring Transactions"
- **Match the user's language**: the vault has both English and German notes. Write the filename in whatever language the user used.
- **Title case** for English, standard capitalization for German
- **No dates or IDs** in the filename
- **No special characters** except hyphens where natural in the title

## Step 5: Compose the Note

Use the `obsidian:obsidian-markdown` skill to ensure proper Obsidian-flavored markdown. The note structure must match existing vault conventions exactly:

### Frontmatter

Only `tags:` — nothing else. No title, no date, no aliases, no status. YAML array format with each tag on its own line:

```yaml
---
tags:
  - first-tag
  - second-tag
---
```

### Body

- Content starts directly after frontmatter with one blank line. No H1 header.
- Use `##` (H2) as the highest heading level within the note.
- Open with a brief explanation of what this note covers and when it's useful — just a sentence or two, not a formal introduction.
- Use fenced code blocks with language identifiers for any code (` ```bash `, ` ```json `, etc.).
- Keep it concise. A Zettelkasten note captures one idea well, not everything about a topic.
- Use standard markdown tables where they aid readability.
- Use `[[wikilinks]]` for references to other vault notes within the body where they naturally fit.

### Related Notes Section (optional)

If Step 3 found genuinely related notes, add them at the end:

```markdown
---
[[Related Note Name]]
[[Another Related Note]]
```

The `---` horizontal rule separates the content from the related links. Only include links that would actually be useful — don't link just because a search returned results.

## Step 6: Create the Note

Use the `obsidian:obsidian-cli` skill to create the note in the Inbox folder:

```bash
obsidian create path="Inbox/<Filename>.md" content="<full note content>" silent
```

Use `\n` for newlines in the content parameter. The `silent` flag prevents the note from stealing focus in Obsidian.

## Step 7: Confirm

Tell the user:
- The note filename and that it's in the Inbox
- Which tags were used (and flag any newly created tags)
- Which existing notes were linked and why

Keep the confirmation brief — the user can open the note in Obsidian to see the full content.

## Example

For the request "Save a note about using jq to filter JSON arrays":

**Tags retrieved** → existing tags include `shell`, `snippet`, `config`, etc.
**Search results** → found "Parallel Execution in Shell.md" (related: shell topic)
**Filename** → `Filter JSON Arrays with jq.md`

```yaml
---
tags:
  - shell
  - snippet
---
```

```
jq is a command-line JSON processor useful for filtering, transforming, and extracting data from JSON.

## Filter Arrays

Select elements from an array where a field matches a value:

\`\`\`bash
cat data.json | jq '.[] | select(.status == "active")'
\`\`\`

## Extract Fields

Pull specific fields from each object in an array:

\`\`\`bash
cat data.json | jq '[.[] | {name: .name, id: .id}]'
\`\`\`

## Combine Filters

Chain filters with pipes:

\`\`\`bash
cat data.json | jq '[.[] | select(.age > 30) | .name]'
\`\`\`

---
[[Parallel Execution in Shell]]
```
