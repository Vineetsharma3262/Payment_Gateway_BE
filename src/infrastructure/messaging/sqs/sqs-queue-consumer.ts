import {
  ChangeMessageVisibilityCommand,
  DeleteMessageCommand,
  ReceiveMessageCommand,
  type SQSClient,
} from '@aws-sdk/client-sqs';
import { backoffWithJitter } from '../../../shared/domain/retry-policy';

export interface QueueMessage {
  id: string;
  body: unknown;
  receiveCount: number;
}

export type MessageHandler = (message: QueueMessage) => Promise<void>;

export interface ConsumerOptions {
  maxMessages: number;
  waitTimeSeconds: number;
  /** Backoff for failed messages, applied through the visibility timeout. */
  retryBaseSeconds: number;
  retryCapSeconds: number;
}

const DEFAULTS: ConsumerOptions = {
  maxMessages: 10,
  waitTimeSeconds: 20,
  retryBaseSeconds: 5,
  retryCapSeconds: 900,
};

/**
 * At-least-once SQS consumer:
 * - long polling;
 * - success → delete; failure → keep the message invisible for a jittered
 *   exponential delay, so retries back off;
 * - after the queue's `maxReceiveCount`, SQS moves it to the dead-letter queue
 *   (redrive policy is infrastructure-as-code). Handlers must be idempotent.
 */
export class SqsQueueConsumer {
  private readonly options: ConsumerOptions;

  constructor(
    private readonly client: SQSClient,
    private readonly queueUrl: string,
    private readonly handler: MessageHandler,
    private readonly onError: (error: unknown, message: QueueMessage) => void,
    options: Partial<ConsumerOptions> = {},
    private readonly random: () => number = Math.random,
  ) {
    this.options = { ...DEFAULTS, ...options };
  }

  /** Processes one batch; returns how many messages succeeded. */
  async pollOnce(): Promise<number> {
    const result = await this.client.send(
      new ReceiveMessageCommand({
        QueueUrl: this.queueUrl,
        MaxNumberOfMessages: this.options.maxMessages,
        WaitTimeSeconds: this.options.waitTimeSeconds,
        MessageSystemAttributeNames: ['ApproximateReceiveCount'],
      }),
    );
    let succeeded = 0;
    for (const raw of result.Messages ?? []) {
      if (!raw.ReceiptHandle || !raw.MessageId) continue;
      const message: QueueMessage = {
        id: raw.MessageId,
        body: safeJson(raw.Body),
        receiveCount: Number(raw.Attributes?.ApproximateReceiveCount ?? '1'),
      };
      try {
        await this.handler(message);
        await this.client.send(
          new DeleteMessageCommand({ QueueUrl: this.queueUrl, ReceiptHandle: raw.ReceiptHandle }),
        );
        succeeded++;
      } catch (error) {
        this.onError(error, message);
        const delayMs = backoffWithJitter(
          message.receiveCount - 1,
          {
            baseMs: this.options.retryBaseSeconds * 1000,
            capMs: this.options.retryCapSeconds * 1000,
          },
          this.random,
        );
        await this.client.send(
          new ChangeMessageVisibilityCommand({
            QueueUrl: this.queueUrl,
            ReceiptHandle: raw.ReceiptHandle,
            VisibilityTimeout: Math.max(1, Math.round(delayMs / 1000)),
          }),
        );
      }
    }
    return succeeded;
  }
}

function safeJson(body: string | undefined): unknown {
  try {
    return body ? (JSON.parse(body) as unknown) : null;
  } catch {
    return body ?? null;
  }
}
