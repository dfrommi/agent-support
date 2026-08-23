import { fileURLToPath } from "node:url";

/** Convert an LSP `file://` URI to an absolute filesystem path. */
export function uriToFile(uri: string): string {
	try {
		return fileURLToPath(uri);
	} catch {
		return uri.replace("file://", "");
	}
}
