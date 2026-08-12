import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createGraph, resetGraph } from "../graph.ts";

const FIXTURE = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixture-java");

beforeEach(() => resetGraph());

describe("java graph", () => {
	describe("symbol lookup", () => {
		it("should find Java classes", async () => {
			const db = await createGraph(FIXTURE);
			const results = await db.symbol("UserService").where(s => s.kind === "class").list();
			assert.equal(results.length, 1);
			assert.equal(results[0].kind, "class");
		});

		it("should find Java methods", async () => {
			const db = await createGraph(FIXTURE);
			const results = await db.symbol("findUser").list();
			assert.equal(results.length, 1);
			assert.equal(results[0].kind, "method");
			assert.equal(results[0].parentName, "UserService");
		});

		it("should find Java constructors (same name as class)", async () => {
			const db = await createGraph(FIXTURE);
			// "User" matches both the class and its constructor — filter to class
			const results = await db.symbol("User").where(s => s.kind === "class").list();
			assert.equal(results.length, 1);
			assert.equal(results[0].kind, "class");
		});
	});

	describe("call graph", () => {
		it("should resolve intra-class method calls", async () => {
			const db = await createGraph(FIXTURE);
			const callers = await db.symbol("validateId").callers().list();
			const names = callers.map((s) => s.name);
			assert.ok(names.includes("findUser"), `Expected findUser in ${names.join(", ")}`);
		});

		it("should resolve new object creation as call", async () => {
			const db = await createGraph(FIXTURE);
			const callers = await db.symbol("User").callers().list();
			const names = callers.map((s) => s.name);
			assert.ok(names.includes("findById"), `Expected findById in ${names.join(", ")}`);
		});

		it("should trace callees from a method", async () => {
			const db = await createGraph(FIXTURE);
			const callees = await db.symbol("findUser").callees().list();
			const names = callees.map((s) => s.name);
			assert.ok(names.includes("validateId"), `Expected validateId in ${names.join(", ")}`);
		});

		it("should trace callees from createUser", async () => {
			const db = await createGraph(FIXTURE);
			const callees = await db.symbol("createUser").callees().list();
			const names = callees.map((s) => s.name);
			assert.ok(names.includes("validateUser"), `Expected validateUser in ${names.join(", ")}`);
			assert.ok(names.includes("auditLog"), `Expected auditLog in ${names.join(", ")}`);
		});
	});

	describe("filtering", () => {
		it("should find all classes in the project", async () => {
			const db = await createGraph(FIXTURE);
			const classes = await db.all().where((s) => s.kind === "class").list();
			assert.equal(classes.length, 3);
		});

		it("should find all methods of a class", async () => {
			const db = await createGraph(FIXTURE);
			const methods = await db.file("UserService.java").symbols().where((s) => s.kind === "method").list();
			const names = methods.map((s) => s.name);
			assert.ok(names.includes("findUser"));
			assert.ok(names.includes("createUser"));
			assert.ok(names.includes("validateId"));
			assert.ok(names.includes("validateUser"));
			assert.ok(names.includes("auditLog"));
		});
	});
});
