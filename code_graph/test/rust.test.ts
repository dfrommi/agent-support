import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createGraph, resetGraph } from "../graph.ts";

const FIXTURE = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixture-rust");

beforeEach(() => resetGraph());

describe("rust graph", () => {
	describe("symbol lookup", () => {
		it("should find Rust structs", async () => {
			const db = await createGraph(FIXTURE);
			const results = await db.symbol("User").where((s) => s.kind === "class").list();
			assert.equal(results.length, 1);
			assert.ok(results[0].exported);
		});

		it("should find Rust functions", async () => {
			const db = await createGraph(FIXTURE);
			const results = await db.symbol("format_message").list();
			assert.equal(results.length, 1);
			assert.equal(results[0].kind, "function");
			assert.ok(results[0].exported);
		});

		it("should find Rust methods", async () => {
			const db = await createGraph(FIXTURE);
			const results = await db.symbol("greet").list();
			assert.equal(results.length, 1);
			assert.equal(results[0].kind, "method");
			assert.equal(results[0].parentName, "User");
		});
	});

	describe("call graph", () => {
		it("should trace method → function calls", async () => {
			const db = await createGraph(FIXTURE);
			// greet calls format_message
			const callees = await db.symbol("greet").callees().list();
			const names = callees.map((s) => s.name);
			assert.ok(names.includes("format_message"), `Expected format_message in ${names.join(", ")}`);
		});

		it("should trace function → function calls", async () => {
			const db = await createGraph(FIXTURE);
			// format_message calls build_greeting
			const callees = await db.symbol("format_message").callees().list();
			const names = callees.map((s) => s.name);
			assert.ok(names.includes("build_greeting"));
		});

		it("should find callers of a private function", async () => {
			const db = await createGraph(FIXTURE);
			const callers = await db.symbol("validate_id").callers().list();
			const names = callers.map((s) => s.name);
			assert.ok(names.includes("find_by_id"));
		});

		it("should trace transitive calls", async () => {
			const db = await createGraph(FIXTURE);
			// greet → format_message → build_greeting
			const transitive = await db.symbol("greet").callees().callees().list();
			const names = transitive.map((s) => s.name);
			assert.ok(names.includes("build_greeting"), `Expected build_greeting in ${names.join(", ")}`);
		});
	});

	describe("filtering", () => {
		it("should find all exported functions", async () => {
			const db = await createGraph(FIXTURE);
			const fns = await db.all().where((s) => s.kind === "function" && s.exported).list();
			const names = fns.map((s) => s.name);
			assert.ok(names.includes("format_message"));
		});

		it("should find methods by parent struct", async () => {
			const db = await createGraph(FIXTURE);
			const methods = await db.all().where((s) => s.parentName === "User" && s.kind === "method").list();
			const names = methods.map((s) => s.name);
			assert.ok(names.includes("greet"));
			assert.ok(names.includes("new"));
		});
	});
});
