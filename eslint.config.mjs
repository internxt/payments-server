import { defineConfig } from 'eslint/config';
import eslintConfigInternxt from '@internxt/eslint-config-internxt';

export default defineConfig(
  {
    ignores: ['dist/**', 'node_modules/**', 'coverage/**', 'src/@types/**'],
  },
  eslintConfigInternxt,
  {
    rules: {
      'max-len': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
      ],
    },
  },
  {
    files: ['tests/**/*.ts'],
    rules: {
      '@typescript-eslint/ban-ts-comment': 'warn',
      '@typescript-eslint/no-require-imports': 'warn',
    },
  },
  {
    files: ['src/cli/**/*.ts', 'scripts/**/*.ts'],
    rules: {
      'no-console': 'off',
    },
  },
);
