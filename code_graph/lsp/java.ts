/**
 * jdtls (Eclipse JDT Language Server) startup for headless use.
 *
 * Several pitfalls were discovered the hard way when running jdtls outside an IDE:
 *
 * ## 1. Data directory must be OUTSIDE the project root
 *    Eclipse refuses to import a project whose root overlaps the workspace.
 *    We place the workspace in $TMPDIR, keyed by a hash of the project path.
 *    (nvim-jdtls does the same — defaults to ~/.cache/jdtls/jdtls-<sha1>)
 *
 * ## 2. JAVA_HOME override for the jdtls process
 *    jdtls requires Java 21+. But the project itself may pin an older JDK
 *    (e.g. via .tool-versions or Gradle toolchain). Since the spawned process
 *    inherits the project cwd, asdf shims would pick up the project's JDK.
 *    We resolve a 21+ home before spawn (macOS: java_home, Linux: JAVA_HOME/env).
 *
 * ## 3. Maven/Gradle import must be explicitly enabled
 *    Without initializationOptions.settings.java.import, jdtls opens the
 *    folder as a generic project — symbols only resolve within opened files.
 *    Cross-file call hierarchy, references, and workspace/symbol all fail.
 *
 * ## 4. workspaceFolders must be sent in initialize
 *    jdtls uses workspaceFolders (not just rootUri) to discover build files.
 *    Without it, Maven/Gradle import is never triggered.
 *
 * ## 5. Standard project layout required
 *    jdtls expects Maven's src/main/java/… or Gradle's src/main/java/…
 *    structure. Flat projects (sources directly at the root) won't be
 *    recognized as Java projects even with import enabled.
 *
 * ## 6. Project must build successfully
 *    If the project has compile errors or missing dependencies, jdtls may
 *    still start but cross-file resolution returns empty. The startup code
 *    can't detect this — graph-lsp.ts verifies import via a workspace/symbol
 *    probe with an actual class name extracted from a source file.
 *
 * ## 7. Dangling Gradle daemons can block subsequent runs
 *    If a Gradle import hangs (e.g. downloading dependencies), the daemon
 *    stays alive and holds locks. Kill gradle processes before retrying.
 */

import crypto from "node:crypto";
import { execSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { LspClient } from "./client.ts";
import { findBinary } from "./findBinary.ts";

const JDTLS_LAUNCHER = findBinary("jdtls", [
	path.join(os.homedir(), ".local/share/nvim/mason/packages/jdtls/bin/jdtls"),
]);

// JDTLS_HOME must be the real package directory, not a symlink target.
// Derive from the fallback path, not the resolved binary (which may be a symlink).
const JDTLS_HOME = path.join(
	os.homedir(),
	".local/share/nvim/mason/packages/jdtls",
);
const LOMBOK = path.join(JDTLS_HOME, "lombok.jar");
const CONFIG_DIR = process.platform === "darwin" ? "config_mac" : "config_linux";

function dataDir(root: string): string {
	const hash = crypto.createHash("sha1").update(root).digest("hex").slice(0, 12);
	return path.join(os.tmpdir(), `jdtls-${hash}`);
}

function resolveJavaHome(): string {
	// macOS: use java_home to find Java 21+
	if (process.platform === "darwin") {
		try {
			return execSync("/usr/libexec/java_home -v 21", { encoding: "utf8" }).trim();
		} catch {
			try {
				return execSync("/usr/libexec/java_home", { encoding: "utf8" }).trim();
			} catch { /* fall through to JAVA_HOME */ }
		}
	}
	// Linux / other: rely on JAVA_HOME env var
	return process.env.JAVA_HOME ?? "";
}

export async function createJavaServer(root: string): Promise<LspClient> {
	const dataDirPath = dataDir(root);
	const args = [
		"-data", dataDirPath,
		"-configuration", path.join(JDTLS_HOME, CONFIG_DIR),
		"--jvm-arg=-javaagent:" + LOMBOK,
	];

	const javaHome = resolveJavaHome();
	const client = new LspClient(JDTLS_LAUNCHER, args, root, { JAVA_HOME: javaHome });

	// Pitfall #3 + #4: Maven/Gradle import + workspaceFolders
	await client.initialize(`file://${root}`, {
		settings: {
			java: {
				import: { maven: { enabled: true }, gradle: { enabled: true } },
			},
		},
	});
	await client.initialized();
	return client;
}

export const extensions = [".java"];
export const languageId = "java";

export function symbolKind(kind: number): string {
	switch (kind) {
		case 5: return "class";
		case 6: return "method";
		case 9: return "constructor";
		case 11: return "interface";
		case 10: return "enum";
		case 8: return "field";
		case 14: return "constant";
		case 13: return "variable";
		default: return "unknown";
	}
}
