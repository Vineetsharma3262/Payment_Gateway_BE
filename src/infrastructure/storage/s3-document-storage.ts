import { GetObjectCommand, PutObjectCommand, type S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type {
  DocumentStorage,
  PresignedUpload,
} from '../../shared/application/document-storage.port';

const UPLOAD_TTL_SECONDS = 300;

/**
 * Private bucket, SSE-KMS enforced by bucket policy, lifecycle rules for
 * retention. Clients upload directly with a short-lived pre-signed PUT.
 */
export class S3DocumentStorage implements DocumentStorage {
  constructor(
    private readonly client: S3Client,
    private readonly bucket: string,
    private readonly kmsKeyId: string | undefined,
  ) {}

  async createUploadUrl(input: {
    storageKey: string;
    contentType: string;
    maxBytes: number;
  }): Promise<PresignedUpload> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: input.storageKey,
      ContentType: input.contentType,
      ServerSideEncryption: 'aws:kms',
      SSEKMSKeyId: this.kmsKeyId,
    });
    const url = await getSignedUrl(this.client, command, { expiresIn: UPLOAD_TTL_SECONDS });
    return {
      url,
      storageKey: input.storageKey,
      expiresAt: new Date(Date.now() + UPLOAD_TTL_SECONDS * 1000),
      requiredHeaders: {
        'Content-Type': input.contentType,
        'x-amz-server-side-encryption': 'aws:kms',
      },
    };
  }

  createDownloadUrl(storageKey: string, ttlSeconds: number): Promise<string> {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.bucket, Key: storageKey }),
      {
        expiresIn: ttlSeconds,
      },
    );
  }
}
