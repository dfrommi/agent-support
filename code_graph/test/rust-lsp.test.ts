import { execSync } from "node:child_process";
import assert from "node:assert/strict";
import { describe, it, afterEach, before } from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createLspGraph, resetLspGraph } from "../graph-lsp.ts";

const FIXTURE = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixture-rust");

// Ensure the Rust project is built so rust-analyzer can index it.
before(() => {
	execSync("cargo check", { cwd: FIXTURE, timeout: 30000 });
});

afterEach(async () => {
	await resetLspGraph();
	await new Promise((r) => setTimeout(r, 100));
});

describe("LSP graph (Rust)", () => {
	describe("symbol lookup", () => {
		it("should find a struct", async () => {
			const db = await createLspGraph(FIXTURE);
			const results = await db.symbol("User").where((s) => s.kind === "class").list();
			assert.equal(results.length, 1);
			assert.equal(results[0].name, "User");
		});

		it("should find a function", async () => {
			const db = await createLspGraph(FIXTURE);
			const results = await db.symbol("format_message").list();
			assert.equal(results.length, 1);
			assert.equal(results[0].kind, "function");
		});

		it("should find impl methods", async () => {
			const db = await createLspGraph(FIXTURE);
			const results = await db.symbol("greet").list();
			const method = results.find((s) => s.kind === "method");
			assert.ok(method, "Expected to find greet as a method");
		});

		it("should find a trait and its implementation", async () => {
			const db = await createLspGraph(FIXTURE);
			const results = await db.symbol("Auditable").list();
			assert.ok(results.length >= 1, "Expected to find Auditable trait");
		});

		it("should fuzzy-find by partial name", async () => {
			const db = await createLspGraph(FIXTURE);
			const results = await db.find("audit").list();
			assert.ok(results.length >= 2);
		});
	});

	describe("call hierarchy", () => {
		it("should resolve outgoing calls from a method", async () => {
			const db = await createLspGraph(FIXTURE);
			// greet calls format_message
			const callees = await db.symbol("greet").callees().list();
			const names = callees.map((s) => s.name);
			assert.ok(names.includes("format_message"));
		});

		it("should resolve incoming calls to a function", async () => {
			const db = await createLspGraph(FIXTURE);
			// format_message is called by greet
			const callers = await db.symbol("format_message").callers().list();
			const names = callers.map((s) => s.name);
			assert.ok(names.includes("greet"));
		});

		it("should resolve private function callers", async () => {
			const db = await createLspGraph(FIXTURE);
			// validate_id is called by find_by_id
			const callers = await db.symbol("validate_id").callers().list();
			const names = callers.map((s) => s.name);
			assert.ok(names.includes("find_by_id"));
		});

		it("should traverse transitive callees", async () => {
			const db = await createLspGraph(FIXTURE);
			// greet → format_message → build_greeting
			const transitive = await db.symbol("greet").callees({ transitive: true }).list();
			const names = transitive.map((s) => s.name);
			assert.ok(names.includes("format_message"));
			assert.ok(names.includes("build_greeting"));
		});
	});

	describe("scope filtering", () => {
		it("should filter symbols by path glob", async () => {
			const db = await createLspGraph(FIXTURE);
			const results = await db.all().inPath("**/lib.rs").list();
			assert.ok(results.length > 0);
		});

		it("should prune callers by scope", async () => {
			const db = await createLspGraph(FIXTURE);
			// format_message is called by greet — both in lib.rs
			const scoped = await db.symbol("format_message")
				.callers({ scope: { exclude: ["**/lib.rs"] } })
				.list();
			const names = scoped.map((s) => s.name);
			assert.ok(!names.includes("greet"), "greet in lib.rs should be excluded");
		});
	});

	describe("terminals", () => {
		it("should explain a symbol", async () => {
			const db = await createLspGraph(FIXTURE);
			const explain = await db.symbol("greet").explain();
			assert.ok(explain.includes("greet"));
			assert.ok(explain.includes("method"));
			assert.ok(explain.includes("Called by") || explain.includes("Calls"));
		});

		it("should analyze impact", async () => {
			const db = await createLspGraph(FIXTURE);
			const impact = await db.symbol("build_greeting").impact();
			assert.ok(impact.includes("Impact"));
			assert.ok(impact.includes("caller"));
		});

		it("should find paths between symbols", async () => {
			const db = await createLspGraph(FIXTURE);
			// greet → format_message → build_greeting
			const path = await db.symbol("greet").pathsTo(
				(s) => s.name === "build_greeting",
			);
			assert.ok(path.includes("greet"));
			assert.ok(path.includes("build_greeting"));
		});

		it("should produce a table", async () => {
			const db = await createLspGraph(FIXTURE);
			const table = await db.all().where((s) => s.kind === "function").asTable();
			assert.ok(table.includes("format_message"));
		});

		it("should produce a summary", async () => {
			const db = await createLspGraph(FIXTURE);
			const summary = await db.all().summary();
			assert.ok(summary.includes("By kind"));
		});
	});

	describe("stats", () => {
		it("should report file and symbol counts for a built project", async () => {
			const db = await createLspGraph(FIXTURE);
			const stats = db.stats();
			assert.ok(stats.symbols > 0);
			assert.ok(stats.files > 0);
		});
	});
});
