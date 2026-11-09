import { S3Client } from '@aws-sdk/client-s3';
import { Global, Module } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../../config/configuration';
import { DOCUMENT_STORAGE } from '../../shared/application/document-storage.port';
import { LocalDocumentStorage } from './local-document-storage';
import { S3DocumentStorage } from './s3-document-storage';

@Global()
@Module({
  providers: [
    {
      provide: DOCUMENT_STORAGE,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) =>
        config.storage.documentsBucket
          ? new S3DocumentStorage(
              new S3Client({ region: config.aws.region }),
              config.storage.documentsBucket,
              config.storage.kmsKeyId,
            )
          : new LocalDocumentStorage(),
    },
  ],
  exports: [DOCUMENT_STORAGE],
})
export class StorageModule {}
