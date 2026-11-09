export interface PageRequest {
  limit: number;
  /** Id of the last item of the previous page. */
  startingAfter?: string;
}

export interface Page<T> {
  items: T[];
  hasMore: boolean;
  nextCursor: string | null;
}

/** Repositories fetch `limit + 1` rows; this trims and computes the cursor. */
export function toPage<T extends { id: string }>(rows: T[], limit: number): Page<T> {
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  return { items, hasMore, nextCursor: hasMore ? items[items.length - 1].id : null };
}
