import * as argon2 from 'argon2';
import type { PasswordHasher } from '../application/identity.ports';

/** Argon2id with OWASP-recommended minimum parameters (19 MiB, t=2, p=1). */
export class Argon2PasswordHasher implements PasswordHasher {
  hash(password: string): Promise<string> {
    return argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 19_456,
      timeCost: 2,
      parallelism: 1,
    });
  }

  async verify(hash: string, password: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, password);
    } catch {
      return false;
    }
  }
}
