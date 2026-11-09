export interface FieldIssue {
  field: string;
  message: string;
}

export class RequestValidationError extends Error {
  readonly code = 'VALIDATION_FAILED';

  constructor(
    readonly issues: FieldIssue[],
    message = 'The request is invalid.',
  ) {
    super(message);
  }
}
