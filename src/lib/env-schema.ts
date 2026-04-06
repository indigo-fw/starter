import { z } from 'zod';

/** Client-safe env vars (NEXT_PUBLIC_*). Single source of truth for both env.ts and env-client.ts. */
export const clientEnvSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.url(),
  NEXT_PUBLIC_SITE_NAME: z.string().min(1).default('Indigo'),
  NEXT_PUBLIC_ADMIN_REGISTRATION_ENABLED: z.coerce.boolean().default(false),
  NEXT_PUBLIC_REGISTRATION_ENABLED: z.coerce.boolean().default(true),
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: z.string().optional(),
  NEXT_PUBLIC_GOOGLE_CLIENT_ID: z.string().optional(),
  NEXT_PUBLIC_DISCORD_CLIENT_ID: z.string().optional(),
  NEXT_PUBLIC_CDN_URL: z.url().optional().or(z.literal('')),
  NEXT_PUBLIC_ORGANIZATIONS_VISIBLE: z.coerce.boolean().default(true),
  NEXT_PUBLIC_SUPPORT_CHAT_ENABLED: z.coerce.boolean().default(true),
});

export type ClientEnv = z.infer<typeof clientEnvSchema>;
