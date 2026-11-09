/** High-entropy opaque tokens (refresh tokens, reset links, invitations). Only their SHA-256 is stored. */
export interface SecureTokenGenerator {
  generate(): string;
}

export const SECURE_TOKEN_GENERATOR = Symbol('SecureTokenGenerator');
