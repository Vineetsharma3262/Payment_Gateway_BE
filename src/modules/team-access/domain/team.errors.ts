import { DomainError } from '../../../shared/domain/domain-error';

export class LastOwnerError extends DomainError {
  readonly code = 'LAST_OWNER';

  constructor() {
    super('A merchant must keep at least one owner.');
  }
}

export class InvitationNotUsableError extends DomainError {
  readonly code = 'INVALID_TOKEN';

  constructor() {
    super('This invitation is invalid, expired or already used.');
  }
}
