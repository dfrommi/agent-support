// ── Scope / glob utilities ─────────────────────────────────

/** Minimal glob-to-regex: supports ** (any depth) and * (within segment). */
export function globToRegex(pattern: string): RegExp {
	let rx = "";
	let i = 0;
	while (i < pattern.length) {
		if (pattern[i] === "*" && pattern[i + 1] === "*") {
			if (pattern[i + 2] === "/") { rx += "(?:.*/)?"; i += 3; }
			else { rx += ".*"; i += 2; }
		} else if (pattern[i] === "*") {
			rx += "[^/]*";
			i++;
		} else if (".+^$(){}[]|\\".includes(pattern[i])) {
			rx += "\\" + pattern[i];
			i++;
		} else {
			rx += pattern[i];
			i++;
		}
	}
	return new RegExp("^" + rx + "$");
}

/** Compile exclude patterns once, reuse across BFS hops. */
export function compileExcludeRx(exclude: string[] | undefined): RegExp[] {
	if (!exclude || exclude.length === 0) return [];
	return exclude.map(globToRegex);
}

export function isExcluded(file: string, rx: RegExp[]): boolean {
	return rx.length > 0 && rx.some((r) => r.test(file));
}
