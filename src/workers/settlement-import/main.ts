import { notImplementedHandler, runQueueWorker } from '../run-queue-worker';

/**
 * Imports gateway settlement reports into Settlement aggregates and ledger postings.
 * Run: `node dist/workers/settlement-import/main.js` (same image as the API).
 */
void runQueueWorker({
  name: 'settlement-import',
  queueUrlVariable: 'SETTLEMENT_IMPORT_QUEUE_URL',
  plannedFor: 'Phase 4',
  handler: notImplementedHandler,
});
