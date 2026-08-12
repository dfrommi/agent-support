import { AuthService, hashPassword } from "./auth";

export class LoginController {
	private auth: AuthService;

	constructor() {
		this.auth = new AuthService();
	}

	handleLogin(user: string, pass: string): boolean {
		const hashed = hashPassword(pass);
		return this.auth.login(user, hashed);
	}
}

export function createController(): LoginController {
	return new LoginController();
}
