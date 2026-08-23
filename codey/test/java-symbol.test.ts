import fs from "node:fs";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createGraph } from "../lib/graph.ts";
import { getGraph, resetGraphs } from "../lib/session.ts";
import { JavaAdapter } from "../languages/java/adapter.ts";

const FIXTURE = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixture-java");

describe("java symbol lookup (LSP)", () => {
	it("finds a class by exact name", async () => {
		const adapter = await JavaAdapter.connect(FIXTURE);
		try {
			const graph = await createGraph(FIXTURE, adapter);
			const classes = graph.symbol("User").filter((s) => s.kind === "class");
			assert.equal(classes.length, 1);
			assert.ok(classes[0].file.endsWith("User.java"));
		} finally {
			await adapter.close();
		}
	});

	it("finds a method with its container and signature", async () => {
		const adapter = await JavaAdapter.connect(FIXTURE);
		try {
			const graph = await createGraph(FIXTURE, adapter);
			const matches = graph.symbol("findById");
			assert.equal(matches.length, 1);
			assert.equal(matches[0].kind, "method");
			assert.equal(matches[0].containerName, "UserRepository");
			assert.ok(matches[0].signature?.includes("findById"));
		} finally {
			await adapter.close();
		}
	});

	it("finds a private method (beyond workspace/symbol coverage)", async () => {
		const adapter = await JavaAdapter.connect(FIXTURE);
		try {
			const graph = await createGraph(FIXTURE, adapter);
			const matches = graph.symbol("validateId");
			assert.equal(matches.length, 1);
			assert.equal(matches[0].kind, "method");
			assert.equal(matches[0].containerName, "UserService");
		} finally {
			await adapter.close();
		}
	});

	it("anchors id and name range at the name line, not the Javadoc", async () => {
		const adapter = await JavaAdapter.connect(FIXTURE);
		try {
			const graph = await createGraph(FIXTURE, adapter);
			const sym = graph.symbol("findById")[0];
			assert.ok(sym.location.nameRange.start.line > sym.location.range.start.line);
			assert.ok(sym.id.endsWith(`findById:${sym.location.nameRange.start.line}`));
		} finally {
			await adapter.close();
		}
	});

	it("reports file and symbol counts", async () => {
		const adapter = await JavaAdapter.connect(FIXTURE);
		try {
			const graph = await createGraph(FIXTURE, adapter);
			const stats = graph.stats();
			assert.equal(stats.files, 5);
			assert.ok(stats.symbols > 0);
		} finally {
			await adapter.close();
		}
	});
});

describe("common-layer queries", () => {
	it("fuzzy-finds symbols by case-insensitive substring", async () => {
		const adapter = await JavaAdapter.connect(FIXTURE);
		try {
			const graph = await createGraph(FIXTURE, adapter);
			const names = graph.find("user").list().map((s) => s.name);
			assert.ok(names.includes("UserService"));
			assert.ok(names.includes("findUser"));
			assert.ok(names.every((n) => n.toLowerCase().includes("user")));
		} finally {
			await adapter.close();
		}
	});

	it("filters by kind and path", async () => {
		const adapter = await JavaAdapter.connect(FIXTURE);
		try {
			const graph = await createGraph(FIXTURE, adapter);
			const methods = graph.find("find").where("method").inPath("**/UserService.java").list();
			const names = methods.map((s) => s.name);
			assert.ok(names.includes("findUser"));
			assert.ok(!names.includes("findById")); // in UserRepository.java, excluded by path
			assert.ok(methods.every((s) => s.kind === "method"));
		} finally {
			await adapter.close();
		}
	});
});

describe("common-layer navigation", () => {
	it("lists members of a class", async () => {
		const adapter = await JavaAdapter.connect(FIXTURE);
		try {
			const graph = await createGraph(FIXTURE, adapter);
			const names = graph.members("UserService").list().map((s) => s.name);
			assert.ok(names.includes("findUser"));
			assert.ok(names.includes("createUser"));
			assert.ok(names.includes("validateId"));
			assert.ok(names.includes("repository"));
		} finally {
			await adapter.close();
		}
	});

	it("lists symbols in a file", async () => {
		const adapter = await JavaAdapter.connect(FIXTURE);
		try {
			const graph = await createGraph(FIXTURE, adapter);
			const names = graph.file("UserRepository.java").list().map((s) => s.name);
			assert.ok(names.includes("UserRepository"));
			assert.ok(names.includes("findById"));
			assert.ok(names.includes("save"));
		} finally {
			await adapter.close();
		}
	});
});

describe("tree-sitter enrichment", () => {
	it("attaches Javadoc to a method", async () => {
		const adapter = await JavaAdapter.connect(FIXTURE);
		try {
			const graph = await createGraph(FIXTURE, adapter);
			const sym = graph.symbol("findById")[0];
			assert.ok(sym.doc?.includes("Finds a user by id"));
		} finally {
			await adapter.close();
		}
	});

	it("attaches annotations to a method", async () => {
		const adapter = await JavaAdapter.connect(FIXTURE);
		try {
			const graph = await createGraph(FIXTURE, adapter);
			const sym = graph.symbol("auditLog")[0];
			assert.ok(sym.annotations?.includes("@Deprecated"));
		} finally {
			await adapter.close();
		}
	});
});

describe("java find usages (LSP)", () => {
	it("rejects an ambiguous name and lists candidates", async () => {
		const adapter = await JavaAdapter.connect(FIXTURE);
		try {
			const graph = await createGraph(FIXTURE, adapter);
			// "User" matches the class and its constructor.
			await assert.rejects(graph.findUsages("User"), /narrow with kind\/container\/signature/);
		} finally {
			await adapter.close();
		}
	});

	it("resolves an ambiguous name with a selector", async () => {
		const adapter = await JavaAdapter.connect(FIXTURE);
		try {
			const graph = await createGraph(FIXTURE, adapter);
			const usages = await graph.findUsages("User", { kind: "class" });
			assert.ok(usages.length >= 1);
		} finally {
			await adapter.close();
		}
	});

	it("finds usages of a method", async () => {
		const adapter = await JavaAdapter.connect(FIXTURE);
		try {
			const graph = await createGraph(FIXTURE, adapter);
			const usages = await graph.findUsages("findById");
			assert.ok(usages.length >= 1);
			assert.ok(usages.some((u) => u.uri.endsWith("UserService.java")));
		} finally {
			await adapter.close();
		}
	});

	it("finds usages of a private method", async () => {
		const adapter = await JavaAdapter.connect(FIXTURE);
		try {
			const graph = await createGraph(FIXTURE, adapter);
			const usages = await graph.findUsages("validateId");
			assert.ok(usages.length >= 1);
			assert.ok(usages.some((u) => u.uri.endsWith("UserService.java")));
		} finally {
			await adapter.close();
		}
	});
});

describe("cached graph", () => {
	it("reindexes changed files through the running adapter", async () => {
		const userServicePath = path.join(FIXTURE, "src/main/java/com/example/UserService.java");
		const original = fs.readFileSync(userServicePath, "utf8");
		try {
			const before = await getGraph(FIXTURE, JavaAdapter.connect);
			assert.equal(before.symbol("ping").length, 0);

			fs.writeFileSync(
				userServicePath,
				original.replace(
					"private void auditLog",
					"public void ping() { return; }\n\n    private void auditLog",
				),
			);

			const after = await getGraph(FIXTURE, JavaAdapter.connect);
			assert.equal(after.symbol("ping").length, 1);
			assert.equal(after.symbol("ping")[0].kind, "method");
		} finally {
			fs.writeFileSync(userServicePath, original);
			await resetGraphs();
		}
	});
});
