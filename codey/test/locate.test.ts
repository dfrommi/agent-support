import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CodeGraph } from "../lib/graph.ts";
import { locateCallable } from "../lib/locate.ts";
import type { Symbol, SymbolKind } from "../lib/model.ts";

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

const FILE = "/p/src/main/java/com/example/Service.java";

const serviceClass = sym("service", "Service", "class", FILE, 1, 20);
const value = sym("value", "value", "field", FILE, 3, 3, "Service");
const outer = sym("outer", "outer", "method", FILE, 5, 15, "Service");
const inner = sym("inner", "inner", "method", FILE, 10, 12, "Service");
const otherClass = sym("other", "Other", "class", FILE, 30, 40);
const run = sym("run", "run", "method", FILE, 32, 34, "Other");

const graph = new CodeGraph([serviceClass, value, outer, inner, otherClass, run], [FILE]);

describe("locateCallable", () => {
	it("returns the outermost callable containing a line", () => {
		assert.equal(locateCallable(graph, FILE, { startLine: 11, endLine: 11 })?.id, "outer");
	});

	it("returns a callable whose range contains a line range", () => {
		assert.equal(locateCallable(graph, FILE, { startLine: 6, endLine: 14 })?.id, "outer");
	});

	it("returns null when the line is not inside a callable", () => {
		assert.equal(locateCallable(graph, FILE, { startLine: 3, endLine: 3 }), null);
	});

	it("returns null when a range spans multiple callables", () => {
		assert.equal(locateCallable(graph, FILE, { startLine: 10, endLine: 32 }), null);
	});

	it("honors the within qualifier (Class:line)", () => {
		const service = { startLine: serviceClass.location.range.start.line, endLine: serviceClass.location.range.end.line };
		assert.equal(locateCallable(graph, FILE, { startLine: 32, endLine: 32 }, service), null);
		assert.equal(locateCallable(graph, FILE, { startLine: 32, endLine: 32 })?.id, "run");
	});

	it("returns null when no callable matches", () => {
		assert.equal(locateCallable(graph, FILE, { startLine: 99, endLine: 99 }), null);
	});
});
