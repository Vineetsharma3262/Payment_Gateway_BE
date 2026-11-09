import { setTimeout as sleep } from 'node:timers/promises';
import type { DistributedLock } from '../../shared/application/distributed-lock.port';

export interface ScheduledJob {
  name: string;
  intervalMs: number;
  run(): Promise<void>;
}

/**
 * Runs jobs periodically; a distributed lock ensures one instance runs a given
 * job per interval even with several scheduler processes. Jobs must be
 * idempotent: a lock can expire mid-run.
 */
export class IntervalScheduler {
  private running = false;

  constructor(
    private readonly lock: DistributedLock,
    private readonly onError: (job: string, error: unknown) => void,
  ) {}

  async start(jobs: readonly ScheduledJob[], tickMs = 1_000): Promise<void> {
    this.running = true;
    const nextRun = new Map(jobs.map((j) => [j.name, 0]));
    while (this.running) {
      for (const job of jobs) {
        if (Date.now() < (nextRun.get(job.name) ?? 0)) continue;
        nextRun.set(job.name, Date.now() + job.intervalMs);
        const release = await this.lock.tryAcquire(`job:${job.name}`, job.intervalMs);
        if (!release) continue;
        try {
          await job.run();
        } catch (error) {
          this.onError(job.name, error);
        } finally {
          await release();
        }
      }
      await sleep(tickMs);
    }
  }

  stop(): void {
    this.running = false;
  }
}
