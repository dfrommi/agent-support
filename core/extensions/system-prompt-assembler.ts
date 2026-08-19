/**
 * Assembles the system prompt from the user's `SYSTEM.md` (customPrompt) by
 * filling in placeholders with the structured data pi already loaded.
 *
 * Placeholders (see SYSTEM.md.template):
 *   {{TOOLS}}      - one "- name: snippet" line per active tool (or "(none)")
 *   {{GUIDELINES}} - conditional file-ops guideline + active tools' guidelines
 *   {{PI_DOCS}}    - the "Pi documentation" block (paths to pi's docs/examples)
 *   {{APPEND_SYSTEM}}     - appendSystemPrompt (APPEND_SYSTEM.md / --append-system-prompt)
 *   {{PROJECT_CONTEXT}}   - the <project_context> block (built from contextFiles)
 *   {{SKILLS}}     - only the <available_skills> XML (intro lives in SYSTEM.md)
 *   {{CWD}}        - working directory
 *
 * {{APPEND_SYSTEM}} and {{PROJECT_CONTEXT}} sit on their own line in SYSTEM.md; when their
 * content is empty, the placeholder line (and its trailing blank line) collapse.
 *
 * When no SYSTEM.md is configured (customPrompt undefined), this leaves pi's
 * default prompt untouched.
 */

import type { BuildSystemPromptOptions, ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { formatSkillsForPrompt, getDocsPath, getExamplesPath, getReadmePath } from "@earendil-works/pi-coding-agent";
import { BASH_FILE_OPS_GUIDELINE } from "./pi-overrides";

const DEFAULT_TOOLS = ["read", "bash", "edit", "write"];

function activeTools(o: BuildSystemPromptOptions): string[] {
	return o.selectedTools ?? DEFAULT_TOOLS;
}

function toolsList(o: BuildSystemPromptOptions): string {
	const snippets = o.toolSnippets ?? {};
	const visible = activeTools(o).filter((name) => snippets[name]);
	return visible.length > 0
		? visible.map((name) => `- ${name}: ${snippets[name]}`).join("\n")
		: "(none)";
}

function guidelines(o: BuildSystemPromptOptions): string {
	const names = activeTools(o);
	const has = (name: string) => names.includes(name);
	const list: string[] = [];

	// Mirrors pi's core conditional: only when bash is the sole file tool.
	if (has("bash") && !has("grep") && !has("find") && !has("ls")) {
		list.push(BASH_FILE_OPS_GUIDELINE);
	}
	for (const guideline of o.promptGuidelines ?? []) {
		const trimmed = guideline.trim();
		if (trimmed) list.push(trimmed);
	}
	return [...new Set(list)].map((g) => `- ${g}`).join("\n");
}

function contextBlock(o: BuildSystemPromptOptions): string {
	const files = o.contextFiles ?? [];
	if (files.length === 0) return "";
	let block = "<project_context>\n\nProject-specific instructions and guidelines:\n\n";
	for (const file of files) {
		block += `<project_instructions path="${file.path}">\n${file.content}\n</project_instructions>\n\n`;
	}
	block += "</project_context>\n";
	return block;
}

function skillsXml(o: BuildSystemPromptOptions): string {
	if (!activeTools(o).includes("read")) return "";
	const section = formatSkillsForPrompt(o.skills ?? []);
	return section ? section.slice(section.indexOf("<available_skills>")) : "";
}

function piDocs(): string {
	return `Pi documentation (read only when the user asks about pi itself, its SDK, extensions, themes, skills, or TUI):
- Main documentation: ${getReadmePath()}
- Additional docs: ${getDocsPath()}
- Examples: ${getExamplesPath()} (extensions, custom tools, SDK)
- When reading pi docs or examples, resolve docs/... under Additional docs and examples/... under Examples, not the current working directory
- When asked about: extensions (docs/extensions.md, examples/extensions/), themes (docs/themes.md), skills (docs/skills.md), prompt templates (docs/prompt-templates.md), TUI components (docs/tui.md), keybindings (docs/keybindings.md), SDK integrations (docs/sdk.md), custom providers (docs/custom-provider.md), adding models (docs/models.md), pi packages (docs/packages.md), environment variables (docs/environment-variables.md)
- When working on pi topics, read the docs and examples, and follow .md cross-references before implementing
- Always read pi .md files completely and follow links to related docs (e.g., tui.md for TUI API details)`;
}

export default function systemPromptAssembler(pi: ExtensionAPI) {
	pi.on("before_agent_start", (event) => {
		const o = event.systemPromptOptions;
		if (!o.customPrompt) return undefined;

		let out = o.customPrompt
			.replace("{{TOOLS}}", toolsList(o))
			.replace("{{GUIDELINES}}", guidelines(o))
			.replace("{{PI_DOCS}}", piDocs());

		const append = o.appendSystemPrompt;
		out = append ? out.replace("{{APPEND_SYSTEM}}", append) : out.replace("{{APPEND_SYSTEM}}\n\n", "");

		const context = contextBlock(o);
		out = context ? out.replace("{{PROJECT_CONTEXT}}", context) : out.replace("{{PROJECT_CONTEXT}}\n\n", "");

		out = out
			.replace("{{SKILLS}}", skillsXml(o))
			.replace("{{CWD}}", o.cwd.replace(/\\/g, "/"));

		return { systemPrompt: out };
	});
}
