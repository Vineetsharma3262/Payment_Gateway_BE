import { notImplementedHandler, runQueueWorker } from '../run-queue-worker';

/**
 * Applies verified gateway events (ApplyProviderPaymentEventUseCase, refunds, disputes, onboarding decisions).
 * Run: `node dist/workers/provider-webhook-processing/main.js` (same image as the API).
 */
void runQueueWorker({
  name: 'provider-webhook-processing',
  queueUrlVariable: 'PROVIDER_EVENTS_QUEUE_URL',
  plannedFor: 'Phase 3',
  handler: notImplementedHandler,
});
