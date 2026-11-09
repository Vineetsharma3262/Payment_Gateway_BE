import { Money } from '../../shared/domain/money';
import type { CapabilityMatrix, PaymentProviderCapability } from './domain-ports/capabilities';
import type { ProviderMode } from './domain-ports/payment-provider.port';
import { ProviderCapabilityError } from './domain-ports/provider-errors';

/**
 * Shared adapter guard: refuse unsupported capabilities always, and unconfirmed
 * capabilities in live mode (they may be exercised against provider test mode
 * while the commercial agreement is being confirmed).
 */
export function assertCapability(
  provider: string,
  matrix: CapabilityMatrix,
  capability: PaymentProviderCapability,
  mode: ProviderMode,
): void {
  const status = matrix[capability];
  if (status === 'supported') return;
  if (status === 'unconfirmed' && mode === 'test') return;
  throw new ProviderCapabilityError(provider, capability, status);
}

export function usdFromProviderCents(amount: number, currency: string): Money {
  const upper = currency.toUpperCase();
  if (!Money.isSupportedCurrency(upper)) {
    throw new Error(`Provider returned unsupported currency '${currency}'.`);
  }
  return Money.of(amount, upper);
}
