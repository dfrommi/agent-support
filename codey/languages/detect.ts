import { existsSync } from "node:fs";
import path from "node:path";
import type { LanguageAdapter } from "../lib/adapter.ts";
import { JavaAdapter } from "./java/adapter.ts";
import { RustAdapter } from "./rust/adapter.ts";

export interface DetectedLanguage {
	factory: (root: string) => Promise<LanguageAdapter>;
	languageId: string;
}

/**
 * Pick the language toolchain for a project root. Rust wins when both markers
 * are present (a Cargo project may vendor a JVM build tool, not the reverse).
 */
export function detectLanguage(root: string): DetectedLanguage {
	if (existsSync(path.join(root, "Cargo.toml"))) {
		return { factory: RustAdapter.connect, languageId: "rust" };
	}
	if (["pom.xml", "build.gradle", "build.gradle.kts"].some((f) => existsSync(path.join(root, f)))) {
		return { factory: JavaAdapter.connect, languageId: "java" };
	}
	throw new Error(
		"No supported project marker found (Cargo.toml, pom.xml, or build.gradle(.kts))",
	);
}
