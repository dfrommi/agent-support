---
name: youtube-search
description: Search YouTube videos and return structured results with metadata. Use this skill whenever the user wants to find YouTube videos, search for tutorials, look up talks, find music videos, or anything involving discovering video content on YouTube. Triggers on phrases like "search youtube", "find videos about", "youtube videos on", "look up on youtube", "any good videos about", or even implicit requests like "I need a tutorial on X" where video content would be helpful.
---

# YouTube Video Search

Search YouTube for videos matching a query and present results as a structured markdown table with rich metadata.

## Prerequisites

This skill requires `yt-dlp`. Before running any search, check if it's installed:

```bash
which yt-dlp
```

If not found, install it:

```bash
brew install yt-dlp
```

## How to search

Build and run the following command:

```bash
yt-dlp "ytsearchN:QUERY" --dump-json --no-download --no-playlist 2>/dev/null
```

Where:
- **N** = number of results to fetch (see "Fetching strategy" below)
- **QUERY** = the user's search terms

Each line of output is a JSON object with video metadata.

### Fetching strategy

`yt-dlp` applies filters *after* fetching, so if you request 5 results with a duration filter, you might get fewer than 5 back. To compensate:

- **No filters**: set N = requested count (default 5)
- **One filter** (duration OR date): set N = requested count × 4
- **Multiple filters** (duration AND date): set N = requested count × 6

Then truncate the output to the requested count. The high multipliers are important because yt-dlp fetches first and filters second — with strict combos (e.g., short + recent), most results get discarded.

### Handling zero results

If no results survive filtering, tell the user and suggest loosening the filters. For example: *"No videos found matching all filters. Try widening the date range or removing the duration limit."* Then re-run with the loosest filter removed so the user still gets something useful.

### Available filters

Apply these based on what the user asks for:

| User says | yt-dlp flag | Example |
|-----------|-------------|---------|
| "under 5 minutes", "short" | `--match-filter "duration < 300"` | 300 = 5 min × 60 |
| "at least 20 minutes", "long" | `--match-filter "duration > 1200"` | 1200 = 20 min × 60 |
| "from the last month", "recent" | `--dateafter YYYYMMDD` | Calculate the date relative to today |
| "from 2024", "this year" | `--dateafter YYYYMMDD` | Start of the referenced period |

Duration shortcuts: "short" ≈ under 5 min, "medium" ≈ 5–20 min, "long" ≈ over 20 min.

Multiple `--match-filter` flags can be combined, e.g.:
```bash
--match-filter "duration > 300" --match-filter "duration < 1200"
```

### Sorting

YouTube search returns results by relevance by default. If the user asks to sort by views or date, append the query with keywords that bias YouTube's ranking (e.g., add "most viewed" or use YouTube's built-in sort). Alternatively, sort the JSON output after fetching.

## Processing the output

Format the `yt-dlp` JSON output into a markdown table directly:

```bash
yt-dlp "ytsearchN:QUERY" --dump-json --no-download --no-playlist 2>/dev/null
```

Apply this formatting to the JSON lines:

- **Title truncation** — trim overly long titles to a readable length.
- **Date conversion** — `YYYYMMDD` → `YYYY-MM-DD`.
- **View/like abbreviation** — 1500 → 1.5K, 2300000 → 2.3M.
- **Summary line** — one line above the table: result count, query, and any filters applied (e.g., "Showing 5 results for 'docker tutorial' — short videos from the last month.").

The output table has these columns: #, Title, Duration, Date, Views, Likes, Channel, Link.

If no results survive filtering, tell the user and suggest loosening the filters.

## Defaults

When the user doesn't specify:
- **Max results**: 5
- **Duration filter**: none
- **Date filter**: none
- **Sort**: relevance (YouTube default)

## Interpreting ambiguous requests

- "recent" without a timeframe → last 6 months
- "popular" → sort by view count after fetching
- "beginner tutorial" → include "beginner" in the search query
- "best videos about X" → no special filter, rely on YouTube relevance
- If the user gives a number like "top 10" → set max results to 10

## Important notes

- Each video fetched takes a moment to resolve (yt-dlp hits YouTube per result), so keep the fetch count reasonable — max 30 for the raw fetch (the user-facing limit stays at ~20, but overfetching for filters may go higher)
- Always use `--no-download` — never download actual video files
- Always redirect stderr with `2>/dev/null` to keep output clean
- If yt-dlp returns an error about extractors or rate limiting, wait a moment and retry once. If it persists, tell the user.
