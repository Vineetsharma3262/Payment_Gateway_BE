/** A dependency the API needs before it can serve traffic. */
export interface ReadinessProbe {
  readonly name: string;
  check(): Promise<void>;
}

export const READINESS_PROBES = Symbol('ReadinessProbes');

export interface ReadinessReport {
  status: 'ok' | 'unavailable';
  checks: Record<string, 'up' | 'down' | 'not_configured'>;
}

export class CheckReadinessUseCase {
  constructor(
    private readonly probes: readonly ReadinessProbe[],
    private readonly timeoutMs = 2_000,
  ) {}

  async execute(): Promise<ReadinessReport> {
    const results = await Promise.all(
      this.probes.map(async (probe) => {
        try {
          await withTimeout(probe.check(), this.timeoutMs);
          return [probe.name, 'up'] as const;
        } catch {
          return [probe.name, 'down'] as const;
        }
      }),
    );
    const checks = Object.fromEntries(results);
    return { status: results.every(([, s]) => s === 'up') ? 'ok' : 'unavailable', checks };
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('timeout')), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}
