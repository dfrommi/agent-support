#!/usr/bin/env python3
import argparse
import html
import json
import re
import subprocess
import sys
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from xml.etree import ElementTree as ET

PARSEABLE_FORMAT_SCORES = {
    "json3": 70,
    "srv3": 65,
    "ttml": 55,
    "srv2": 50,
    "srv1": 45,
    "vtt": 40,
    "srt": 35,
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Extract a YouTube transcript from published subtitles only and render it as markdown."
        )
    )
    parser.add_argument("source", help="YouTube URL.")
    parser.add_argument(
        "--lang",
        action="append",
        default=[],
        help="Preferred subtitle language. Repeat to provide multiple preferences.",
    )
    parser.add_argument(
        "-o",
        "--output",
        help="Write markdown to this file. File output includes YAML frontmatter.",
    )
    return parser.parse_args()


def normalize_lang(value: str) -> str:
    return value.lower().replace("_", "-")


def base_lang(value: str) -> str:
    return normalize_lang(value).split("-")[0]


def fetch_metadata(source: str) -> dict:
    cmd = [
        "yt-dlp",
        "--dump-single-json",
        "--no-download",
        "--no-playlist",
        source,
    ]
    result = subprocess.run(
        cmd,
        check=True,
        capture_output=True,
        text=True,
    )
    return json.loads(result.stdout)


def collect_candidates(data: dict) -> list[dict]:
    candidates: list[dict] = []
    for source_kind, key in (("manual", "subtitles"), ("automatic", "automatic_captions")):
        language_map = data.get(key) or {}
        for language, entries in language_map.items():
            if language == "live_chat":
                continue
            for entry in entries:
                ext = (entry.get("ext") or "").lower()
                url = entry.get("url")
                if not url or ext not in PARSEABLE_FORMAT_SCORES:
                    continue
                candidates.append(
                    {
                        "source_kind": source_kind,
                        "language": language,
                        "ext": ext,
                        "url": url,
                        "name": entry.get("name") or "",
                    }
                )
    return candidates


def language_score(candidate_language: str, preferred_languages: list[str], detected_language: str | None) -> int:
    candidate = normalize_lang(candidate_language)
    candidate_base = base_lang(candidate_language)

    best = 0
    for index, preferred in enumerate(preferred_languages):
        normalized = normalize_lang(preferred)
        preferred_base = base_lang(preferred)
        if candidate == normalized:
            best = max(best, 300 - index * 20)
        elif candidate_base == preferred_base or candidate.startswith(f"{preferred_base}-"):
            best = max(best, 260 - index * 20)

    if best:
        return best

    if detected_language:
        detected = normalize_lang(detected_language)
        detected_base = base_lang(detected_language)
        if candidate == detected:
            return 220
        if candidate_base == detected_base or candidate.startswith(f"{detected_base}-"):
            return 180

    return 0


def score_candidate(candidate: dict, preferred_languages: list[str], detected_language: str | None) -> int:
    score = 1000 if candidate["source_kind"] == "manual" else 500
    score += language_score(candidate["language"], preferred_languages, detected_language)
    score += PARSEABLE_FORMAT_SCORES[candidate["ext"]]
    if normalize_lang(candidate["language"]) == "en":
        score += 10
    return score


def choose_candidate(candidates: list[dict], preferred_languages: list[str], detected_language: str | None) -> dict:
    ranked = sorted(
        candidates,
        key=lambda candidate: score_candidate(candidate, preferred_languages, detected_language),
        reverse=True,
    )
    return ranked[0]


def fetch_text(url: str) -> str:
    request = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(request) as response:
        charset = response.headers.get_content_charset() or "utf-8"
        return response.read().decode(charset, errors="replace")


def format_timestamp(seconds: float) -> str:
    whole = int(seconds)
    hours, remainder = divmod(whole, 3600)
    minutes, secs = divmod(remainder, 60)
    if hours:
        return f"{hours:02d}:{minutes:02d}:{secs:02d}"
    return f"{minutes:02d}:{secs:02d}"


