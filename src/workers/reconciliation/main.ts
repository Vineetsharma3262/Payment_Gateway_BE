import { notImplementedHandler, runQueueWorker } from '../run-queue-worker';

/**
 * Nightly comparison of PayCo records with gateway transactions (reconcile()).
 * Run: `node dist/workers/reconciliation/main.js` (same image as the API).
 */
void runQueueWorker({
  name: 'reconciliation',
  queueUrlVariable: 'RECONCILIATION_QUEUE_URL',
  plannedFor: 'Phase 4',
  handler: notImplementedHandler,
});
