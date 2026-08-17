import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";
import { callgraph } from "../explore.ts";
import { resetGraph } from "../backend.ts";
import { copyFixture } from "./helpers.ts";

const JAVA = copyFixture("fixture-java");
const TS = copyFixture("fixture-ts");
const HEX = copyFixture("fixture-hex");

afterEach(() => resetGraph());

describe("codelin callgraph tool", () => {
	describe("path (from + to)", () => {
		it("finds a static call path between two methods", async () => {
			const out = await callgraph(TS, { from: "getUser", to: "findUser" });
			assert.match(out, /getUser → findUser/);
			assert.match(out, /calls · .* · high/);
		});

		it("traces from a member-qualified source symbol", async () => {
			const out = await callgraph(JAVA, { from: "PartnerProductController.createProduct", to: "CatalogService", maxDepth: 8 });
			assert.match(out, /createProduct → CatalogService/);
		});

		it("reports when no static path exists", async () => {
			const out = await callgraph(TS, { from: "findUser", to: "saveUser" });
			assert.match(out, /No static path/);
		});
	});

	describe("@http entry points", () => {
		it("traces an HTTP endpoint to a symbol through controller and interface", async () => {
			const out = await callgraph(JAVA, { from: "@http", to: "CatalogService", maxDepth: 8 });
			assert.match(out, /POST \/partner\/v2\/products → CatalogService/);
			assert.match(out, /PartnerProductController\.createProduct/);
			assert.match(out, /CatalogService\.createProduct/);
		});

		it("covers every member of a multi-method target, not just the first hit", async () => {
			const out = await callgraph(JAVA, { from: "@http", to: "CatalogService", maxDepth: 8 });
			assert.match(out, /CatalogService\.createProduct/);
			assert.match(out, /CatalogService\.updateProduct/);
		});

		it("calls out members of a target with no path from @http", async () => {
			const out = await callgraph(JAVA, { from: "@http", to: "CatalogService", maxDepth: 8 });
			assert.match(out, /No path from .* to CatalogService\.deleteProduct/);
		});

		it("composes a deep hexagonal path through two interface dispatches", async () => {
			const out = await callgraph(HEX, { from: "@http", to: "CatalogService", maxDepth: 12 });
			assert.match(out, /ProductPersistencePort\.addProduct/);
			assert.match(out, /ProductPersistenceService\.addProduct/);
			assert.match(out, /CatalogService\.createProduct/);
			assert.match(out, /interface dispatch/);
		});

		it("stops at the first member of a target instead of tracing internal calls", async () => {
			const out = await callgraph(HEX, { from: "@http", to: "ProductService", maxDepth: 12 });
			assert.match(out, /→ ProductService\.add\*\*/);
			assert.doesNotMatch(out, /→ ProductService\.addProduct/);
			assert.match(out, /No path from .* to ProductService\.addProduct/);
		});

		it("flags interface→implementation dispatch as inferred", async () => {
			const out = await callgraph(JAVA, { from: "PartnerProductController", to: "CatalogServiceImpl", maxDepth: 8 });
			assert.match(out, /inferred · interface dispatch/);
		});
	});

	describe("expansion", () => {
		it("lists what a symbol reaches (forward)", async () => {
			const out = await callgraph(TS, { from: "run", maxDepth: 4 });
			assert.match(out, /run\*\* reaches/);
			assert.match(out, /getUser/);
		});

		it("lists what reaches a symbol (backward)", async () => {
			const out = await callgraph(TS, { to: "findUser" });
			assert.match(out, /findUser\*\* is reached by/);
			assert.match(out, /getUser/);
		});
	});

	describe("safety", () => {
		it("fails instead of returning partial results when the traversal budget is exhausted", async () => {
			const root = fs.mkdtempSync(path.join(os.tmpdir(), "codelin-fanout-"));
			try {
				const srcDir = path.join(root, "src/main/java/com/example");
				fs.mkdirSync(srcDir, { recursive: true });
				fs.writeFileSync(path.join(root, "build.gradle"), "");
				const calls = Array.from({ length: 300 }, (_, i) => `        leaf${i}();`).join("\n");
				const decls = Array.from({ length: 300 }, (_, i) => `    private void leaf${i}() {}`).join("\n");
				fs.writeFileSync(path.join(srcDir, "FanoutController.java"), `package com.example;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class FanoutController {
    @GetMapping("/api")
    public String handle() {
${calls}
        return "ok";
    }

${decls}
}
`);
				fs.writeFileSync(path.join(srcDir, "UnreachableTarget.java"), `package com.example;

public class UnreachableTarget {
    public void target() {}
}
`);
				const out = await callgraph(root, { from: "@http", to: "UnreachableTarget", maxDepth: 12 });
				assert.match(out, /Traversal budget exhausted/);
			} finally {
				fs.rmSync(root, { recursive: true, force: true });
			}
		});
	});

	describe("validation", () => {
		it("requires at least one of from/to", async () => {
			const out = await callgraph(TS, {});
			assert.match(out, /at least one of `from` or `to`/);
		});

		it("rejects unknown entry-point roots", async () => {
			const out = await callgraph(TS, { from: "@bogus" });
			assert.match(out, /Unknown entry-point root/);
		});

		it("reports an unmatched symbol", async () => {
			const out = await callgraph(TS, { from: "zzzznonexistent" });
			assert.match(out, /No indexed symbol/);
		});
	});
});
