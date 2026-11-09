import { notImplementedHandler, runQueueWorker } from '../run-queue-worker';

/**
 * Resolves *.provider_sync_required events by polling the gateway (unknown outcomes, missed webhooks).
 * Run: `node dist/workers/payment-status-sync/main.js` (same image as the API).
 */
void runQueueWorker({
  name: 'payment-status-sync',
  queueUrlVariable: 'PROVIDER_SYNC_QUEUE_URL',
  plannedFor: 'Phase 3',
  handler: notImplementedHandler,
});
