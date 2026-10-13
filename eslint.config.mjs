import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';
import { defineConfig, globalIgnores } from 'eslint/config';

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          destructuredArrayIgnorePattern: '^_',
          // ESLint's own default, lost by overriding the options object. Keeps
          // the omit idiom `({ secret, ...rest }) => rest` from reading as a
          // lapse: the named sibling exists precisely to be discarded.
          ignoreRestSiblings: true,
        },
      ],
      // Null-guard instead of `!` — a wrong assertion is a runtime crash that
      // the type checker was specifically prevented from warning about.
      // Off for now: 353 existing sites (2026-09) would bury every other
      // warning. Flip to "warn" once they're cleaned up (see todos backlog).
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },

  // Translation hooks go through the project wrapper (safe fallback when the
  // namespace isn't loaded + PO extraction). Only the wrapper itself may
  // import next-intl's hook directly.
  {
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/core/lib/i18n/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'next-intl',
              importNames: ['useTranslations'],
              message:
                "Use useAdminTranslations / useBlankTranslations from '@/lib/translations' instead.",
            },
          ],
        },
      ],
    },
  },

  // Public (localized) surfaces must use the locale-aware wrappers — raw
  // next/link and next/navigation silently drop the locale prefix. Core and
  // the dashboard are exempt (core can't import project components; the
  // dashboard is not localized). `warn` until the existing imports are
  // migrated; then ratchet to `error`.
  {
    files: [
      'src/app/(public)/**/*.{ts,tsx}',
      'src/components/public/**/*.{ts,tsx}',
    ],
    rules: {
      'no-restricted-imports': [
        'warn',
        {
          paths: [
            {
              name: 'next/link',
              message:
                "Use Link from '@/components/Link' — it resolves the locale prefix and CMS slugs.",
            },
            {
              name: 'next/navigation',
              importNames: [
                'useRouter',
                'usePathname',
                'redirect',
                'permanentRedirect',
              ],
              message:
                "Use the locale-aware useRouter / usePathname / redirect from '@/i18n/navigation'.",
            },
            {
              name: 'next-intl',
              importNames: ['useTranslations'],
              message:
                "Use useAdminTranslations / useBlankTranslations from '@/lib/translations' instead.",
            },
          ],
        },
      ],
    },
  },

  // Server-side code logs through createLogger() (LOG_LEVEL gating, JSON in
  // production, monitoring forwarding). The logger is the one console sink;
  // CLI entry points print for humans and are exempt.
  {
    files: [
      'src/server/**/*.ts',
      'src/core/lib/**/*.ts',
      'src/core/crud/**/*.ts',
      'src/core/storage/**/*.ts',
      'src/core-*/lib/**/*.ts',
      'src/core-*/routers/**/*.ts',
      'src/core-*/jobs/**/*.ts',
    ],
    ignores: [
      'src/core/lib/infra/logger.ts',
      'src/core-*/lib/cli.ts',
      '**/__tests__/**',
      '**/*.test.ts',
    ],
    rules: {
      'no-console': 'error',
    },
  },

  // `.cjs` IS CommonJS, so `require()` is the correct syntax there, not a lapse.
  {
    files: ['**/*.cjs'],
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },

  // Test files stub and cast freely — strict typing of fixtures buys nothing.
  {
    files: ['**/*.test.ts', '**/*.test.tsx', '**/__tests__/**'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },

  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    '.next/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
    // Tooling output and agent config folders (skill markdown, worktrees):
    '.next-*/**',
    '.indigo/**',
    'coverage/**',
    '.agents/**',
    '.claude/**',
    '.codex/**',
  ]),
]);

export default eslintConfig;
