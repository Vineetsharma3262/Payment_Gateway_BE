import { DomainError } from '../../../../shared/domain/domain-error';

export class InvalidOrderAmountError extends DomainError {
  readonly code = 'INVALID_ORDER_AMOUNT';

  constructor(amountMinor: number) {
    super('Order amount must be a positive integer number of cents.', { amountMinor });
  }
}

export class InvalidOrderReceiptError extends DomainError {
  readonly code = 'INVALID_ORDER_RECEIPT';

  constructor(maxLength: number) {
    super(`Receipt must be between 1 and ${maxLength} characters.`, { maxLength });
  }
}

export class InvalidOrderNotesError extends DomainError {
  readonly code = 'INVALID_ORDER_NOTES';

  constructor(reason: string) {
    super(reason);
  }
}
