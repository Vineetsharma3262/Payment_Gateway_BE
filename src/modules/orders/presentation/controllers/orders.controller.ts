import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { APP_CONFIG, type AppConfig } from '../../../../config/configuration';
import type { MerchantContext } from '../../../../shared/application/merchant-context';
import { CurrentMerchant } from '../../../../shared/presentation/decorators/current-merchant.decorator';
import {
  ApiIdempotencyKeyHeader,
  IdempotencyKey,
} from '../../../../shared/presentation/decorators/idempotency-key.decorator';
import { ApiKeyAuthGuard } from '../../../../shared/presentation/guards/api-key-auth.guard';
import {
  toOpenApiSchema,
  ZodValidationPipe,
} from '../../../../shared/presentation/validation/zod-validation.pipe';
import type { CreateOrderUseCase } from '../../application/use-cases/create-order.use-case';
import type { GetOrderUseCase } from '../../application/use-cases/get-order.use-case';
import { CREATE_ORDER_USE_CASE, GET_ORDER_USE_CASE } from '../../orders.tokens';
import {
  createOrderRequestSchema,
  type CreateOrderRequest,
} from '../request-dto/create-order.request';
import { OrderResponse } from '../response-dto/order.response';

/** Merchant-facing (server-to-server, secret API key). */
@ApiTags('Orders')
@ApiBearerAuth('api-key')
@UseGuards(ApiKeyAuthGuard)
@Controller({ path: 'orders', version: '1' })
export class OrdersController {
  constructor(
    @Inject(CREATE_ORDER_USE_CASE) private readonly createOrder: CreateOrderUseCase,
    @Inject(GET_ORDER_USE_CASE) private readonly getOrder: GetOrderUseCase,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create an order',
    description:
      'Creates a PayCo order and the corresponding order at the payment provider under your account. Returns a PayCo checkout URL once the order can accept payment.',
  })
  @ApiIdempotencyKeyHeader()
  @ApiBody({ schema: toOpenApiSchema(createOrderRequestSchema) })
  @ApiCreatedResponse({ type: OrderResponse })
  async create(
    @CurrentMerchant() merchant: MerchantContext,
    @IdempotencyKey() idempotencyKey: string,
    @Body(new ZodValidationPipe(createOrderRequestSchema)) body: CreateOrderRequest,
  ): Promise<OrderResponse> {
    const order = await this.createOrder.execute({
      merchant,
      idempotencyKey,
      amountMinor: body.amount,
      currency: body.currency,
      receipt: body.receipt,
      notes: body.notes,
    });
    return OrderResponse.from(order, this.config.checkout.baseUrl);
  }

  @Get(':orderId')
  @ApiOperation({ summary: 'Retrieve an order' })
  @ApiParam({ name: 'orderId', example: 'ord_3fZk9Qm2LxV8pR1sT4uW6yA0' })
  @ApiOkResponse({ type: OrderResponse })
  async retrieve(
    @CurrentMerchant() merchant: MerchantContext,
    @Param('orderId') orderId: string,
  ): Promise<OrderResponse> {
    const order = await this.getOrder.execute({ merchant, orderId });
    return OrderResponse.from(order, this.config.checkout.baseUrl);
  }
}
