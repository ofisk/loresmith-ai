import { BaseDAOClass } from "./base-dao";

export type AuthProvider = "password" | "google";

export interface AuthUserRow {
  id: string;
  username: string;
  email: string;
  password_hash: string | null;
  email_verified_at: string | null;
  auth_provider: string;
  is_admin: number;
  created_at: string;
  updated_at: string;
}

export interface CreateAuthUserInput {
  id: string;
  username: string;
  email: string;
  passwordHash: string | null;
  authProvider: AuthProvider;
  isAdmin?: boolean;
}

export interface EmailVerificationTokenRow {
  token: string;
  username: string;
  expires_at: string;
  created_at: string;
}

export class AuthUserDAO extends BaseDAOClass {
  async createUser(input: CreateAuthUserInput): Promise<void> {
    const sql = `
      INSERT INTO users (id, username, email, password_hash, auth_provider, is_admin, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, current_timestamp, current_timestamp)
    `;
    await this.execute(sql, [
      input.id,
      input.username,
      input.email,
      input.passwordHash,
      input.authProvider,
      input.isAdmin ? 1 : 0,
    ]);
  }

  async getUserByUsername(username: string): Promise<AuthUserRow | null> {
    const sql = "SELECT * FROM users WHERE username = ?";
    return this.queryFirst<AuthUserRow>(sql, [username]);
  }

  async getUserByEmail(email: string): Promise<AuthUserRow | null> {
    const sql = "SELECT * FROM users WHERE email = ?";
    return this.queryFirst<AuthUserRow>(sql, [email]);
  }

  async setEmailVerified(username: string): Promise<void> {
    const sql =
      "UPDATE users SET email_verified_at = current_timestamp, updated_at = current_timestamp WHERE username = ?";
    await this.execute(sql, [username]);
  }

  async createVerificationToken(
    token: string,
    username: string,
    expiresAt: Date
  ): Promise<void> {
    const sql = `
      INSERT INTO email_verification_tokens (token, username, expires_at, created_at)
      VALUES (?, ?, ?, current_timestamp)
    `;
    await this.execute(sql, [token, username, expiresAt.toISOString()]);
  }

  async getVerificationToken(
    token: string
  ): Promise<EmailVerificationTokenRow | null> {
    const sql =
      "SELECT * FROM email_verification_tokens WHERE token = ? AND expires_at > datetime('now')";
    return this.queryFirst<EmailVerificationTokenRow>(sql, [token]);
  }

  async deleteVerificationToken(token: string): Promise<void> {
    const sql = "DELETE FROM email_verification_tokens WHERE token = ?";
    await this.execute(sql, [token]);
  }

  async deleteVerificationTokensForUser(username: string): Promise<void> {
    const sql = "DELETE FROM email_verification_tokens WHERE username = ?";
    await this.execute(sql, [username]);
  }
}
