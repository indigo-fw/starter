import { createAuthClient } from 'better-auth/react';
import { adminClient, customSessionClient, organizationClient } from 'better-auth/client/plugins';

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
  plugins: [adminClient(), customSessionClient(), organizationClient()],
});

export const { signIn, signUp, signOut, useSession } = authClient;
