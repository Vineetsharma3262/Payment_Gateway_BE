import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import { ForbiddenError } from '../../application/application-error';
import type { MerchantContext } from '../../application/merchant-context';
import type { UserContext } from '../../application/user-context';
import type { UserRequest } from '../guards/jwt-auth.guard';

export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): UserContext => {
    const user = ctx.switchToHttp().getRequest<UserRequest>().user;
    if (!user) throw new Error('CurrentUser used on a route without JwtAuthGuard.');
    return user;
  },
);

/**
 * Merchant context for dashboard requests: tenant from the session, mode from
 * the `PayCo-Mode` header (default `test`).
 */
export const DashboardMerchant = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): MerchantContext => {
    const request = ctx.switchToHttp().getRequest<UserRequest>();
    const user = request.user;
    if (!user) throw new Error('DashboardMerchant used on a route without JwtAuthGuard.');
    if (!user.merchantId) throw new ForbiddenError('This action requires a merchant workspace.');
    const mode = request.header('payco-mode') === 'live' ? 'live' : 'test';
    return { merchantId: user.merchantId, mode, actor: { type: 'user', id: user.userId } };
  },
);
