import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * `PayCo-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256(secret, "<t>.<raw body>")>[,v1=…]`
 *
 * The timestamp is signed to prevent replay; during secret rotation every
 * active secret produces a `v1` value so merchants can switch without
 * downtime. node:crypto is a runtime primitive, not a framework dependency.
 */
export const SIGNATURE_HEADER = 'PayCo-Signature';
export const DEFAULT_TOLERANCE_SECONDS = 300;

export function signPayload(
  rawBody: string,
  secrets: readonly string[],
  timestampSeconds: number,
): string {
  const parts = [`t=${timestampSeconds}`];
  for (const secret of secrets) {
    parts.push(
      `v1=${createHmac('sha256', secret).update(`${timestampSeconds}.${rawBody}`).digest('hex')}`,
    );
  }
  return parts.join(',');
}

/** Reference verifier, mirrored in PayCo's SDKs and docs for merchants. */
export function verifySignature(
  header: string,
  rawBody: string,
  secret: string,
  nowSeconds: number,
  toleranceSeconds = DEFAULT_TOLERANCE_SECONDS,
): boolean {
  const items = header.split(',').map((p) => p.trim().split('=') as [string, string]);
  const t = Number(items.find(([k]) => k === 't')?.[1]);
  if (!Number.isInteger(t) || Math.abs(nowSeconds - t) > toleranceSeconds) return false;
  const expected = Buffer.from(
    createHmac('sha256', secret).update(`${t}.${rawBody}`).digest('hex'),
  );
  return items
    .filter(([k]) => k === 'v1')
    .some(([, v]) => {
      const candidate = Buffer.from(v ?? '');
      return candidate.length === expected.length && timingSafeEqual(candidate, expected);
    });
}
