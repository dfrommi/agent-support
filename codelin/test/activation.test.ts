import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import { getGraph, resetGraph } from "../backend.ts";
import codelinExtension, { hasProjectMarker } from "../index.ts";

const tmp = mkdtempSync(path.join(os.tmpdir(), "codelin-activation-"));

after(() => {
	resetGraph(); // close the codegraph instance so the file watcher doesn't keep the process alive
	rmSync(tmp, { recursive: true, force: true });
});

function makeDir(name: string): string {
	const dir = path.join(tmp, name);
	mkdirSync(dir);
	return dir;
}

describe("codelin activation", () => {
	describe("hasProjectMarker", () => {
		it("is false without any marker file", () => {
			assert.equal(hasProjectMarker(makeDir("empty")), false);
		});

		it("is true for build.gradle", () => {
			const dir = makeDir("gradle");
			writeFileSync(path.join(dir, "build.gradle"), "");
			assert.equal(hasProjectMarker(dir), true);
		});

		it("is true for build.gradle.kts", () => {
			const dir = makeDir("gradle-kts");
			writeFileSync(path.join(dir, "build.gradle.kts"), "");
			assert.equal(hasProjectMarker(dir), true);
		});

		it("is true for Cargo.toml", () => {
			const dir = makeDir("cargo");
			writeFileSync(path.join(dir, "Cargo.toml"), "");
			assert.equal(hasProjectMarker(dir), true);
		});

		it("ignores marker files nested below the root", () => {
			const dir = makeDir("nested");
			mkdirSync(path.join(dir, "sub"));
			writeFileSync(path.join(dir, "sub", "Cargo.toml"), "");
			assert.equal(hasProjectMarker(dir), false);
		});
	});

	describe("codelinExtension", () => {
		function runSession(cwd: string): { registeredTools: Array<{ name: string }> } {
			const handlers = new Map();
			const registeredTools: Array<{ name: string }> = [];
			const pi = {
				on(event: string, handler: unknown) {
					handlers.set(event, handler);
				},
				registerTool(tool: { name: string }) {
					registeredTools.push(tool);
				},
			};
			codelinExtension(pi as never);
			const sessionStart = handlers.get("session_start") as (event: unknown, ctx: { cwd: string }) => void;
			assert.ok(sessionStart, "session_start handler is registered");
			sessionStart({}, { cwd });
			return { registeredTools };
		}

		it("does not register any tool for an unsupported repo", () => {
			const { registeredTools } = runSession(makeDir("unsupported"));
			assert.equal(registeredTools.length, 0);
		});

		it("registers both code and callgraph for a supported repo", async () => {
			const dir = makeDir("gradle-supported");
			writeFileSync(path.join(dir, "build.gradle"), "");
			const { registeredTools } = runSession(dir);
			const names = registeredTools.map((t) => t.name).sort();
			assert.deepEqual(names, ["callgraph", "code"]);
			// The extension fires warmup() in the background (a file watcher that
			// would otherwise keep the test process alive). Resolve the same
			// backend instance and close it deterministically.
			await getGraph(dir);
			resetGraph();
		});
	});
});
