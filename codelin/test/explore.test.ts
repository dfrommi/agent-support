import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { explore } from "../explore.ts";
import { resetGraph } from "../backend.ts";
import { copyFixture } from "./helpers.ts";

const FIXTURE = copyFixture("fixture-ts");

afterEach(() => resetGraph());

describe("codelin explore", () => {
	describe("symbol mode", () => {
		it("returns line-numbered source for a function", async () => {
			const out = await explore(FIXTURE, "findUser");
			assert.match(out, /findUser/);
			// Read-parity: line numbers match the real file (findUser starts at line 6).
			assert.match(out, /\n6\texport function findUser/);
			assert.match(out, /```typescript/);
		});

		it("shows callees of a function", async () => {
			const out = await explore(FIXTURE, "getUser");
			assert.match(out, /findUser/);
			assert.match(out, /Calls →/);
		});

		it("shows callers of a function", async () => {
			const out = await explore(FIXTURE, "saveUser");
			assert.match(out, /createUser/);
			assert.match(out, /Called by ←/);
		});

		it("returns a container's own source when it has no indexed members", async () => {
			// `User` is an interface; codegraph indexes no member nodes for it, so
			// codelin falls back to the container's own (small) source.
			const out = await explore(FIXTURE, "User");
			assert.match(out, /interface/);
			assert.match(out, /\n1\texport interface User/);
		});
	});

	describe("file mode", () => {
		it("returns a file Read-parity when queried by path", async () => {
			const out = await explore(FIXTURE, "src/repo.ts");
			assert.match(out, /\*\*src\/repo\.ts\*\*/);
			assert.match(out, /\n1\t/);
			assert.match(out, /findUser/);
		});
	});

	describe("flow mode", () => {
		it("finds the call path between two symbols", async () => {
			const out = await explore(FIXTURE, "run findUser");
			assert.match(out, /Call path/);
			assert.match(out, /run/);
			assert.match(out, /findUser/);
		});
	});

	describe("fallback", () => {
		it("does a literal text search when nothing is indexed", async () => {
			const out = await explore(FIXTURE, "zzzznonexistent");
			assert.equal(out, "(no matches)");
		});
	});
});
