/**
 * Pi Notify Extension
 *
 * Sends a native macOS notification when Pi is waiting for input. Clicking
 * the notification brings WezTerm to the front and focuses the pane running
 * Pi. Skipped when Pi's pane is already focused and WezTerm
 * is the frontmost app.
 */

import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const execFileAsync = promisify(execFile);
const WEZTERM_BUNDLE_ID = "com.github.wez.wezterm";
const INTERACTIVE_TOOL_NAMES = new Set(["ask_user_question"]);
let lastSentGroupId: string | undefined;

/** Absolute path to the `wezterm` CLI, derived from WezTerm's own env. */
function weztermPath(): string {
	const dir = process.env.WEZTERM_EXECUTABLE_DIR;
	return dir ? `${dir}/wezterm` : "wezterm";
}

function notificationGroup(): string {
	const paneId = process.env.WEZTERM_PANE;
	return paneId ? `pi-${paneId}` : "pi-default";
}

function removeNotification(): void {
	const group = lastSentGroupId;
	if (!group) return;
	lastSentGroupId = undefined;

	const child = spawn("terminal-notifier", ["-remove", group], { stdio: "ignore" });
	child.on("error", () => {}); // terminal-notifier missing — fail silently
	child.unref();
}

function notify(title: string, body: string): void {
	const paneId = process.env.WEZTERM_PANE;
	const group = notificationGroup();
	const args = [
		"-title", title,
		"-message", body,
		"-group", group,
	];

	// Clicking the notification relaunches terminal-notifier in a fresh
	// process without our shell environment, so the click command must carry
	// the absolute wezterm path and unix socket itself.
	if (paneId) {
		const socket = process.env.WEZTERM_UNIX_SOCKET;
		const click = [
			socket ? `WEZTERM_UNIX_SOCKET='${socket}'` : "",
			`'${weztermPath()}'`,
			"cli",
			"--no-auto-start",
			"activate-pane",
			"--pane-id",
			paneId,
		]
			.filter(Boolean)
			.join(" ");
		args.push("-activate", WEZTERM_BUNDLE_ID, "-execute", click);
	}

	const child = spawn("terminal-notifier", args, { stdio: "ignore" });
	lastSentGroupId = group;
	child.on("error", () => {}); // terminal-notifier missing — fail silently
	child.unref();
}

/** True if WezTerm is the frontmost macOS app. Fails open (false) so a notification is never dropped. */
async function isWezTermFrontmost(): Promise<boolean> {
	try {
		const { stdout } = await execFileAsync(
			"osascript",
			[
				"-e",
				'tell application "System Events" to get name of first application process whose frontmost is true',
			],
			{ encoding: "utf8" },
		);
		return /wezterm/i.test(String(stdout).trim());
	} catch {
		return false;
	}
}

/** True if this pane ($WEZTERM_PANE) is the pane that currently has focus in WezTerm. Fails open (false). */
async function isPaneFocused(): Promise<boolean> {
	const pane = process.env.WEZTERM_PANE;
	if (!pane) return false;
	try {
		const { stdout } = await execFileAsync(
			weztermPath(),
			["cli", "--no-auto-start", "list-clients", "--format", "json"],
			{ encoding: "utf8" },
		);
		const clients = JSON.parse(String(stdout)) as Array<{ focused_pane_id?: number | null }>;
		const focused = clients?.[0]?.focused_pane_id;
		return focused !== undefined && focused !== null && String(focused) === pane;
	} catch {
		return false;
	}
}

async function notifyWhenAway(body: string): Promise<void> {
	const [frontmost, paneFocused] = await Promise.all([isWezTermFrontmost(), isPaneFocused()]);
	// Skip the push only when the user is already looking at Pi's pane.
	if (!frontmost || !paneFocused) {
		notify("Pi", body);
	}
}

export default function (pi: ExtensionAPI) {
	pi.on("input", async (event) => {
		if (event.source === "interactive") {
			removeNotification();
		}
		return { action: "continue" };
	});

	pi.on("tool_execution_start", async (event) => {
		if (INTERACTIVE_TOOL_NAMES.has(event.toolName)) {
			await notifyWhenAway("Waiting for input");
		}
	});

	// `agent_end` fires after each low-level run; Pi may still retry, compact,
	// or continue with queued follow-ups. Notify only after the full run settles.
	pi.on("agent_settled", async () => {
		await notifyWhenAway("Ready for input");
	});
}
