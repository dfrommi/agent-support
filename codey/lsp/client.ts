import { spawn, type ChildProcess } from "node:child_process";
import {
	CancellationTokenSource,
	createMessageConnection,
	NullLogger,
	StreamMessageReader,
	StreamMessageWriter,
	type MessageConnection,
} from "vscode-jsonrpc/node";
import {
	CallHierarchyOutgoingCallsRequest,
	CallHierarchyPrepareRequest,
	DidChangeTextDocumentNotification,
	DidOpenTextDocumentNotification,
	DocumentSymbolRequest,
	ExitNotification,
	ImplementationRequest,
	InitializedNotification,
	InitializeRequest,
	ReferencesRequest,
	ShutdownRequest,
	TypeHierarchyPrepareRequest,
	TypeHierarchySubtypesRequest,
	type CallHierarchyItem,
	type CallHierarchyOutgoingCall,
	type DocumentSymbol,
	type Location,
	type TypeHierarchyItem,
} from "vscode-languageserver-protocol";

const DEFAULT_TIMEOUT_MS = 30_000;
const STDERR_TAIL_CHARS = 8_192;

/**
 * Minimal LSP client over stdio, built on vscode-jsonrpc for framing/transport
 * and vscode-languageserver-protocol for request/notification types.
 */
export class LspClient {
	private process: ChildProcess;
	private connection: MessageConnection;
	private stderrTail = "";
	private shutdownHook?: () => Promise<void>;
	private shutDown = false;

	constructor(command: string, args: string[], cwd: string, env?: Record<string, string>) {
		this.process = spawn(command, args, {
			cwd,
			stdio: ["pipe", "pipe", "pipe"],
			env: { ...process.env, ...env },
		});

		this.connection = createMessageConnection(
			new StreamMessageReader(this.process.stdout!),
			new StreamMessageWriter(this.process.stdin!),
			NullLogger,
		);
		this.connection.listen();

		// The language server's stderr is diagnostic noise (progress, harmless
		// warnings like a missing optional config file), not user-facing output.
		// Buffer it and surface it only when a request actually fails.
		this.process.stderr!.on("data", (chunk: Buffer) => {
			this.stderrTail = (this.stderrTail + chunk.toString()).slice(-STDERR_TAIL_CHARS);
		});
		this.process.on("error", (e) => {
			this.connection.dispose();
			process.stderr.write(`[lsp] spawn error: ${e.message}\n`);
		});
		this.process.on("exit", () => {
			// normal shutdown kills the server with SIGTERM (exit code 143);
			// nothing to do here — vscode-jsonrpc owns pending requests.
		});
	}

