import { Entity } from '../../../shared/domain/entity';
import { InvariantViolationError } from '../../../shared/domain/domain-error';

/**
 * A merchant's end customer (payer). Merchant-scoped: the same email at two
 * merchants is two customers. Saved payment methods are gateway tokens
 * (needed for invoices and subscriptions, PRD 5.1) — never card data.
 */
export interface CustomerProps {
  id: string;
  merchantId: string;
  email: string | null;
  name: string | null;
  phone: string | null;
  savedPaymentMethodTokens: string[];
  createdAt: Date;
}

export class Customer extends Entity {
  private constructor(private readonly props: CustomerProps) {
    super(props.id);
  }

  static create(params: Omit<CustomerProps, 'savedPaymentMethodTokens'>): Customer {
    const email = params.email?.trim().toLowerCase() ?? null;
    if (email !== null && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new InvariantViolationError('Customer email is invalid.');
    }
    if (!email && !params.name)
      throw new InvariantViolationError('A customer needs an email or a name.');
    return new Customer({ ...params, email, savedPaymentMethodTokens: [] });
  }

  get merchantId(): string {
    return this.props.merchantId;
  }

  toProps(): CustomerProps {
    return { ...this.props, savedPaymentMethodTokens: [...this.props.savedPaymentMethodTokens] };
  }
}
