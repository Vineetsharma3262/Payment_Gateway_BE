import 'reflect-metadata';
import { Logger } from '@nestjs/common';

/**
 * Scheduled invoice / subscription operations (renewals, dunning retries,
 * overdue reminders) using IntervalScheduler + DistributedLock. Phase 5:
 * refuses to start until the billing use cases are persisted.
 * Run: `node dist/workers/billing-scheduler/main.js`.
 */
new Logger('billing-scheduler').error('Worker not implemented yet (Phase 5); refusing to start.');
process.exitCode = 1;
