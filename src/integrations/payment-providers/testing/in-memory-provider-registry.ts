import type {
  PaymentProvider,
  PaymentProviderName,
  PaymentProviderRegistry,
} from '../domain-ports/payment-provider.port';

export class StaticPaymentProviderRegistry implements PaymentProviderRegistry {
  private readonly providers: Map<PaymentProviderName, PaymentProvider>;

  constructor(providers: readonly PaymentProvider[]) {
    this.providers = new Map(providers.map((p) => [p.name, p]));
  }

  get(name: PaymentProviderName): PaymentProvider {
    const provider = this.providers.get(name);
    if (!provider) throw new Error(`Payment provider '${name}' is not configured.`);
    return provider;
  }
}
