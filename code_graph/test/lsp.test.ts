import assert from "node:assert/strict";
import { describe, it, afterEach } from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createLspGraph, resetLspGraph } from "../graph-lsp.ts";

const FIXTURE = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixture-java");

afterEach(async () => {
	await resetLspGraph();
	// Small delay to let ports/processes fully release
	await new Promise((r) => setTimeout(r, 100));
});

describe("LSP graph (Java)", () => {
	describe("symbol lookup", () => {
		it("should find a class by name", async () => {
			const db = await createLspGraph(FIXTURE);
			const results = await db.symbol("User").where((s) => s.kind === "class").list();
			assert.equal(results.length, 1);
			assert.equal(results[0].name, "User");
			assert.equal(results[0].kind, "class");
		});

		it("should find a method by name (with parameter types)", async () => {
			const db = await createLspGraph(FIXTURE);
			const results = await db.symbol("findById(String)").list();
			assert.equal(results.length, 1);
			assert.equal(results[0].kind, "method");
		});

		it("should find symbols by partial name", async () => {
			const db = await createLspGraph(FIXTURE);
			const results = await db.find("find").list();
			assert.ok(results.length >= 2, `Expected at least 2, got ${results.length}`);
		});

		it("should case-insensitive find", async () => {
			const db = await createLspGraph(FIXTURE);
			const results = await db.find("user").list();
			assert.ok(results.length > 0);
		});
	});

	describe("call hierarchy", () => {
		it("should find callers of a method", async () => {
			const db = await createLspGraph(FIXTURE);
			const callers = await db.symbol("findById(String)").callers().list();
			const names = callers.map((s) => s.name);
			assert.ok(names.some((n) => n.includes("findUser")), `Expected findUser in ${names.join(", ")}`);
		});

		it("should find callees of a method", async () => {
			const db = await createLspGraph(FIXTURE);
			const callees = await db.symbol("findUser(String)").callees().list();
			const names = callees.map((s) => s.name);
			assert.ok(names.some((n) => n.includes("findById")), `Expected findById in ${names.join(", ")}`);
		});

		it("should find transitive callers", async () => {
			const db = await createLspGraph(FIXTURE);
			const transitive = await db.symbol("findById(String)").callers({ transitive: true }).list();
			const names = transitive.map((s) => s.name);
			assert.ok(names.some((n) => n.includes("findUser")), `Expected findUser in ${names.join(", ")}`);
		});

		it("should find transitive callees", async () => {
			const db = await createLspGraph(FIXTURE);
			const transitive = await db.symbol("findUser(String)").callees({ transitive: true }).list();
			const names = transitive.map((s) => s.name);
			assert.ok(names.some((n) => n.includes("findById")), `Expected findById in ${names.join(", ")}`);
			assert.ok(names.some((n) => n.includes("validateId")), `Expected validateId in ${names.join(", ")}`);
		});
	});

	describe("scope filtering", () => {
		it("should exclude callers by path glob", async () => {
			const db = await createLspGraph(FIXTURE);
			// findById is called by findUser (UserService.java) — exclude it
			const scoped = await db.symbol("findById(String)")
				.callers({ scope: { exclude: ["**/UserService.java"] } })
				.list();
			const names = scoped.map((s) => s.name);
			assert.ok(!names.some((n) => n.includes("findUser")), "findUser should be excluded");
		});

		it("should scope impact analysis", async () => {
			const db = await createLspGraph(FIXTURE);
			const impact = await db.symbol("findById(String)")
				.impact({ scope: { exclude: ["**/UserService.java"] } });
			assert.ok(!impact.includes("UserService"), "UserService should be excluded from impact");
		});
	});

	describe("terminals", () => {
		it("should produce explain output", async () => {
			const db = await createLspGraph(FIXTURE);
			const explain = await db.symbol("findById(String)").explain();
			assert.ok(explain.includes("findById"));
			assert.ok(explain.includes("Called by"));
			assert.ok(explain.includes("Calls"));
		});

		it("should produce impact analysis", async () => {
			const db = await createLspGraph(FIXTURE);
			const impact = await db.symbol("findById(String)").impact();
			assert.ok(impact.includes("Impact"));
			assert.ok(impact.includes("caller"));
			assert.ok(impact.includes("UserService"));
		});

		it("should produce a call tree", async () => {
			const db = await createLspGraph(FIXTURE);
			const tree = await db.symbol("findUser(String)").callTree({ maxDepth: 2 });
			assert.ok(tree.includes("findUser"));
			assert.ok(tree.includes("findById"));
		});

		it("should produce a summary", async () => {
			const db = await createLspGraph(FIXTURE);
			const summary = await db.all().summary();
			assert.ok(summary.includes("By kind"));
			assert.ok(summary.includes("method"));
			assert.ok(summary.includes("class"));
		});

		it("should find paths between symbols", async () => {
			const db = await createLspGraph(FIXTURE);
			// findUser calls findById
			const path = await db.symbol("findUser(String)").pathsTo(
				(s) => s.name.includes("findById"),
			);
			assert.ok(path.includes("findUser"), "path should start at findUser");
			assert.ok(path.includes("findById"), "path should end at findById");
		});

		it("should produce a table", async () => {
			const db = await createLspGraph(FIXTURE);
			const table = await db.all().where((s) => s.kind === "class").asTable();
			assert.ok(table.includes("User"));
			assert.ok(table.includes("class"));
		});

		it("should produce a table with selected columns", async () => {
			const db = await createLspGraph(FIXTURE);
			const table = await db.all().where((s) => s.kind === "class").select(["name"]).asTable();
			assert.ok(table.includes("User"));
			assert.ok(!table.includes("class")); // kind column not selected
		});
	});

	describe("changed", () => {
		it("should return symbols from files changed since a git ref", async () => {
			const db = await createLspGraph(FIXTURE);
			// fixture-java is committed — diff vs HEAD should find no unstaged changes
			const changed = await db.changed({ since: "HEAD" }).list();
			assert.ok(Array.isArray(changed), "changed() should return an array");
		});

		it("should detect unstaged file modifications", async () => {
			const fs = await import("node:fs");
			const userServicePath = path.join(FIXTURE, "src/main/java/com/example/UserService.java");
			const original = fs.readFileSync(userServicePath, "utf8");

			try {
				// Modify a file (unstaged change)
				fs.writeFileSync(userServicePath, original + "\n// test comment\n");

				const db = await createLspGraph(FIXTURE);
				const changed = await db.changed({ since: "HEAD" }).list();
				const changedFiles = [...new Set(changed.map((s: any) => s.file))];
				assert.ok(
					changedFiles.some((f: string) => f.includes("UserService.java")),
					"UserService.java should appear in changed files",
				);
			} finally {
				fs.writeFileSync(userServicePath, original);
			}
		});
	});

	describe("freshness", () => {
		it("should pick up file modifications via didChange", async () => {
			const fs = await import("node:fs");
			const userServicePath = path.join(FIXTURE, "src/main/java/com/example/UserService.java");
			const original = fs.readFileSync(userServicePath, "utf8");

			try {
				// First query: baseline
				const db1 = await createLspGraph(FIXTURE);
				const before = await db1.find("ping").list();
				assert.equal(before.length, 0, "ping should not exist yet");

				// Add a new method
				const modified = original.replace(
					"private void auditLog",
					"public void ping() { return; }\n\n    private void auditLog",
				);
				fs.writeFileSync(userServicePath, modified);

				// Second query: should pick up the new method via didChange
				const db2 = await createLspGraph(FIXTURE);
				const after = await db2.find("ping").list();
				assert.equal(after.length, 1, "ping should be found after file modification");
				assert.equal(after[0].kind, "method");
			} finally {
				fs.writeFileSync(userServicePath, original);
			}
		});
	});

	describe("stats", () => {
		it("should report file and symbol counts for a well-formed project", async () => {
			const db = await createLspGraph(FIXTURE);
			const stats = db.stats();
			assert.ok(stats.symbols > 0);
			assert.ok(stats.files > 0);
		});
	});
});
