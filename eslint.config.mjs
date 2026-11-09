// @ts-check
import eslint from '@eslint/js';
import prettier from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';

/**
 * Layer dependency rules (see docs/architecture/module-ownership.md).
 * The same rules are asserted by src/tests/architecture so that they also hold
 * if someone disables lint locally.
 */
const FRAMEWORK_AND_IO_PACKAGES = [
  '@nestjs/*',
  '@prisma/*',
  'prisma',
  '@aws-sdk/*',
  'ioredis',
  'express',
  'razorpay',
  'stripe',
  'pino',
  'nestjs-pino',
  'axios',
];

export default tseslint.config(
  { ignores: ['dist/**', 'coverage/**', 'node_modules/**', 'prisma/migrations/**', '*.mjs', '*.js'] },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  prettier,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-console': 'error',
    },
  },
  {
    files: ['src/**/domain/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: FRAMEWORK_AND_IO_PACKAGES, message: 'Domain code must be framework- and IO-free.' },
            {
              group: ['**/application/**', '**/infrastructure/**', '**/presentation/**', '**/integrations/**'],
              message: 'Domain code may only depend on domain code.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/**/application/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: FRAMEWORK_AND_IO_PACKAGES, message: 'Application code depends on ports, not frameworks or IO libraries.' },
            {
              group: ['**/infrastructure/**', '**/presentation/**'],
              message: 'Application code must not import adapters or controllers.',
            },
            {
              group: ['**/integrations/*/razorpay/**', '**/integrations/*/stripe-connect/**', '**/integrations/*/testing/**'],
              message: 'Use the provider-neutral port in integrations/*/domain-ports.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/tests/**/*.ts', 'prisma/**/*.ts'],
    rules: {
      '@typescript-eslint/unbound-method': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      'no-console': 'off',
    },
  },
);
