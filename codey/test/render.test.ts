import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resetGraphs } from "../lib/session.ts";
import { explore, search } from "../render.ts";

const FIXTURE = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixture-java");

after(async () => {
	await resetGraphs();
});

describe("code tool rendering", () => {
	it("renders a symbol with body and usages", async () => {
		const text = await explore(FIXTURE, "findById", "all");
		assert.ok(text.includes("findById"));
		assert.ok(text.includes("UserRepository"));
		assert.ok(text.includes("Callers"));
	});

	it("resolves a member-qualified name", async () => {
		const text = await explore(FIXTURE, "UserService.findUser", "all");
		assert.ok(text.includes("findUser"));
		assert.ok(text.includes("UserService"));
	});

	it("shows resolved outgoing calls", async () => {
		const text = await explore(FIXTURE, "findUser", "all");
		assert.ok(text.includes("Callees"));
		assert.ok(text.includes("UserService.validateId"));
		assert.ok(text.includes("UserRepository.findById"));
	});

	it("outlines a file's symbols with line ranges", async () => {
		const text = await explore(FIXTURE, "UserRepository.java", "all");
		assert.ok(text.includes("UserRepository.java"));
		assert.ok(text.includes("findById"));
		assert.ok(text.includes("save"));
		assert.ok(text.includes("3 symbol(s)"));
		assert.ok(/- `findById` \(method\) :\d+ \(\d+ lines?\)/.test(text));
	});

	it("searches symbols by substring", async () => {
		const text = await search(FIXTURE, { substrings: ["find"], scope: "all" });
		assert.ok(text.includes("findById"));
		assert.ok(text.includes("findUser"));
		assert.ok(text.includes("UserRepository.findById"));
		assert.ok(text.includes("matches for"));
	});

	it("shows the Java package in search results", async () => {
		const text = await search(FIXTURE, { substrings: ["UserService"], scope: "all" });
		assert.ok(text.includes("com.example.UserService"));
	});

	it("resolves a file:line to the enclosing method", async () => {
		const text = await explore(FIXTURE, "UserRepository.java:8", "all");
		assert.ok(text.includes("findById"));
		assert.ok(text.includes("Callers"));
	});

	it("resolves a file:line-range to the enclosing method", async () => {
		const text = await explore(FIXTURE, "UserRepository.java:7-9", "all");
		assert.ok(text.includes("findById"));
	});

	it("ignores a trailing column in a location", async () => {
		const text = await explore(FIXTURE, "UserRepository.java:8:1", "all");
		assert.ok(text.includes("findById"));
	});

	it("resolves a Class:line to the enclosing method", async () => {
		const text = await explore(FIXTURE, "UserService:10", "all");
		assert.ok(text.includes("findUser"));
		assert.ok(text.includes("Callers"));
	});

	it("errors when a location is not inside a method", async () => {
		const text = await explore(FIXTURE, "UserService:4", "all");
		assert.ok(text.includes("not inside a method"));
	});

	it("shows implementations and filters them out of usages", async () => {
		const text = await explore(FIXTURE, "PaymentProcessor", "all");
		assert.ok(text.includes("Implementations (1)"));
		assert.ok(text.includes("CreditCardProcessor"));
		assert.ok(text.includes("Usages: (none)"));
	});

	it("shows overrides of an interface method", async () => {
		const text = await explore(FIXTURE, "PaymentProcessor.process", "all");
		assert.ok(text.includes("Overrides (1)"));
		assert.ok(text.includes("CreditCardProcessor.process"));
	});

	it("marks empty override and call sections explicitly", async () => {
		const text = await explore(FIXTURE, "UserService.validateId", "all");
		assert.ok(text.includes("Overrides: (none)"));
		assert.ok(text.includes("Callees: (none)"));
	});

	it("summarizes callers by default with a kind histogram", async () => {
		const text = await explore(FIXTURE, "findById", "all");
		assert.ok(text.includes("Callers (1): method 1"));
		assert.ok(text.includes("findUser"));
	});

	it("lists every call site with usages=full", async () => {
		const text = await explore(FIXTURE, "findById", "all", "full");
		assert.ok(text.includes("Callers (1):"));
		assert.ok(text.includes("- method (1)"));
		assert.ok(text.includes("findUser"));
	});
});
