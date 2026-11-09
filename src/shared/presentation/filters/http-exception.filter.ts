import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { ApplicationError } from '../../application/application-error';
import { DomainError } from '../../domain/domain-error';
import { RequestValidationError } from '../validation/request-validation.error';
import { ERROR_STATUS, HTTP_STATUS_CODES } from './error-codes';

interface ErrorBody {
  error: { code: string; message: string; details?: unknown };
  meta: { request_id: string | undefined };
}

/**
 * Single place where errors become HTTP responses. Unknown errors are logged
 * with their stack and returned as an opaque `internal_error`.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<Request & { id?: string }>();
    const response = http.getResponse<Response>();
    const { status, code, message, details } = this.describe(exception);

    if (status >= 500) {
      this.logger.error({ err: exception, requestId: request.id, code }, 'Request failed');
    }
    if (code === 'PROVIDER_UNAVAILABLE' || code === 'PROVIDER_OUTCOME_UNKNOWN') {
      response.setHeader('Retry-After', '5');
    }

    const body: ErrorBody = {
      error: { code: code.toLowerCase(), message, ...(details === undefined ? {} : { details }) },
      meta: { request_id: request.id },
    };
    response.status(status).json(body);
  }

  private describe(exception: unknown): {
    status: number;
    code: string;
    message: string;
    details?: unknown;
  } {
    if (exception instanceof RequestValidationError) {
      return {
        status: HttpStatus.BAD_REQUEST,
        code: exception.code,
        message: exception.message,
        details: exception.issues,
      };
    }
    if (exception instanceof DomainError || exception instanceof ApplicationError) {
      return {
        status: ERROR_STATUS[exception.code] ?? HttpStatus.UNPROCESSABLE_ENTITY,
        code: exception.code,
        message: exception.message,
        details: exception.details,
      };
    }
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const code =
        HTTP_STATUS_CODES[status] ?? (status >= 500 ? 'INTERNAL_ERROR' : 'REQUEST_FAILED');
      return {
        status,
        code,
        message: status >= 500 ? 'Internal server error.' : exception.message,
      };
    }
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      code: 'INTERNAL_ERROR',
      message: 'Internal server error.',
    };
  }
}
