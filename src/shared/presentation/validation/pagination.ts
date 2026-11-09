import { z } from 'zod';

/** Cursor pagination query shared by list endpoints. */
export const paginationQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  starting_after: z.string().max(40).optional(),
});

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;
