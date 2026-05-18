'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { signIn } from '@/lib/auth-client';
import { adminRoutes } from '@/config/routes';

const registrationEnabled =
  process.env.NEXT_PUBLIC_ADMIN_REGISTRATION_ENABLED === 'true' ||
  process.env.NEXT_PUBLIC_ADMIN_REGISTRATION_ENABLED === '1';

export function LoginPageClient({
  isDemo,
  devEmail,
  devPassword,
}: {
  isDemo?: boolean;
  devEmail?: string | null;
  devPassword?: string | null;
}) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleQuickLogin() {
    if (!devEmail || !devPassword) return;
    setError('');
    setLoading(true);
    try {
      const result = await signIn.email({ email: devEmail, password: devPassword });
      if (result.error) {
        setError(result.error.message ?? 'Invalid credentials');
      } else {
        router.push(adminRoutes.home);
      }
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const result = await signIn.email({ email, password });
      if (result.error) {
        const status = result.error.status;
        if (status && status >= 500) {
          setError('Server error. Please try again later.');
        } else {
          setError(result.error.message ?? 'Invalid credentials');
        }
      } else {
        router.push(adminRoutes.home);
      }
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-login-card rounded-lg border border-(--border-primary) bg-(--surface-primary) p-8 shadow-sm">
      {devEmail && devPassword && (
        <div className="mb-6 rounded-md border border-amber-200 bg-amber-50 dark:border-amber-500/30 dark:bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-300">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-semibold">
                {isDemo ? 'Demo instance — resets every hour' : 'Local dev'}
              </p>
              <p className="mt-1">
                {isDemo ? 'Admin' : 'Sign in as'}:{' '}
                <code className="rounded bg-amber-100 dark:bg-amber-500/20 px-1 py-0.5 font-mono text-xs">
                  {devEmail}
                </code>{' '}
                /{' '}
                <code className="rounded bg-amber-100 dark:bg-amber-500/20 px-1 py-0.5 font-mono text-xs">
                  {devPassword}
                </code>
              </p>
            </div>
            <button
              type="button"
              onClick={handleQuickLogin}
              disabled={loading}
              className="shrink-0 rounded bg-amber-200 dark:bg-amber-500/30 px-2.5 py-1 text-xs font-medium hover:bg-amber-300 dark:hover:bg-amber-500/50 transition-colors disabled:opacity-50"
            >
              Sign in →
            </button>
          </div>
        </div>
      )}

      <h1 className="text-2xl font-bold text-(--text-primary)">Sign In</h1>
      <p className="mt-1 text-sm text-(--text-muted)">
        Sign in to your Indigo account
      </p>

      {error && (
        <div className="auth-login-error mt-4 rounded-md bg-red-50 dark:bg-red-500/15 p-3 text-sm text-red-700 dark:text-red-400">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="auth-login-form mt-6 space-y-4">
        <div>
          <label
            htmlFor="email"
            className="block text-sm font-medium text-(--text-secondary)"
          >
            Email
          </label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="input mt-1"
            placeholder="you@example.com"
          />
        </div>

        <div>
          <label
            htmlFor="password"
            className="block text-sm font-medium text-(--text-secondary)"
          >
            Password
          </label>
          <input
            id="password"
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="input mt-1"
            placeholder="••••••••"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="btn btn-primary w-full rounded-md px-4 py-2.5 text-sm font-medium disabled:opacity-50"
        >
          {loading ? 'Signing in...' : 'Sign In'}
        </button>
      </form>

      <div className="auth-login-forgot-link mt-4 text-center">
        <Link href={adminRoutes.forgotPassword} className="text-sm text-(--text-muted) hover:text-brand-600">
          Forgot your password?
        </Link>
      </div>

      {registrationEnabled && (
        <p className="auth-login-alt-action mt-4 text-center text-sm text-(--text-muted)">
          Don&apos;t have an account?{' '}
          <Link href={adminRoutes.register} className="font-medium text-brand-600 hover:text-brand-500">
            Sign up
          </Link>
        </p>
      )}
    </div>
  );
}
