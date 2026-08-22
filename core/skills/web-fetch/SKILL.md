---
name: web-fetch
description: >-
  Use when the agent needs information from the web rather than local files or
  prior knowledge: user-provided URLs, current or externally verifiable facts,
  research, scraping/crawling, official docs, library/framework APIs, OSS code,
  changelogs, issues, releases, or source verification. Not for purely local
  repo work or when the user already supplied all needed data.
---
## Web, Code, and Docs Research

Use the `ketch` CLI for all external research. Backends are fixed: Brave (search),
grepapp (code), Context7 (docs).

### Search
- `ketch search "query"` — title, URL, snippet
- `ketch search "query" --scrape` — also return full markdown for each result
- Filter by host with `site:` (include) / `-site:` (exclude), `OR` for several:
  `ketch search "CVE-2024-3094 site:nvd.nist.gov OR site:cisa.gov -site:github.com"`
  (brave/exa/ddg honor it; parallel does not — drop parallel from `--multi` when filtering)
- `--minimal` — one tab-separated line per result; `--trim` drops markdown formatting
- `--multi=brave,exa,parallel` — federate several backends (rank-fused, deduped); `--random` tries one then falls back

### Scrape
- `ketch scrape <url>` — clean markdown of a page (handles thin and large pages)
- `ketch scrape <url1> <url2> ...` — batch; also accepts a JSON array, file, or stdin list
- `ketch scrape <url> --select "css selector"` — extract one element; `--raw` — raw HTML
- `--force-browser` — always render via headless Chrome, skipping JS-shell auto-detection

### Code
- `ketch code "query" --lang go` — repo, file, line number, snippet (commit-pinned URL)
- `--backend github` adds star counts; `--regex` interprets the query as a regex

### Docs
- `ketch docs "react" --resolve` — find a library's Context7 id (returns ids like `/react/react`)
- `ketch docs "useActionState" --library /react/react` — query that id for code snippets
- `--tokens N` caps the snippet budget

### Crawl
- `ketch crawl <url> --sitemap --background`, then poll `ketch crawl status` (stop with `ketch crawl stop`)
- `--allow "substr"` / `--deny "regex"` filter discovered URLs; `--depth N` bounds BFS depth

All commands support `--json`; prefer it for agent consumption. `ketch <command> --help` lists remaining flags.
