/**
 * Password hashing and verification for username/password auth.
 * Uses bcrypt (bcryptjs) for secure one-way hashing; passwords are never stored in plaintext.
 */

import { hash, compare } from "bcryptjs";

const SALT_ROUNDS = 10;

export async function hashPassword(plainPassword: string): Promise<string> {
  return hash(plainPassword, SALT_ROUNDS);
}

export async function verifyPassword(
  plainPassword: string,
  storedHash: string
): Promise<boolean> {
  return compare(plainPassword, storedHash);
}
