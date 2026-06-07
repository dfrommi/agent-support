#!/usr/bin/env bash
#
# ingest-sessions.sh
#
# Pipeline to transform Pi agent session logs into compact project memory.
#
# Run from any project directory. The project is defined by your CWD.
# Scripts and prompt templates are resolved relative to this script's
# location (agent-support/memory/).
#
# Steps:
#   1. Compress raw sessions into JSONL (compress-sessions.py)
#   2. Deduplicate: skip sessions already processed (by content hash)
#   3. Extract insights from each new session (pi + extract-insights prompt)
#   4. Merge all new insights into memory files (pi + merge-memory prompt)
#   5. Record processed sessions so they're skipped next time
#
# Configuration:
#   PI_MODEL    Model to use for extraction and merge (default: deepseek/deepseek-v4-pro)
#               Examples: "anthropic/claude-sonnet-4.6", "deepseek/deepseek-v4-flash"
#
# Usage:
#   /path/to/agent-support/memory/ingest-sessions.sh            # full pipeline
#   /path/to/agent-support/memory/ingest-sessions.sh --dry-run  # print commands
#
set -euo pipefail

PROJECT_DIR="$PWD"
MEMORY_DIR="$PROJECT_DIR/.agents/memory"
PIPELINE_DIR="$PROJECT_DIR/.memory-pipeline"
CACHE_DIR="$PIPELINE_DIR/cache"
PROCESSED_DIR="$PIPELINE_DIR/processed"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
COMPRESS_SCRIPT="$SCRIPT_DIR/compress-sessions.py"
PROMPTS_DIR="$SCRIPT_DIR"

PI_MODEL="${PI_MODEL:-deepseek/deepseek-v4-pro}"

DRY_RUN=false
if [ "${1:-}" = "--dry-run" ]; then
    DRY_RUN=true
    shift
fi

# ── helpers ────────────────────────────────────────────────────────────

die() { echo "ERROR: $*" >&2; exit 1; }

# Run pi for extraction or merge.
# Prompt templates are passed via @ to include their instructions.
# Session/insight files are also passed via @ for direct content access.
# Always uses --no-session to avoid creating session logs from ingestion runs.
run_pi_extract() {
    local session_file="$1"
    local insight_file="$2"
    local prompt_template="$PROMPTS_DIR/extract-insights.md"
    local args=(
        -p --no-session
        --model "$PI_MODEL"
        @"$prompt_template"
        @"$session_file"
        "Write structured insights as JSONL to $insight_file"
    )
    if $DRY_RUN; then
        echo "  [DRY-RUN] pi ${args[*]}" >&2
        return 0
    fi
    pi "${args[@]}"
}

run_pi_merge() {
    local insights_file="$1"
    local prompt_template="$PROMPTS_DIR/merge-memory.md"
    local args=(
        -p --no-session
        --model "$PI_MODEL"
        @"$prompt_template"
        @"$insights_file"
        "Read current memory files (if any) from $MEMORY_DIR/. Merge in the new insights. Write updated files back to $MEMORY_DIR/."
    )
    if $DRY_RUN; then
        echo "  [DRY-RUN] pi ${args[*]}" >&2
        return 0
    fi
    pi "${args[@]}"
}

# ── step 1: compress ───────────────────────────────────────────────────

echo "=== Step 1: Compressing sessions (project: $PROJECT_DIR) ===" >&2

mkdir -p "$CACHE_DIR/compressed"
python3 "$COMPRESS_SCRIPT" --out "$CACHE_DIR/compressed/"

shopt -s nullglob
compressed_files=("$CACHE_DIR/compressed"/*.jsonl)
shopt -u nullglob

if [ ${#compressed_files[@]} -eq 0 ]; then
    die "No compressed sessions found — is this a Pi project with session history?"
fi
echo "  ${#compressed_files[@]} compressed sessions" >&2

# ── step 2: dedup ──────────────────────────────────────────────────────

echo "=== Step 2: Finding new sessions ===" >&2

new_sessions=()
for f in "${compressed_files[@]}"; do
    session_id="$(basename "$f" .jsonl)"
    hash="$(shasum -a 256 "$f" | awk '{print $1}')"

    if [ -f "$PROCESSED_DIR/$session_id" ]; then
        old_hash="$(cat "$PROCESSED_DIR/$session_id")"
        if [ "$hash" = "$old_hash" ]; then
            echo "  skip $session_id (already processed)" >&2
            continue
        fi
        echo "  update $session_id (content changed)" >&2
    else
        echo "  new   $session_id" >&2
    fi

    new_sessions+=("$f")
done

if [ ${#new_sessions[@]} -eq 0 ]; then
    echo "No new sessions to process. Done." >&2
    exit 0
fi
echo "  ${#new_sessions[@]} sessions to process" >&2

# ── step 3: extract insights ───────────────────────────────────────────

echo "=== Step 3: Extracting insights (model: $PI_MODEL) ===" >&2

mkdir -p "$CACHE_DIR/insights"
all_insights_file="$CACHE_DIR/all-insights.jsonl"
> "$all_insights_file"

extract_ok=0
extract_fail=0
extracted_list="$CACHE_DIR/.extracted_sessions"
> "$extracted_list"

for f in "${new_sessions[@]}"; do
    session_id="$(basename "$f" .jsonl)"
    compressed_abs="$CACHE_DIR/compressed/$session_id.jsonl"
    insight_abs="$CACHE_DIR/insights/$session_id.jsonl"
    hash="$(shasum -a 256 "$f" | awk '{print $1}')"

    echo "  extracting $session_id..." >&2

    if run_pi_extract "$compressed_abs" "$insight_abs"; then
        if [ -f "$insight_abs" ] && [ -s "$insight_abs" ] && head -c1 "$insight_abs" | grep -q '{'; then
            cat "$insight_abs" >> "$all_insights_file"
            echo "$session_id $hash" >> "$extracted_list"
            extract_ok=$((extract_ok + 1))
            echo "    → $(wc -l < "$insight_abs") insights" >&2
        else
            echo "    WARNING: no valid output found at $insight_abs" >&2
            extract_fail=$((extract_fail + 1))
        fi
    else
        echo "    WARNING: pi invocation failed" >&2
        extract_fail=$((extract_fail + 1))
    fi
done

echo "  extracted: $extract_ok ok, $extract_fail failed/skipped" >&2

# ── step 4: merge insights ─────────────────────────────────────────────

echo "=== Step 4: Merging into memory ===" >&2

if [ ! -s "$all_insights_file" ]; then
    echo "  No insights to merge (all extractions failed or were skipped)" >&2
else
    mkdir -p "$MEMORY_DIR"

    echo "  merging $(wc -l < "$all_insights_file") insights..." >&2

    if run_pi_merge "$all_insights_file"; then
        echo "  merge complete" >&2
    else
        echo "  WARNING: merge pi invocation failed" >&2
    fi
fi

# ── step 5: record processed sessions ──────────────────────────────────

echo "=== Step 5: Recording processed sessions ===" >&2

mkdir -p "$PROCESSED_DIR"
recorded=0
if [ -f "$extracted_list" ]; then
    while read -r session_id hash; do
        echo "$hash" > "$PROCESSED_DIR/$session_id"
        recorded=$((recorded + 1))
    done < "$extracted_list"
fi
echo "  recorded $recorded sessions" >&2

echo "" >&2
echo "Done. Memory files in $MEMORY_DIR/" >&2
ls -la "$MEMORY_DIR"/*.md 2>/dev/null || echo "  (no .md files yet — extractions may have failed)" >&2
