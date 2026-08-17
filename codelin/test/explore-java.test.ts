import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { explore } from "../explore.ts";
import { resetGraph } from "../backend.ts";
import { copyFixture } from "./helpers.ts";

const FIXTURE = copyFixture("fixture-java");

afterEach(() => resetGraph());

describe("codelin code tool (java)", () => {
	it("returns a member outline for a class", async () => {
		const out = await explore(FIXTURE, "UserService");
		assert.match(out, /Members/);
		assert.match(out, /findUser/);
		assert.match(out, /validateId/);
	});

	it("returns a method body with read-parity line numbers", async () => {
		const out = await explore(FIXTURE, "findUser");
		assert.match(out, /findUser/);
		assert.match(out, /repository\.findById/);
		assert.match(out, /\n\d+\t/);
	});

	it("resolves an interface over a similarly-named field", async () => {
		const out = await explore(FIXTURE, "CatalogService");
		assert.match(out, /\*\*CatalogService\*\* \(interface\)/);
		assert.match(out, /Implemented\/Extended by ← CatalogServiceImpl/);
		assert.match(out, /Other matches/);
		assert.match(out, /catalogService \(field\)/);
	});

	it("offers the interface as an alternative when a field matches exactly", async () => {
		const out = await explore(FIXTURE, "catalogService");
		assert.match(out, /\*\*catalogService\*\* \(field\)/);
		assert.match(out, /CatalogService \(interface\)/);
	});

	it("resolves a member-qualified class method", async () => {
		const out = await explore(FIXTURE, "UserService.findUser");
		assert.match(out, /\*\*findUser\*\* \(method\)/);
		assert.match(out, /repository\.findById/);
		assert.match(out, /Calls → .*UserService\.validateId/);
	});

	it("resolves a member-qualified interface method", async () => {
		const out = await explore(FIXTURE, "CatalogService.createProduct");
		assert.match(out, /\*\*createProduct\*\* \(method\)/);
		assert.match(out, /CatalogService\.java/);
	});

	it("resolves a member-qualified query case-insensitively", async () => {
		const out = await explore(FIXTURE, "userservice.finduser");
		assert.match(out, /\*\*findUser\*\* \(method\)/);
		assert.match(out, /case-insensitive match/);
	});

	it("flags a test-scope primary when scope=main", async () => {
		const out = await explore(FIXTURE, "CatalogServiceTest", "main");
		assert.match(out, /\*\*CatalogServiceTest\*\*/);
		assert.match(out, /outside scope "main"/);
	});

	it("excludes test code from alternatives under scope=main", async () => {
		const out = await explore(FIXTURE, "CatalogService", "main");
		assert.doesNotMatch(out, /CatalogServiceTest/);
	});
});
