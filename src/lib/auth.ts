import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { admin, customSession, organization } from 'better-auth/plugins';
import { role } from 'better-auth/plugins/access';

import { Role } from '@/core/policy';
import { db } from '@/server/db';
import { enqueueTemplateEmail } from '@/core/lib/email';
import { handleUserCreated } from '@/lib/auth-hooks';

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
          // Body extracted to `handleUserCreated` (top of file) for direct
          // unit-testability of the personal-org + hook-wiring path.
          after: async (user) => { await handleUserCreated(user); },
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
          const { enqueueTemplateEmail } = await import('@/core/lib/email');
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

    // BETTER_AUTH_URL is a plain (non-NEXT_PUBLIC) var — Next.js does NOT inline
    // it at build time, so it stays runtime-overridable on the VPS.
    // Falls back to NEXT_PUBLIC_APP_URL for local dev.
    baseURL: process.env.BETTER_AUTH_URL ?? process.env.NEXT_PUBLIC_APP_URL,
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
