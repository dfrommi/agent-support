import path from "node:path";
import { LspClient } from "./client.ts";

const SERVER_PATH = path.join(
	process.env.HOME ?? "~",
	".local/share/nvim/mason/packages/typescript-language-server/node_modules/.bin/typescript-language-server",
);

export async function createTsServer(root: string): Promise<LspClient> {
	const client = new LspClient(SERVER_PATH, ["--stdio"], root);
	await client.initialize(`file://${root}`);
	await client.initialized();
	return client;
}

export const extensions = [".ts", ".tsx", ".js", ".jsx"];
export const languageId = "typescript";

export function symbolKind(kind: number): string {
	// LSP SymbolKind constants
	switch (kind) {
		case 1: return "file";
		case 2: return "module";
		case 3: return "namespace";
		case 4: return "package";
		case 5: return "class";
		case 6: return "method";
		case 7: return "property";
		case 8: return "field";
		case 9: return "constructor";
		case 10: return "enum";
		case 11: return "interface";
		case 12: return "function";
		case 13: return "variable";
		case 14: return "constant";
		case 15: return "string";
		case 16: return "number";
		case 17: return "boolean";
		case 18: return "array";
		case 19: return "object";
		case 20: return "key";
		case 21: return "null";
		case 22: return "enumMember";
		case 23: return "struct";
		case 24: return "event";
		case 25: return "operator";
		case 26: return "typeParameter";
		default: return "unknown";
	}
}
