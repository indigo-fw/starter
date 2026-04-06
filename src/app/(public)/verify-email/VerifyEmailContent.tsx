'use client';

import { useState, useEffect } from 'react';
import { Mail, LogOut } from 'lucide-react';
import { authClient, signOut } from '@/lib/auth-client';
import { useBlankTranslations } from '@/lib/translations';
import { EMAIL_GRACE_PERIOD_MS } from '@/lib/email-verification';

interface VerifyEmailContentProps {
  email: string;
  createdAt: string;
}

export function VerifyEmailContent({ email, createdAt }: VerifyEmailContentProps) {
  const __ = useBlankTranslations();
  const [resendCooldown, setResendCooldown] = useState(0);
  const [isResending, setIsResending] = useState(false);
  const [sent, setSent] = useState(false);
  const [timeLeft, setTimeLeft] = useState('');

  // Countdown timer for grace period
  useEffect(() => {
    function updateTimeLeft() {
      const created = new Date(createdAt).getTime();
      const expiresAt = created + EMAIL_GRACE_PERIOD_MS;
      const remaining = expiresAt - Date.now();

      if (remaining <= 0) {
        setTimeLeft('');
        return;
      }

      const hours = Math.floor(remaining / (60 * 60 * 1000));
      const minutes = Math.floor((remaining % (60 * 60 * 1000)) / (60 * 1000));
      setTimeLeft(`${hours}h ${minutes}m`);
    }

    updateTimeLeft();
    const interval = setInterval(updateTimeLeft, 60_000);
    return () => clearInterval(interval);
  }, [createdAt]);

  // Resend cooldown timer
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const interval = setInterval(() => {
      setResendCooldown((prev) => prev - 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [resendCooldown]);

  const handleResend = async () => {
    setIsResending(true);
    try {
      await authClient.sendVerificationEmail({ email });
      setResendCooldown(60);
      setSent(true);
    } catch {
      // Silently fail — user can retry
    } finally {
      setIsResending(false);
    }
  };

  return (
    <div className="text-center">
      <div className="mx-auto w-16 h-16 rounded-full bg-brand-500/10 flex items-center justify-center mb-6">
        <Mail className="w-8 h-8 text-brand-500" />
      </div>

      <h1 className="text-2xl font-bold mb-2">{__('Verify your email')}</h1>
      <p className="text-(--text-secondary) mb-6">
        {__("We've sent a verification link to")}{' '}
        <span className="font-medium text-(--text-primary)">{email}</span>.{' '}
        {__('Please check your inbox and click the link to verify your account.')}
      </p>

      {timeLeft && (
        <p className="text-sm text-(--text-secondary) mb-6">
          {__('Your grace period expires in')} <span className="font-medium">{timeLeft}</span>
        </p>
      )}

      {!timeLeft && (
        <div className="bg-warning-500/10 border border-warning-500/30 rounded-lg p-4 mb-6">
          <p className="text-sm text-warning-700 dark:text-warning-400">
            {__('Your grace period has expired. Please verify your email to continue using your account.')}
          </p>
        </div>
      )}

      {sent && (
        <p className="text-sm text-success-600 dark:text-success-400 mb-4">
          {__('Verification email sent!')}
        </p>
      )}

      <button
        onClick={handleResend}
        disabled={isResending || resendCooldown > 0}
        className="inline-flex items-center px-4 py-2 rounded-lg font-medium text-sm bg-brand-500 text-white hover:bg-brand-600 transition-colors disabled:opacity-50"
      >
        {isResending
          ? __('Sending...')
          : resendCooldown > 0
            ? `${__('Resend email')} (${resendCooldown}s)`
            : __('Resend verification email')}
      </button>

      <p className="text-xs text-(--text-secondary) mt-8">
        {__("Didn't receive the email? Check your spam folder or try resending.")}
      </p>

      <button
        onClick={() => signOut({ fetchOptions: { onSuccess: () => { window.location.href = '/'; } } })}
        className="inline-flex items-center gap-1.5 mt-4 text-xs text-(--text-secondary) hover:text-(--text-primary) transition-colors"
      >
        <LogOut size={14} />
        {__('Sign out and use a different email')}
      </button>
    </div>
  );
}
