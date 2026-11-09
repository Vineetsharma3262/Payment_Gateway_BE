import type { CapabilityStatus, PaymentProviderCapability } from './capabilities';

/**
 * Adapters translate every provider failure into one of these. The distinction
 * between "rejected", "unavailable" and "unknown" decides whether PayCo may
 * retry: only `ProviderUnavailableError` guarantees the operation did not happen.
 */
export abstract class ProviderError extends Error {
  protected constructor(
    readonly provider: string,
    readonly operation: string,
    message: string,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class ProviderCapabilityError extends ProviderError {
  constructor(
    provider: string,
    readonly capability: PaymentProviderCapability,
    readonly status: CapabilityStatus,
  ) {
    super(
      provider,
      capability,
      `Capability '${capability}' is ${status} for provider '${provider}'.`,
    );
  }
}

/** Provider definitively refused the request (validation, auth, business rule). Safe to surface. */
export class ProviderRejectedError extends ProviderError {
  constructor(
    provider: string,
    operation: string,
    readonly reason: string,
  ) {
    super(provider, operation, `Provider rejected ${operation}: ${reason}`);
  }
}

/** Request was not accepted (connection refused, rate limited before processing). Safe to retry. */
export class ProviderUnavailableError extends ProviderError {
  constructor(provider: string, operation: string, cause?: string) {
    super(provider, operation, `Provider unavailable for ${operation}${cause ? `: ${cause}` : ''}`);
  }
}

/** Request may have been processed (timeout, 5xx after send). Reconcile before retrying. */
export class ProviderOutcomeUnknownError extends ProviderError {
  constructor(provider: string, operation: string, cause?: string) {
    super(provider, operation, `Outcome unknown for ${operation}${cause ? `: ${cause}` : ''}`);
  }
}

export class ProviderSignatureInvalidError extends ProviderError {
  constructor(provider: string, operation: string) {
    super(provider, operation, `Signature verification failed for ${operation}.`);
  }
}

/** The capability may exist at the provider but PayCo has not built the adapter call yet. */
export class ProviderOperationNotImplementedError extends ProviderError {
  constructor(provider: string, operation: string, reason: string) {
    super(provider, operation, `${operation} is not implemented for '${provider}': ${reason}`);
  }
}
