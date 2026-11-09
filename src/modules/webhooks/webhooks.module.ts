import { Module } from '@nestjs/common';
import {
  ProviderWebhooksController,
  WebhookEndpointsController,
} from './presentation/webhooks.controllers';

/**
 * Webhooks context. Implemented and unit-tested: public event catalogue,
 * PayCo signatures (with rotation), endpoint aggregate (SSRF guard), delivery
 * retry state (24h), inbound ProviderEvent and IngestProviderWebhookUseCase.
 * Persistence and wiring of ingestion (Phase 3) and delivery (Phase 4) remain.
 */
@Module({ controllers: [WebhookEndpointsController, ProviderWebhooksController] })
export class WebhooksModule {}
