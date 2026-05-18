#!/usr/bin/env bash
set -euo pipefail

usage() {
  echo "Usage: desktop.sh <title> <message>" >&2
}

if [[ $# -ne 2 ]]; then
  usage
  exit 1
fi

title=$1
message=$2

exec terminal-notifier -title "$title" -message "$message"
