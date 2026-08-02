#!/usr/bin/env python3
"""
Analyse Pi coding agent session logs: token usage, cost, tool behaviour.

Reads the JSONL session files Pi writes to ~/.pi/agent/sessions and aggregates
them. Useful for answering questions like "where does my token budget go?",
"which tools fail most often?", "is prompt caching working?" and "did the agent
actually start using the new tool I built?".

Everything is derived from data Pi already records, so no instrumentation is
needed. Read-only; never modifies session files.

Usage:
    analyze-sessions.py [filters] [options]

Filters:
    --project SUBSTR   only sessions whose cwd contains SUBSTR (repeatable)
    --model SUBSTR     only assistant messages from models matching SUBSTR
    --since DATE       only sessions started on/after DATE (YYYY-MM-DD)
    --until DATE       only sessions started before DATE (YYYY-MM-DD)

Options:
    --dir DIR          session directory (default: ~/.pi/agent/sessions)
    --only SECTIONS    comma-separated: overview,models,cache,tools,files,bash,sessions
    --top N            rows per table (default 12)
    --json             emit raw aggregates as JSON instead of tables

Examples:
    analyze-sessions.py --project myrepo
    analyze-sessions.py --since 2026-07-01 --only tools,files
    analyze-sessions.py --project myrepo --json | jq .tools
"""

import argparse
import collections
import json
import os
import pathlib
import sys

SECTIONS = ["overview", "models", "cache", "tools", "files", "bash", "sessions"]
# Tool arguments that name a file. Extend if you add tools with other conventions.
PATH_KEYS = ("path", "file", "paths", "files", "filePath", "file_path")


def iter_entries(path):
    """Yield parsed JSON objects from a session file, skipping unparseable lines."""
    try:
        with open(path, errors="ignore") as fh:
            for line in fh:
                line = line.strip()
                if not line:
                    continue
                try:
                    yield json.loads(line)
                except json.JSONDecodeError:
                    continue
    except OSError:
        return


def paths_in(arguments):
    """Extract file paths from a tool call's arguments, whatever key they use."""
    out = []
    for key in PATH_KEYS:
        val = arguments.get(key)
        if isinstance(val, str):
            out.append(val)
        elif isinstance(val, list):
            out += [v for v in val if isinstance(v, str)]
    return out


def collect(files, args):
    agg = {
        "sessions": 0,
        "session_files": 0,
        "messages": 0,
        "usage": collections.Counter(),
        "cost": 0.0,
        "by_model": collections.defaultdict(lambda: {"tokens": 0, "cost": 0.0, "messages": 0}),
        "tool_calls": collections.Counter(),
        "tool_errors": collections.Counter(),
        "reads_by_ext": collections.Counter(),
        "ranged_reads": collections.Counter(),
        "full_reads": collections.Counter(),
        "edits_by_ext": collections.Counter(),
        "bash": collections.Counter(),
        "per_session": [],
        "first": None,
        "last": None,
    }

    for path in files:
        entries = list(iter_entries(path))
        if not entries:
            continue
        meta = next((e for e in entries if e.get("type") == "session"), {})
        cwd = meta.get("cwd") or str(pathlib.Path(path).parent.name)
        started = meta.get("timestamp") or ""

        if args.project and not any(p in cwd for p in args.project):
            continue
        if args.since and started and started[:10] < args.since:
            continue
        if args.until and started and started[:10] >= args.until:
            continue

        agg["session_files"] += 1
        s_cost, s_tokens, s_calls = 0.0, 0, 0

        for entry in entries:
            if entry.get("type") != "message":
                continue
            msg = entry.get("message") or {}
            agg["messages"] += 1

            usage = msg.get("usage")
            model = msg.get("model") or "?"
            if usage and (not args.model or args.model in model):
                for key in ("input", "output", "cacheRead", "cacheWrite", "reasoning"):
                    agg["usage"][key] += usage.get(key) or 0
                total = usage.get("totalTokens") or 0
                cost = (usage.get("cost") or {}).get("total") or 0.0
                agg["usage"]["total"] += total
                agg["cost"] += cost
                m = agg["by_model"][model]
                m["tokens"] += total
                m["cost"] += cost
                m["messages"] += 1
                s_cost += cost
                s_tokens += total

            if msg.get("role") == "toolResult":
                name = msg.get("toolName") or "?"
                if msg.get("isError"):
                    agg["tool_errors"][name] += 1

            for block in msg.get("content") or []:
                if not isinstance(block, dict) or block.get("type") != "toolCall":
                    continue
                name = block.get("name") or "?"
                agg["tool_calls"][name] += 1
                s_calls += 1
                arguments = block.get("arguments") or block.get("input") or {}
                if not isinstance(arguments, dict):
                    continue

                if name == "bash":
                    cmd = " ".join(str(arguments.get("command", "")).split())
                    head = cmd.lstrip("(").split()
                    agg["bash"][os.path.basename(head[0]) if head else "(empty)"] += 1

                for p in paths_in(arguments):
                    ext = pathlib.PurePath(p).suffix or "(none)"
                    if name == "read":
                        agg["reads_by_ext"][ext] += 1
                        if arguments.get("offset") or arguments.get("limit"):
                            agg["ranged_reads"][ext] += 1
                        else:
                            agg["full_reads"][ext] += 1
                    elif name in ("edit", "write"):
                        agg["edits_by_ext"][ext] += 1

        agg["sessions"] += 1
        agg["per_session"].append(
            {"cwd": cwd, "started": started, "cost": s_cost, "tokens": s_tokens, "calls": s_calls}
        )
        for key, val in (("first", started), ("last", started)):
            if not val:
                continue
            if agg[key] is None or (val < agg[key] if key == "first" else val > agg[key]):
                agg[key] = val
    return agg


