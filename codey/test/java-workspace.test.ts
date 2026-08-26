import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { acquireJdtlsWorkspace } from "../languages/java/workspace.ts";

describe("JDTLS workspace leases", () => {
	it("reuses a free persistent workspace", async () => {
		const cacheRoot = await fs.mkdtemp(path.join(os.tmpdir(), "codey-workspace-test-"));
		const first = await acquireJdtlsWorkspace("/project", { cacheRoot, sessionId: "first" });
		assert.equal(first.persistent, true);
		const dataDir = first.dataDir;
		await first.release();

		const second = await acquireJdtlsWorkspace("/project", { cacheRoot, sessionId: "second" });
		assert.equal(second.persistent, true);
		assert.equal(second.dataDir, dataDir);
		await second.release();
		await fs.rm(cacheRoot, { recursive: true, force: true });
	});

	it("uses a private workspace while the persistent workspace is leased", async () => {
		const cacheRoot = await fs.mkdtemp(path.join(os.tmpdir(), "codey-workspace-test-"));
		const first = await acquireJdtlsWorkspace("/project", { cacheRoot, sessionId: "first" });
		const second = await acquireJdtlsWorkspace("/project", { cacheRoot, sessionId: "second" });
		assert.equal(second.persistent, false);
		assert.notEqual(second.dataDir, first.dataDir);
		await second.release();
		await first.release();
		await fs.rm(cacheRoot, { recursive: true, force: true });
	});
});
