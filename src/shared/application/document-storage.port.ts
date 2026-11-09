/** Onboarding documents, dispute evidence and reports. Bytes never pass through the API process. */
export interface PresignedUpload {
  url: string;
  storageKey: string;
  expiresAt: Date;
  requiredHeaders: Record<string, string>;
}

export interface DocumentStorage {
  createUploadUrl(input: {
    storageKey: string;
    contentType: string;
    maxBytes: number;
  }): Promise<PresignedUpload>;
  createDownloadUrl(storageKey: string, ttlSeconds: number): Promise<string>;
}

export const DOCUMENT_STORAGE = Symbol('DocumentStorage');
