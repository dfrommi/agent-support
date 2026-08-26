/**
 * jdtls (Eclipse JDT Language Server) startup for headless use.
 *
 * Several pitfalls were discovered the hard way when running jdtls outside an IDE:
 *
 * ## 1. Data directory must be OUTSIDE the project root
 *    Eclipse refuses to import a project whose root overlaps the workspace.
 *    We reuse a persistent cache workspace when its project lease is free, and
 *    use a private temporary workspace when another process owns the lease.
 *
 * ## 2. Java selection must be explicit
 *    jdtls requires Java 21+. We resolve Java from the project cwd, validate
 *    its version, and pass --java-executable so subagent environments do not
 *    depend on JAVA_HOME being set.
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

import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { SymbolKind as LspSymbolKind } from "vscode-languageserver-protocol";
import { LspClient } from "../../lsp/client.ts";
import { findBinary } from "../../lsp/findBinary.ts";
import type { SymbolKind } from "../../lib/model.ts";
import { acquireJdtlsWorkspace } from "./workspace.ts";

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

interface JavaRuntime {
	executable: string;
	home: string;
	major: number;
}

function resolveJavaRuntime(root: string): JavaRuntime {
	const candidates = [
		...(process.env.JAVA_HOME ? [path.join(process.env.JAVA_HOME, "bin", "java")] : []),
		"java",
		...(process.platform === "darwin" ? ["/usr/libexec/java_home"] : []),
	];
	const failures: string[] = [];
	for (const candidate of candidates) {
		try {
			const executable = candidate === "/usr/libexec/java_home"
				? execFileSync(candidate, ["-v", "21"], { cwd: root, encoding: "utf8" }).trim() + "/bin/java"
				: resolveExecutable(candidate, root);
			const versionResult = spawnSync(executable, ["-XshowSettings:properties", "-version"], {
				cwd: root,
				encoding: "utf8",
			});
			if (versionResult.error) throw versionResult.error;
			const version = `${versionResult.stdout}\n${versionResult.stderr}`;
			const match = version.match(/version\s+"(\d+)/);
			const major = match ? Number(match[1]) : 0;
			if (major < 21) {
				failures.push(`${candidate}: Java ${major || "unknown"}`);
				continue;
			}
			const javaHome = version.match(/\bjava\.home\s*=\s*(.+)/)?.[1]?.trim();
			if (!javaHome) throw new Error("java.home was not reported");
			return { executable, home: javaHome, major };
		} catch (error) {
			failures.push(`${candidate}: ${(error as Error).message.split("\n")[0]}`);
		}
	}
	throw new Error(`Could not find Java 21+ for jdtls in ${root}. Tried: ${failures.join("; ")}`);
}

function resolveExecutable(candidate: string, root: string): string {
	if (path.isAbsolute(candidate)) return candidate;
	return execFileSync("which", [candidate], { cwd: root, encoding: "utf8" }).trim();
}

export async function createJavaServer(root: string): Promise<LspClient> {
	const workspace = await acquireJdtlsWorkspace(root);
	let client: LspClient | undefined;
	try {
		const java = resolveJavaRuntime(root);
		const args = [
			"-data", workspace.dataDir,
			"-configuration", path.join(JDTLS_HOME, CONFIG_DIR),
			"--java-executable", java.executable,
			"--jvm-arg=-javaagent:" + LOMBOK,
		];
		client = new LspClient(getJdtlsLauncher(), args, root, { JAVA_HOME: java.home });
		client.onShutdown(workspace.release);

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
	} catch (error) {
		if (client) await client.shutdown();
		else await workspace.release();
		throw error;
	}
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
