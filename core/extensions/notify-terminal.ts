/**
 * Pi Notify Extension
 *
 * Sends a native macOS notification when Pi agent is done and waiting for
 * input. Clicking the notification brings WezTerm to the front and focuses
 * the pane running Pi. Skipped when Pi's pane is already focused and WezTerm
 * is the frontmost app.
 */

import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const execFileAsync = promisify(execFile);
const WEZTERM_BUNDLE_ID = "com.github.wez.wezterm";

/** Absolute path to the `wezterm` CLI, derived from WezTerm's own env. */
function weztermPath(): string {
	const dir = process.env.WEZTERM_EXECUTABLE_DIR;
	return dir ? `${dir}/wezterm` : "wezterm";
}

function notify(title: string, body: string): void {
	// Note: -sender is intentionally omitted — terminal-notifier 2.0.0 hangs
	// (never exits) when given it.
	const args = [
		"-title", title,
		"-message", body,
		"-group", "pi-settled",
	];

	// Clicking the notification relaunches terminal-notifier in a fresh
	// process without our shell environment, so the click command must carry
	// the absolute wezterm path and unix socket itself.
	const paneId = process.env.WEZTERM_PANE;
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

export default function (pi: ExtensionAPI) {
	// `agent_end` fires after each low-level run; Pi may still retry, compact,
	// or continue with queued follow-ups. Notify only after the full run settles.
	pi.on("agent_settled", async () => {
		const [frontmost, paneFocused] = await Promise.all([isWezTermFrontmost(), isPaneFocused()]);
		// Skip the push only when the user is already looking at Pi's pane.
		if (!frontmost || !paneFocused) {
			notify("Pi", "Ready for input");
		}
	});
}
