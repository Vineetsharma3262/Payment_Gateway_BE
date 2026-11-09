/** @type {import('jest').Config} */
const base = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  transform: { '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.json' }] },
  testEnvironment: 'node',
};

module.exports = {
  projects: [
    { ...base, displayName: 'unit', testMatch: ['<rootDir>/src/tests/unit/**/*.spec.ts'] },
    {
      ...base,
      displayName: 'architecture',
      testMatch: ['<rootDir>/src/tests/architecture/**/*.spec.ts'],
    },
    {
      ...base,
      displayName: 'integration',
      testMatch: ['<rootDir>/src/tests/integration/**/*.spec.ts'],
    },
    {
      ...base,
      displayName: 'e2e',
      testMatch: ['<rootDir>/src/tests/e2e/**/*.e2e-spec.ts'],
      setupFiles: ['<rootDir>/src/tests/e2e/setup-env.ts'],
    },
  ],
  collectCoverageFrom: ['src/**/*.ts', '!src/tests/**', '!src/main.ts', '!src/workers/**/main.ts'],
};
