'use client';

import { useState } from 'react';
import Link from 'next/link';

import { requestReset } from './actions';
import { adminRoutes } from '@/config/routes';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const result = await requestReset(email);
      if (result.success) {
        setSent(true);
      } else {
        setError(result.error ?? 'Something went wrong.');
      }
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <div className="auth-forgot-card rounded-lg border border-(--border-primary) bg-(--surface-primary) p-8 shadow-sm">
        <h1 className="text-2xl font-bold text-(--text-primary)">Check your email</h1>
        <p className="mt-3 text-sm text-(--text-secondary)">
          If an account exists for <strong>{email}</strong>, we&apos;ve sent a password reset link.
          Check your inbox and follow the instructions.
        </p>
        <Link
          href={adminRoutes.login}
          className="mt-6 inline-block text-sm font-medium text-(--color-brand-600) hover:text-(--color-brand-500)"
        >
          Back to Sign In
        </Link>
      </div>
    );
  }

  return (
    <div className="auth-forgot-card rounded-lg border border-(--border-primary) bg-(--surface-primary) p-8 shadow-sm">
      <h1 className="text-2xl font-bold text-(--text-primary)">Forgot Password</h1>
      <p className="mt-1 text-sm text-(--text-muted)">
        Enter your email and we&apos;ll send you a reset link.
      </p>

      {error && (
        <div className="auth-forgot-error mt-4 rounded-md bg-red-50 dark:bg-red-500/15 p-3 text-sm text-red-700 dark:text-red-400">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="auth-forgot-form mt-6 space-y-4">
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

        <button
          type="submit"
          disabled={loading}
          className="btn btn-primary w-full rounded-md px-4 py-2.5 text-sm font-medium disabled:opacity-50"
        >
          {loading ? 'Sending...' : 'Send Reset Link'}
        </button>
      </form>

      <p className="auth-forgot-alt-action mt-6 text-center text-sm text-(--text-muted)">
        Remember your password?{' '}
        <Link href={adminRoutes.login} className="font-medium text-(--color-brand-600) hover:text-(--color-brand-500)">
          Sign in
        </Link>
      </p>
    </div>
  );
}
