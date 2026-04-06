'use server';

import { auth } from '@/lib/auth';
import { publicAuthRoutes } from '@/config/routes';

export async function requestPasswordReset(email: string): Promise<{ success: boolean; error?: string }> {
  try {
    await auth.api.requestPasswordReset({
      body: { email, redirectTo: publicAuthRoutes.resetPassword },
    });
    return { success: true };
  } catch {
    // Don't reveal whether email exists
    return { success: true };
  }
}