def normalize_text(text: str) -> str:
    text = html.unescape(text)
    text = re.sub(r"<[^>]+>", "", text)
    text = re.sub(r"\s+", " ", text).strip()
    text = re.sub(r"\s+([,.;:!?])", r"\1", text)
    return text


def parse_clock(value: str) -> float:
    value = value.strip()
    parts = value.split(":")
    if len(parts) == 3:
        hours, minutes, seconds = parts
        return int(hours) * 3600 + int(minutes) * 60 + float(seconds)
    if len(parts) == 2:
        minutes, seconds = parts
        return int(minutes) * 60 + float(seconds)
    return float(parts[0])


def parse_webvtt(text: str) -> list[dict]:
    cues: list[dict] = []
    current_seconds: float | None = None
    current_lines: list[str] = []

    def flush() -> None:
        nonlocal current_seconds, current_lines
        if current_seconds is not None and current_lines:
            content = normalize_text(" ".join(current_lines))
            if content:
                cues.append({"seconds": current_seconds, "text": content})
        current_seconds = None
        current_lines = []

    for raw_line in text.splitlines():
        line = raw_line.strip("\ufeff")
        stripped = line.strip()
        if not stripped:
            flush()
            continue
        if stripped == "WEBVTT" or stripped.startswith(("NOTE", "STYLE", "REGION")):
            continue
        if "-->" in stripped:
            flush()
            start = stripped.split("-->", 1)[0].strip()
            current_seconds = parse_clock(start)
            continue
        if re.fullmatch(r"\d+", stripped):
            continue
        current_lines.append(stripped)

    flush()
    return cues


def parse_srt(text: str) -> list[dict]:
    return parse_webvtt(text.replace(",", "."))


def parse_json3(text: str) -> list[dict]:
    data = json.loads(text)
    cues: list[dict] = []
    for event in data.get("events", []):
        segments = event.get("segs")
        if not segments:
            continue
        joined = "".join(segment.get("utf8", "") for segment in segments)
        content = normalize_text(joined)
        if not content:
            continue
        cues.append(
            {
                "seconds": float(event.get("tStartMs", 0)) / 1000.0,
                "text": content,
            }
        )
    return cues


def parse_xml_transcript(text: str) -> list[dict]:
    root = ET.fromstring(text)
    cues: list[dict] = []

    for element in root.iter():
        local_name = element.tag.split("}")[-1]
        if local_name not in {"p", "text"}:
            continue

        begin = element.attrib.get("begin")
        if begin is not None:
            start_seconds = parse_clock(begin)
        elif "t" in element.attrib:
            start_seconds = float(element.attrib["t"]) / 1000.0
        elif "start" in element.attrib:
            start_seconds = float(element.attrib["start"])
        else:
            continue

        tokens = [token.strip() for token in element.itertext() if token.strip()]
        content = normalize_text(" ".join(tokens))
        if not content:
            continue

        cues.append(
            {
                "seconds": start_seconds,
                "text": content,
            }
        )

    return cues


def dedupe_consecutive(cues: list[dict]) -> list[dict]:
    deduped: list[dict] = []
    previous_text = None
    for cue in cues:
        if cue["text"] == previous_text:
            continue
        deduped.append(cue)
        previous_text = cue["text"]
    return deduped


def normalized_tokens(text: str) -> list[str]:
    return [re.sub(r"[^\w']+", "", token.lower()) for token in text.split() if token.strip()]


def append_delta(current_text: str, new_text: str) -> str:
    if not current_text:
        return new_text
    if new_text in current_text:
        return current_text

    current_tokens = normalized_tokens(current_text)
    new_tokens = normalized_tokens(new_text)
    max_overlap = min(len(current_tokens), len(new_tokens))

    for overlap in range(max_overlap, 0, -1):
        if current_tokens[-overlap:] == new_tokens[:overlap]:
            remainder = new_text.split()[overlap:]
            if not remainder:
                return current_text
            return f"{current_text} {' '.join(remainder)}"

    return f"{current_text} {new_text}"


