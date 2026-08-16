import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)));

/** Copy a fixture directory into a temp dir so indexing never touches the repo. */
export function copyFixture(name: string): string {
	const src = path.join(FIXTURES, name);
	const dst = path.join(os.tmpdir(), `codelin-${name}-${crypto.randomBytes(4).toString("hex")}`);
	fs.cpSync(src, dst, {
		recursive: true,
		filter: (s) =>
			!s.includes(`${path.sep}node_modules${path.sep}`) &&
			!s.includes(`${path.sep}.codegraph${path.sep}`) &&
			!s.includes(`${path.sep}target${path.sep}`),
	});
	return dst;
}
