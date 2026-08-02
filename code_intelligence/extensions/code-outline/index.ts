import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { outline } from "./outline.ts";

export default function codeOutlineExtension(pi: ExtensionAPI) {
	pi.registerTool({
		name: "outline",
		label: "Outline",
		description:
			"Structural skeleton of Java source: every class, field, method and constructor as a one-line signature with its line number, at a fraction of the size of the source. " +
			"Takes a list of .java file paths and/or globs, so a whole package can be surveyed in one call, e.g. ['src/main/java/com/example/service/*.java']. " +
			"Use the line numbers to read a specific member with read(offset, limit). " +
			"Java only. Imports, comments, Javadoc and method bodies are never shown.",
		promptSnippet: "Outline Java classes, fields and method signatures with line numbers, per file or per package",
		promptGuidelines: [
			"Prefer outline over read to survey a large Java file or a whole Java package; for a short file, read it directly instead.",
			"Pass several paths or a glob to outline in one call rather than outlining or reading Java files one by one.",
		],
		parameters: Type.Object({
			paths: Type.Array(Type.String(), {
				description: ".java file paths and/or globs, e.g. ['src/**/dto/*.java', 'src/main/java/com/example/Foo.java']",
				minItems: 1,
			}),
		}),
		execute: async (_toolCallId, params) => ({
			content: [{ type: "text", text: await outline(params.paths as string[]) }],
			details: {},
		}),
	});
}
