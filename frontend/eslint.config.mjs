import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';
import prettier from 'eslint-config-prettier/flat';

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  prettier,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      'no-console': ['error', { allow: ['warn', 'error'] }],
      'import/order': [
        'error',
        {
          groups: ['builtin', 'external', 'internal', ['parent', 'sibling', 'index']],
          pathGroups: [
            { pattern: '{react,next,next/**}', group: 'builtin', position: 'before' },
            { pattern: '@/**', group: 'internal' },
          ],
          pathGroupsExcludedImportTypes: ['react', 'next'],
          'newlines-between': 'always',
          alphabetize: { order: 'asc' },
        },
      ],
    },
  },
  {
    // Files generated and managed by astryx theme commands.
    files: ['src/astryx-themes.ts'],
    rules: { 'import/order': 'off' },
  },
  globalIgnores(['.next/**', 'node_modules/**', 'coverage/**', 'next-env.d.ts']),
]);
