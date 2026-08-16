import { createUser, getUser } from "./service";

export function run(): void {
	void getUser("1");
	void createUser("alice");
}
