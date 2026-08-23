import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CodeGraph } from "../lib/graph.ts";
import type { Symbol, SymbolKind } from "../lib/model.ts";
import { kindHistogram, searchSymbols, type SearchOptions } from "../lib/search.ts";

const MAIN = "/p/src/main/java/com/example";
const TEST = "/p/src/test/java/com/example";
const ROOT = "/p";

function sym(id: string, name: string, kind: SymbolKind, file: string, line: number, container?: string): Symbol {
	return {
		id,
		name,
		kind,
		file,
		location: {
			uri: `file://${file}`,
			range: { start: { line, column: 1 }, end: { line, column: 1 } },
			nameRange: { start: { line, column: 1 }, end: { line, column: 1 + name.length } },
		},
		containerName: container,
	};
}

const userClass = sym("user", "User", "class", `${MAIN}/User.java`, 3);
const userCtor = sym("user-ctor", "User", "constructor", `${MAIN}/User.java`, 5, "User");
const userName = sym("user-name", "name", "field", `${MAIN}/User.java`, 4, "User");
const repoClass = sym("repo", "UserRepository", "class", `${MAIN}/UserRepository.java`, 3);
const findById = sym("findById", "findById", "method", `${MAIN}/UserRepository.java`, 4, "UserRepository");
const svcClass = sym("svc", "UserService", "class", `${MAIN}/UserService.java`, 3);
const findUser = sym("findUser", "findUser", "method", `${MAIN}/UserService.java`, 5, "UserService");
const testClass = sym("catalog", "CatalogService", "class", `${TEST}/CatalogService.java`, 3);

const SYMBOLS = [userClass, userCtor, userName, repoClass, findById, svcClass, findUser, testClass];
const FILES = [...new Set(SYMBOLS.map((s) => s.file))];
const graph = new CodeGraph(SYMBOLS, FILES);

function search(overrides: Partial<SearchOptions>): Symbol[] {
	return searchSymbols(graph, { substrings: [], scope: "all", root: ROOT, ...overrides });
}

describe("searchSymbols", () => {
	it("matches with OR across substrings", () => {
		const names = search({ substrings: ["findById", "findUser"] }).map((s) => s.name);
		assert.deepEqual(names.sort(), ["findById", "findUser"]);
	});

	it("matches the qualified Container.member name", () => {
		const result = search({ substrings: ["UserService.find"] });
		assert.deepEqual(result.map((s) => s.name), ["findUser"]);
	});

	it("accepts Rust's `::` in substrings", () => {
		const result = search({ substrings: ["UserService::find"] });
		assert.deepEqual(result.map((s) => s.name), ["findUser"]);
	});

	it("still matches bare names", () => {
		const names = search({ substrings: ["find"] }).map((s) => s.name).sort();
		assert.deepEqual(names, ["findById", "findUser"]);
	});

	it("filters by includeKinds", () => {
		const result = search({ substrings: ["find"], includeKinds: ["method"] });
		assert.deepEqual(result.map((s) => s.name).sort(), ["findById", "findUser"]);
		assert.ok(result.every((s) => s.kind === "method"));
	});

	it("excludeKinds wins over includeKinds", () => {
		const result = search({ substrings: ["User"], includeKinds: ["constructor", "class"], excludeKinds: ["constructor"] });
		assert.ok(result.every((s) => s.kind === "class"));
		assert.ok(result.some((s) => s.id === "repo"));
		assert.ok(!result.some((s) => s.kind === "constructor"));
	});

	it("respects scope", () => {
		assert.equal(search({ substrings: ["Catalog"], scope: "main" }).length, 0);
		assert.deepEqual(search({ substrings: ["Catalog"], scope: "test" }).map((s) => s.name), ["CatalogService"]);
		assert.deepEqual(search({ substrings: ["Catalog"], scope: "all" }).map((s) => s.name), ["CatalogService"]);
	});

	it("filters by project-relative path glob", () => {
		const result = search({ substrings: ["find"], path: "src/main/**" });
		assert.deepEqual(result.map((s) => s.name).sort(), ["findById", "findUser"]);
	});

	it("returns nothing for empty substrings", () => {
		assert.deepEqual(search({ substrings: ["", "  "] }), []);
	});

	it("ranks types above members", () => {
		const result = search({ substrings: ["User"] });
		assert.equal(result[0].name, "User");
		assert.equal(result[0].kind, "class");
	});

	it("ranks camelCase-boundary matches above mid-word matches", () => {
		const symbols = [
			sym("abs", "AbsoluteHumidityStateProvider", "struct", `${MAIN}/A.rs`, 1),
			sym("corr", "CorrelationId", "struct", `${MAIN}/C.rs`, 1),
			sym("ext", "ExternalId", "struct", `${MAIN}/E.rs`, 1),
			sym("id", "Id", "struct", `${MAIN}/I.rs`, 1),
		];
		const idGraph = new CodeGraph(symbols, [...new Set(symbols.map((s) => s.file))]);
		const result = searchSymbols(idGraph, { substrings: ["Id"], scope: "all", root: ROOT });
		assert.deepEqual(
			result.map((s) => s.name),
			["Id", "ExternalId", "CorrelationId", "AbsoluteHumidityStateProvider"],
		);
	});

	it("searches proc-macro derive-name aliases", () => {
		const derive = sym("derive", "state_enum_derive", "function", `${MAIN}/lib.rs`, 9);
		derive.aliases = ["StateEnumDerive"];
		const graph2 = new CodeGraph(
			[...SYMBOLS, derive],
			[...new Set([...SYMBOLS.map((s) => s.file), derive.file])],
		);
		const result = searchSymbols(graph2, { substrings: ["StateEnumDerive"], scope: "all", root: ROOT });
		assert.deepEqual(result.map((s) => s.name), ["state_enum_derive"]);
	});
});

describe("kindHistogram", () => {
	it("summarizes matches by kind, most common first", () => {
		assert.equal(kindHistogram([userClass, userClass, findById]), "class 2, method 1");
	});

	it("returns an empty string for no symbols", () => {
		assert.equal(kindHistogram([]), "");
	});
});
