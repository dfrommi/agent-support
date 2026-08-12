export type SymbolKind = "function" | "class" | "method" | "variable" | "interface" | "type" | "enum";

export interface Symbol {
	id: string;
	name: string;
	kind: SymbolKind;
	file: string;
	line: number; // 1-indexed
	column: number; // 1-indexed
	/** End line of the symbol's definition (1-indexed). Useful for reading the exact range. */
	endLine?: number;
	/** End column of the symbol's definition (1-indexed). */
	endColumn?: number;
	exported: boolean;
	/** Class name for methods, undefined otherwise */
	parentName?: string;
}

export interface CallEdge {
	callerId: string;
	calleeId: string;
	calleeName: string; // the name as written in the call expression
	line: number;
}

export interface FileInfo {
	path: string;
	symbols: Symbol[];
}
