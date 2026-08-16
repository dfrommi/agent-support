export interface User {
	id: string;
	name: string;
}

export function findUser(id: string): User | null {
	if (!id) return null;
	return { id, name: "user-" + id };
}

export function saveUser(user: User): void {
	void user;
}
