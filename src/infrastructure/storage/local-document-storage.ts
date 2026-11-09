import type {
  DocumentStorage,
  PresignedUpload,
} from '../../shared/application/document-storage.port';

/** Development/test only: returns non-functional URLs so flows can be exercised without S3. */
export class LocalDocumentStorage implements DocumentStorage {
  createUploadUrl(input: { storageKey: string; contentType: string }): Promise<PresignedUpload> {
    return Promise.resolve({
      url: `http://localhost/dev-uploads/${encodeURIComponent(input.storageKey)}`,
      storageKey: input.storageKey,
      expiresAt: new Date(Date.now() + 300_000),
      requiredHeaders: { 'Content-Type': input.contentType },
    });
  }

  createDownloadUrl(storageKey: string): Promise<string> {
    return Promise.resolve(`http://localhost/dev-uploads/${encodeURIComponent(storageKey)}`);
  }
}
