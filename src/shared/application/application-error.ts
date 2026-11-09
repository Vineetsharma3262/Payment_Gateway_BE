/**
 * Errors raised by use cases for conditions that are not domain invariants
 * (missing resources, conflicts, authorization). Mapped to HTTP by the
 * presentation layer's exception filter.
 */
export abstract class ApplicationError extends Error {
  abstract readonly code: string;

  protected constructor(
    message: string,
    readonly details?: Readonly<Record<string, unknown>>,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

/**
 * Also used for resources owned by another merchant, so that existence of
 * other tenants' resources is never disclosed.
 */
export class ResourceNotFoundError extends ApplicationError {
  readonly code = 'RESOURCE_NOT_FOUND';

  constructor(resource: string, id: string) {
    super(`No ${resource} found with id '${id}'.`, { resource, id });
  }
}

export class ConcurrencyConflictError extends ApplicationError {
  readonly code = 'CONCURRENCY_CONFLICT';

  constructor(resource: string, id: string) {
    super(`${resource} '${id}' was modified concurrently. Retry the request.`, { resource, id });
  }
}

export class IdempotencyKeyInProgressError extends ApplicationError {
  readonly code = 'IDEMPOTENCY_KEY_IN_PROGRESS';

  constructor() {
    super('A request with this Idempotency-Key is still being processed.');
  }
}

export class IdempotencyKeyReusedError extends ApplicationError {
  readonly code = 'IDEMPOTENCY_KEY_REUSED';

  constructor() {
    super('This Idempotency-Key was already used with a different request payload.');
  }
}

export class MerchantNotPermittedError extends ApplicationError {
  readonly code = 'MERCHANT_NOT_PERMITTED';

  constructor(reason: string) {
    super(reason);
  }
}

export class UnsupportedCurrencyError extends ApplicationError {
  readonly code = 'UNSUPPORTED_CURRENCY';

  constructor(currency: string) {
    super(`Currency '${currency}' is not supported. PayCo currently accepts USD only.`, {
      currency,
    });
  }
}

/**
 * The provider may or may not have performed the operation (timeout, 5xx after
 * send). Callers must reconcile before retrying anything that moves money.
 */
export class ProviderOutcomeUnknownError extends ApplicationError {
  readonly code = 'PROVIDER_OUTCOME_UNKNOWN';

  constructor(operation: string, resourceId: string) {
    super(
      `The payment provider did not confirm '${operation}'. Retry with the same Idempotency-Key; PayCo will reconcile before acting again.`,
      { operation, resourceId },
    );
  }
}

export class ProviderRejectedError extends ApplicationError {
  readonly code = 'PROVIDER_REJECTED';

  constructor(operation: string, reason: string) {
    super(`The payment provider rejected '${operation}': ${reason}`, { operation });
  }
}

export class CapabilityNotSupportedError extends ApplicationError {
  readonly code = 'CAPABILITY_NOT_SUPPORTED';

  constructor(provider: string, capability: string, status: string) {
    super(`Provider '${provider}' capability '${capability}' is ${status}.`, {
      provider,
      capability,
      status,
    });
  }
}

export class ProviderUnavailableError extends ApplicationError {
  readonly code = 'PROVIDER_UNAVAILABLE';

  constructor(operation: string) {
    super(
      `The payment provider is temporarily unavailable for '${operation}'. It is safe to retry.`,
      {
        operation,
      },
    );
  }
}

/** Re-raises the error stored for an idempotent request so a retry observes the same outcome. */
export class ReplayedApplicationError extends ApplicationError {
  constructor(
    readonly code: string,
    message: string,
    details?: Record<string, unknown>,
  ) {
    super(message, details);
  }
}

/** Route exists in the published contract but its phase is not implemented yet (HTTP 501). */
export class PlannedFeatureError extends ApplicationError {
  readonly code = 'NOT_IMPLEMENTED';

  constructor(feature: string, phase: string) {
    super(`'${feature}' is part of the API contract but is not implemented yet (${phase}).`, {
      feature,
      phase,
    });
  }
}

export class ForbiddenError extends ApplicationError {
  readonly code = 'FORBIDDEN';

  constructor(message = 'You do not have permission to perform this action.') {
    super(message);
  }
}

export class ConflictError extends ApplicationError {
  readonly code = 'CONFLICT';

  constructor(message: string, details?: Record<string, unknown>) {
    super(message, details);
  }
}
