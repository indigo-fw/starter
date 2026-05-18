import { createAuthClient } from 'better-auth/react';
import { adminClient, customSessionClient, organizationClient } from 'better-auth/client/plugins';

export const authClient = createAuthClient({
  // No baseURL — Better Auth defaults to same origin (window.location.origin).
  // Avoids bake-at-build-time issues with NEXT_PUBLIC_APP_URL in pre-built Docker images.
  plugins: [adminClient(), customSessionClient(), organizationClient()],
});

export const { signIn, signUp, signOut, useSession } = authClient;
