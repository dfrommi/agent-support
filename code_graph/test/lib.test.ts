import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CodeGraph } from "../lib/graph.ts";
import type { Symbol, SymbolKind } from "../lib/model.ts";
import { resolveSymbol } from "../lib/resolve.ts";
import { inScope, type Scope } from "../lib/scope.ts";
import { containingSymbol, resolveUsageSymbols } from "../lib/usages.ts";

const MAIN = "/p/src/main/java/com/example";
const TEST = "/p/src/test/java/com/example";

function sym(id: string, name: string, kind: SymbolKind, file: string, line: number, endLine: number, container?: string): Symbol {
	return {
		id,
		name,
		kind,
		file,
		location: {
			uri: `file://${file}`,
			range: { start: { line, column: 1 }, end: { line: endLine, column: 1 } },
			nameRange: { start: { line, column: 1 }, end: { line, column: 1 + name.length } },
		},
		containerName: container,
	};
}

const userClass = sym("user", "User", "class", `${MAIN}/User.java`, 3, 10);
const userCtor = sym("user-ctor", "User", "constructor", `${MAIN}/User.java`, 5, 7, "User");
const userName = sym("user-name", "name", "field", `${MAIN}/User.java`, 4, 4, "User");
const repoClass = sym("repo", "UserRepository", "class", `${MAIN}/UserRepository.java`, 3, 9);
const findById = sym("findById", "findById", "method", `${MAIN}/UserRepository.java`, 4, 6, "UserRepository");
const testClass = sym("catalog", "CatalogService", "class", `${TEST}/CatalogService.java`, 3, 10);

const SYMBOLS = [userClass, userCtor, userName, repoClass, findById, testClass];
const FILES = [...new Set(SYMBOLS.map((s) => s.file))];
const graph = new CodeGraph(SYMBOLS, FILES);

describe("scope", () => {
	it("classifies main, test, and generated paths", () => {
		assert.equal(inScope(`${MAIN}/User.java`, "main" satisfies Scope), true);
		assert.equal(inScope(`${MAIN}/User.java`, "test" satisfies Scope), false);
		assert.equal(inScope(`${TEST}/CatalogService.java`, "test" satisfies Scope), true);
		assert.equal(inScope(`${TEST}/CatalogService.java`, "main" satisfies Scope), false);
		assert.equal(inScope(`${MAIN}/generated/Foo.java`, "main" satisfies Scope), false);
		assert.equal(inScope(`${MAIN}/User.java`, "all" satisfies Scope), true);
	});

	it("treats a test-named container as test scope", () => {
		assert.equal(inScope(`${MAIN}/lib.rs`, "test" satisfies Scope, "tests"), true);
		assert.equal(inScope(`${MAIN}/lib.rs`, "main" satisfies Scope, "tests"), false);
		assert.equal(inScope(`${MAIN}/lib.rs`, "test" satisfies Scope, "test"), true);
		assert.equal(inScope(`${MAIN}/lib.rs`, "main" satisfies Scope, "helper"), true);
	});

	it("ignores a test directory above the project root", () => {
		const root = "/p/test/fixture-rust";
		assert.equal(inScope(`${root}/src/lib.rs`, "main" satisfies Scope, undefined, root), true);
		assert.equal(inScope(`${root}/tests/integration.rs`, "main" satisfies Scope, undefined, root), false);
		assert.equal(inScope(`${root}/tests/integration.rs`, "test" satisfies Scope, undefined, root), true);
	});
});

describe("resolveSymbol", () => {
	it("ranks exact name and prefers type over constructor", () => {
		const res = resolveSymbol(graph, "User", "all");
		assert.ok(res);
		assert.equal(res.primary.kind, "class");
		assert.ok(res.others.some((s) => s.kind === "constructor"));
		assert.equal(res.tier, 0);
	});

	it("resolves Container.member", () => {
		const res = resolveSymbol(graph, "UserRepository.findById", "all");
		assert.ok(res);
		assert.equal(res.primary.name, "findById");
		assert.equal(res.primary.containerName, "UserRepository");
	});

	it("falls back to case-insensitive match", () => {
		const res = resolveSymbol(graph, "userrepository", "all");
		assert.ok(res);
		assert.equal(res.primary.name, "UserRepository");
		assert.equal(res.tier, 1);
	});

	it("still returns an out-of-scope exact match with a flag", () => {
		const res = resolveSymbol(graph, "CatalogService", "main");
		assert.ok(res);
		assert.equal(res.primary.name, "CatalogService");
		assert.equal(res.outOfScope, true);
	});
});

describe("usages → containing symbol", () => {
	it("picks the innermost containing symbol", () => {
		const usage = { uri: `file://${MAIN}/User.java`, range: { start: { line: 6, column: 1 }, end: { line: 6, column: 1 } } };
		assert.equal(containingSymbol(graph, usage)?.kind, "constructor");
	});

	it("picks a field over its containing class", () => {
		const usage = { uri: `file://${MAIN}/User.java`, range: { start: { line: 4, column: 1 }, end: { line: 4, column: 1 } } };
		assert.equal(containingSymbol(graph, usage)?.kind, "field");
	});

	it("returns undefined for files outside the index", () => {
		const usage = { uri: "file:///external/Dependency.java", range: { start: { line: 1, column: 1 }, end: { line: 1, column: 1 } } };
		assert.equal(containingSymbol(graph, usage), undefined);
	});

	it("maps a list of usages to symbols", () => {
		const usages = [
			{ uri: `file://${MAIN}/User.java`, range: { start: { line: 6, column: 1 }, end: { line: 6, column: 1 } } },
			{ uri: "file:///external/Dependency.java", range: { start: { line: 1, column: 1 }, end: { line: 1, column: 1 } } },
		];
		const resolved = resolveUsageSymbols(graph, usages);
		assert.equal(resolved[0].symbol?.kind, "constructor");
		assert.equal(resolved[1].symbol, undefined);
	});
});
