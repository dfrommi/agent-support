import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { LanguageAdapter } from "../lib/adapter.ts";
import { CodeGraph } from "../lib/graph.ts";
import type { Location, Symbol, SymbolKind } from "../lib/model.ts";

function sym(id: string, name: string, kind: SymbolKind, file: string, start: number, end: number, container?: string): Symbol {
	return {
		id,
		name,
		kind,
		file,
		location: {
			uri: `file://${file}`,
			range: { start: { line: start, column: 1 }, end: { line: end, column: 1 } },
			nameRange: { start: { line: start, column: 1 }, end: { line: start, column: 1 + name.length } },
		},
		containerName: container,
	};
}

function loc(uri: string, line: number): Location {
	return { uri, range: { start: { line, column: 1 }, end: { line, column: 1 } } };
}

const FILE = "/p/src/main/java/com/example/Repo.java";
const IMPL = "/p/src/main/java/com/example/RepoImpl.java";

const repoIface = sym("iface", "Repo", "interface", FILE, 3, 5);
const repoFind = sym("iface-find", "find", "method", FILE, 4, 4, "Repo");
const repoImpl = sym("impl", "RepoImpl", "class", IMPL, 3, 6);
const implFind = sym("impl-find", "find", "method", IMPL, 4, 5, "RepoImpl");

const SYMBOLS = [repoIface, repoFind, repoImpl, implFind];
const FILES = [FILE, IMPL];

function adapter(implementations: (s: Symbol) => Promise<Location[]>): LanguageAdapter {
	return {
		languageId: "java",
		discoverSourceFiles: async () => FILES,
		indexSymbols: async () => SYMBOLS,
		findUsages: async () => [],
		implementations,
		callees: async () => [],
		close: async () => {},
	};
}

describe("implementationsOf", () => {
	it("resolves a type's implementer to a canonical symbol", async () => {
		const graph = new CodeGraph(SYMBOLS, FILES, adapter(async (s) => (s.id === "iface" ? [loc(`file://${IMPL}`, 3)] : [])));
		const impls = await graph.implementationsOf(repoIface);
		assert.deepEqual(impls.map((s) => s.id), ["impl"]);
	});

	it("resolves a method's override", async () => {
		const graph = new CodeGraph(SYMBOLS, FILES, adapter(async (s) => (s.id === "iface-find" ? [loc(`file://${IMPL}`, 4)] : [])));
		const impls = await graph.implementationsOf(repoFind);
		assert.deepEqual(impls.map((s) => s.id), ["impl-find"]);
	});

	it("dedupes repeated locations by id", async () => {
		const graph = new CodeGraph(SYMBOLS, FILES, adapter(async () => [loc(`file://${IMPL}`, 3), loc(`file://${IMPL}`, 3)]));
		const impls = await graph.implementationsOf(repoIface);
		assert.equal(impls.length, 1);
		assert.equal(impls[0].id, "impl");
	});

	it("falls back to name + file for reference anchors", async () => {
		// A Rust-style `impl Repo for RepoImpl` anchor is not inside any symbol range.
		const cand = { ...loc(`file://${IMPL}`, 7), name: "RepoImpl" };
		const graph = new CodeGraph(SYMBOLS, FILES, adapter(async () => [cand]));
		const impls = await graph.implementationsOf(repoIface);
		assert.deepEqual(impls.map((s) => s.id), ["impl"]);
	});

	it("normalizes generic self types and matches across files", async () => {
		// `impl<T> Repo<T> for RepoImpl<T>`: the anchor name carries generics and
		// lives in a different file than the RepoImpl declaration.
		const cand = { ...loc(`file://${FILE}`, 7), name: "RepoImpl<T>" };
		const graph = new CodeGraph(SYMBOLS, FILES, adapter(async () => [cand]));
		const impls = await graph.implementationsOf(repoIface);
		assert.deepEqual(impls.map((s) => s.id), ["impl"]);
	});

	it("excludes the queried symbol itself", async () => {
		// `implementation` on a struct can return the struct's own name anchor.
		const graph = new CodeGraph(SYMBOLS, FILES, adapter(async () => [loc(`file://${FILE}`, 3)]));
		assert.deepEqual(await graph.implementationsOf(repoIface), []);
	});
});
