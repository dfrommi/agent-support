---
name: transcribe
description: Extract transcripts from Apple Podcasts episode URLs and YouTube video URLs. Use this skill when the user wants a transcript, subtitles as markdown, or a transcript saved to a file. For Apple Podcasts, use the transcript cached by the macOS Podcasts app after the user opens the episode and transcript in Podcasts. For YouTube, use published subtitles only and prefer the best subtitle candidate with yt-dlp metadata instead of transcribing audio.
---

# Transcribe

Extract transcripts into markdown.

This skill has two isolated paths:

- Apple Podcasts via the local macOS Podcasts TTML cache
- YouTube via published subtitles selected with `yt-dlp`

Do not transcribe audio files for this skill. If no suitable YouTube subtitles exist, surface that clearly. For Apple Podcasts, if the cached TTML file does not exist yet, ask the user to open the episode in Podcasts and open the transcript once, then rerun.

## Available scripts

- `$SKILL_ROOT/scripts/podcast.py` — Apple Podcasts URL or episode id -> markdown transcript from cached TTML
- `$SKILL_ROOT/scripts/youtube.py` — YouTube URL -> markdown transcript from the best subtitle candidate

## Prerequisites

Check that `yt-dlp` exists before either workflow:

```bash
which yt-dlp
```

If it is missing on macOS:

```bash
brew install yt-dlp
```

## Apple Podcasts workflow

Use this path for Apple Podcasts episode URLs only.

```bash
python3 "$SKILL_ROOT/scripts/podcast.py" "APPLE_PODCASTS_URL"
```

If the user wants a file:

```bash
python3 "$SKILL_ROOT/scripts/podcast.py" "APPLE_PODCASTS_URL" --output "transcript.md"
```

### Cache miss behavior

The script reads from:

`~/Library/Group Containers/243LU875E5.groups.com.apple.podcasts/Library/Cache/Assets/TTML`

If the script says the TTML cache file is missing:

1. Ask the user to open the Apple Podcasts episode on this Mac
2. Ask them to open the transcript in the Podcasts app once
3. Rerun the script

Do not fall back to audio transcription.

## YouTube workflow

Use this path for YouTube video URLs only.

```bash
python3 "$SKILL_ROOT/scripts/youtube.py" "YOUTUBE_URL"
```

If the user wants a file:

```bash
python3 "$SKILL_ROOT/scripts/youtube.py" "YOUTUBE_URL" --output "transcript.md"
```

If the user asks for a specific language, pass one or more `--lang` values:

```bash
python3 "$SKILL_ROOT/scripts/youtube.py" "YOUTUBE_URL" --lang en
python3 "$SKILL_ROOT/scripts/youtube.py" "YOUTUBE_URL" --lang de --lang en
```

### Subtitle selection

The YouTube script chooses a subtitle candidate by scoring:

1. Manual subtitles over automatic captions
2. Requested language over all others
3. The video's declared language when no language was requested
4. Parse-friendly formats such as JSON3, SRV3, or TTML before lower-priority formats

If no subtitles exist, tell the user that the video has no usable published subtitles and that this skill intentionally avoids audio transcription.

## Output format

Markdown is always the output format.

- For stdout: print markdown transcript content
- For `--output`: write markdown with YAML frontmatter first

The frontmatter should include source metadata such as title, source URL, source type, language, extraction method, and any subtitle or cache details that were used.

## Choosing the path

1. If the URL is an Apple Podcasts episode URL, run the podcast script
2. If the URL is a YouTube video URL, run the YouTube script
3. If the input is ambiguous, inspect it before choosing

## Failure handling

- Surface cache misses, missing subtitles, or parser failures directly
- Do not hide partial failures behind success-shaped output
- Prefer a clean explicit error over guessing
