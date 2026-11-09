import type { Page, PageRequest } from '../../../shared/domain/pagination';
import type { OnboardingApplication, OnboardingStatus } from './onboarding-application';
import type { OnboardingDocument } from './onboarding-document';

export interface OnboardingApplicationRepository {
  findByMerchant(merchantId: string): Promise<OnboardingApplication | null>;
  findById(id: string): Promise<OnboardingApplication | null>;
  list(
    filter: { status?: OnboardingStatus },
    page: PageRequest,
  ): Promise<Page<OnboardingApplication>>;
  insert(application: OnboardingApplication): Promise<void>;
  save(application: OnboardingApplication): Promise<void>;
}

export interface OnboardingDocumentRepository {
  listForApplication(merchantId: string, applicationId: string): Promise<OnboardingDocument[]>;
  insert(document: OnboardingDocument): Promise<void>;
}

export const ONBOARDING_APPLICATION_REPOSITORY = Symbol('OnboardingApplicationRepository');
export const ONBOARDING_DOCUMENT_REPOSITORY = Symbol('OnboardingDocumentRepository');
