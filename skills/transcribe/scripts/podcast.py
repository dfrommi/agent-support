#!/usr/bin/env python3
import argparse
import json
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import parse_qs, urlparse
from xml.etree import ElementTree as ET

DEFAULT_CACHE_DIR = (
    Path.home()
    / "Library/Group Containers/243LU875E5.groups.com.apple.podcasts/Library/Cache/Assets/TTML"
)
XML_LANG = "{http://www.w3.org/XML/1998/namespace}lang"
TTM_AGENT = "{http://www.w3.org/ns/ttml#metadata}agent"
TT_NS = {"tt": "http://www.w3.org/ns/ttml"}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Extract an Apple Podcasts transcript from the local Podcasts TTML cache "
            "and render it as markdown."
        )
    )
    parser.add_argument(
        "source",
        help="Apple Podcasts episode URL or numeric episode id.",
    )
    parser.add_argument(
        "-o",
        "--output",
        help="Write markdown to this file. File output includes YAML frontmatter.",
    )
    parser.add_argument(
        "--cache-dir",
        default=str(DEFAULT_CACHE_DIR),
        help=f"Override the Podcasts TTML cache directory. Default: {DEFAULT_CACHE_DIR}",
    )
    return parser.parse_args()


def extract_episode_id(source: str) -> str:
    if re.fullmatch(r"\d+", source):
        return source

    parsed = urlparse(source)
    query = parse_qs(parsed.query)
    episode_ids = query.get("i")
    if episode_ids and episode_ids[0]:
        return episode_ids[0]

    match = re.search(r"(?:\?|&)i=(\d+)", source)
    if match:
        return match.group(1)

    raise ValueError("Could not extract the Apple Podcasts episode id from the input.")


def fetch_metadata(source: str) -> dict:
    cmd = [
        "yt-dlp",
        "--dump-single-json",
        "--no-download",
        "--no-playlist",
        source,
    ]
    try:
        result = subprocess.run(
            cmd,
            check=True,
            capture_output=True,
            text=True,
        )
    except (FileNotFoundError, subprocess.CalledProcessError):
        return {}

    try:
        return json.loads(result.stdout)
    except json.JSONDecodeError:
        return {}


def find_ttml_file(cache_dir: Path, episode_id: str) -> Path | None:
    matches = sorted(
        cache_dir.rglob(f"*{episode_id}*.ttml*"),
        key=lambda path: path.stat().st_mtime,
        reverse=True,
    )
    return matches[0] if matches else None


def parse_timestamp(value: str) -> float:
    if not value:
        return 0.0

    parts = value.split(":")
    if len(parts) == 3:
        hours, minutes, seconds = parts
        return int(hours) * 3600 + int(minutes) * 60 + float(seconds)
    if len(parts) == 2:
        minutes, seconds = parts
        return int(minutes) * 60 + float(seconds)
    return float(parts[0])


def format_timestamp(seconds: float) -> str:
    whole = int(seconds)
    hours, remainder = divmod(whole, 3600)
    minutes, secs = divmod(remainder, 60)
    if hours:
        return f"{hours:02d}:{minutes:02d}:{secs:02d}"
    return f"{minutes:02d}:{secs:02d}"


def normalize_text(text: str) -> str:
    text = re.sub(r"\s+", " ", text).strip()
    text = re.sub(r"\s+([,.;:!?])", r"\1", text)
    text = re.sub(r"([(\[{])\s+", r"\1", text)
    text = re.sub(r"\s+([)\]}])", r"\1", text)
    return text


def parse_ttml(path: Path) -> tuple[str | None, list[dict]]:
    root = ET.fromstring(path.read_text(encoding="utf-8"))
    transcript_language = root.attrib.get(XML_LANG)
    items: list[dict] = []

    for paragraph in root.findall(".//tt:p", TT_NS):
        tokens = [token.strip() for token in paragraph.itertext() if token.strip()]
        text = normalize_text(" ".join(tokens))
        if not text:
            continue

        items.append(
            {
                "timestamp": format_timestamp(parse_timestamp(paragraph.attrib.get("begin", "0"))),
                "speaker": paragraph.attrib.get(TTM_AGENT),
                "text": text,
            }
        )

    return transcript_language, items


def markdown_lines(items: list[dict]) -> list[str]:
    lines = ["# Transcript", ""]
    for item in items:
        speaker = f"{item['speaker']}: " if item["speaker"] else ""
        lines.append(f"- [{item['timestamp']}] {speaker}{item['text']}")
    return lines


def yaml_quote(value: str) -> str:
    return json.dumps(value, ensure_ascii=False)


def render_frontmatter(metadata: dict, episode_id: str, transcript_language: str | None, ttml_file: Path) -> list[str]:
    title = metadata.get("title") or f"Apple Podcasts episode {episode_id}"
    podcast = metadata.get("series") or metadata.get("uploader") or metadata.get("channel") or ""
    source_url = metadata.get("webpage_url") or metadata.get("original_url") or metadata.get("url") or ""
    audio_url = metadata.get("url") or ""

    return [
        "---",
        f"title: {yaml_quote(title)}",
        f"podcast: {yaml_quote(podcast)}",
        f"source_type: {yaml_quote('apple-podcasts')}",
        f"source_url: {yaml_quote(source_url)}",
        f"episode_id: {yaml_quote(episode_id)}",
        f"transcript_language: {yaml_quote(transcript_language or '')}",
        f"method: {yaml_quote('apple_podcasts_ttml_cache')}",
        f"ttml_cache_file: {yaml_quote(str(ttml_file))}",
        f"audio_url: {yaml_quote(audio_url)}",
        f"generated_at: {yaml_quote(datetime.now(timezone.utc).isoformat())}",
        "---",
        "",
    ]


def main() -> int:
    args = parse_args()
    cache_dir = Path(args.cache_dir).expanduser()
    if not cache_dir.exists():
        print(f"Error: TTML cache directory does not exist: {cache_dir}", file=sys.stderr)
        return 1

    try:
        episode_id = extract_episode_id(args.source)
    except ValueError as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1

    ttml_file = find_ttml_file(cache_dir, episode_id)
    if ttml_file is None:
        print(
            "Error: No cached Apple Podcasts transcript file was found for this episode.\n"
            "Open the episode in the Podcasts app on this Mac, open the transcript once, "
            "then rerun this command.",
            file=sys.stderr,
        )
        return 1

    metadata = fetch_metadata(args.source)
    transcript_language, items = parse_ttml(ttml_file)
    if not items:
        print(f"Error: Parsed TTML file is empty: {ttml_file}", file=sys.stderr)
        return 1

    lines: list[str] = []
    if args.output:
        lines.extend(render_frontmatter(metadata, episode_id, transcript_language, ttml_file))
    lines.extend(markdown_lines(items))
    output = "\n".join(lines) + "\n"

    if args.output:
        output_path = Path(args.output).expanduser()
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(output, encoding="utf-8")
    else:
        sys.stdout.write(output)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
