/** Published contract of the Merchant Onboarding context (framework-free). */
export interface OnboardingStarter {
  /** Creates the draft application for a new merchant. Idempotent per merchant. */
  start(merchantId: string, legalBusinessName: string): Promise<void>;
}

export const ONBOARDING_STARTER = Symbol('OnboardingStarter');
