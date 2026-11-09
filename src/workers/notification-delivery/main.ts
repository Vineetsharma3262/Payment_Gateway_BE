import { notImplementedHandler, runQueueWorker } from '../run-queue-worker';

/**
 * Sends branded receipts and notifications through the EmailSender port.
 * Run: `node dist/workers/notification-delivery/main.js` (same image as the API).
 */
void runQueueWorker({
  name: 'notification-delivery',
  queueUrlVariable: 'NOTIFICATION_QUEUE_URL',
  plannedFor: 'Phase 5',
  handler: notImplementedHandler,
});
