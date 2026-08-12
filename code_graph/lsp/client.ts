import { spawn, type ChildProcess } from "node:child_process";
import { createInterface } from "node:readline";

// ── JSON-RPC over stdio ─────────────────────────────────────

interface Message {
	jsonrpc: "2.0";
	id?: number | string;
	method?: string;
	params?: unknown;
	result?: unknown;
	error?: { code: number; message: string; data?: unknown };
}

export class LspClient {
	private process: ChildProcess;
	private pending = new Map<number | string, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
	private nextId = 1;
	private buffer = "";
	private contentLength = -1;
	private onNotification: ((method: string, params: unknown) => void) | null = null;

	constructor(command: string, args: string[], cwd: string, env?: Record<string, string>) {
		this.process = spawn(command, args, {
			cwd,
			stdio: ["pipe", "pipe", "pipe"],
			env: { ...process.env, ...env },
		});

		this.process.stdout!.on("data", (chunk: Buffer) => this.handleData(chunk.toString()));
		this.process.stderr!.on("data", (chunk: Buffer) => {
			// LSP servers often log to stderr
			process.stderr.write(`[lsp:stderr] ${chunk}`);
		});
		this.process.on("error", (e) => {
			for (const [, { reject }] of this.pending) reject(e);
		});
		this.process.on("exit", (code) => {
			if (code !== 0 && code !== null) {
				const msg = `LSP server exited with code ${code}`;
				for (const [, { reject }] of this.pending) reject(new Error(msg));
			}
		});
	}

	private handleData(data: string): void {
		this.buffer += data;
		while (true) {
			if (this.contentLength < 0) {
				const headerEnd = this.buffer.indexOf("\r\n\r\n");
				if (headerEnd < 0) return;
				const header = this.buffer.slice(0, headerEnd);
				const match = header.match(/Content-Length: (\d+)/i);
				if (!match) {
					// Malformed — skip
					this.buffer = this.buffer.slice(headerEnd + 4);
					continue;
				}
				this.contentLength = parseInt(match[1], 10);
				this.buffer = this.buffer.slice(headerEnd + 4);
			}
			if (this.buffer.length < this.contentLength) return; // not enough body yet
			const body = this.buffer.slice(0, this.contentLength);
			this.buffer = this.buffer.slice(this.contentLength);
			this.contentLength = -1;
			try {
				const msg: Message = JSON.parse(body);
				this.handleMessage(msg);
			} catch {
				// ignore malformed
			}
		}
	}

	private handleMessage(msg: Message): void {
		if (msg.id !== undefined && msg.id !== null) {
			const pending = this.pending.get(msg.id);
			if (!pending) return;
			this.pending.delete(msg.id);
			if (msg.error) pending.reject(new Error(msg.error.message));
			else pending.resolve(msg.result);
		} else if (msg.method) {
			if (this.onNotification) this.onNotification(msg.method, msg.params);
		}
	}

	setNotificationHandler(handler: (method: string, params: unknown) => void): void {
		this.onNotification = handler;
	}

	async request(method: string, params?: unknown): Promise<unknown> {
		const id = this.nextId++;
		const msg: Message = { jsonrpc: "2.0", id, method, params };
		return new Promise((resolve, reject) => {
			this.pending.set(id, { resolve, reject });
			this.send(msg);
		});
	}

	notify(method: string, params?: unknown): void {
		this.send({ jsonrpc: "2.0", method, params });
	}

	private send(msg: Message): void {
		const body = JSON.stringify(msg);
		const header = `Content-Length: ${Buffer.byteLength(body)}\r\n\r\n`;
		this.process.stdin!.write(header + body);
	}

	async initialize(rootUri: string, initializationOptions?: unknown): Promise<unknown> {
		const rootPath = rootUri.replace("file://", "");
		return this.request("initialize", {
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
					documentSymbol: { hierarchicalDocumentSymbolSupport: true },
				},
			},
			...(initializationOptions ? { initializationOptions } : {}),
		});
	}

	async initialized(): Promise<void> {
		this.notify("initialized", {});
	}

	async shutdown(): Promise<void> {
		try {
			await this.request("shutdown");
		} catch {
			// ignore
		}
		this.notify("exit");
		this.process.kill();
	}

	// ── Convenience methods ──────────────────────────────────

	async workspaceSymbols(query: string): Promise<any[]> {
		const result = (await this.request("workspace/symbol", { query })) as any[];
		return result ?? [];
	}

	async documentSymbols(uri: string): Promise<any[]> {
		const result = (await this.request("textDocument/documentSymbol", {
			textDocument: { uri },
		})) as any[];
		return result ?? [];
	}

	async references(uri: string, line: number, character: number): Promise<any[]> {
		const result = (await this.request("textDocument/references", {
			textDocument: { uri },
			position: { line, character },
			context: { includeDeclaration: false },
		})) as any[];
		return result ?? [];
	}

	async incomingCalls(item: { uri: string; range: any; name: string; kind: number }): Promise<any[]> {
		const result = (await this.request("callHierarchy/incomingCalls", { item })) as any[];
		return result ?? [];
	}

	async outgoingCalls(item: { uri: string; range: any; name: string; kind: number }): Promise<any[]> {
		const result = (await this.request("callHierarchy/outgoingCalls", { item })) as any[];
		return result ?? [];
	}

	async prepareCallHierarchy(uri: string, line: number, character: number): Promise<any[]> {
		const result = (await this.request("textDocument/prepareCallHierarchy", {
			textDocument: { uri },
			position: { line, character },
		})) as any[];
		return result ?? [];
	}

	async didOpen(uri: string, text: string, languageId: string): Promise<void> {
		this.notify("textDocument/didOpen", {
			textDocument: {
				uri,
				languageId,
				version: 1,
				text,
			},
		});
	}
}
