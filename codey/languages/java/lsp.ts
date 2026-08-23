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
 *    Cross-file resolution, references, and workspace/symbol all fail.
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
 *    still start but cross-file resolution returns empty.
 */

import crypto from "node:crypto";
import { execSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { SymbolKind as LspSymbolKind } from "vscode-languageserver-protocol";
import { LspClient } from "../../lsp/client.ts";
import { findBinary } from "../../lsp/findBinary.ts";
import type { SymbolKind } from "../../lib/model.ts";

// Resolve the launcher lazily so importing this module (e.g. loading the pi
// extension) never throws just because jdtls is not installed.
let jdtlsLauncher: string | null = null;
function getJdtlsLauncher(): string {
	if (jdtlsLauncher) return jdtlsLauncher;
	jdtlsLauncher = findBinary("jdtls", [
		path.join(os.homedir(), ".local/share/nvim/mason/packages/jdtls/bin/jdtls"),
	]);
	return jdtlsLauncher;
}

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
	const client = new LspClient(getJdtlsLauncher(), args, root, { JAVA_HOME: javaHome });

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

export const languageId = "java";

/** Map an LSP SymbolKind to the canonical SymbolKind, or null for non-symbols. */
export function lspKindToSymbolKind(kind: number): SymbolKind | null {
	switch (kind) {
		case LspSymbolKind.Class: return "class";
		case LspSymbolKind.Interface: return "interface";
		case LspSymbolKind.Enum: return "enum";
		case LspSymbolKind.Method: return "method";
		case LspSymbolKind.Constructor: return "constructor";
		case LspSymbolKind.Field: return "field";
		case LspSymbolKind.EnumMember: return "enum_member";
		case LspSymbolKind.Constant: return "field";
		case LspSymbolKind.Property: return "field";
		case LspSymbolKind.Variable: return "variable";
		case LspSymbolKind.Function: return "function";
		case LspSymbolKind.Struct: return "class";
		// LSP kinds that are not code symbols: File, Module, Namespace, Package, ...
		default: return null;
	}
}
