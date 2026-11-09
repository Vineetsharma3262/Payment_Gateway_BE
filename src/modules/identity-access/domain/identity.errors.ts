import { DomainError } from '../../../shared/domain/domain-error';

/** One message for unknown email, wrong password and disabled accounts: no account enumeration. */
export class InvalidCredentialsError extends DomainError {
  readonly code = 'INVALID_CREDENTIALS';

  constructor() {
    super('Email or password is incorrect.');
  }
}

export class AccountLockedError extends DomainError {
  readonly code = 'ACCOUNT_LOCKED';

  constructor(until: Date) {
    super('Too many failed sign-in attempts. Try again later.', {
      retry_after: until.toISOString(),
    });
  }
}

export class WeakPasswordError extends DomainError {
  readonly code = 'WEAK_PASSWORD';

  constructor(reason: string) {
    super(reason);
  }
}

export class InvalidEmailError extends DomainError {
  readonly code = 'INVARIANT_VIOLATION';

  constructor() {
    super('Email address is invalid.');
  }
}
