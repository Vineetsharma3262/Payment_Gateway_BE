import { notImplementedHandler, runQueueWorker } from '../run-queue-worker';

/**
 * Delivers PayCo-signed merchant webhooks with 24h backoff retries (WebhookDelivery).
 * Run: `node dist/workers/webhook-delivery/main.js` (same image as the API).
 */
void runQueueWorker({
  name: 'webhook-delivery',
  queueUrlVariable: 'WEBHOOK_DELIVERY_QUEUE_URL',
  plannedFor: 'Phase 4',
  handler: notImplementedHandler,
});
