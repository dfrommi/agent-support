#!/usr/bin/env bash
set -euo pipefail

usage() {
  echo "Usage: push.sh <title> <message>" >&2
}

if [[ $# -ne 2 ]]; then
  usage
  exit 1
fi

title=$1
message=$2

dotenv_file="$(pwd)/.env"

if [[ -f "$dotenv_file" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$dotenv_file"
  set +a
fi

[[ -n "${PUSHOVER_TOKEN:-}" ]] || { echo "Error: PUSHOVER_TOKEN is not set." >&2; exit 1; }
[[ -n "${PUSHOVER_USER_KEY:-}" ]] || { echo "Error: PUSHOVER_USER_KEY is not set." >&2; exit 1; }

curl --fail --silent --show-error \
  -X POST "https://api.pushover.net/1/messages.json" \
  --form-string "token=$PUSHOVER_TOKEN" \
  --form-string "user=$PUSHOVER_USER_KEY" \
  --form-string "title=$title" \
  --form-string "message=$message"
