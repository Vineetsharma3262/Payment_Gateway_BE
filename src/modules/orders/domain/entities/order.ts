import { AggregateRoot } from '../../../../shared/domain/aggregate-root';
import { InvalidStateTransitionError } from '../../../../shared/domain/domain-error';
import type { Money } from '../../../../shared/domain/money';
import {
  InvalidOrderAmountError,
  InvalidOrderNotesError,
  InvalidOrderReceiptError,
} from '../errors/order.errors';
import { OrderEventTypes, type OrderEventType } from '../events/order.events';
import { canTransition, type OrderStatus } from '../value-objects/order-status';
import type { ProviderOrderRef } from '../value-objects/provider-order-ref';

export type OrderMode = 'test' | 'live';
export type OrderNotes = Readonly<Record<string, string>>;

export const ORDER_LIMITS = {
  receiptMaxLength: 40,
  notesMaxKeys: 15,
  notesKeyMaxLength: 40,
  notesValueMaxLength: 256,
} as const;

export interface OrderProps {
  id: string;
  merchantId: string;
  mode: OrderMode;
  amount: Money;
  status: OrderStatus;
  receipt: string | null;
  notes: OrderNotes;
  providerOrder: ProviderOrderRef | null;
  failureReason: string | null;
  createdAt: Date;
  updatedAt: Date;
  version: number;
}

export interface CreateOrderParams {
  id: string;
  merchantId: string;
  mode: OrderMode;
  amount: Money;
  receipt?: string | null;
  notes?: Record<string, string>;
  now: Date;
}

/**
 * Order aggregate (Orders bounded context). An order is the merchant's intent
 * to collect a fixed USD amount; payments are attempts against it and belong to
 * the Payments context.
 */
export class Order extends AggregateRoot {
  private constructor(private props: OrderProps) {
    super(props.id, props.version);
  }

  static create(params: CreateOrderParams): Order {
    if (!params.amount.isPositive()) throw new InvalidOrderAmountError(params.amount.amountMinor);
    const receipt = Order.validateReceipt(params.receipt ?? null);
    const notes = Order.validateNotes(params.notes ?? {});

    const order = new Order({
      id: params.id,
      merchantId: params.merchantId,
      mode: params.mode,
      amount: params.amount,
      status: 'created',
      receipt,
      notes,
      providerOrder: null,
      failureReason: null,
      createdAt: params.now,
      updatedAt: params.now,
      version: 0,
    });
    order.recordEvent(OrderEventTypes.Created, params.now);
    return order;
  }

  /** Rebuilds an aggregate from persistence without re-running creation rules or emitting events. */
  static rehydrate(props: OrderProps): Order {
    return new Order({ ...props });
  }

  get merchantId(): string {
    return this.props.merchantId;
  }
  get mode(): OrderMode {
    return this.props.mode;
  }
  get amount(): Money {
    return this.props.amount;
  }
  get status(): OrderStatus {
    return this.props.status;
  }
  get receipt(): string | null {
    return this.props.receipt;
  }
  get notes(): OrderNotes {
    return this.props.notes;
  }
  get providerOrder(): ProviderOrderRef | null {
    return this.props.providerOrder;
  }
  get failureReason(): string | null {
    return this.props.failureReason;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
  get updatedAt(): Date {
    return this.props.updatedAt;
  }

  belongsTo(merchantId: string): boolean {
    return this.props.merchantId === merchantId;
  }

  attachProviderOrder(ref: ProviderOrderRef, now: Date): void {
    this.transitionTo('awaiting_payment', now);
    this.props.providerOrder = ref;
    this.recordEvent(OrderEventTypes.AwaitingPayment, now);
  }

  markProviderRejected(reason: string, now: Date): void {
    this.transitionTo('failed', now);
    this.props.failureReason = reason.slice(0, 500);
    this.recordEvent(OrderEventTypes.ProviderCreationFailed, now, {
      reason: this.props.failureReason,
    });
  }

  /** The provider may or may not hold an order for us; status sync must reconcile. State is unchanged. */
  flagProviderOutcomeUnknown(now: Date): void {
    if (this.props.status !== 'created') return;
    this.recordEvent(OrderEventTypes.ProviderSyncRequired, now);
  }

  markPaid(now: Date): void {
    if (this.props.status === 'paid') return; // duplicate/out-of-order webhook: idempotent no-op
    this.transitionTo('paid', now);
    this.recordEvent(OrderEventTypes.Paid, now);
  }

  expire(now: Date): void {
    this.transitionTo('expired', now);
    this.recordEvent(OrderEventTypes.Expired, now);
  }

  private transitionTo(next: OrderStatus, now: Date): void {
    if (!canTransition(this.props.status, next)) {
      throw new InvalidStateTransitionError('Order', this.props.status, next);
    }
    this.props.status = next;
    this.props.updatedAt = now;
  }

  private recordEvent(
    eventType: OrderEventType,
    now: Date,
    extra: Record<string, unknown> = {},
  ): void {
    this.record({
      eventType,
      aggregateType: 'order',
      aggregateId: this.id,
      merchantId: this.props.merchantId,
      occurredAt: now,
      payload: {
        orderId: this.id,
        mode: this.props.mode,
        amountMinor: this.props.amount.amountMinor,
        currency: this.props.amount.currency,
        status: this.props.status,
        ...extra,
      },
    });
  }

  private static validateReceipt(receipt: string | null): string | null {
    if (receipt === null) return null;
    const trimmed = receipt.trim();
    if (trimmed.length === 0 || trimmed.length > ORDER_LIMITS.receiptMaxLength) {
      throw new InvalidOrderReceiptError(ORDER_LIMITS.receiptMaxLength);
    }
    return trimmed;
  }

  private static validateNotes(notes: Record<string, string>): OrderNotes {
    const entries = Object.entries(notes);
    if (entries.length > ORDER_LIMITS.notesMaxKeys) {
      throw new InvalidOrderNotesError(`At most ${ORDER_LIMITS.notesMaxKeys} notes are allowed.`);
    }
    for (const [key, value] of entries) {
      if (key.length === 0 || key.length > ORDER_LIMITS.notesKeyMaxLength) {
        throw new InvalidOrderNotesError(
          `Note keys must be 1-${ORDER_LIMITS.notesKeyMaxLength} characters.`,
        );
      }
      if (typeof value !== 'string' || value.length > ORDER_LIMITS.notesValueMaxLength) {
        throw new InvalidOrderNotesError(
          `Note values must be strings of at most ${ORDER_LIMITS.notesValueMaxLength} characters.`,
        );
      }
    }
    return Object.freeze({ ...notes });
  }
}
