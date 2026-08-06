import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";

/**
 * /diff [args]
 *
 * Launches the revdiff TUI in the terminal. Defaults to reviewing all
 * uncommitted changes (HEAD — staged + unstaged; untracked via the revdiff
 * config's untracked=true). Any args replace the default entirely (e.g.
 * "/diff main" or "/diff --staged"). On quit, any captured comments are
 * placed in the input editor so you can add context before sending.
 */
export default function revdiff(pi: ExtensionAPI) {
	pi.registerCommand("diff", {
		description: "Run a revdiff review (default: all uncommitted changes vs HEAD) and place captured comments in the editor",
		handler: async (args: string, ctx: ExtensionCommandContext) => {
			if (ctx.mode !== "tui") {
				ctx.ui.notify("/diff requires the interactive TUI.", "warning");
				return;
			}

			const launchArgs = args.trim() ? args.trim().split(/\s+/) : ["HEAD"];

			const tempDir = mkdtempSync(path.join(tmpdir(), "revdiff-pi-"));
			const outputFile = path.join(tempDir, "annotations.txt");
			const commandArgs = [...launchArgs, `--output=${outputFile}`];

			let launchError = "";
			const exitCode = await ctx.ui.custom((tui, _theme, _kb, done) => {
				// Hand the terminal over to revdiff, then restore pi.
				tui.stop();
				process.stdout.write("\x1b[2J\x1b[H");
				const result = spawnSync("revdiff", commandArgs, {
					cwd: ctx.cwd,
					stdio: "inherit",
				});
				if (result.error) {
					launchError = result.error.code === "ENOENT" ? "revdiff not found in PATH" : result.error.message;
				}
				tui.start();
				tui.requestRender(true);
				done(result.status ?? 1);
				return { render: () => [], invalidate() {} };
			});

			const rawOutput = existsSync(outputFile) ? readFileSync(outputFile, "utf8").trim() : "";
			try {
				rmSync(tempDir, { recursive: true, force: true });
			} catch {
				// ignore temp cleanup failures
			}

			if (launchError) {
				ctx.ui.notify(`Failed to launch revdiff: ${launchError}`, "error");
				return;
			}
			if (exitCode !== 0) {
				ctx.ui.notify("revdiff review did not complete", "warning");
				return;
			}

			if (!rawOutput) {
				ctx.ui.notify("Review complete — no comments.", "info");
				return;
			}

			ctx.ui.setEditorText(`Review feedback:\n\n${rawOutput}`);
			ctx.ui.notify("Review feedback placed in the editor — add context and press Enter to send.", "info");
		},
	});
}

