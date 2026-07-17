import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

const restrictedRuntimeImports = [
  'fs',
  'fs/promises',
  'node:fs',
  'node:fs/promises',
  'path',
  'node:path',
  'http',
  'node:http',
  'https',
  'node:https',
  'playwright',
  'playwright-core',
  '@playwright/test',
  '@nestjs/common',
  '@nestjs/core',
  '@nestjs/config',
];

const domainRestrictedImports = [...restrictedRuntimeImports, 'react', 'react-dom', 'react-dom/*'];

export default defineConfig([
  globalIgnores(['coverage', 'dist', 'dist-ssr', 'node_modules', '.data', '.idea']),
  {
    files: ['*.js', '*.cjs', '*.mjs'],
    extends: [js.configs.recommended],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.es2023,
      },
    },
    rules: {
      semi: ['error', 'always'],
    },
  },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.strictTypeChecked,
      tseslint.configs.stylisticTypeChecked,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.es2023,
      },
      parserOptions: {
        project: ['./tsconfig.app.json', './tsconfig.node.json', './tsconfig.spec.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': [
        'error',
        {
          prefer: 'type-imports',
          fixStyle: 'inline-type-imports',
        },
      ],
      '@typescript-eslint/explicit-function-return-type': [
        'error',
        {
          allowExpressions: true,
          allowHigherOrderFunctions: true,
          allowTypedFunctionExpressions: true,
        },
      ],
      '@typescript-eslint/no-confusing-void-expression': [
        'error',
        {
          ignoreArrowShorthand: true,
        },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': [
        'error',
        {
          checksVoidReturn: {
            attributes: false,
          },
        },
      ],
      '@typescript-eslint/no-unnecessary-condition': 'error',
      '@typescript-eslint/no-unsafe-argument': 'error',
      '@typescript-eslint/no-unsafe-assignment': 'error',
      '@typescript-eslint/no-unsafe-call': 'error',
      '@typescript-eslint/no-unsafe-member-access': 'error',
      '@typescript-eslint/no-unsafe-return': 'error',
      '@typescript-eslint/only-throw-error': 'error',
      '@typescript-eslint/prefer-nullish-coalescing': 'error',
      '@typescript-eslint/strict-boolean-expressions': [
        'error',
        {
          allowNullableBoolean: false,
          allowNullableObject: false,
          allowNullableString: false,
          allowNumber: false,
          allowString: false,
        },
      ],
      semi: ['error', 'always'],
      'no-restricted-syntax': [
        'error',
        {
          selector: 'TSAnyKeyword',
          message: 'Do not use any. Define an explicit domain, DTO, or infrastructure type.',
        },
        {
          selector: 'TSUnknownKeyword',
          message:
            'Do not use unknown. Validate external data at the boundary and map it to an explicit type.',
        },
      ],
    },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/infrastructure/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'playwright',
              message:
                'Playwright must stay inside infrastructure adapters and scraper implementations.',
            },
            {
              name: 'playwright-core',
              message:
                'Playwright must stay inside infrastructure adapters and scraper implementations.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/domain/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: domainRestrictedImports.map((name) => ({
            name,
            message:
              'The domain layer must not depend on frameworks, runtimes, browser automation, or UI libraries.',
          })),
          patterns: [
            {
              group: [
                '**/application/**',
                '**/infrastructure/**',
                '**/presentation/**',
                '**/ui/**',
              ],
              message: 'The domain layer must not import outer architectural layers.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/application/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: restrictedRuntimeImports.map((name) => ({
            name,
            message:
              'The application layer must use ports instead of runtime, framework, or Playwright APIs directly.',
          })),
          patterns: [
            {
              group: ['**/infrastructure/**', '**/presentation/**', '**/ui/**'],
              message: 'The application layer must not import infrastructure or UI layers.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['vite.config.ts', 'vitest.config.ts'],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.es2023,
      },
    },
  },
]);
