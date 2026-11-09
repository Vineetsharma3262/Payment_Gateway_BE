import { SendMessageCommand, type SQSClient } from '@aws-sdk/client-sqs';
import type {
  MessagePublisher,
  OutboundMessage,
} from '../../../shared/application/messaging/message-publisher.port';

/**
 * Publishes to an SQS queue. Exhausted consumer retries are moved to the
 * queue's dead-letter queue by its redrive policy (configured in infrastructure
 * as code, see docs/architecture/overview.md#asynchronous-processing).
 */
export class SqsMessagePublisher implements MessagePublisher {
  private readonly fifo: boolean;

  constructor(
    private readonly client: SQSClient,
    private readonly queueUrl: string,
  ) {
    this.fifo = queueUrl.endsWith('.fifo');
  }

  async publish(message: OutboundMessage): Promise<void> {
    await this.client.send(
      new SendMessageCommand({
        QueueUrl: this.queueUrl,
        MessageBody: JSON.stringify({ id: message.id, type: message.type, ...message.body }),
        MessageAttributes: { eventType: { DataType: 'String', StringValue: message.type } },
        ...(this.fifo
          ? { MessageGroupId: message.groupId, MessageDeduplicationId: message.id }
          : {}),
      }),
    );
  }
}
