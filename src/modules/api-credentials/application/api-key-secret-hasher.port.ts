/**
 * API secrets are high-entropy random values, so a keyed hash (HMAC with a
 * pepper from the secret manager) is used instead of a slow password hash;
 * Argon2id is reserved for user passwords (Identity & Access).
 */
export interface ApiKeySecretHasher {
  hash(secret: string): string;
  matches(secret: string, storedHash: string): boolean;
}

export const API_KEY_SECRET_HASHER = Symbol('ApiKeySecretHasher');
