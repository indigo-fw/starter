import 'server-only';
import { z } from 'zod';
import { clientEnvSchema } from './env-schema';

const serverEnvSchema = z.object({
  // Database
  DATABASE_URL: z.url(),

  // Auth
  BETTER_AUTH_SECRET: z.string().min(32),

  // Social providers (optional)
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  DISCORD_CLIENT_ID: z.string().optional(),
  DISCORD_CLIENT_SECRET: z.string().optional(),

  // Email (SMTP)
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.string().regex(/^\d+$/).default('587'),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  FROM_EMAIL: z.email().optional(),

  // Redis
  REDIS_URL: z.url().optional(),
  REDIS_PASSWORD: z.string().optional(),

  // DeepL Translation (optional)
  DEEPL_API_KEY: z.string().optional(),
  DEEPL_API_FREE: z.coerce.boolean().default(true),

  // Storage
  STORAGE_BACKEND: z.enum(['s3', 'filesystem']).default('filesystem'),

  // Storage (S3-compatible) — required only when STORAGE_BACKEND=s3
  S3_ENDPOINT: z.url().optional(),
  S3_REGION: z.string().optional(),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),

  // Application
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),

  // Stripe (optional — billing disabled without STRIPE_SECRET_KEY)
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),

  // Stripe price IDs (optional — required per-plan when Stripe billing is enabled)
  STRIPE_PRICE_STARTER_MONTHLY: z.string().optional(),
  STRIPE_PRICE_STARTER_YEARLY: z.string().optional(),
  STRIPE_PRICE_PRO_MONTHLY: z.string().optional(),
  STRIPE_PRICE_PRO_YEARLY: z.string().optional(),
  STRIPE_PRICE_ENTERPRISE_MONTHLY: z.string().optional(),
  STRIPE_PRICE_ENTERPRISE_YEARLY: z.string().optional(),

  // NOWPayments (optional — crypto payments disabled without API key)
  NOWPAYMENTS_API_KEY: z.string().optional(),
  NOWPAYMENTS_IPN_SECRET: z.string().optional(),
  NOWPAYMENTS_SANDBOX: z.coerce.boolean().default(true),

  // AI Assist (optional — editor AI features disabled without API key)
  AI_API_KEY: z.string().optional(),
  AI_API_URL: z.url().optional(),
  AI_MODEL: z.string().optional(),

  // Encryption key for DB-stored secrets (provider API keys). 64-char hex = 32 bytes.
  ENCRYPTION_KEY: z.string().length(64).optional(),

  // Set to 'true' to use mock AI adapters (random text, placeholder images/videos)
  MOCK_AI: z.coerce.boolean().default(false),

  // ElevenLabs (optional — voice calls disabled without API key)
  ELEVENLABS_API_KEY: z.string().optional(),
  ELEVENLABS_DEFAULT_VOICE_ID: z.string().optional(),

  // Email list / newsletter integration (optional)
  EMAIL_LIST_PROVIDER: z.enum(['mailchimp', 'brevo']).optional(),
  MAILCHIMP_API_KEY: z.string().optional(),
  MAILCHIMP_LIST_ID: z.string().optional(),
  BREVO_API_KEY: z.string().optional(),
  BREVO_LIST_ID: z.string().optional(),

  // Server role
  SERVER_ROLE: z.enum(['all', 'frontend', 'api', 'worker']).default('all'),
  PORT: z.string().regex(/^\d+$/).default('3000'),

  // WebSocket
  WS_ENABLED: z.coerce.boolean().default(true),
});

const envSchema = serverEnvSchema.merge(clientEnvSchema);

// Validate and export
const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  console.error('Invalid environment variables:');
  console.error(parsedEnv.error.format());
  throw new Error('Invalid environment variables');
}

export const env = parsedEnv.data;

export type Env = z.infer<typeof envSchema>;
