/** Short-lived mutual exclusion across instances (e.g. one scheduler run at a time). Never guards money on its own. */
export interface DistributedLock {
  /** Returns a release function, or null if another holder has the lock. */
  tryAcquire(name: string, ttlMs: number): Promise<(() => Promise<void>) | null>;
}

export const DISTRIBUTED_LOCK = Symbol('DistributedLock');
