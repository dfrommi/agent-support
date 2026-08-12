export interface User {
	id: string;
	email: string;
}

export type UserRole = "admin" | "user" | "guest";

export enum Permission {
	Read = "read",
	Write = "write",
	Delete = "delete",
}
