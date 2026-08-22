import { execSync } from "node:child_process";
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createGraph } from "../lib/graph.ts";
import { RustAdapter } from "../languages/rust/adapter.ts";

const FIXTURE = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixture-rust");

let adapter: RustAdapter;

before(async () => {
	// Build once so rust-analyzer's initial workspace load is fast and stable.
	execSync("cargo check", { cwd: FIXTURE, timeout: 30_000 });
	adapter = await RustAdapter.connect(FIXTURE);
	await createGraph(FIXTURE, adapter); // warm up: the first index is the cold one
});

after(async () => {
	await adapter.close();
});

describe("rust symbol lookup (LSP)", () => {
	it("finds a struct by exact name", async () => {
		const graph = await createGraph(FIXTURE, adapter);
		const structs = graph.symbol("User").filter((s) => s.kind === "struct");
		assert.equal(structs.length, 1);
		assert.ok(structs[0].file.endsWith("lib.rs"));
	});

	it("finds a method with its container and signature", async () => {
		const graph = await createGraph(FIXTURE, adapter);
		const matches = graph.symbol("greet");
		assert.equal(matches.length, 1);
		assert.equal(matches[0].kind, "method");
		assert.equal(matches[0].containerName, "User");
		assert.ok(matches[0].signature?.includes("fn(&self)"));
	});

	it("classifies associated and free functions as function", async () => {
		const graph = await createGraph(FIXTURE, adapter);
		const news = graph.symbol("new");
		assert.ok(news.some((s) => s.kind === "function" && s.containerName === "User"));

		const free = graph.symbol("format_message");
		assert.equal(free.length, 1);
		assert.equal(free[0].kind, "function");
		assert.equal(free[0].containerName, undefined);
	});

	it("finds a trait", async () => {
		const graph = await createGraph(FIXTURE, adapter);
		const traits = graph.symbol("Auditable");
		assert.equal(traits.length, 1);
		assert.equal(traits[0].kind, "trait");
	});

	it("reports file and symbol counts", async () => {
		const graph = await createGraph(FIXTURE, adapter);
		const stats = graph.stats();
		assert.equal(stats.files, 1);
		assert.ok(stats.symbols >= 18);
	});
});

describe("common-layer queries (Rust)", () => {
	it("lists members of a struct", async () => {
		const graph = await createGraph(FIXTURE, adapter);
		const names = graph.members("User").list().map((s) => s.name);
		assert.ok(names.includes("id"));
		assert.ok(names.includes("name"));
		assert.ok(names.includes("new"));
		assert.ok(names.includes("greet"));
	});

	it("lists symbols in a file", async () => {
		const graph = await createGraph(FIXTURE, adapter);
		const names = graph.file("lib.rs").list().map((s) => s.name);
		assert.ok(names.includes("User"));
		assert.ok(names.includes("format_message"));
		assert.ok(names.includes("find_by_id"));
	});
});

describe("tree-sitter enrichment (Rust)", () => {
	it("attaches attributes to a struct", async () => {
		const graph = await createGraph(FIXTURE, adapter);
		const sym = graph.symbol("User")[0];
		assert.ok(sym.annotations?.some((a) => a.includes("derive")));
	});

	it("attaches a doc comment to a function", async () => {
		const graph = await createGraph(FIXTURE, adapter);
		const sym = graph.symbol("format_message")[0];
		assert.ok(sym.doc?.includes("Formats a greeting"));
	});
});

describe("rust find usages (LSP)", () => {
	it("finds usages of a free function", async () => {
		const graph = await createGraph(FIXTURE, adapter);
		const usages = await graph.findUsages("format_message");
		assert.ok(usages.length >= 1);
		assert.ok(usages.some((u) => u.uri.endsWith("lib.rs")));
	});

	it("finds usages of a helper function", async () => {
		const graph = await createGraph(FIXTURE, adapter);
		const usages = await graph.findUsages("validate_id");
		assert.ok(usages.length >= 1);
		assert.ok(usages.some((u) => u.uri.endsWith("lib.rs")));
	});
});

describe("rust outgoing calls (LSP)", () => {
	it("resolves callees of a function", async () => {
		const graph = await createGraph(FIXTURE, adapter);
		const callees = await graph.calleesOf(graph.symbol("format_message")[0]);
		assert.ok(callees.some((c) => c.name === "build_greeting"));
	});
});
