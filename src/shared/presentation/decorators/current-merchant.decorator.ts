import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { MerchantContext } from '../../application/merchant-context';

export type AuthenticatedRequest = Request & { merchant?: MerchantContext };

/** The tenant established by an authentication guard. Never derived from body, query or path. */
export const CurrentMerchant = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): MerchantContext => {
    const merchant = ctx.switchToHttp().getRequest<AuthenticatedRequest>().merchant;
    if (!merchant)
      throw new Error('CurrentMerchant used on a route without an authentication guard.');
    return merchant;
  },
);
