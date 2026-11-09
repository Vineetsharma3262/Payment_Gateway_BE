import { PlannedFeatureError } from '../application/application-error';

/**
 * Body of a route that is part of the published API contract but whose phase
 * is not implemented yet. Validation and authentication still run first, so
 * the contract (inputs, auth, errors) is exercised; the response is 501.
 */
export function planned(feature: string, phase: string): Promise<never> {
  return Promise.reject(new PlannedFeatureError(feature, phase));
}
