import type { Clock } from '../../../shared/application/clock.port';
import type { DomainEventPublisher } from '../../../shared/application/domain-event-publisher.port';
import type { IdGenerator } from '../../../shared/application/id-generator.port';
import type { UnitOfWork } from '../../../shared/application/unit-of-work.port';
import type {
  PaymentProviderName,
  PaymentProviderRegistry,
  ProviderMode,
} from '../../../integrations/payment-providers/domain-ports/payment-provider.port';
import { ProviderEvent } from '../domain/provider-event';
import type { ProviderEventRepository } from '../domain/webhooks.repositories';

/**
 * Inbound gateway webhook (pay-in flow steps 7–8):
 * 1. verify the signature over the exact raw bytes (throws if invalid → 400);
 * 2. persist the event (deduplicated by provider event id) together with an
 *    outbox message for the processing worker, in one transaction;
 * 3. only then acknowledge with 2xx.
 * Processing never happens on the request path.
 */
export class IngestProviderWebhookUseCase {
  constructor(
    private readonly deps: {
      unitOfWork: UnitOfWork;
      providers: PaymentProviderRegistry;
      events: ProviderEventRepository;
      outbox: DomainEventPublisher;
      ids: IdGenerator;
      clock: Clock;
    },
  ) {}

  async execute(input: {
    provider: PaymentProviderName;
    mode: ProviderMode;
    rawBody: Buffer;
    headers: Record<string, string | undefined>;
  }): Promise<{ eventId: string; duplicate: boolean }> {
    const verified = await this.deps.providers
      .get(input.provider)
      .verifyWebhook({ mode: input.mode, rawBody: input.rawBody, headers: input.headers });

    const event = ProviderEvent.receive({
      id: this.deps.ids.next('pev'),
      provider: verified.provider,
      mode: input.mode,
      providerEventId: verified.providerEventId,
      type: verified.type,
      providerType: verified.providerType,
      accountId: verified.accountId,
      payload: verified.payload,
      receivedAt: this.deps.clock.now(),
    });

    return this.deps.unitOfWork.run(async () => {
      const inserted = await this.deps.events.insertIfAbsent(event);
      if (!inserted) return { eventId: event.id, duplicate: true };
      await this.deps.outbox.publish([
        {
          eventType: 'provider_event.received',
          aggregateType: 'provider_event',
          aggregateId: event.id,
          merchantId: 'platform',
          occurredAt: this.deps.clock.now(),
          payload: {
            providerEventId: verified.providerEventId,
            provider: verified.provider,
            type: verified.type,
          },
        },
      ]);
      return { eventId: event.id, duplicate: false };
    });
  }
}
