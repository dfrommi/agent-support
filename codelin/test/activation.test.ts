import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import codelinExtension, { hasProjectMarker } from "../index.ts";

const tmp = mkdtempSync(path.join(os.tmpdir(), "codelin-activation-"));

after(() => rmSync(tmp, { recursive: true, force: true }));

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
		it("does not register the code tool for an unsupported repo", () => {
			const handlers = new Map();
			const registeredTools: unknown[] = [];
			const pi = {
				on(event: string, handler: unknown) {
					handlers.set(event, handler);
				},
				registerTool(tool: unknown) {
					registeredTools.push(tool);
				},
			};

			codelinExtension(pi as never);

			const sessionStart = handlers.get("session_start") as (event: unknown, ctx: { cwd: string }) => void;
			assert.ok(sessionStart, "session_start handler is registered");
			sessionStart({}, { cwd: makeDir("unsupported") });
			assert.equal(registeredTools.length, 0);
		});
	});
});
