import { AsyncLocalStorage } from 'node:async_hooks';
import type { NextFunction, Request, Response } from 'express';

const storage = new AsyncLocalStorage<{ req: Request & { id?: string } }>();

/**
 * Makes the request id available to infrastructure (audit records, outbound
 * calls) without threading it through use-case signatures. The id is read
 * lazily because the logger middleware may assign it after this one runs.
 */
export function requestContextMiddleware(
  req: Request & { id?: string },
  _res: Response,
  next: NextFunction,
): void {
  storage.run({ req }, next);
}

export const ClsRequestContext = {
  requestId(): string | undefined {
    const id = storage.getStore()?.req.id;
    return typeof id === 'string' ? id : undefined;
  },
};
