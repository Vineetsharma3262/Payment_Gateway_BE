import type { SecureTokenGenerator } from '../../application/secure-token.port';
import { randomBase62 } from './random-id-generator';

/** 48 base62 characters ≈ 285 bits. */
export class RandomTokenGenerator implements SecureTokenGenerator {
  generate(): string {
    return randomBase62(48);
  }
}
