import path from "node:path";

/** Which files participate in resolution, rendering, and traversal. */
export type Scope = "main" | "test" | "all";

function isTestPath(file: string): boolean {
	if (/(^|\/)(test|tests|testcomponent|componenttest|__tests__|__mocks__|spec)\//i.test(file)) {
		return true;
	}
	const base = file.split("/").pop() ?? file;
	return /(Test|Tests|Spec|IT|ITCase|TestCase)\.[A-Za-z0-9]+$/.test(base);
}

function isGeneratedPath(file: string): boolean {
	return /(^|\/)generated\//i.test(file);
}

/**
 * Inline test-module convention (e.g. Rust `#[cfg(test)] mod tests`).
 * A container named `test`/`tests` is a safe test signal: it can be wrong by
 * omission (nested helper modules), but not by commission when it matches.
 */
function isTestContainer(containerName?: string): boolean {
	return containerName === "test" || containerName === "tests";
}

/**
 * True when a symbol at `file` (optionally inside `containerName`) is in scope.
 * When `root` is provided, test/generated detection runs against the path
 * relative to the project root, so a `test/` directory *above* the root (e.g.
 * the repo's own test harness) does not mark project sources as test code.
 */
export function inScope(file: string, scope: Scope, containerName?: string, root?: string): boolean {
	if (scope === "all") return true;
	const target = root ? path.relative(root, file) : file;
	const test = isTestPath(target) || isTestContainer(containerName);
	if (scope === "main") return !test && !isGeneratedPath(target);
	return test && !isGeneratedPath(target); // "test"
}
