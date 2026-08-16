import assert from "node:assert/strict";
import { chmodSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";
import { explore, recallWords } from "../explore.ts";
import { resetGraph } from "../backend.ts";
import { copyFixture } from "./helpers.ts";

const FIXTURE = copyFixture("fixture-ts");

afterEach(() => resetGraph());

/** Write a throwaway executable that emits a canned planner JSON, and point CODELIN_NL_QUERY at it. */
function fakeNlBinary(json: string): string {
	const bin = path.join(os.tmpdir(), `codelin-nl-${process.pid}-${Math.random().toString(36).slice(2)}.sh`);
	writeFileSync(bin, `#!/bin/sh\nprintf '%s' '${json}'`);
	chmodSync(bin, 0o755);
	return bin;
}

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

		it("routes prose queries to segment co-occurrence, not FTS token matches", async () => {
			// "save user" must map to saveUser (name contains both prose words),
			// and must NOT drag in the User interface just because "user" is a token.
			const out = await explore(FIXTURE, "save user");
			assert.match(out, /\*\*saveUser\*\*/);
			assert.doesNotMatch(out, /\*\*User\*\* \(/);
		});

		it("stems prose words for deterministic segment matching", async () => {
			// "finding" has no segment in the fixture, but its stem "find" does.
			const out = await explore(FIXTURE, "finding user");
			assert.match(out, /\*\*findUser\*\*/);
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

		it("shows both endpoints when no static path exists", async () => {
			const out = await explore(FIXTURE, "findUser saveUser");
			assert.match(out, /No static call path/);
			assert.match(out, /\*\*findUser\*\*/);
			assert.match(out, /\*\*saveUser\*\*/);
		});
	});

	describe("fallback", () => {
		it("does a literal text search when nothing is indexed", async () => {
			const out = await explore(FIXTURE, "zzzznonexistent");
			assert.equal(out, "(no matches)");
		});
	});

	describe("nl planner", () => {
		it("routes prose to a call path via the optional planner", async () => {
			const bin = fakeNlBinary('{"intent":"path","selected":"run,findUser","reasoning":"test"}');
			process.env.CODELIN_NL_QUERY = bin;
			process.env.CODELIN_NL_ENABLED = "1";
			try {
				const out = await explore(FIXTURE, "save user");
				assert.match(out, /Call path/);
				assert.match(out, /findUser/);
			} finally {
				delete process.env.CODELIN_NL_QUERY;
				delete process.env.CODELIN_NL_ENABLED;
				rmSync(bin, { force: true });
			}
		});

		it("routes prose to a selected symbol via the optional planner", async () => {
			const bin = fakeNlBinary('{"intent":"symbol","selected":"findUser","reasoning":"test"}');
			process.env.CODELIN_NL_QUERY = bin;
			process.env.CODELIN_NL_ENABLED = "1";
			try {
				const out = await explore(FIXTURE, "save user");
				assert.match(out, /\*\*findUser\*\*/);
			} finally {
				delete process.env.CODELIN_NL_QUERY;
				delete process.env.CODELIN_NL_ENABLED;
				rmSync(bin, { force: true });
			}
		});

		it("falls back to heuristics when the planner selects nothing", async () => {
			const bin = fakeNlBinary('{"intent":"none","selected":"","reasoning":"test"}');
			process.env.CODELIN_NL_QUERY = bin;
			process.env.CODELIN_NL_ENABLED = "1";
			try {
				const out = await explore(FIXTURE, "save user");
				assert.match(out, /\*\*saveUser\*\*/);
			} finally {
				delete process.env.CODELIN_NL_QUERY;
				delete process.env.CODELIN_NL_ENABLED;
				rmSync(bin, { force: true });
			}
		});

		it("strips the planner's (kind) suffix when resolving selections", async () => {
			const bin = fakeNlBinary('{"intent":"path","selected":"run (function),findUser (function)","reasoning":"test"}');
			process.env.CODELIN_NL_QUERY = bin;
			process.env.CODELIN_NL_ENABLED = "1";
			try {
				const out = await explore(FIXTURE, "save user");
				assert.match(out, /Call path/);
				assert.match(out, /findUser/);
			} finally {
				delete process.env.CODELIN_NL_QUERY;
				delete process.env.CODELIN_NL_ENABLED;
				rmSync(bin, { force: true });
			}
		});

		it("ignores the planner when not explicitly enabled", async () => {
			const bin = fakeNlBinary('{"intent":"path","selected":"run,findUser","reasoning":"test"}');
			process.env.CODELIN_NL_QUERY = bin; // binary present, but not opted in
			try {
				const out = await explore(FIXTURE, "save user");
				assert.match(out, /\*\*saveUser\*\*/); // deterministic result
				assert.doesNotMatch(out, /Call path/); // planner path NOT taken
			} finally {
				delete process.env.CODELIN_NL_QUERY;
				rmSync(bin, { force: true });
			}
		});
	});

	describe("recall words", () => {
		it("stems inflectional suffixes for segment recall", () => {
			assert.ok(recallWords("planning").includes("plan"));
			assert.ok(recallWords("reaches").includes("reach"));
			assert.ok(recallWords("running").includes("run"));
			assert.ok(recallWords("users").includes("user"));
			assert.ok(!recallWords("class").includes("clas")); // -ss is not stripped
		});
	});
});
