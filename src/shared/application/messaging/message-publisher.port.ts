export interface OutboundMessage {
  /** Stable id; consumers deduplicate on it (delivery is at-least-once). */
  id: string;
  type: string;
  /** Message group for ordered processing per aggregate when the queue is FIFO. */
  groupId: string;
  body: Record<string, unknown>;
}

export interface MessagePublisher {
  publish(message: OutboundMessage): Promise<void>;
}

export const MESSAGE_PUBLISHER = Symbol('MessagePublisher');
