---
name: task-handoff
description: Compact the coding session into a handoff document for another agent to pick up.
disable-model-invocation: true
---

## Goal

Write a handoff document summarising the current coding session and its progress so a fresh agent can continue the work.

### Preconditions

- Know the agreed ordered split from the conversation
- Identify the active slice and which slices are complete, current, and pending.
- If the active slice is unfinished, record it as in progress rather than done.

### Document Schema

Write exactly one Markdown document to the temporary directory of the user's OS - not the current workspace.

Do not duplicate content already captured in other artifacts (specs, plans, ADRs, issues, commits, diffs). Reference them by path or URL instead.

The handoff must be concise but complete enough for a new context to continue without the old conversation. Use this structure:

```markdown
# <title>

## Goal

## Confirmed requirements

## Non-goals and constraints

## Ordered split

- [x] 01 ...
- [ ] 02 ... (current)
- [ ] 03 ...

## Progress and implementation state

### Completed

### Current slice

### Pending

## Key technical facts

## Decisions and rejected alternatives

## Changed files

## Validation

## Deviations, blockers, and open questions

## Split Execution contract

## Next action

<read-files>
...
</read-files>

<modified-files>
...
</modified-files>
```

Include only facts relevant to continuation. Preserve exact names, interfaces, commands, test results, and known unrelated failures when they matter. Do not include speculative plans or repeat the entire conversation.

After writing, report the path.
