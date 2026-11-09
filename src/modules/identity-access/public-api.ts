/** Published contract of the Identity & Access context (framework-free). */
export interface UserDirectory {
  emailsOf(userIds: readonly string[]): Promise<Map<string, string>>;
}

export const USER_DIRECTORY = Symbol('UserDirectory');
