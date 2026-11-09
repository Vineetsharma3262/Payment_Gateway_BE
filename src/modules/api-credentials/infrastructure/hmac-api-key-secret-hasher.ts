import { createHmac, timingSafeEqual } from 'node:crypto';
import type { ApiKeySecretHasher } from '../application/api-key-secret-hasher.port';

export class HmacApiKeySecretHasher implements ApiKeySecretHasher {
  constructor(private readonly pepper: string) {
    if (pepper.length < 32) throw new Error('API key pepper must be at least 32 characters.');
  }

  hash(secret: string): string {
    return createHmac('sha256', this.pepper).update(secret, 'utf8').digest('hex');
  }

  matches(secret: string, storedHash: string): boolean {
    const computed = Buffer.from(this.hash(secret), 'hex');
    const stored = Buffer.from(storedHash, 'hex');
    return computed.length === stored.length && timingSafeEqual(computed, stored);
  }
}
