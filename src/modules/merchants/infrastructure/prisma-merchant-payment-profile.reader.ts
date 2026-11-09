import { Injectable } from '@nestjs/common';
import type { PaymentProviderName } from '../../../integrations/payment-providers/domain-ports/payment-provider.port';
import { TransactionHost } from '../../../shared/infrastructure/database/transaction-host';
import type { MerchantPaymentProfile, MerchantPaymentProfileReader } from '../public-api';

@Injectable()
export class PrismaMerchantPaymentProfileReader implements MerchantPaymentProfileReader {
  constructor(private readonly host: TransactionHost) {}

  async getPaymentProfile(merchantId: string): Promise<MerchantPaymentProfile | null> {
    const merchant = await this.host.client.merchant.findUnique({
      where: { id: merchantId },
      include: { providerAccounts: true },
    });
    if (!merchant) return null;

    const accountFor = (mode: 'test' | 'live') => {
      const account = merchant.providerAccounts.find((a) => a.mode === mode);
      return account
        ? {
            provider: account.provider as PaymentProviderName,
            accountId: account.providerAccountId,
          }
        : null;
    };

    return {
      merchantId: merchant.id,
      status: merchant.status,
      liveChargesEnabled: merchant.liveChargesEnabled,
      providerAccounts: { test: accountFor('test'), live: accountFor('live') },
    };
  }
}
