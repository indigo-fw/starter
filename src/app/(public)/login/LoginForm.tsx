'use client';

import { useState } from 'react';

import { useSearchParams } from 'next/navigation';

import { Link } from '@/components/Link';
import { SocialLoginButtons } from '@/components/public/SocialLoginButtons';
import { accountRoutes, publicAuthRoutes } from '@/config/routes';
import { useRouter } from '@/i18n/navigation';
import { signIn } from '@/lib/auth-client';
import { useBlankTranslations } from '@/lib/translations';

export interface LoginFormProps {
  /** Called after successful login (dialog mode). If not provided, redirects to callbackUrl. */
  onSuccess?: () => void;
  /** Called when user clicks "Sign up" (dialog mode). If not provided, renders a Link. */
  onSwitchToRegister?: () => void;
  /** Override callbackUrl for social login (dialog mode: pass current pathname so OAuth returns here) */
  socialCallbackUrl?: string;
  /** Pre-fill credentials for dev/demo banner quick-login button */
  devEmail?: string | null;
  /** Pre-fill credentials for dev/demo banner quick-login button */
  devPassword?: string | null;
  /** When true, banner label says "Demo instance" */
  isDemo?: boolean;
}

export function LoginForm({
  onSuccess,
  onSwitchToRegister,
  socialCallbackUrl,
  devEmail,
  devPassword,
  isDemo,
}: LoginFormProps = {}) {
  const __ = useBlankTranslations();
  const router = useRouter();
  const searchParams = useSearchParams();
  // An unprefixed public path set by the proxy / account layout; the locale-aware
  // router adds the visitor's prefix. Not a statically typed pathname — cast to the default.
  const callbackUrl = (searchParams.get('callbackUrl') ??
    accountRoutes.home) as typeof accountRoutes.home;
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleQuickLogin = async () => {
    if (!devEmail || !devPassword) return;
    setError('');
    setLoading(true);
    try {
      const result = await signIn.email({
        email: devEmail,
        password: devPassword,
      });
      if (result.error) {
        setError(result.error.message ?? __('Invalid email or password'));
      } else if (onSuccess) {
        onSuccess();
      } else {
        router.push(callbackUrl);
      }
    } catch {
      setError(__('Something went wrong. Please try again.'));
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const result = await signIn.email({ email, password });
      if (result.error) {
        setError(result.error.message ?? __('Invalid email or password'));
      } else if (onSuccess) {
        onSuccess();
      } else {
        router.push(callbackUrl);
      }
    } catch {
      setError(__('Something went wrong. Please try again.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      {devEmail && devPassword && (
        <div className="mb-6 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-semibold">
                {isDemo
                  ? __('Demo instance — resets every hour')
                  : __('Local dev')}
              </p>
              <p className="mt-1">
                {__('Sign in as')}:{' '}
                <code className="rounded bg-amber-100 px-1 py-0.5 font-mono text-xs dark:bg-amber-500/20">
                  {devEmail}
                </code>{' '}
                /{' '}
                <code className="rounded bg-amber-100 px-1 py-0.5 font-mono text-xs dark:bg-amber-500/20">
                  {devPassword}
                </code>
              </p>
            </div>
            <button
              type="button"
              onClick={handleQuickLogin}
              disabled={loading}
              className="shrink-0 rounded bg-amber-200 px-2.5 py-1 text-xs font-medium transition-colors hover:bg-amber-300 disabled:opacity-50 dark:bg-amber-500/30 dark:hover:bg-amber-500/50"
            >
              {__('Sign in →')}
            </button>
          </div>
        </div>
      )}

      <SocialLoginButtons callbackUrl={socialCallbackUrl ?? callbackUrl} />

      <div className="my-6 flex items-center gap-3">
        <div className="flex-1 border-t border-(--border-primary)" />
        <span className="text-xs text-(--text-secondary)">
          {__('or continue with email')}
        </span>
        <div className="flex-1 border-t border-(--border-primary)" />
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="rounded-lg bg-danger-500/10 px-4 py-2 text-sm text-danger-500">
            {error}
          </div>
        )}

        <div>
          <label
            htmlFor="login-email"
            className="mb-1 block text-sm font-medium"
          >
            {__('Email')}
          </label>
          <input
            id="login-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg border border-(--border-primary) bg-(--surface-primary) px-3 py-2 text-sm focus:ring-2 focus:ring-brand-500/25 focus:outline-none"
            placeholder={__('you@example.com')}
            required
          />
        </div>

        <div>
          <div className="mb-1 flex items-center justify-between">
            <label
              htmlFor="login-password"
              className="block text-sm font-medium"
            >
              {__('Password')}
            </label>
            <Link
              href={publicAuthRoutes.forgotPassword}
              className="text-xs text-brand-500 hover:underline"
            >
              {__('Forgot password?')}
            </Link>
          </div>
          <input
            id="login-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg border border-(--border-primary) bg-(--surface-primary) px-3 py-2 text-sm focus:ring-2 focus:ring-brand-500/25 focus:outline-none"
            placeholder={__('••••••••')}
            required
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brand-600 disabled:opacity-50"
        >
          {loading ? __('Signing in...') : __('Sign In')}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-(--text-secondary)">
        {__("Don't have an account?")}{' '}
        {onSwitchToRegister ? (
          <button
            type="button"
            onClick={onSwitchToRegister}
            className="text-brand-500 hover:underline"
          >
            {__('Sign up')}
          </button>
        ) : (
          <Link
            href={publicAuthRoutes.register}
            className="text-brand-500 hover:underline"
          >
            {__('Sign up')}
          </Link>
        )}
      </p>
    </div>
  );
}
