/**
 * Exponential backoff with full jitter: delay ∈ [0, min(cap, base·2^attempt)].
 * Full jitter spreads retries from many clients so a recovering dependency is
 * not hit by synchronized waves. `random` is injectable for deterministic tests.
 */
export function backoffWithJitter(
  attempt: number,
  options: { baseMs: number; capMs: number },
  random: () => number = Math.random,
): number {
  const exponential = Math.min(options.capMs, options.baseMs * 2 ** Math.max(0, attempt));
  return Math.floor(random() * exponential);
}

/**
 * Outbound merchant webhooks (PRD 7.3): retry with backoff for 24 hours, then
 * mark failed and keep for manual replay. Returns null when the window is spent.
 */
export function nextWebhookAttemptAt(
  firstAttemptAt: Date,
  attempt: number,
  now: Date,
  random: () => number = Math.random,
): Date | null {
  const windowEnd = firstAttemptAt.getTime() + 24 * 60 * 60 * 1000;
  // Floor of 30s so even an unlucky jitter draw does not hammer the endpoint.
  const delay =
    30_000 + backoffWithJitter(attempt, { baseMs: 60_000, capMs: 2 * 60 * 60 * 1000 }, random);
  const next = now.getTime() + delay;
  return next > windowEnd ? null : new Date(next);
}
