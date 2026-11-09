/**
 * Base class for business-rule violations. Carries a stable, machine-readable
 * code that the presentation layer maps to an HTTP status and public error code.
 */
export abstract class DomainError extends Error {
  abstract readonly code: string;

  protected constructor(
    message: string,
    readonly details?: Readonly<Record<string, unknown>>,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class InvariantViolationError extends DomainError {
  readonly code = 'INVARIANT_VIOLATION';

  constructor(message: string, details?: Record<string, unknown>) {
    super(message, details);
  }
}

export class InvalidStateTransitionError extends DomainError {
  readonly code = 'INVALID_STATE_TRANSITION';

  constructor(aggregate: string, from: string, to: string) {
    super(`${aggregate} cannot transition from '${from}' to '${to}'.`, { aggregate, from, to });
  }
}