def merge_fragmented_cues(cues: list[dict]) -> list[dict]:
    if not cues:
        return []

    merged: list[dict] = []
    current = dict(cues[0])

    for cue in cues[1:]:
        gap = cue["seconds"] - current["seconds"]
        if (
            gap <= 3.2
            and not re.search(r"[.!?]$", current["text"])
            and len(current["text"].split()) < 80
        ):
            current["text"] = normalize_text(append_delta(current["text"], cue["text"]))
            continue

        merged.append(current)
        current = dict(cue)

    merged.append(current)
    return merged


def finalize_cues(cues: list[dict]) -> list[dict]:
    finalized = []
    for cue in merge_fragmented_cues(dedupe_consecutive(cues)):
        finalized.append(
            {
                "timestamp": format_timestamp(cue["seconds"]),
                "text": cue["text"],
            }
        )
    return finalized


def parse_subtitle_payload(ext: str, payload: str) -> list[dict]:
    if ext == "vtt":
        return parse_webvtt(payload)
    if ext == "srt":
        return parse_srt(payload)
    if ext == "json3":
        return parse_json3(payload)
    if ext in {"ttml", "srv1", "srv2", "srv3"}:
        return parse_xml_transcript(payload)
    raise ValueError(f"Unsupported subtitle format: {ext}")


def yaml_quote(value: str) -> str:
    return json.dumps(value, ensure_ascii=False)


def render_frontmatter(data: dict, candidate: dict) -> list[str]:
    return [
        "---",
        f"title: {yaml_quote(data.get('title') or data.get('fulltitle') or 'YouTube transcript')}",
        f"channel: {yaml_quote(data.get('channel') or data.get('uploader') or '')}",
        f"source_type: {yaml_quote('youtube')}",
        f"source_url: {yaml_quote(data.get('webpage_url') or data.get('original_url') or '')}",
        f"video_id: {yaml_quote(data.get('id') or '')}",
        f"transcript_language: {yaml_quote(candidate['language'])}",
        f"subtitle_source: {yaml_quote(candidate['source_kind'])}",
        f"subtitle_format: {yaml_quote(candidate['ext'])}",
        f"method: {yaml_quote('youtube_published_subtitles')}",
        f"generated_at: {yaml_quote(datetime.now(timezone.utc).isoformat())}",
        "---",
        "",
    ]


def render_markdown(cues: list[dict]) -> list[str]:
    lines = ["# Transcript", ""]
    for cue in cues:
        lines.append(f"- [{cue['timestamp']}] {cue['text']}")
    return lines


def main() -> int:
    args = parse_args()
    preferred_languages = args.lang

    try:
        data = fetch_metadata(args.source)
    except FileNotFoundError:
        print("Error: yt-dlp is not installed.", file=sys.stderr)
        return 1
    except subprocess.CalledProcessError as exc:
        stderr = exc.stderr.strip() if exc.stderr else "yt-dlp failed to inspect the video."
        print(f"Error: {stderr}", file=sys.stderr)
        return 1
    except json.JSONDecodeError:
        print("Error: Could not parse yt-dlp metadata output.", file=sys.stderr)
        return 1

    candidates = collect_candidates(data)
    if not candidates:
        print(
            "Error: No usable published subtitles were found for this YouTube video. "
            "This skill does not transcribe audio.",
            file=sys.stderr,
        )
        return 1

    detected_language = data.get("language")
    candidate = choose_candidate(candidates, preferred_languages, detected_language)
    payload = fetch_text(candidate["url"])
    cues = finalize_cues(parse_subtitle_payload(candidate["ext"], payload))
    if not cues:
        print("Error: Subtitle payload was fetched, but no transcript lines were parsed.", file=sys.stderr)
        return 1

    lines: list[str] = []
    if args.output:
        lines.extend(render_frontmatter(data, candidate))
    lines.extend(render_markdown(cues))
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
