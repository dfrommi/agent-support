---
name: notify
description: Use this skill when the user wants to notify, alert, or ping someone after work completes, including requests like "notify me", "send a notification", "send a desktop alert", or "send a push notification".
---

# Notify

Send notifications from this repository with deterministic shell scripts instead of ad-hoc commands.

## When to use this skill

Use this skill when the task includes any of these intents:

- Notify the user after work completes
- Send a desktop notification on macOS
- Send a push notification through Pushover
- Alert the user about success, failure, or a status change

## Available scripts

- `$SKILL_ROOT/scripts/desktop.sh` — shows a local macOS notification with `osascript`
- `$SKILL_ROOT/scripts/push.sh` — sends a Pushover notification with `curl`

## Arguments

Both scripts accept the same interface:

```sh
bash "$SKILL_ROOT/scripts/desktop.sh" "Title" "Body"
bash "$SKILL_ROOT/scripts/push.sh" "Title" "Body"
```

Required positional arguments:

- `$1` = title
- `$2` = message

If the argument count is wrong, the script prints a short usage message and exits non-zero.

## Selection

Choose the transport that matches the user's request:

1. Use `$SKILL_ROOT/scripts/desktop.sh` for immediate local alerts on this macOS machine.
2. Use `$SKILL_ROOT/scripts/push.sh` when the user asks for a push, mobile, or remote notification.
3. If the user asks to "notify me" without specifying a transport, prefer the desktop script.

## Environment

`$SKILL_ROOT/scripts/push.sh` reads `PUSHOVER_TOKEN` and `PUSHOVER_USER_KEY`.

If the current working directory contains a `.env` file, the push script sources it before sending so repository-local values can override the current shell environment.

## Workflow

1. Decide whether the request needs the desktop or push script.
2. Run the script with title and message as positional arguments.
3. If the script fails, surface the error instead of hiding it.
