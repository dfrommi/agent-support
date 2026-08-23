import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Symbol, SymbolKind } from "../lib/model.ts";
import { groupUsages, rankUsages, sampleUsages, type ResolvedUsage } from "../lib/usages.ts";

const DEF = "/p/src/main/java/com/example/UserRepository.java";
const OTHER = "/p/src/main/java/com/example/UserService.java";

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

function usage(line: number, file: string, symbol?: Symbol, column = 1): ResolvedUsage {
	return {
		location: {
			uri: `file://${file}`,
			range: { start: { line, column }, end: { line, column } },
		},
		symbol,
	};
}

const callerA = sym("a", "callerA", "method", OTHER, 10, "ServiceA");
const callerB = sym("b", "callerB", "method", DEF, 20, "Repository");

describe("groupUsages", () => {
	it("collapses repeated call sites of the same symbol", () => {
		const groups = groupUsages([usage(1, OTHER, callerA), usage(2, OTHER, callerA)]);
		assert.equal(groups.length, 1);
		assert.equal(groups[0].symbol?.id, "a");
		assert.equal(groups[0].count, 2);
	});

	it("collapses external references (no symbol) by file:line", () => {
		const groups = groupUsages([usage(5, OTHER), usage(5, OTHER)]);
		assert.equal(groups.length, 1);
		assert.equal(groups[0].symbol, undefined);
		assert.equal(groups[0].count, 2);
	});

	it("keys by symbol id, not location", () => {
		const groups = groupUsages([usage(7, OTHER, callerA), usage(7, OTHER, callerB)]);
		assert.equal(groups.length, 2);
	});

	it("keeps a symbol distinct from an external ref at the same file:line", () => {
		const groups = groupUsages([usage(7, OTHER, callerA), usage(7, OTHER)]);
		assert.equal(groups.length, 2);
	});
});

describe("rankUsages", () => {
	it("ranks call sites outside the defining file first", () => {
		const groups = groupUsages([
			usage(1, DEF, callerB), // same file
			usage(2, OTHER, callerA), // different file
		]);
		const ranked = rankUsages(groups, DEF);
		assert.equal(ranked[0].symbol?.id, "a");
		assert.equal(ranked[1].symbol?.id, "b");
	});

	it("orders by line within the same file", () => {
		const groups = groupUsages([usage(9, DEF, callerB), usage(3, DEF, callerA)]);
		const ranked = rankUsages(groups, DEF);
		assert.equal(ranked[0].location.range.start.line, 3);
		assert.equal(ranked[1].location.range.start.line, 9);
	});

	it("ranks callable-context usages above module-level references", () => {
		const fieldSym = sym("f", "holder", "field", OTHER, 5, "Holder");
		const groups = groupUsages([usage(1, OTHER), usage(2, OTHER, callerA), usage(3, OTHER, fieldSym)]);
		const ranked = rankUsages(groups, DEF);
		assert.deepEqual(
			ranked.map((g) => g.symbol?.id ?? g.location.range.start.line),
			["a", "f", 1],
		);
	});

	it("does not mutate its input", () => {
		const groups = groupUsages([usage(2, OTHER, callerA), usage(1, DEF, callerB)]);
		const before = groups.map((g) => g.location.range.start.line);
		rankUsages(groups, DEF);
		assert.deepEqual(groups.map((g) => g.location.range.start.line), before);
	});
});

describe("sampleUsages", () => {
	it("caps the sample and reports the hidden count", () => {
		const usages = [1, 2, 3, 4, 5, 6, 7].map((l) => usage(l, OTHER));
		const { shown, hidden } = sampleUsages(usages, DEF, 5);
		assert.equal(shown.length, 5);
		assert.equal(hidden, 2);
	});

	it("returns all groups when under the cap", () => {
		const usages = [1, 2, 3].map((l) => usage(l, OTHER));
		const { shown, hidden } = sampleUsages(usages, DEF, 5);
		assert.equal(shown.length, 3);
		assert.equal(hidden, 0);
	});
});
