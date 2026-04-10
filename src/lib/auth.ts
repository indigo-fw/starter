import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { admin, customSession, organization } from 'better-auth/plugins';
import { role } from 'better-auth/plugins/access';

import { eq, and, count, isNull } from 'drizzle-orm';
import { Role } from '@/core/policy';
import { createLogger } from '@/core/lib/infra/logger';
import { slugify } from '@/core/lib/slug';
import { db } from '@/server/db';
import { organization as organizationTable, member } from '@/server/db/schema/organization';
import { saasSupportChatSessions } from '@/core-support/schema/support-chat';
import { enqueueTemplateEmail } from '@/server/jobs/email';
import { syncSubscriber } from '@/core/lib/email-list/index';

const log = createLogger('auth');

function createAuth() {
  return betterAuth({
    database: drizzleAdapter(db, { provider: 'pg' }),

    user: {
      modelName: 'user',
      fields: { name: 'name', emailVerified: 'emailVerified' },
    },
    session: {
      modelName: 'session',
      expiresIn: 60 * 60 * 24 * 365, // 1 year
      updateAge: 60 * 60 * 24 * 30, // refresh monthly
      cookieCache: {
        enabled: true,
        maxAge: 5 * 60, // 5 min
      },
    },
    account: {
      modelName: 'account',
      accountLinking: {
        enabled: true,
        trustedProviders: ['google', 'discord'],
      },
    },

    emailAndPassword: {
      enabled: true,
      minPasswordLength: 6,
      requireEmailVerification: false, // We enforce grace period ourselves
      sendResetPassword: async ({ user, url }) => {
        await enqueueTemplateEmail(user.email, 'password-reset', {
          name: user.name ?? 'there',
          resetUrl: url,
        });
      },
    },

    emailVerification: {
      sendOnSignUp: true,
      autoSignInAfterVerification: true,
      sendVerificationEmail: async ({ user, url }) => {
        await enqueueTemplateEmail(user.email, 'verify-email', {
          name: user.name ?? 'there',
          verifyUrl: url,
        });
      },
    },

    databaseHooks: {
      user: {
        create: {
          after: async (user) => {
            // Auto-create personal organization for billing/token support.
            // Always runs — even when ORGANIZATIONS_VISIBLE=false, billing
            // needs an org owner. The user never sees it in B2C mode.
            try {
              const orgName = user.name ? `${user.name}'s workspace` : 'My workspace';
              let slug = slugify(orgName);
              // Ensure slug uniqueness
              const [existing] = await db
                .select({ count: count() })
                .from(organizationTable)
                .where(eq(organizationTable.slug, slug));
              if ((existing?.count ?? 0) > 0) {
                slug = `${slug}-${user.id.slice(0, 8)}`;
              }

              const orgId = crypto.randomUUID();
              await db.insert(organizationTable).values({
                id: orgId,
                name: orgName,
                slug,
                createdAt: new Date(),
              });
              await db.insert(member).values({
                id: crypto.randomUUID(),
                organizationId: orgId,
                userId: user.id,
                role: 'owner',
                createdAt: new Date(),
              });

              log.info('Personal org created', { userId: user.id, orgId });
            } catch (err: unknown) {
              log.error('Failed to create personal org', { userId: user.id, error: String(err) });
            }

            // Link orphaned chat sessions that used this email before registration
            try {
              await db
                .update(saasSupportChatSessions)
                .set({ userId: user.id })
                .where(and(
                  eq(saasSupportChatSessions.email, user.email),
                  isNull(saasSupportChatSessions.userId),
                ));
            } catch (err: unknown) {
              log.warn('Failed to link chat sessions', { email: user.email, error: String(err) });
            }

            // Sync to email list (fire-and-forget)
            syncSubscriber(user.email, {
              firstName: user.name ?? undefined,
              tags: ['registered'],
            });

            // Welcome email skipped — verification email (sendOnSignUp) serves as the welcome.
            // The old standalone welcome email sent mixed signals ("Go to Dashboard")
            // alongside a "verify your email" message arriving at the same time.
          },
        },
      },
    },

    socialProviders: {
      google: {
        clientId: process.env.GOOGLE_CLIENT_ID ?? '',
        clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
        enabled: !!process.env.GOOGLE_CLIENT_ID,
      },
      discord: {
        clientId: process.env.DISCORD_CLIENT_ID ?? '',
        clientSecret: process.env.DISCORD_CLIENT_SECRET ?? '',
        enabled: !!process.env.DISCORD_CLIENT_ID,
      },
    },

    plugins: [
      admin({
        defaultRole: Role.USER,
        adminRoles: [Role.ADMIN, Role.SUPERADMIN],
        roles: {
          [Role.USER]: role({}),
          [Role.EDITOR]: role({}),
          [Role.ADMIN]: role({}),
          [Role.SUPERADMIN]: role({}),
        },
      }),
      organization({
        allowUserToCreateOrganization: true,
        creatorRole: 'owner',
        membershipLimit: 100,
        sendInvitationEmail: async ({ invitation, organization: org }) => {
          const { enqueueTemplateEmail } = await import('@/server/jobs/email');
          const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
          await enqueueTemplateEmail(invitation.email, 'invitation', {
            organizationName: org.name,
            inviteUrl: `${appUrl}/dashboard/organizations?accept=${invitation.id}`,
            appUrl,
          });
        },
      }),
      customSession(async ({ user, session }) => {
        const u = user as Record<string, unknown>;
        return {
          user: {
            ...user,
            role: u.role as string ?? Role.USER,
            banned: u.banned as boolean ?? false,
            emailVerified: u.emailVerified as boolean ?? false,
            createdAt: u.createdAt as string ?? new Date().toISOString(),
          },
          session: {
            ...session,
            activeOrganizationId: (session as Record<string, unknown>).activeOrganizationId as string | null ?? null,
          },
        };
      }),
    ],

    advanced: {
      useSecureCookies: process.env.NODE_ENV === 'production',
    },

    baseURL: process.env.NEXT_PUBLIC_APP_URL,
  });
}

const globalForAuth = globalThis as unknown as {
  betterAuth: ReturnType<typeof createAuth> | undefined;
};

export const auth = globalForAuth.betterAuth ?? createAuth();

if (process.env.NODE_ENV !== 'production') {
  globalForAuth.betterAuth = auth;
}

export type Auth = typeof auth;
