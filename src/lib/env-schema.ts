import { z } from 'zod';

/**
 * Correct string-to-boolean parser for env vars. Unlike `z.coerce.boolean()`
 * (which is truthy for ANY non-empty string, so "false"/"0" both become `true`),
 * this only treats `"true"`/`"1"` as true and `"false"`/`"0"` as false.
 * Wrap with `.default(...)` at the call site to preserve each field's default.
 */
export const boolFromEnv = z
  .enum(['true', 'false', '1', '0'])
  .transform((v) => v === 'true' || v === '1');

/** Client-safe env vars (NEXT_PUBLIC_*). Single source of truth for both env.ts and env-client.ts. */
export const clientEnvSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.url(),
  NEXT_PUBLIC_SITE_NAME: z.string().min(1).default('Indigo'),
  NEXT_PUBLIC_ADMIN_REGISTRATION_ENABLED: boolFromEnv.default(false),
  NEXT_PUBLIC_REGISTRATION_ENABLED: boolFromEnv.default(true),
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: z.string().optional(),
  NEXT_PUBLIC_GOOGLE_CLIENT_ID: z.string().optional(),
  NEXT_PUBLIC_DISCORD_CLIENT_ID: z.string().optional(),
  NEXT_PUBLIC_CDN_URL: z.url().optional().or(z.literal('')),
  NEXT_PUBLIC_ORGANIZATIONS_VISIBLE: boolFromEnv.default(true),
  NEXT_PUBLIC_SUPPORT_CHAT_ENABLED: boolFromEnv.default(true),
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: z.string().optional(),
  NEXT_PUBLIC_SENTRY_DSN: z.url().optional().or(z.literal('')),
});

export type ClientEnv = z.infer<typeof clientEnvSchema>;
