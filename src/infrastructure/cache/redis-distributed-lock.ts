import { randomUUID } from 'node:crypto';
import type Redis from 'ioredis';
import type { DistributedLock } from '../../shared/application/distributed-lock.port';

const RELEASE = `if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) else return 0 end`;

export class RedisDistributedLock implements DistributedLock {
  constructor(private readonly redis: Redis) {}

  async tryAcquire(name: string, ttlMs: number): Promise<(() => Promise<void>) | null> {
    const key = `payco:lock:${name}`;
    const token = randomUUID();
    const ok = await this.redis.set(key, token, 'PX', ttlMs, 'NX');
    if (ok !== 'OK') return null;
    return async () => {
      await this.redis.eval(RELEASE, 1, key, token);
    };
  }
}

/** Single-process fallback for development/test. */
export class InProcessLock implements DistributedLock {
  private readonly held = new Map<string, number>();

  tryAcquire(name: string, ttlMs: number): Promise<(() => Promise<void>) | null> {
    const until = this.held.get(name);
    if (until && until > Date.now()) return Promise.resolve(null);
    this.held.set(name, Date.now() + ttlMs);
    return Promise.resolve(() => {
      this.held.delete(name);
      return Promise.resolve();
    });
  }
}
