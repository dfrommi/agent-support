---
name: zettelkasten-recall
description: Search and retrieve knowledge from the user's Obsidian Zettelkasten vault "Brain". Use this skill whenever the user asks about what's in their notes, brain, Zettelkasten, or second brain. Trigger on phrases like "what do I know about", "check my notes", "do I have anything on", "find in my brain", "was steht in meinen Notizen", "what did I save about", or any question that might be answered by searching the user's existing notes. Also use when the user references their vault knowledge during a conversation, even implicitly — e.g., "I think I wrote something about this" or "didn't I save a note on that?".
---

# Zettelkasten Recall

Retrieve and synthesize knowledge from the user's Obsidian vault. The vault is called "Brain" and the user may refer to it as their Zettelkasten, Second Brain, Brain, or just "my notes".

**Important**: Always use the `obsidian` CLI to access the vault — never read vault files directly on the filesystem. This ensures proper indexing and works regardless of your working directory.

## Step 1: Search

Use the `obsidian:obsidian-cli` skill to search with 2-3 variations of the user's topic — try the main term, synonyms, and related concepts to cast a wide net:

```bash
obsidian search query="<term>" limit=10
```

If searching for a specific note the user mentioned by name, you can read it directly:

```bash
obsidian read file="<Note Name>"
```

## Step 2: Read Relevant Notes

For the most promising search hits (up to 3), read the full note content:

```bash
obsidian read file="<Note Name>"
```

Skim the results and focus on the notes most relevant to the user's question. Notes in this vault are atomic (one concept each), so you may need to read several to piece together a complete picture.

## Step 3: Follow Connections

If the user is exploring a topic broadly, check backlinks and related notes to discover content the initial search might have missed:

```bash
obsidian backlinks file="<Note Name>"
```

Also look at the wikilinks at the bottom of notes (after the `---` separator) — they point to related content the user has already connected.

## Step 4: Present Findings

Summarize what the vault contains about the topic:
- Quote or paraphrase the relevant information
- Name the specific notes so the user can navigate to them in Obsidian (use `[[Note Name]]` format)
- If the topic spans multiple notes, organize your response by subtopic
- Match the user's language (German or English)

If the vault has **nothing** on the topic, say so clearly. Do not fill gaps with your own knowledge unless the user asks. The point is to surface what *their* notes contain.

If the vault has **partial** information, present what exists and mention what's missing — the user may want to create a new note to fill the gap (which is where the `zettelkasten` creation skill comes in).
