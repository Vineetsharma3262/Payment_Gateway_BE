import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import { ApiHeader } from '@nestjs/swagger';
import type { Request } from 'express';
import { RequestValidationError } from '../validation/request-validation.error';

export const IDEMPOTENCY_KEY_HEADER = 'idempotency-key';
const VALID_KEY = /^[\x21-\x7e]{8,255}$/;

/** Required on every financial create operation (PRD 7.2). */
export const IdempotencyKey = createParamDecorator((_: unknown, ctx: ExecutionContext): string => {
  const value = ctx.switchToHttp().getRequest<Request>().header(IDEMPOTENCY_KEY_HEADER);
  if (!value || !VALID_KEY.test(value)) {
    throw new RequestValidationError(
      [
        {
          field: 'Idempotency-Key',
          message: 'Header is required: 8-255 printable ASCII characters.',
        },
      ],
      'An Idempotency-Key header is required for this operation.',
    );
  }
  return value;
});

export const ApiIdempotencyKeyHeader = () =>
  ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    description:
      'Unique key per logical operation (e.g. a UUID). Retrying with the same key and body returns the original result; a different body is rejected. Keys are honoured for 24 hours.',
  });
