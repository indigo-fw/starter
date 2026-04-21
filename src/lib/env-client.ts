import { clientEnvSchema, type ClientEnv } from './env-schema';

// Next.js only inlines NEXT_PUBLIC_* vars when referenced as literal property accesses.
// We must list them explicitly — dynamic iteration over process.env won't work client-side.
//
// The `satisfies Record<keyof ClientEnv, ...>` ensures this object has exactly the same
// keys as clientEnvSchema. Adding a key to the schema without adding it here is a type error.
const clientEnvRaw = {
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  NEXT_PUBLIC_SITE_NAME: process.env.NEXT_PUBLIC_SITE_NAME,
  NEXT_PUBLIC_ADMIN_REGISTRATION_ENABLED: process.env.NEXT_PUBLIC_ADMIN_REGISTRATION_ENABLED,
  NEXT_PUBLIC_REGISTRATION_ENABLED: process.env.NEXT_PUBLIC_REGISTRATION_ENABLED,
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
  NEXT_PUBLIC_GOOGLE_CLIENT_ID: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
  NEXT_PUBLIC_DISCORD_CLIENT_ID: process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID,
  NEXT_PUBLIC_CDN_URL: process.env.NEXT_PUBLIC_CDN_URL,
  NEXT_PUBLIC_ORGANIZATIONS_VISIBLE: process.env.NEXT_PUBLIC_ORGANIZATIONS_VISIBLE,
  NEXT_PUBLIC_SUPPORT_CHAT_ENABLED: process.env.NEXT_PUBLIC_SUPPORT_CHAT_ENABLED,
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
  NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
} satisfies Record<keyof ClientEnv, string | undefined>;

const parsed = clientEnvSchema.safeParse(clientEnvRaw);

if (!parsed.success) {
  console.error('Invalid client environment variables:', parsed.error.format());
  throw new Error('Invalid client environment variables');
}

export const clientEnv = parsed.data;
