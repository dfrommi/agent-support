import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { explore } from "../explore.ts";
import { resetGraph } from "../backend.ts";
import { copyFixture } from "./helpers.ts";

const FIXTURE = copyFixture("fixture-ts");

afterEach(() => resetGraph());

describe("codelin code tool (ts)", () => {
	describe("symbol mode", () => {
		it("returns line-numbered source for a function", async () => {
			const out = await explore(FIXTURE, "findUser");
			assert.match(out, /findUser/);
			assert.match(out, /\n6\texport function findUser/);
			assert.match(out, /```typescript/);
		});

		it("shows callers of a function", async () => {
			const out = await explore(FIXTURE, "findUser");
			assert.match(out, /Called by ←/);
			assert.match(out, /getUser/);
		});

		it("returns a container's own source when it has no indexed members", async () => {
			const out = await explore(FIXTURE, "User");
			assert.match(out, /interface/);
			assert.match(out, /\n1\texport interface User/);
		});

		it("lists a case-insensitive type alternative when a field matches exactly", async () => {
			const out = await explore(FIXTURE, "User");
			assert.match(out, /\*\*User\*\*/);
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

	describe("fallback", () => {
		it("does a literal text search when nothing is indexed", async () => {
			const out = await explore(FIXTURE, "zzzznonexistent");
			assert.equal(out, "(no matches)");
		});

		it("renders the literal-match fallback with repo-relative paths", async () => {
			const out = await explore(FIXTURE, "crypto.randomUUID");
			assert.match(out, /^Literal matches/);
			assert.match(out, /src\/service\.ts:\d+/);
			assert.ok(!out.includes(FIXTURE), "fallback output must not contain absolute paths");
		});

		it("points a multi-word query at callgraph instead of guessing", async () => {
			const out = await explore(FIXTURE, "run findUser");
			assert.match(out, /callgraph/);
		});
	});
});
