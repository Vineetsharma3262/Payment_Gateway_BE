import { Entity } from '../../../shared/domain/entity';
import type { DocumentType } from './onboarding.types';

/**
 * Retention placeholder: 7 years after creation. The real period depends on
 * PayCo's regulatory obligations (open question Q8) and is enforced by S3
 * lifecycle rules keyed on this date.
 */
export const DOCUMENT_RETENTION_MS = 7 * 365 * 24 * 60 * 60 * 1000;

export interface OnboardingDocumentProps {
  id: string;
  merchantId: string;
  applicationId: string;
  documentType: DocumentType;
  storageKey: string;
  contentType: string;
  status: 'pending_upload' | 'uploaded' | 'submitted';
  retainUntil: Date;
  createdAt: Date;
}

export class OnboardingDocument extends Entity {
  private constructor(private readonly props: OnboardingDocumentProps) {
    super(props.id);
  }

  static request(
    params: Omit<OnboardingDocumentProps, 'status' | 'retainUntil' | 'storageKey'>,
  ): OnboardingDocument {
    return new OnboardingDocument({
      ...params,
      // Key contains no personal data; merchant prefix supports per-tenant access policies.
      storageKey: `onboarding/${params.merchantId}/${params.id}`,
      status: 'pending_upload',
      retainUntil: new Date(params.createdAt.getTime() + DOCUMENT_RETENTION_MS),
    });
  }

  static rehydrate(props: OnboardingDocumentProps): OnboardingDocument {
    return new OnboardingDocument({ ...props });
  }

  get storageKey(): string {
    return this.props.storageKey;
  }

  toProps(): OnboardingDocumentProps {
    return { ...this.props };
  }
}

export const ALLOWED_DOCUMENT_CONTENT_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
] as const;
export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
