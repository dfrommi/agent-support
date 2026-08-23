import fs from "node:fs";
import os from "node:os";
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import path from "node:path";
import { RustAdapter } from "../languages/rust/adapter.ts";

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "rust-workspace-"));

function write(file: string, contents: string): void {
	fs.mkdirSync(path.dirname(file), { recursive: true });
	fs.writeFileSync(file, contents);
}

before(() => {
	// A workspace whose member (crate-a) has a path dependency (crate-b) that is
	// not itself a workspace member — the layout the old root-only walk missed.
	write(path.join(TMP, "Cargo.toml"), '[workspace]\nmembers = ["crate-a"]\nresolver = "2"\n');
	write(path.join(TMP, "crate-a", "Cargo.toml"), [
		"[package]",
		'name = "crate-a"',
		'version = "0.1.0"',
		'edition = "2021"',
		"",
		"[dependencies]",
		'crate-b = { path = "../crate-b" }',
		"",
	].join("\n"));
	write(path.join(TMP, "crate-a", "src", "lib.rs"), "pub fn a() {}\n");
	write(path.join(TMP, "crate-b", "Cargo.toml"), [
		"[package]",
		'name = "crate-b"',
		'version = "0.1.0"',
		'edition = "2021"',
		"",
	].join("\n"));
	write(path.join(TMP, "crate-b", "src", "lib.rs"), "pub fn b() {}\n");
});

after(() => {
	fs.rmSync(TMP, { recursive: true, force: true });
});

describe("workspace file discovery (Rust)", () => {
	it("discovers source files across workspace members and path dependencies", async () => {
		const adapter = await RustAdapter.connect(TMP);
		try {
			const files = await adapter.discoverSourceFiles(TMP);
			const has = (suffix: string) => files.some((f) => f.endsWith(suffix));
			assert.ok(has(path.join("crate-a", "src", "lib.rs")), `crate-a/src/lib.rs missing from ${files}`);
			assert.ok(has(path.join("crate-b", "src", "lib.rs")), `crate-b/src/lib.rs missing from ${files}`);
		} finally {
			await adapter.close();
		}
	});
});
