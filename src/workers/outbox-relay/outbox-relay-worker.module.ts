import { SQSClient } from '@aws-sdk/client-sqs';
import { Module } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../../config/configuration';
import { ConfigurationModule } from '../../config/configuration.module';
import { OutboxRelay } from '../../infrastructure/messaging/outbox/outbox-relay';
import { SqsMessagePublisher } from '../../infrastructure/messaging/sqs/sqs-message-publisher';
import { DatabaseModule } from '../../shared/infrastructure/database/database.module';
import { PrismaService } from '../../shared/infrastructure/database/prisma.service';
import { LoggingModule } from '../../shared/infrastructure/logging/logging.module';

/** Minimal module graph for the relay process: no HTTP, no bounded-context modules. */
@Module({
  imports: [ConfigurationModule, LoggingModule, DatabaseModule],
  providers: [
    {
      provide: OutboxRelay,
      inject: [APP_CONFIG, PrismaService],
      useFactory: (config: AppConfig, prisma: PrismaService) => {
        if (!config.aws.outboxQueueUrl)
          throw new Error('SQS_OUTBOX_QUEUE_URL is required for the outbox relay.');
        const publisher = new SqsMessagePublisher(
          new SQSClient({ region: config.aws.region }),
          config.aws.outboxQueueUrl,
        );
        return new OutboxRelay(prisma, publisher);
      },
    },
  ],
})
export class OutboxRelayWorkerModule {}
