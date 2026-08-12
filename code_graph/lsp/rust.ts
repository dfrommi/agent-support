import { LspClient } from "./client.ts";

const RUST_ANALYZER = "/opt/homebrew/opt/rustup/bin/rust-analyzer";

export async function createRustServer(root: string): Promise<LspClient> {
	const client = new LspClient(RUST_ANALYZER, [], root);
	await client.initialize(`file://${root}`);
	await client.initialized();
	return client;
}

export const extensions = [".rs"];
export const languageId = "rust";

export function symbolKind(kind: number): string {
	switch (kind) {
		case 5: return "class";    // struct
		case 6: return "method";
		case 9: return "constructor";
		case 11: return "interface"; // trait
		case 10: return "enum";
		case 12: return "function";
		case 13: return "variable";
		case 14: return "constant";
		case 23: return "class";   // struct
		default: return "unknown";
	}
}
