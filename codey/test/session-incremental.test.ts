import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import type { LanguageAdapter } from "../lib/adapter.ts";
import { getGraph, resetGraphs } from "../lib/session.ts";
import type { Symbol } from "../lib/model.ts";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "session-incr-"));

const aFile = path.join(tmp, "a.rs");
const bFile = path.join(tmp, "b.rs");

// The fake adapter's discoverable file set, mutated per test.
let currentFiles: string[] = [];
let indexCalls: string[][] = [];

function symbolFor(file: string): Symbol {
	const name = path.basename(file).replace(/\.rs$/, "");
	return {
		id: `${file}:${name}:1`,
		name,
		kind: "function",
		file,
		location: {
			uri: `file://${file}`,
			range: { start: { line: 1, column: 1 }, end: { line: 1, column: 1 } },
			nameRange: { start: { line: 1, column: 1 }, end: { line: 1, column: 1 } },
		},
	};
}

function makeAdapter(): LanguageAdapter {
	return {
		languageId: "test",
		discoverSourceFiles: async () => [...currentFiles],
		indexSymbols: async (_root, files) => {
			indexCalls.push([...files]);
			return files.map(symbolFor);
		},
		findUsages: async () => [],
		implementations: async () => [],
		callees: async () => [],
		close: async () => {},
	};
}
const factory = async () => makeAdapter();

function write(file: string, content: string): void {
	fs.writeFileSync(file, content);
	// Ensure a distinct mtime even if the write lands in the same millisecond.
	const now = Date.now();
	fs.utimesSync(file, new Date(now), new Date(now + 1000));
}

before(() => {
	write(aFile, "a");
	write(bFile, "b");
});

after(async () => {
	await resetGraphs();
	fs.rmSync(tmp, { recursive: true, force: true });
});

describe("getGraph incremental re-index", () => {
	it("indexes only changed files and preserves unchanged symbols", async () => {
		await resetGraphs();
		currentFiles = [aFile, bFile];
		indexCalls = [];

		const first = await getGraph(tmp, factory);
		assert.equal(indexCalls.length, 1);

		write(aFile, "a2");

		const second = await getGraph(tmp, factory);
		assert.equal(indexCalls.length, 2);
		assert.deepEqual(indexCalls[1], [aFile]); // only the changed file

		// b was not re-indexed; the stale a symbol was replaced, not duplicated.
		assert.equal(second.symbols.length, 2);
		assert.equal(second.symbol("a").length, 1);
		assert.equal(second.symbol("b").length, 1);
	});

	it("drops symbols of removed files without re-indexing", async () => {
		await resetGraphs();
		currentFiles = [aFile, bFile];
		indexCalls = [];

		await getGraph(tmp, factory);
		assert.equal(indexCalls.length, 1);

		currentFiles = [aFile]; // b.rs disappears from discovery
		const second = await getGraph(tmp, factory);

		assert.equal(indexCalls.length, 1); // removals need no index call
		assert.deepEqual(second.symbols.map((s) => s.name).sort(), ["a"]);
	});

	it("indexes newly added files", async () => {
		await resetGraphs();
		currentFiles = [aFile];
		indexCalls = [];

		await getGraph(tmp, factory);

		const cFile = path.join(tmp, "c.rs");
		write(cFile, "c");
		currentFiles = [aFile, cFile];

		const second = await getGraph(tmp, factory);
		assert.equal(indexCalls.length, 2);
		assert.deepEqual(indexCalls[1], [cFile]); // only the new file
		assert.deepEqual(second.symbols.map((s) => s.name).sort(), ["a", "c"]);
	});
});
