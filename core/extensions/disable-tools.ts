import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

// Tools to disable at session start. Add or remove names here.
const DISABLED_TOOLS: string[] = [
	"copilot_credit_usage",
];

export default function disableTools(pi: ExtensionAPI) {
	pi.on("session_start", () => {
		if (DISABLED_TOOLS.length === 0) return;
		const active = pi.getActiveTools();
		pi.setActiveTools(active.filter((name) => !DISABLED_TOOLS.includes(name)));
	});
}
