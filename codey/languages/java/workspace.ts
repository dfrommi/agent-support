import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const OWNER_FILE = "owner.json";

export interface JdtlsWorkspaceLease {
	readonly dataDir: string;
	readonly persistent: boolean;
	release(): Promise<void>;
}

interface LeaseOwner {
	token: string;
	pid: number;
	sessionId: string;
	projectRoot: string;
	startedAt: string;
}

export interface WorkspaceOptions {
	cacheRoot?: string;
	sessionId?: string;
}

/** Acquire a reusable JDTLS workspace, or create a private fallback. */
export async function acquireJdtlsWorkspace(root: string, options: WorkspaceOptions = {}): Promise<JdtlsWorkspaceLease> {
	const projectHash = crypto.createHash("sha1").update(root).digest("hex").slice(0, 12);
	const cacheRoot = options.cacheRoot ?? process.env.XDG_CACHE_HOME ?? path.join(os.homedir(), ".cache");
	const dataDir = path.join(cacheRoot, "codey", "jdtls", projectHash);
	const lockDir = `${dataDir}.lock`;
	const owner: LeaseOwner = {
		token: crypto.randomUUID(),
		pid: process.pid,
		sessionId: options.sessionId ?? process.env.PI_SESSION_ID ?? `pid-${process.pid}`,
		projectRoot: root,
		startedAt: new Date().toISOString(),
	};

	await fs.promises.mkdir(path.dirname(dataDir), { recursive: true });
	if (await acquireLock(lockDir, owner)) {
		return {
			dataDir,
			persistent: true,
			release: () => releaseLock(lockDir, owner.token),
		};
	}

	const privateDir = await fs.promises.mkdtemp(
		path.join(os.tmpdir(), `codey-jdtls-${projectHash}-${safeSessionId(owner.sessionId)}-`),
	);
	return {
		dataDir: privateDir,
		persistent: false,
		release: async () => {
			await fs.promises.rm(privateDir, { recursive: true, force: true });
		},
	};
}

async function acquireLock(lockDir: string, owner: LeaseOwner): Promise<boolean> {
	for (let attempt = 0; attempt < 2; attempt++) {
		try {
			await fs.promises.mkdir(lockDir);
			await fs.promises.writeFile(
				path.join(lockDir, OWNER_FILE),
				JSON.stringify(owner, null, 2),
				{ flag: "wx" },
			);
			return true;
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
			if (!(await removeDeadLock(lockDir))) return false;
		}
	}
	return false;
}

async function removeDeadLock(lockDir: string): Promise<boolean> {
	let owner: LeaseOwner;
	try {
		const text = await fs.promises.readFile(path.join(lockDir, OWNER_FILE), "utf8");
		owner = JSON.parse(text) as LeaseOwner;
	} catch {
		// A lock without owner metadata may be in the middle of creation. Do not
		// remove it and risk taking a live workspace from another process.
		return false;
	}

	if (isProcessAlive(owner.pid)) return false;
	await fs.promises.rm(lockDir, { recursive: true, force: true });
	return true;
}

function isProcessAlive(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch (error) {
		return (error as NodeJS.ErrnoException).code === "EPERM";
	}
}

async function releaseLock(lockDir: string, token: string): Promise<void> {
	try {
		const text = await fs.promises.readFile(path.join(lockDir, OWNER_FILE), "utf8");
		const owner = JSON.parse(text) as LeaseOwner;
		if (owner.token === token) {
			await fs.promises.rm(lockDir, { recursive: true, force: true });
		}
	} catch {
		// The lock may have been reclaimed after a crash or removed already.
	}
}

function safeSessionId(sessionId: string): string {
	return sessionId.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80) || `pid-${process.pid}`;
}
