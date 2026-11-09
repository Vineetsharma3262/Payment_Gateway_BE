import {
  ChangeMessageVisibilityCommand,
  DeleteMessageCommand,
  ReceiveMessageCommand,
  type SQSClient,
} from '@aws-sdk/client-sqs';
import { SqsQueueConsumer } from '../../../infrastructure/messaging/sqs/sqs-queue-consumer';

describe('SQS queue consumer', () => {
  it('deletes handled messages and backs off failed ones via visibility timeout', async () => {
    const sent: unknown[] = [];
    const client = {
      send: (command: unknown) => {
        sent.push(command);
        if (command instanceof ReceiveMessageCommand) {
          return Promise.resolve({
            Messages: [
              {
                MessageId: 'ok',
                ReceiptHandle: 'r1',
                Body: '{"n":1}',
                Attributes: { ApproximateReceiveCount: '1' },
              },
              {
                MessageId: 'bad',
                ReceiptHandle: 'r2',
                Body: '{"n":2}',
                Attributes: { ApproximateReceiveCount: '4' },
              },
            ],
          });
        }
        return Promise.resolve({});
      },
    } as unknown as SQSClient;
    const errors: string[] = [];
    const consumer = new SqsQueueConsumer(
      client,
      'https://sqs.test/q',
      (m) =>
        (m.body as { n: number }).n === 2 ? Promise.reject(new Error('boom')) : Promise.resolve(),
      (_e, m) => errors.push(m.id),
      { retryBaseSeconds: 10, retryCapSeconds: 600 },
      () => 0.5,
    );

    await expect(consumer.pollOnce()).resolves.toBe(1);
    const deletes = sent.filter(
      (c): c is DeleteMessageCommand => c instanceof DeleteMessageCommand,
    );
    const visibility = sent.filter(
      (c): c is ChangeMessageVisibilityCommand => c instanceof ChangeMessageVisibilityCommand,
    );
    expect(deletes.map((d) => d.input.ReceiptHandle)).toEqual(['r1']);
    expect(visibility).toHaveLength(1);
    // receiveCount 4 → attempt 3 → min(600, 10·2³)=80s × jitter 0.5 = 40s
    expect(visibility[0].input).toMatchObject({ ReceiptHandle: 'r2', VisibilityTimeout: 40 });
    expect(errors).toEqual(['bad']);
  });
});
