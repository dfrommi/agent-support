#!/usr/bin/env python3
"""
Compress Pi coding agent session logs into a simplified JSONL form for LLM consumption.

Filters out thinking blocks, tool calls, and tool results — keeping only the
user↔assistant conversational exchange. Each line is a self-contained message
with an explicit role, making it trivial for LLMs to process.

Output format (one JSON object per line):
    {"role":"user"|"assistant","content":"...","session":"<uuid>","ts":"<iso>"}

Usage:
    python compress-sessions.py [--dir SESSION_DIR] [--out OUTPUT]

    Default SESSION_DIR: auto-detected from the current working directory
    Default output: stdout (all sessions combined, one JSONL stream)

    If --out is a directory, writes one .jsonl file per session, named by session UUID.
    If --out is a file, writes a combined JSONL stream.
    If --out is omitted, prints combined JSONL to stdout.
"""

import argparse
import json
import os
import sys
from pathlib import Path


def resolve_session_dir(cwd: str) -> str:
    """Derive session directory from cwd, matching Pi's naming convention."""
    encoded = "--" + cwd.strip("/").replace("/", "-") + "--"
    return os.path.expanduser(f"~/.pi/agent/sessions/{encoded}")


def load_sessions(session_dir: str) -> list[tuple[Path, list[dict]]]:
    """Load all session files sorted chronologically. Returns (path, events)."""
    sp = Path(session_dir)
    if not sp.is_dir():
        return []
    files = sorted(sp.glob("*.jsonl"))
    sessions = []
    for fp in files:
        events = []
        with open(fp) as f:
            for line in f:
                line = line.strip()
                if line:
                    events.append(json.loads(line))
        sessions.append((fp, events))
    return sessions


def get_session_id(events: list[dict]) -> str:
    """Extract the session UUID from session events."""
    for ev in events:
        if ev["type"] == "session":
            return ev["id"]
    return "unknown"


def extract_messages(events: list[dict], session_id: str) -> list[dict]:
    """
    Extract a flat list of compressed messages from session events.

    Each message is: {"role": "user"|"assistant", "content": "...",
                      "session": "<uuid>", "ts": "<iso>"}

    Thinking blocks, tool calls, tool results, and non-message events
    are all dropped. Only user text and assistant text blocks survive.
    """
    messages = []

    for ev in events:
        if ev["type"] != "message":
            continue

        msg = ev["message"]
        role = msg["role"]

        if role == "toolResult":
            continue

        # Collect all text blocks from this message
        text_blocks = [
            b["text"]
            for b in msg.get("content", [])
            if b.get("type") == "text" and b.get("text", "").strip()
        ]

        if not text_blocks:
            continue

        content = "\n\n".join(text_blocks)

        messages.append({
            "role": role,
            "content": content,
            "session": session_id,
            "ts": ev["timestamp"],
        })

    return messages


def render_jsonl(messages: list[dict]) -> str:
    """Render a list of message dicts as JSONL text."""
    return "\n".join(json.dumps(m, ensure_ascii=False) for m in messages)


def main():
    parser = argparse.ArgumentParser(
        description="Compress Pi session logs to LLM-friendly JSONL"
    )
    parser.add_argument(
        "--dir",
        default=None,
        help="Session directory (default: auto-detect from cwd)",
    )
    parser.add_argument(
        "--out",
        default=None,
        help="Output file or directory (default: stdout)",
    )
    args = parser.parse_args()

    session_dir = args.dir or resolve_session_dir(os.getcwd())

    if not os.path.isdir(session_dir):
        print(f"Error: session directory not found: {session_dir}", file=sys.stderr)
        sys.exit(1)

    sessions = load_sessions(session_dir)
    if not sessions:
        print(f"No session files found in: {session_dir}", file=sys.stderr)
        sys.exit(1)

    if args.out:
        out_path = Path(args.out)
        if out_path.is_dir() or args.out.endswith(os.sep):
            # Per-session output: one .jsonl file per session, named by UUID
            out_path.mkdir(parents=True, exist_ok=True)
            total = 0
            for fp, events in sessions:
                session_id = get_session_id(events)
                msgs = extract_messages(events, session_id)
                if not msgs:
                    continue
                filename = f"{session_id}.jsonl"
                filepath = out_path / filename
                with open(filepath, "w") as f:
                    f.write(render_jsonl(msgs))
                    f.write("\n")
                total += len(render_jsonl(msgs))
                print(f"  {filename}  ({len(msgs)} messages)", file=sys.stderr)
            print(f"Written {len(sessions)} files to {out_path}", file=sys.stderr)
        else:
            # Single combined file
            all_msgs = []
            for fp, events in sessions:
                session_id = get_session_id(events)
                all_msgs.extend(extract_messages(events, session_id))
            with open(args.out, "w") as f:
                f.write(render_jsonl(all_msgs))
                f.write("\n")
            print(f"Written {len(all_msgs)} messages to {args.out}", file=sys.stderr)
    else:
        # stdout: combined stream
        all_msgs = []
        for fp, events in sessions:
            session_id = get_session_id(events)
            all_msgs.extend(extract_messages(events, session_id))
        print(render_jsonl(all_msgs))


if __name__ == "__main__":
    main()
