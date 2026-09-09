import bcrypt from "bcryptjs";

const ROUNDS = 10;

export async function hashPassword(password: string) {
  return bcrypt.hash(password, ROUNDS);
}

export async function verifyPassword(password: string, passwordHash: string) {
  return bcrypt.compare(password, passwordHash);
}