	async request(method: string, params?: unknown, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<unknown> {
		// A cancellation token lets us send `$/cancelRequest` on timeout, so the
		// connection drops its pending bookkeeping instead of accumulating it.
		const source = new CancellationTokenSource();
		const pending = this.connection.sendRequest(method, params, source.token);
		let timer: ReturnType<typeof setTimeout> | undefined;
		const timeout = new Promise<never>((_, reject) => {
			timer = setTimeout(() => {
				source.cancel();
				reject(new Error(`LSP request "${method}" timed out after ${timeoutMs}ms`));
			}, timeoutMs);
		});
		try {
			return await Promise.race([pending, timeout]);
		} catch (e) {
			throw new Error(this.withStderrTail((e as Error).message));
		} finally {
			clearTimeout(timer);
			source.dispose();
			pending.catch(() => {}); // swallow a late settle after the timeout wins
		}
	}

	/** Append the buffered server stderr to a request error for debuggability. */
	private withStderrTail(message: string): string {
		const tail = this.stderrTail.trim();
		return tail ? `${message}\nRecent server stderr:\n${tail}` : message;
	}

	notify(method: string, params?: unknown): void {
		void this.connection.sendNotification(method, params).catch(() => {
			// notifications are fire-and-forget; a killed server may reject the
			// write (EPIPE / stream destroyed) during shutdown.
		});
	}

	async initialize(rootUri: string, initializationOptions?: unknown): Promise<unknown> {
		const rootPath = rootUri.replace("file://", "");
		return this.request(InitializeRequest.method, {
			processId: process.pid,
			rootUri,
			workspaceFolders: [{ uri: rootUri, name: rootPath.split("/").pop() || rootPath }],
			capabilities: {
				workspace: {
					symbol: { dynamicRegistration: true },
					workspaceFolders: true,
				},
				textDocument: {
					callHierarchy: { dynamicRegistration: true },
					typeHierarchy: { dynamicRegistration: true },
					implementation: { dynamicRegistration: true, linkSupport: true },
					documentSymbol: { hierarchicalDocumentSymbolSupport: true },
				},
			},
			...(initializationOptions ? { initializationOptions } : {}),
		});
	}

	async initialized(): Promise<void> {
		this.notify(InitializedNotification.method, {});
	}

	onShutdown(hook: () => Promise<void>): void {
		this.shutdownHook = hook;
	}

	async shutdown(): Promise<void> {
		if (this.shutDown) return;
		this.shutDown = true;
		try {
			try {
				await this.request(ShutdownRequest.method, undefined, 3_000);
			} catch {
				// server may already be gone
			}
			this.notify(ExitNotification.method);
			this.process.kill();
		} finally {
			await this.shutdownHook?.();
		}
	}

	async documentSymbols(uri: string): Promise<DocumentSymbol[]> {
		const result = await this.request(DocumentSymbolRequest.method, {
			textDocument: { uri },
		});
		return (Array.isArray(result) ? result : []) as DocumentSymbol[];
	}

	async references(uri: string, line: number, character: number): Promise<Location[]> {
		const result = await this.request(ReferencesRequest.method, {
			textDocument: { uri },
			position: { line, character },
			context: { includeDeclaration: false },
		});
		return (Array.isArray(result) ? result : []) as Location[];
	}

	/** Implementation locations (override/implementer name anchors), normalized from Location or LocationLink. */
	async implementation(uri: string, line: number, character: number): Promise<Location[]> {
		const result = await this.request(ImplementationRequest.method, {
			textDocument: { uri },
			position: { line, character },
		});
		const arr = Array.isArray(result) ? result : result ? [result] : [];
		return arr.map((item: any) => {
			if (item.targetUri) {
				return { uri: item.targetUri, range: item.targetSelectionRange ?? item.targetRange };
			}
			return { uri: item.uri, range: item.range };
		});
	}

	async prepareTypeHierarchy(uri: string, line: number, character: number): Promise<TypeHierarchyItem[]> {
		const result = await this.request(TypeHierarchyPrepareRequest.method, {
			textDocument: { uri },
			position: { line, character },
		});
		return (Array.isArray(result) ? result : []) as TypeHierarchyItem[];
	}

	async typeHierarchySubtypes(item: TypeHierarchyItem): Promise<TypeHierarchyItem[]> {
		const result = await this.request(TypeHierarchySubtypesRequest.method, { item });
		return (Array.isArray(result) ? result : []) as TypeHierarchyItem[];
	}

	async prepareCallHierarchy(uri: string, line: number, character: number): Promise<CallHierarchyItem[]> {
		const result = await this.request(CallHierarchyPrepareRequest.method, {
			textDocument: { uri },
			position: { line, character },
		});
		return (Array.isArray(result) ? result : []) as CallHierarchyItem[];
	}

	async outgoingCalls(item: CallHierarchyItem): Promise<CallHierarchyOutgoingCall[]> {
		const result = await this.request(CallHierarchyOutgoingCallsRequest.method, { item });
		return (Array.isArray(result) ? result : []) as CallHierarchyOutgoingCall[];
	}

	async didOpen(uri: string, text: string, languageId: string): Promise<void> {
		this.notify(DidOpenTextDocumentNotification.method, {
			textDocument: { uri, languageId, version: 1, text },
		});
	}

	async didChange(uri: string, text: string, version: number): Promise<void> {
		this.notify(DidChangeTextDocumentNotification.method, {
			textDocument: { uri, version },
			contentChanges: [{ text }],
		});
	}
}
