'use server';

import { auth } from '@/lib/auth';
import { adminRoutes } from '@/config/routes';

interface ResetResult {
  success: boolean;
  error?: string;
}

export async function requestReset(email: string): Promise<ResetResult> {
  try {
    await auth.api.requestPasswordReset({
      body: {
        email,
        redirectTo: adminRoutes.resetPassword,
      },
    });
    return { success: true };
  } catch {
    // Always return success to not leak user existence
    return { success: true };
  }
}
