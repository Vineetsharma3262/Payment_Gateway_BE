import 'reflect-metadata';
import { SQSClient } from '@aws-sdk/client-sqs';
import { Logger, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Logger as PinoLogger } from 'nestjs-pino';
import { APP_CONFIG, type AppConfig } from '../config/configuration';
import { ConfigurationModule } from '../config/configuration.module';
import {
  SqsQueueConsumer,
  type MessageHandler,
} from '../infrastructure/messaging/sqs/sqs-queue-consumer';
import { LoggingModule } from '../shared/infrastructure/logging/logging.module';

export interface QueueWorkerDefinition {
  name: string;
  /** Environment variable holding the queue URL. */
  queueUrlVariable: string;
  /** Phase in which the handler becomes available; null when implemented. */
  plannedFor: string | null;
  handler: MessageHandler;
}

@Module({ imports: [ConfigurationModule, LoggingModule] })
class WorkerBaseModule {}

/**
 * Shared bootstrap for queue workers: one process per worker type, same image
 * as the API. Workers whose phase is not implemented refuse to start, so a
 * deployment can never silently drop or mis-handle queue messages.
 */
export async function runQueueWorker(definition: QueueWorkerDefinition): Promise<void> {
  const app = await NestFactory.createApplicationContext(WorkerBaseModule, { bufferLogs: true });
  app.useLogger(app.get(PinoLogger));
  const logger = new Logger(definition.name);
  if (definition.plannedFor) {
    logger.error(
      `Worker '${definition.name}' is not implemented yet (${definition.plannedFor}); refusing to consume.`,
    );
    await app.close();
    process.exitCode = 1;
    return;
  }
  const config = app.get<AppConfig>(APP_CONFIG);
  const queueUrl = process.env[definition.queueUrlVariable];
  if (!queueUrl) throw new Error(`${definition.queueUrlVariable} is required.`);

  const consumer = new SqsQueueConsumer(
    new SQSClient({ region: config.aws.region }),
    queueUrl,
    definition.handler,
    (error, message) =>
      logger.warn(
        { err: error, messageId: message.id, receiveCount: message.receiveCount },
        'message failed',
      ),
  );
  let running = true;
  process.once('SIGTERM', () => (running = false));
  process.once('SIGINT', () => (running = false));
  while (running) {
    try {
      await consumer.pollOnce();
    } catch (error) {
      logger.error({ err: error }, 'poll failed');
    }
  }
  await app.close();
}

export const notImplementedHandler: MessageHandler = () =>
  Promise.reject(new Error('not implemented'));
