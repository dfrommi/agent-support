import { execSync } from "node:child_process";
import { statSync } from "node:fs";

/** Resolve a binary path: try `which` first, then fallback paths. */
export function findBinary(name: string, fallbackPaths: string[]): string {
	try {
		return execSync(`which ${name}`, { encoding: "utf8", timeout: 3000 }).trim();
	} catch { /* not in PATH */ }
	for (const p of fallbackPaths) {
		try { statSync(p); return p; } catch { /* doesn't exist */ }
	}
	throw new Error(
		`Could not find ${name}. Install it or set PATH. ` +
		`Searched fallbacks: ${fallbackPaths.join(", ")}`,
	);
}
