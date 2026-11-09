import { randomBytes } from 'node:crypto';
import type { IdGenerator, IdPrefix } from '../../application/id-generator.port';

const ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
/** 24 base62 characters ≈ 142 bits of entropy: unguessable, so ids can appear in checkout URLs. */
const LENGTH = 24;

/** `ord_3fZ…`: prefixed, opaque PayCo identifiers (PRD 7.2). */
export class RandomIdGenerator implements IdGenerator {
  next(prefix: IdPrefix): string {
    return `${prefix}_${randomBase62(LENGTH)}`;
  }
}

export function randomBase62(length: number): string {
  let out = '';
  while (out.length < length) {
    for (const byte of randomBytes(length * 2)) {
      // Rejection sampling avoids modulo bias (248 = 62 * 4).
      if (byte < 248) out += ALPHABET[byte % 62];
      if (out.length === length) break;
    }
  }
  return out;
}
