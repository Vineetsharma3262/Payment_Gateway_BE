/**
 * Runs work inside a single database transaction. Repositories and the outbox
 * writer join the ambient transaction automatically.
 *
 * Never call an external provider inside `run`: a database transaction cannot
 * include a network call atomically, and holding a transaction open across one
 * exhausts connections under provider latency.
 */
export interface UnitOfWork {
  run<T>(work: () => Promise<T>): Promise<T>;
}

export const UNIT_OF_WORK = Symbol('UnitOfWork');
