import {
  type CallHandler,
  type ExecutionContext,
  Inject,
  Injectable,
  Logger,
  type NestInterceptor,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { finalize, type Observable } from 'rxjs';
import type { MerchantContext } from '../../../shared/application/merchant-context';
import { API_REQUEST_LOG_STORE, type ApiRequestLogStore } from '../domain/api-key.repository';

/**
 * Developer request logs (PRD 5.4 "developers: logs"): metadata for calls made
 * with secret API keys. Never bodies, headers or query strings. Written after
 * the response, best-effort, so logging can never fail a payment request.
 */
@Injectable()
export class ApiRequestLogInterceptor implements NestInterceptor {
  private readonly logger = new Logger(ApiRequestLogInterceptor.name);

  constructor(@Inject(API_REQUEST_LOG_STORE) private readonly store: ApiRequestLogStore) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    const req = context
      .switchToHttp()
      .getRequest<Request & { id?: string; merchant?: MerchantContext }>();
    const res = context.switchToHttp().getResponse<Response>();
    const started = Date.now();
    return next.handle().pipe(
      finalize(() => {
        const merchant = req.merchant;
        if (!merchant || merchant.actor.type !== 'api_key') return;
        const route = (req.route as { path?: string } | undefined)?.path ?? req.path;
        this.store
          .append({
            merchantId: merchant.merchantId,
            apiKeyId: merchant.actor.id,
            mode: merchant.mode,
            method: req.method,
            route: route.slice(0, 200),
            statusCode: res.statusCode,
            durationMs: Date.now() - started,
            requestId: typeof req.id === 'string' ? req.id : null,
            idempotencyKey: req.header('idempotency-key')?.slice(0, 255) ?? null,
          })
          .catch((error: unknown) =>
            this.logger.warn({ err: error }, 'failed to write API request log'),
          );
      }),
    );
  }
}
