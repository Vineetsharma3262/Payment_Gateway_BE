import { createHmac, timingSafeEqual } from 'node:crypto';

export function hmacSha256Hex(secret: string, payload: string | Buffer): string {
  return createHmac('sha256', secret).update(payload).digest('hex');
}

/** Constant-time comparison of hex/ASCII signatures; false on any length mismatch. */
export function safeEqual(expected: string, received: string): boolean {
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(received, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}
