import { ResourceNotFoundError } from '../../../../shared/application/application-error';
import type { UseCase } from '../../../../shared/application/use-case';
import type { OrderRepository } from '../../domain/repositories/order.repository';
import type { GetOrderInput, OrderDto } from '../dto/order.dto';
import { toOrderDto } from '../mappers/order-dto.mapper';

export class GetOrderUseCase implements UseCase<GetOrderInput, OrderDto> {
  constructor(private readonly orders: OrderRepository) {}

  async execute({ merchant, orderId }: GetOrderInput): Promise<OrderDto> {
    const order = await this.orders.findForMerchant(merchant.merchantId, orderId);
    // Same error for "missing" and "owned by someone else" and "other mode": no tenant enumeration.
    if (!order || !order.belongsTo(merchant.merchantId) || order.mode !== merchant.mode) {
      throw new ResourceNotFoundError('order', orderId);
    }
    return toOrderDto(order);
  }
}
