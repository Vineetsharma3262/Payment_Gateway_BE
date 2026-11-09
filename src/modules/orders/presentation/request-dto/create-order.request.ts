import { z } from 'zod';
import { ORDER_LIMITS } from '../../domain/entities/order';

/**
 * Public request contract (snake_case). Shape and types are validated here;
 * business rules (USD-only, amount > 0, merchant permissions) are enforced in
 * the application and domain layers so they hold for every entry point.
 */
export const createOrderRequestSchema = z
  .object({
    amount: z
      .number()
      .int('amount must be an integer number of cents')
      .describe('Amount in the smallest currency unit (cents). 1000 = $10.00.'),
    currency: z
      .string()
      .length(3)
      .describe('Three-letter ISO currency code, lower-case. Only `usd` is accepted.'),
    receipt: z
      .string()
      .max(ORDER_LIMITS.receiptMaxLength)
      .optional()
      .describe('Your own reference for this order (e.g. invoice number).'),
    notes: z
      .record(z.string(), z.string())
      .optional()
      .describe(
        `Up to ${ORDER_LIMITS.notesMaxKeys} key-value pairs. Do not store sensitive personal data here.`,
      ),
  })
  .strict();

export type CreateOrderRequest = z.infer<typeof createOrderRequestSchema>;
