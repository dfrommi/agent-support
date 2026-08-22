import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getGraph, resetGraphs } from "../lib/session.ts";
import { RustAdapter } from "../languages/rust/adapter.ts";

const FIXTURE = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixture-rust");
// Use a private copy: the cached-graph test mutates its files, and other Rust
// test files read the shared fixture in parallel.
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "rust-session-"));

before(() => {
	fs.mkdirSync(path.join(TMP, "src"), { recursive: true });
	fs.copyFileSync(path.join(FIXTURE, "Cargo.toml"), path.join(TMP, "Cargo.toml"));
	fs.copyFileSync(path.join(FIXTURE, "src/lib.rs"), path.join(TMP, "src/lib.rs"));
	execSync("cargo check", { cwd: TMP, timeout: 30_000 });
});

after(async () => {
	await resetGraphs();
	fs.rmSync(TMP, { recursive: true, force: true });
});

describe("cached graph (Rust)", () => {
	it("reindexes changed files through the running adapter", async () => {
		const libPath = path.join(TMP, "src/lib.rs");
		const original = fs.readFileSync(libPath, "utf8");
		try {
			const before = await getGraph(TMP, RustAdapter.connect);
			assert.equal(before.symbol("ping").length, 0);

			fs.writeFileSync(libPath, original + "\npub fn ping() {}\n");

			const after = await getGraph(TMP, RustAdapter.connect);
			assert.equal(after.symbol("ping").length, 1);
			assert.equal(after.symbol("ping")[0].kind, "function");
		} finally {
			fs.writeFileSync(libPath, original);
			await resetGraphs();
		}
	});
});