def bar(fraction, width=24):
    filled = int(round(fraction * width))
    return "#" * filled + "." * (width - filled)


def report(agg, args):
    want = args.only.split(",") if args.only else SECTIONS
    top = args.top
    u = agg["usage"]

    if "overview" in want:
        print(f"\n=== overview  ({agg['sessions']} sessions, {agg['messages']} messages)")
        if agg["first"]:
            print(f"  period        {agg['first'][:10]} .. {agg['last'][:10]}")
        print(f"  total tokens  {u['total']:,}")
        print(f"  total cost    ${agg['cost']:,.2f}")
        if agg["sessions"]:
            print(f"  per session   {u['total'] // agg['sessions']:,} tokens  ${agg['cost'] / agg['sessions']:.3f}")

    if "models" in want and agg["by_model"]:
        print(f"\n=== cost by model")
        rows = sorted(agg["by_model"].items(), key=lambda kv: -kv[1]["cost"])[:top]
        for name, m in rows:
            share = m["cost"] / agg["cost"] if agg["cost"] else 0
            print(f"  {bar(share)} ${m['cost']:8.2f}  {m['tokens']:>11,}tok  {name}")

    if "cache" in want and u["total"]:
        billed = u["input"] + u["cacheWrite"]
        served = u["cacheRead"]
        print(f"\n=== prompt cache")
        print(f"  cacheRead   {served:>12,}   (cheap reuse)")
        print(f"  cacheWrite  {u['cacheWrite']:>12,}   (premium, written once)")
        print(f"  input       {u['input']:>12,}   (uncached)")
        print(f"  output      {u['output']:>12,}")
        if served + billed:
            print(f"  hit rate    {100 * served / (served + billed):>11.1f}%   of prompt tokens served from cache")

    if "tools" in want and agg["tool_calls"]:
        total = sum(agg["tool_calls"].values())
        print(f"\n=== tool calls  ({total:,} total, {sum(agg['tool_errors'].values()):,} errors)")
        print(f"  {'tool':<20} {'calls':>7} {'errors':>7}  {'rate':>6}")
        for name, n in agg["tool_calls"].most_common(top):
            err = agg["tool_errors"][name]
            print(f"  {name:<20} {n:>7,} {err:>7,}  {100 * err / n:>5.1f}%")

    if "files" in want and agg["reads_by_ext"]:
        print(f"\n=== file access by extension")
        print(f"  {'ext':<10} {'reads':>7} {'ranged':>7} {'full':>7}  {'edits':>7}")
        for ext, n in agg["reads_by_ext"].most_common(top):
            ranged = agg["ranged_reads"][ext]
            print(
                f"  {ext:<10} {n:>7,} {ranged:>7,} {agg['full_reads'][ext]:>7,}  "
                f"{agg['edits_by_ext'][ext]:>7,}   ({100 * ranged / n:.0f}% ranged)"
            )

    if "bash" in want and agg["bash"]:
        print(f"\n=== bash commands  ({sum(agg['bash'].values()):,} total)")
        for cmd, n in agg["bash"].most_common(top):
            print(f"  {n:>7,}  {cmd}")

    if "sessions" in want and agg["per_session"]:
        print(f"\n=== most expensive sessions")
        for s in sorted(agg["per_session"], key=lambda s: -s["cost"])[:top]:
            print(
                f"  ${s['cost']:7.3f}  {s['tokens']:>10,}tok  {s['calls']:>4} calls  "
                f"{s['started'][:10]}  {pathlib.PurePath(s['cwd']).name}"
            )
    print()


def main():
    ap = argparse.ArgumentParser(add_help=False)
    ap.add_argument("--dir", default=os.path.expanduser("~/.pi/agent/sessions"))
    ap.add_argument("--project", action="append", default=[])
    ap.add_argument("--model", default="")
    ap.add_argument("--since", default="")
    ap.add_argument("--until", default="")
    ap.add_argument("--only", default="")
    ap.add_argument("--top", type=int, default=12)
    ap.add_argument("--json", action="store_true")
    ap.add_argument("-h", "--help", action="store_true")
    args = ap.parse_args()

    if args.help:
        print(__doc__)
        return 0

    root = pathlib.Path(args.dir)
    if not root.exists():
        print(f"session directory not found: {root}", file=sys.stderr)
        return 1

    files = sorted(root.glob("**/*.jsonl"))
    if not files:
        print(f"no session files under {root}", file=sys.stderr)
        return 1

    agg = collect(files, args)
    if agg["sessions"] == 0:
        print("no sessions matched the given filters", file=sys.stderr)
        return 1

    if args.json:
        agg["by_model"] = dict(agg["by_model"])
        for key, val in list(agg.items()):
            if isinstance(val, collections.Counter):
                agg[key] = dict(val)
        print(json.dumps(agg, indent=2))
    else:
        report(agg, args)
    return 0


if __name__ == "__main__":
    sys.exit(main())
