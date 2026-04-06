'use client';

import { useEffect, useState } from 'react';
import { Mail, X } from 'lucide-react';
import { authClient, useSession } from '@/lib/auth-client';
import { useBlankTranslations } from '@/lib/translations';

const DISMISS_KEY = 'emailVerifyDismissedUntil';
const DISMISS_HOURS = 24;

export function EmailVerificationBanner() {
  const __ = useBlankTranslations();
  const { data: session } = useSession();
  const [visible, setVisible] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [isResending, setIsResending] = useState(false);

  const user = session?.user as Record<string, unknown> | undefined;
  const emailVerified = (user?.emailVerified as boolean) ?? false;
  const userEmail = user?.email as string | undefined;

  useEffect(() => {
    if (!session?.user || emailVerified) {
      setVisible(false);
      return;
    }
    const dismissedUntil = localStorage.getItem(DISMISS_KEY);
    if (dismissedUntil && Date.now() < Number(dismissedUntil)) {
      setVisible(false);
      return;
    }
    setVisible(true);
  }, [session, emailVerified]);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const interval = setInterval(() => {
      setResendCooldown((prev) => prev - 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [resendCooldown]);

  const handleDismiss = () => {
    const until = Date.now() + DISMISS_HOURS * 60 * 60 * 1000;
    localStorage.setItem(DISMISS_KEY, String(until));
    setVisible(false);
  };

  const handleResend = async () => {
    if (!userEmail) return;
    setIsResending(true);
    try {
      await authClient.sendVerificationEmail({ email: userEmail });
      setResendCooldown(60);
    } catch {
      // Silently fail — user can retry
    } finally {
      setIsResending(false);
    }
  };

  if (!visible) return null;

  return (
    <div className="relative rounded-lg border border-warning-500/30 bg-warning-500/5 p-4 mb-6">
      <button
        onClick={handleDismiss}
        className="absolute right-2 top-2 rounded-lg p-1 text-(--text-secondary) transition-colors hover:text-(--text-primary)"
        aria-label="Dismiss"
      >
        <X size={16} />
      </button>

      <div className="flex items-start gap-3 pr-6">
        <Mail size={20} className="mt-0.5 shrink-0 text-warning-500" />
        <div className="flex-1">
          <p className="text-sm font-medium">
            {__('Verify your email')}
          </p>
          <p className="mt-1 text-xs text-(--text-secondary)">
            {__('Check your inbox and click the verification link to fully activate your account.')}
          </p>
          <button
            onClick={handleResend}
            disabled={isResending || resendCooldown > 0}
            className="mt-2 text-xs font-medium text-brand-500 transition-colors hover:text-brand-600 disabled:text-(--text-secondary)"
          >
            {isResending
              ? __('Sending...')
              : resendCooldown > 0
                ? `${__('Resend verification email')} (${resendCooldown}s)`
                : __('Resend verification email')}
          </button>
        </div>
      </div>
    </div>
  );
}
