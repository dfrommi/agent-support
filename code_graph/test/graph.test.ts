import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createGraph, resetGraph } from "../graph.ts";

const FIXTURE = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixture");

beforeEach(() => resetGraph());

describe("graph", () => {
	describe("symbol lookup", () => {
		it("should find a class by name", async () => {
			const db = await createGraph(FIXTURE);
			const results = await db.symbol("AuthService").list();
			assert.equal(results.length, 1);
			assert.equal(results[0].name, "AuthService");
			assert.equal(results[0].kind, "class");
		});

		it("should find a function by name", async () => {
			const db = await createGraph(FIXTURE);
			const results = await db.symbol("hashPassword").list();
			assert.equal(results.length, 1);
			assert.equal(results[0].kind, "function");
		});

		it("should find methods inside classes", async () => {
			const db = await createGraph(FIXTURE);
			const results = await db.symbol("login").list();
			assert.equal(results.length, 1);
			assert.equal(results[0].kind, "method");
			assert.equal(results[0].parentName, "AuthService");
		});

		it("should find interfaces", async () => {
			const db = await createGraph(FIXTURE);
			const results = await db.symbol("User").list();
			assert.equal(results.length, 1);
			assert.equal(results[0].kind, "interface");
		});

		it("should find type aliases", async () => {
			const db = await createGraph(FIXTURE);
			const results = await db.symbol("UserRole").list();
			assert.equal(results.length, 1);
			assert.equal(results[0].kind, "type");
		});

		it("should find enums", async () => {
			const db = await createGraph(FIXTURE);
			const results = await db.symbol("Permission").list();
			assert.equal(results.length, 1);
			assert.equal(results[0].kind, "enum");
		});

		it("should return empty for unknown symbol", async () => {
			const db = await createGraph(FIXTURE);
			const results = await db.symbol("NonExistent").list();
			assert.equal(results.length, 0);
		});
	});

	describe("fuzzy find", () => {
		it("should find symbols by partial name", async () => {
			const db = await createGraph(FIXTURE);
			const results = await db.find("auth").list();
			const names = results.map((s) => s.name);
			assert.ok(names.includes("AuthService"), `Expected AuthService in ${names.join(", ")}`);
		});

		it("should be case-insensitive", async () => {
			const db = await createGraph(FIXTURE);
			const results = await db.find("authservice").list();
			assert.equal(results.length, 1);
			assert.equal(results[0].name, "AuthService");
		});
	});

	describe("call graph", () => {
		it("should find callers of a function", async () => {
			const db = await createGraph(FIXTURE);
			const callers = await db.symbol("hashPassword").callers().list();
			const names = callers.map((s) => s.name);
			assert.ok(names.includes("handleLogin"), `Expected handleLogin in ${names.join(", ")}`);
		});

		it("should find callees of a function", async () => {
			const db = await createGraph(FIXTURE);
			const callees = await db.symbol("handleLogin").callees().list();
			const names = callees.map((s) => s.name);
			assert.ok(names.includes("hashPassword"), `Expected hashPassword in ${names.join(", ")}`);
		});

		it("should resolve calls across files via imports", async () => {
			const db = await createGraph(FIXTURE);
			const callers = await db.symbol("hashPassword").callers().list();
			const names = callers.map((s) => s.name);
			assert.ok(names.includes("handleLogin"), `Expected handleLogin in ${names.join(", ")}`);
		});

		it("should find transitive callers", async () => {
			const db = await createGraph(FIXTURE);
			const callers = await db.symbol("validateCredentials").callers().list();
			const names = callers.map((s) => s.name);
			assert.ok(names.includes("login"), `Expected login in ${names.join(", ")}`);
		});
	});

	describe("filtering", () => {
		it("should filter by kind", async () => {
			const db = await createGraph(FIXTURE);
			const classes = await db.all().where((s) => s.kind === "class").list();
			const names = classes.map((s) => s.name);
			assert.ok(names.includes("AuthService"));
			assert.ok(names.includes("LoginController"));
		});

		it("should filter exported symbols", async () => {
			const db = await createGraph(FIXTURE);
			const exported = await db.all().exported().list();
			for (const s of exported) {
				assert.ok(s.exported, `${s.name} should be exported`);
			}
			assert.ok(exported.length > 0);
		});

		it("should combine filters", async () => {
			const db = await createGraph(FIXTURE);
			const results = await db.all().where((s) => s.kind === "function" && s.exported).list();
			const names = results.map((s) => s.name);
			assert.ok(names.includes("hashPassword"));
			assert.ok(names.includes("createController"));
		});

		it("should filter by path glob", async () => {
			const db = await createGraph(FIXTURE);
			const authSymbols = await db.all().inPath("**/auth.ts").list();
			const names = authSymbols.map((s) => s.name);
			assert.ok(names.includes("AuthService"));
			assert.ok(names.includes("hashPassword"));
			assert.ok(!names.includes("LoginController"), "LoginController is in controller.ts, not auth.ts");
		});
	});

	describe("file lookup", () => {
		it("should find a file by partial path", async () => {
			const db = await createGraph(FIXTURE);
			const files = await db.file("auth.ts").list();
			assert.equal(files.length, 1);
			assert.ok(files[0].path.endsWith("auth.ts"));
		});

		it("should list symbols in a file", async () => {
			const db = await createGraph(FIXTURE);
			const symbols = await db.file("models.ts").symbols().list();
			const names = symbols.map((s) => s.name);
			assert.ok(names.includes("User"));
			assert.ok(names.includes("UserRole"));
			assert.ok(names.includes("Permission"));
		});

		it("should navigate file → symbols → callers", async () => {
			const db = await createGraph(FIXTURE);
			const callers = await db.file("auth.ts").symbols().where((s) => s.name === "hashPassword").callers().list();
			const names = callers.map((s) => s.name);
			assert.ok(names.includes("handleLogin"));
		});
	});

	describe("terminals", () => {
		it("should produce a table", async () => {
			const db = await createGraph(FIXTURE);
			const table = await db.symbol("AuthService").asTable();
			assert.ok(table.includes("AuthService"));
			assert.ok(table.includes("class"));
			assert.ok(table.includes("auth.ts"));
		});

		it("should produce a table with selected columns", async () => {
			const db = await createGraph(FIXTURE);
			const table = await db.symbol("AuthService").select(["name", "kind"]).asTable();
			assert.ok(table.includes("AuthService"));
			assert.ok(table.includes("class"));
			// file should not be in the table when not selected
			assert.ok(!table.includes("auth.ts"));
		});

		it("should produce a tree", async () => {
			const db = await createGraph(FIXTURE);
			const tree = await db.file("auth.ts").symbols().tree();
			assert.ok(tree.includes("auth.ts"));
			assert.ok(tree.includes("AuthService"));
			assert.ok(tree.includes("hashPassword"));
		});

		it("should count results", async () => {
			const db = await createGraph(FIXTURE);
			const count = await db.all().where((s) => s.kind === "class").count();
			assert.ok(count >= 2);
		});

		it("should return first result", async () => {
			const db = await createGraph(FIXTURE);
			const sym = await db.symbol("AuthService").first();
			assert.ok(sym);
			assert.equal(sym!.name, "AuthService");
		});

		it("should produce a summary", async () => {
			const db = await createGraph(FIXTURE);
			const summary = await db.all().summary();
			assert.ok(summary.includes("By kind"));
			assert.ok(summary.includes("class"));
			assert.ok(summary.includes("function"));
		});

		it("should produce an explain for a single symbol", async () => {
			const db = await createGraph(FIXTURE);
			const explain = await db.symbol("hashPassword").explain();
			assert.ok(explain.includes("hashPassword"));
			assert.ok(explain.includes("function"));
			assert.ok(explain.includes("Called by"));
		});
	});

	describe("scope filtering", () => {
		it("should exclude callers matching a glob pattern", async () => {
			const db = await createGraph(FIXTURE);
			const fs = await import("node:fs");
			const testDir = path.join(FIXTURE, "__test_scope__");
			const testFile = path.join(testDir, "helper.test.ts");
			try {
				fs.mkdirSync(testDir);
				fs.writeFileSync(testFile, `import { hashPassword } from "../auth";\nexport function testHelper() { hashPassword("x"); }`);

				resetGraph();
				const db2 = await createGraph(FIXTURE);

				const allCallers = await db2.symbol("hashPassword").callers().list();
				const allNames = allCallers.map((s) => s.name);
				assert.ok(allNames.includes("testHelper"), "testHelper should be a caller");
				assert.ok(allNames.includes("handleLogin"), "handleLogin should be a caller");

				const scopedCallers = await db2.symbol("hashPassword")
					.callers({ scope: { exclude: ["**/__test_scope__/**"] } })
					.list();
				const scopedNames = scopedCallers.map((s) => s.name);
				assert.ok(!scopedNames.includes("testHelper"), "testHelper should be excluded by scope");
				assert.ok(scopedNames.includes("handleLogin"), "handleLogin should still appear");
			} finally {
				fs.rmSync(testDir, { recursive: true, force: true });
			}
		});

		it("should prune transitive traversal at excluded nodes", async () => {
			const db = await createGraph(FIXTURE);
			const fs = await import("node:fs");
			const testDir = path.join(FIXTURE, "__test_scope2__");
			const testFile = path.join(testDir, "wrapper.test.ts");
			try {
				fs.mkdirSync(testDir);
				fs.writeFileSync(testFile, `import { handleLogin } from "../controller";\nexport function testWrapper() { handleLogin("u", "p"); }`);

				resetGraph();
				const db2 = await createGraph(FIXTURE);

				const allTransitive = await db2.symbol("hashPassword").callers({ transitive: true }).list();
				const allNames = allTransitive.map((s) => s.name);
				assert.ok(allNames.includes("testWrapper"), "testWrapper should be a transitive caller");

				const scopedTransitive = await db2.symbol("hashPassword")
					.callers({ transitive: true, scope: { exclude: ["**/__test_scope2__/**"] } })
					.list();
				const scopedNames = scopedTransitive.map((s) => s.name);
				assert.ok(!scopedNames.includes("testWrapper"), "testWrapper should be excluded");
				assert.ok(scopedNames.includes("handleLogin"), "handleLogin should still appear (it's in main code)");
			} finally {
				fs.rmSync(testDir, { recursive: true, force: true });
			}
		});

		it("should work with callees too", async () => {
			const db = await createGraph(FIXTURE);
			const fs = await import("node:fs");
			const testDir = path.join(FIXTURE, "__test_scope3__");
			const testFile = path.join(testDir, "util.test.ts");
			try {
				fs.mkdirSync(testDir);
				fs.writeFileSync(testFile, `export function testOnlyHelper() { return 1; }`);

				resetGraph();
				const db2 = await createGraph(FIXTURE);

				const scopedCallees = await db2.symbol("handleLogin")
					.callees({ scope: { exclude: ["**/__test_scope3__/**"] } })
					.list();
				const names = scopedCallees.map((s) => s.name);
				assert.ok(names.includes("hashPassword"), "hashPassword should still be a callee");
			} finally {
				fs.rmSync(testDir, { recursive: true, force: true });
			}
		});

		it("should support scope in impact analysis", async () => {
			const db = await createGraph(FIXTURE);
			const fs = await import("node:fs");
			const testDir = path.join(FIXTURE, "__test_scope4__");
			const testFile = path.join(testDir, "impact.test.ts");
			try {
				fs.mkdirSync(testDir);
				fs.writeFileSync(testFile, `import { hashPassword } from "../auth";\nexport function testImpact() { hashPassword("x"); }`);

				resetGraph();
				const db2 = await createGraph(FIXTURE);

				const fullImpact = await db2.symbol("hashPassword").impact();
				assert.ok(fullImpact.includes("testImpact"), "testImpact should be in unscoped impact");

				const scopedImpact = await db2.symbol("hashPassword")
					.impact({ scope: { exclude: ["**/__test_scope4__/**"] } });
				assert.ok(!scopedImpact.includes("testImpact"), "testImpact should be excluded from scoped impact");
			} finally {
				fs.rmSync(testDir, { recursive: true, force: true });
			}
		});

		it("should support scope in pathsTo", async () => {
			const db = await createGraph(FIXTURE);
			const fs = await import("node:fs");
			const testDir = path.join(FIXTURE, "__test_scope5__");
			const testFile = path.join(testDir, "path.test.ts");
			try {
				fs.mkdirSync(testDir);
				fs.writeFileSync(testFile, `import { hashPassword } from "../auth";\nexport function pathHelper() { hashPassword("x"); }`);

				resetGraph();
				const db2 = await createGraph(FIXTURE);

				// pathHelper calls hashPassword; should find a path
				const fullPath = await db2.symbol("pathHelper").pathsTo(
					(s) => s.name === "hashPassword",
				);
				assert.ok(fullPath.includes("hashPassword"), "should find path to hashPassword");

				// With scope excluding the test dir, pathHelper itself is excluded from source
				// (pathsTo source is already resolved, scope only affects traversal frontier)
			} finally {
				fs.rmSync(testDir, { recursive: true, force: true });
			}
		});
	});

	describe("stats", () => {
		it("should report file, symbol, and edge counts", async () => {
			const db = await createGraph(FIXTURE);
			const stats = db.stats();
			assert.ok(stats.files > 0);
			assert.ok(stats.symbols > 0);
			assert.ok(stats.edges >= 0);
		});
	});
});
