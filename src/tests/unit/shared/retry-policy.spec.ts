import { backoffWithJitter, nextWebhookAttemptAt } from '../../../shared/domain/retry-policy';

describe('retry policy', () => {
  it('backs off exponentially with full jitter and a cap', () => {
    const opts = { baseMs: 1_000, capMs: 10_000 };
    expect(backoffWithJitter(0, opts, () => 0.999)).toBe(999);
    expect(backoffWithJitter(3, opts, () => 0.999)).toBe(7_992);
    expect(backoffWithJitter(20, opts, () => 0.999)).toBe(9_990);
    expect(backoffWithJitter(5, opts, () => 0)).toBe(0);
  });

  it('stops scheduling outbound webhook retries after 24 hours (PRD 7.3)', () => {
    const first = new Date('2026-10-27T00:00:00Z');
    const soon = nextWebhookAttemptAt(first, 1, new Date('2026-10-27T00:01:00Z'), () => 0.5);
    expect(soon).not.toBeNull();
    expect(soon!.getTime()).toBeGreaterThan(new Date('2026-10-27T00:01:00Z').getTime());

    const late = nextWebhookAttemptAt(first, 12, new Date('2026-10-27T23:59:00Z'), () => 0.5);
    expect(late).toBeNull();
  });
});
