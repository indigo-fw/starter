'use client';

import { useState, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

import { authClient } from '@/lib/auth-client';
import { adminRoutes } from '@/config/routes';

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }

    if (!token) {
      setError('Missing reset token. Please request a new reset link.');
      return;
    }

    setLoading(true);

    try {
      const result = await authClient.resetPassword({ newPassword: password, token });
      if (result.error) {
        setError(result.error.message ?? 'Failed to reset password.');
      } else {
        setDone(true);
      }
    } catch {
      setError('Failed to reset password. The link may have expired.');
    } finally {
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <div className="auth-reset-card rounded-lg border border-(--border-primary) bg-(--surface-primary) p-8 shadow-sm">
        <h1 className="text-2xl font-bold text-(--text-primary)">Invalid Link</h1>
        <p className="mt-3 text-sm text-(--text-secondary)">
          This password reset link is invalid or has expired.
        </p>
        <Link
          href={adminRoutes.forgotPassword}
          className="mt-4 inline-block text-sm font-medium text-(--color-brand-600) hover:text-(--color-brand-500)"
        >
          Request a new reset link
        </Link>
      </div>
    );
  }

  if (done) {
    return (
      <div className="auth-reset-card rounded-lg border border-(--border-primary) bg-(--surface-primary) p-8 shadow-sm">
        <h1 className="text-2xl font-bold text-(--text-primary)">Password Reset</h1>
        <p className="mt-3 text-sm text-(--text-secondary)">
          Your password has been reset successfully. You can now sign in with your new password.
        </p>
        <Link
          href={adminRoutes.login}
          className="btn btn-primary mt-4 inline-block rounded-md px-4 py-2 text-sm font-medium"
        >
          Sign In
        </Link>
      </div>
    );
  }

  return (
    <div className="auth-reset-card rounded-lg border border-(--border-primary) bg-(--surface-primary) p-8 shadow-sm">
      <h1 className="text-2xl font-bold text-(--text-primary)">Set New Password</h1>
      <p className="mt-1 text-sm text-(--text-muted)">
        Choose a new password for your account.
      </p>

      {error && (
        <div className="auth-reset-error mt-4 rounded-md bg-red-50 dark:bg-red-500/15 p-3 text-sm text-red-700 dark:text-red-400">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="auth-reset-form mt-6 space-y-4">
        <div>
          <label
            htmlFor="password"
            className="block text-sm font-medium text-(--text-secondary)"
          >
            New Password
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

        <div>
          <label
            htmlFor="confirm"
            className="block text-sm font-medium text-(--text-secondary)"
          >
            Confirm Password
          </label>
          <input
            id="confirm"
            type="password"
            required
            minLength={6}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="input mt-1"
            placeholder="••••••••"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="btn btn-primary w-full rounded-md px-4 py-2.5 text-sm font-medium disabled:opacity-50"
        >
          {loading ? 'Resetting...' : 'Reset Password'}
        </button>
      </form>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="rounded-lg border border-(--border-primary) bg-(--surface-primary) p-8 shadow-sm text-center text-(--text-muted)">Loading...</div>}>
      <ResetPasswordForm />
    </Suspense>
  );
}
