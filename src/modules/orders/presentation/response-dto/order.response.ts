import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ORDER_STATUSES, type OrderStatus } from '../../domain/value-objects/order-status';
import type { OrderDto } from '../../application/dto/order.dto';

export class OrderCheckoutResponse {
  @ApiProperty({ description: 'PayCo-hosted checkout URL for this order.' })
  url!: string;
}

/** Public order representation. Contains no provider identifiers. */
export class OrderResponse {
  @ApiProperty({ example: 'ord_3fZk9Qm2LxV8pR1sT4uW6yA0' })
  id!: string;

  @ApiProperty({ enum: ['order'] })
  object!: 'order';

  @ApiProperty({ description: 'Amount in cents.', example: 2500 })
  amount!: number;

  @ApiProperty({ example: 'usd' })
  currency!: string;

  @ApiProperty({ enum: ORDER_STATUSES })
  status!: OrderStatus;

  @ApiProperty({ description: 'True for live mode, false for test mode.' })
  livemode!: boolean;

  @ApiPropertyOptional({ nullable: true, type: String })
  receipt!: string | null;

  @ApiProperty({ type: 'object', additionalProperties: { type: 'string' } })
  notes!: Record<string, string>;

  @ApiPropertyOptional({ nullable: true, type: OrderCheckoutResponse })
  checkout!: OrderCheckoutResponse | null;

  @ApiPropertyOptional({ nullable: true, type: String })
  failure_reason!: string | null;

  @ApiProperty({ format: 'date-time' })
  created_at!: string;

  @ApiProperty({ format: 'date-time' })
  updated_at!: string;

  static from(dto: OrderDto, checkoutBaseUrl: string): OrderResponse {
    return {
      id: dto.id,
      object: 'order',
      amount: dto.amountMinor,
      currency: dto.currency.toLowerCase(),
      status: dto.status,
      livemode: dto.mode === 'live',
      receipt: dto.receipt,
      notes: dto.notes,
      checkout:
        dto.status === 'awaiting_payment'
          ? { url: `${checkoutBaseUrl.replace(/\/$/, '')}/${encodeURIComponent(dto.id)}` }
          : null,
      failure_reason: dto.failureReason,
      created_at: dto.createdAt,
      updated_at: dto.updatedAt,
    };
  }
}
