import { InvariantViolationError } from '../../../shared/domain/domain-error';
import { ProviderSignatureInvalidError } from '../../../integrations/payment-providers/domain-ports/provider-errors';
import { FakePaymentProvider } from '../../../integrations/payment-providers/testing/fake-payment-provider';
import { StaticPaymentProviderRegistry } from '../../../integrations/payment-providers/testing/in-memory-provider-registry';
import { IngestProviderWebhookUseCase } from '../../../modules/webhooks/application/ingest-provider-webhook.use-case';
import { toPublicEventType } from '../../../modules/webhooks/domain/event-catalog';
import type { ProviderEvent } from '../../../modules/webhooks/domain/provider-event';
import { WebhookDelivery } from '../../../modules/webhooks/domain/webhook-delivery';
import { WebhookEndpoint } from '../../../modules/webhooks/domain/webhook-endpoint';
import { signPayload, verifySignature } from '../../../modules/webhooks/domain/webhook-signature';
import {
  FixedClock,
  PassThroughUnitOfWork,
  RecordingEventPublisher,
  SequentialIdGenerator,
} from '../../support/fakes';

const now = new Date('2026-10-27T00:00:00Z');
const t = Math.floor(now.getTime() / 1000);

describe('PayCo outbound webhook signatures', () => {
  const body = '{"id":"evt_1","type":"payment.succeeded"}';

  it('verifies with the merchant secret and rejects tampering, wrong secrets and stale timestamps', () => {
    const header = signPayload(body, ['whsec_a'], t);
    expect(verifySignature(header, body, 'whsec_a', t)).toBe(true);
    expect(verifySignature(header, body.replace('1', '2'), 'whsec_a', t)).toBe(false);
    expect(verifySignature(header, body, 'whsec_b', t)).toBe(false);
    expect(verifySignature(header, body, 'whsec_a', t + 301)).toBe(false);
  });

  it('signs with every active secret during rotation', () => {
    const header = signPayload(body, ['whsec_new', 'whsec_old'], t);
    expect(verifySignature(header, body, 'whsec_new', t)).toBe(true);
    expect(verifySignature(header, body, 'whsec_old', t)).toBe(true);
  });

  it('maps internal events to the public catalogue and hides internal-only ones', () => {
    expect(toPublicEventType('payment.captured')).toBe('payment.succeeded');
    expect(toPublicEventType('order.provider_sync_required')).toBeNull();
  });
});

describe('Webhook endpoint', () => {
  const secret = { id: 's1', secretEncrypted: 'enc1', createdAt: now, expiresAt: null };

  it.each([
    'http://merchant.example/hook',
    'https://localhost/hook',
    'https://10.0.0.5/x',
    'https://169.254.169.254/latest',
    'ftp://x.example',
  ])('rejects unsafe live URL %s', (url) => {
    expect(() =>
      WebhookEndpoint.create({
        id: 'we',
        merchantId: 'm',
        mode: 'live',
        url,
        enabledEvents: ['payment.succeeded'],
        createdAt: now,
        secret,
      }),
    ).toThrow(InvariantViolationError);
  });

  it('keeps the old secret active for 24h after rotation', () => {
    const ep = WebhookEndpoint.create({
      id: 'we',
      merchantId: 'm',
      mode: 'live',
      url: 'https://merchant.example/hook',
      enabledEvents: ['payment.succeeded'],
      createdAt: now,
      secret,
    });
    ep.rotateSecret({ id: 's2', secretEncrypted: 'enc2', createdAt: now, expiresAt: null }, now);
    expect(ep.activeSecrets(now).map((s) => s.id)).toEqual(['s2', 's1']);
    expect(ep.activeSecrets(new Date(now.getTime() + 25 * 3600_000)).map((s) => s.id)).toEqual([
      's2',
    ]);
    expect(ep.subscribesTo('payment.succeeded')).toBe(true);
    expect(ep.subscribesTo('refund.succeeded')).toBe(false);
  });
});

describe('Webhook delivery retries (PRD 7.3: backoff for 24 hours)', () => {
  it('succeeds on 2xx and stops retrying', () => {
    const d = WebhookDelivery.schedule({
      id: 'whd',
      merchantId: 'm',
      endpointId: 'we',
      eventId: 'evt',
      eventType: 'payment.succeeded',
      createdAt: now,
    });
    d.recordAttempt({ at: now, statusCode: 500, durationMs: 10, error: null }, () => 0.5);
    expect(d.status).toBe('pending');
    expect(d.nextAttemptAt!.getTime()).toBeGreaterThan(now.getTime());
    d.recordAttempt({ at: d.nextAttemptAt!, statusCode: 204, durationMs: 10, error: null });
    expect(d.status).toBe('succeeded');
  });

  it('is exhausted after the 24-hour window and can be replayed', () => {
    const d = WebhookDelivery.schedule({
      id: 'whd',
      merchantId: 'm',
      endpointId: 'we',
      eventId: 'evt',
      eventType: 'payment.succeeded',
      createdAt: now,
    });
    let at = now;
    let guard = 0;
    while (d.status === 'pending' && guard++ < 100) {
      d.recordAttempt({ at, statusCode: null, durationMs: 0, error: 'timeout' }, () => 0.99);
      at = d.nextAttemptAt ?? at;
    }
    expect(d.status).toBe('exhausted');
    expect(at.getTime() - now.getTime()).toBeLessThanOrEqual(24 * 3600_000);
    expect(d.attemptCount).toBeGreaterThan(5);
    d.replay(new Date(now.getTime() + 48 * 3600_000));
    expect(d.status).toBe('pending');
  });
});

describe('IngestProviderWebhookUseCase', () => {
  function setup() {
    const stored = new Map<string, ProviderEvent>();
    const outbox = new RecordingEventPublisher();
    const useCase = new IngestProviderWebhookUseCase({
      unitOfWork: new PassThroughUnitOfWork(),
      providers: new StaticPaymentProviderRegistry([new FakePaymentProvider()]),
      events: {
        insertIfAbsent: (e) => {
          const key = `${e.toProps().provider}:${e.toProps().providerEventId}`;
          if (stored.has(key)) return Promise.resolve(false);
          stored.set(key, e);
          return Promise.resolve(true);
        },
      },
      outbox,
      ids: new SequentialIdGenerator(),
      clock: new FixedClock(),
    });
    return { useCase, stored, outbox };
  }
  const raw = Buffer.from(
    JSON.stringify({
      id: 'evt_p1',
      type: 'payment.captured',
      created_at: now.toISOString(),
      data: {},
    }),
  );

  it('stores a verified event once and enqueues it once (duplicates acknowledged, not reprocessed)', async () => {
    const { useCase, stored, outbox } = setup();
    const headers = { 'x-fake-signature': FakePaymentProvider.signWebhook(raw) };
    await expect(
      useCase.execute({ provider: 'fake', mode: 'test', rawBody: raw, headers }),
    ).resolves.toMatchObject({ duplicate: false });
    await expect(
      useCase.execute({ provider: 'fake', mode: 'test', rawBody: raw, headers }),
    ).resolves.toMatchObject({ duplicate: true });
    expect(stored.size).toBe(1);
    expect(outbox.types()).toEqual(['provider_event.received']);
  });

  it('rejects an invalid signature before storing anything', async () => {
    const { useCase, stored } = setup();
    await expect(
      useCase.execute({
        provider: 'fake',
        mode: 'test',
        rawBody: raw,
        headers: { 'x-fake-signature': 'bad' },
      }),
    ).rejects.toBeInstanceOf(ProviderSignatureInvalidError);
    expect(stored.size).toBe(0);
  });
});
