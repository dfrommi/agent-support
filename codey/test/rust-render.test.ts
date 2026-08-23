import { execSync } from "node:child_process";
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resetGraphs } from "../lib/session.ts";
import { explore } from "../render.ts";

const FIXTURE = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixture-rust");

before(async () => {
	execSync("cargo check", { cwd: FIXTURE, timeout: 30_000 });
	await explore(FIXTURE, "format_message", "all"); // warm the cached graph
});

after(async () => {
	await resetGraphs();
});

describe("code tool rendering (Rust)", () => {
	it("renders a function with body, usages, and callees", async () => {
		const text = await explore(FIXTURE, "format_message", "all");
		assert.ok(text.includes("format_message"));
		assert.ok(text.includes("```rust"));
		assert.ok(text.includes("Callees"));
		assert.ok(text.includes("build_greeting"));
		assert.ok(text.includes("Callers"));
	});

	it("resolves a member-qualified name", async () => {
		const text = await explore(FIXTURE, "User.greet", "all");
		assert.ok(text.includes("greet"));
		assert.ok(text.includes("User"));
	});

	it("outlines a file's symbols with line ranges", async () => {
		const text = await explore(FIXTURE, "src/lib.rs", "all");
		assert.ok(text.includes("lib.rs"));
		assert.ok(text.includes("19 symbol(s)"));
		assert.ok(/- `format_message` \(function\) :\d+ \(\d+ lines?\)/.test(text));
	});

	it("shows implementations of a trait and overrides of its method", async () => {
		const trait = await explore(FIXTURE, "Auditable", "all");
		assert.ok(trait.includes("Implementations (1)"));
		assert.ok(trait.includes("AuditLogger"));

		const method = await explore(FIXTURE, "Auditable.audit_log", "all");
		assert.ok(method.includes("Overrides (1)"));
		assert.ok(method.includes("AuditLogger.audit_log"));
	});

	it("marks empty member and subtype sections explicitly", async () => {
		const text = await explore(FIXTURE, "Marker", "all");
		assert.ok(text.includes("Members: (none)"));
		assert.ok(text.includes("Subtypes: (none)"));
	});
});
