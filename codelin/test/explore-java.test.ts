import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { explore } from "../explore.ts";
import { resetGraph } from "../backend.ts";
import { copyFixture } from "./helpers.ts";

const FIXTURE = copyFixture("fixture-java");

afterEach(() => resetGraph());

describe("codelin explore (java)", () => {
	it("returns a member outline for a class", async () => {
		const out = await explore(FIXTURE, "UserService");
		assert.match(out, /Members/);
		assert.match(out, /findUser/);
		assert.match(out, /validateId/);
	});

	it("returns a method body with read-parity line numbers", async () => {
		const out = await explore(FIXTURE, "findUser");
		assert.match(out, /findUser/);
		assert.match(out, /repository\.findById/);
		assert.match(out, /\n\d+\t/);
	});
});
