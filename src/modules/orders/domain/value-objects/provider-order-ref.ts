import { InvariantViolationError } from '../../../../shared/domain/domain-error';
import { ValueObject } from '../../../../shared/domain/value-object';

/**
 * Link from a PayCo order to the gateway's order. Internal only: persisted in
 * provider_resource_mappings and never serialised into public responses.
 */
export class ProviderOrderRef extends ValueObject<{ provider: string; providerOrderId: string }> {
  static of(provider: string, providerOrderId: string): ProviderOrderRef {
    if (!provider || !providerOrderId) {
      throw new InvariantViolationError('Provider order reference requires provider and id.');
    }
    return new ProviderOrderRef({ provider, providerOrderId });
  }

  get provider(): string {
    return this.props.provider;
  }

  get providerOrderId(): string {
    return this.props.providerOrderId;
  }
}
