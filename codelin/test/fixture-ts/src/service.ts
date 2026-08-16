import { findUser, saveUser, type User } from "./repo";

export function getUser(id: string): User | null {
	return findUser(id);
}

export function createUser(name: string): User {
	const user: User = { id: crypto.randomUUID(), name };
	saveUser(user);
	return user;
}
