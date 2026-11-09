import { ResourceNotFoundError } from '../../../../shared/application/application-error';
import type { Clock } from '../../../../shared/application/clock.port';
import type { DomainEventPublisher } from '../../../../shared/application/domain-event-publisher.port';
import type { OrderRepository } from '../../domain/repositories/order.repository';
import type { OrderPaymentRecorder } from '../../public-api';

export class OrderPaymentRecorderService implements OrderPaymentRecorder {
  constructor(
    private readonly orders: OrderRepository,
    private readonly events: DomainEventPublisher,
    private readonly clock: Clock,
  ) {}

  async markPaid(merchantId: string, orderId: string): Promise<void> {
    const order = await this.orders.findForMerchant(merchantId, orderId);
    if (!order) throw new ResourceNotFoundError('order', orderId);
    order.markPaid(this.clock.now());
    await this.orders.save(order);
    await this.events.publish(order.pullEvents());
  }
}
