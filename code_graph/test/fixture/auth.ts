export class AuthService {
	login(username: string, password: string): boolean {
		this.validateCredentials(username, password);
		return true;
	}

	validateCredentials(username: string, password: string): boolean {
		return username.length > 0 && password.length > 0;
	}

	logout(): void {
		this.cleanupSession();
	}

	private cleanupSession(): void {
		// internal
	}
}

export function hashPassword(password: string): string {
	return "hashed:" + password;
}

export const defaultTimeout = 5000;
