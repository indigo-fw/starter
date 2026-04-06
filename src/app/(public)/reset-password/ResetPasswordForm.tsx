'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { authClient } from '@/lib/auth-client';
import { publicAuthRoutes } from '@/config/routes';
import { useBlankTranslations } from '@/lib/translations';

export function ResetPasswordForm() {
  const __ = useBlankTranslations();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  if (!token) {
    return (
      <div className="text-center">
        <p className="text-sm text-danger-500">{__('Invalid or missing reset token.')}</p>
        <Link href={publicAuthRoutes.forgotPassword} className="inline-block mt-4 text-sm text-brand-500 hover:underline">
          {__('Request a new link')}
        </Link>
      </div>
    );
  }

  if (success) {
    return (
      <div className="text-center">
        <p className="text-sm text-(--text-secondary)">{__('Your password has been reset successfully!')}</p>
        <Link href={publicAuthRoutes.login} className="inline-block mt-4 text-sm text-brand-500 hover:underline">
          {__('Sign in with your new password')}
        </Link>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password !== confirm) {
      setError(__('Passwords do not match'));
      return;
    }

    setLoading(true);
    try {
      const result = await authClient.resetPassword({ newPassword: password, token });
      if (result.error) {
        setError(result.error.message ?? __('Failed to reset password'));
      } else {
        setSuccess(true);
      }
    } catch {
      setError(__('Something went wrong. Please try again.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="text-sm text-danger-500 bg-danger-500/10 px-4 py-2 rounded-lg">
          {error}
        </div>
      )}

      <div>
        <label htmlFor="password" className="block text-sm font-medium mb-1">{__('New Password')}</label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full px-3 py-2 rounded-lg border border-(--border-primary) bg-(--surface-primary) text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/25"
          placeholder={__('At least 6 characters')}
          minLength={6}
          required
        />
      </div>

      <div>
        <label htmlFor="confirm" className="block text-sm font-medium mb-1">{__('Confirm Password')}</label>
        <input
          id="confirm"
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className="w-full px-3 py-2 rounded-lg border border-(--border-primary) bg-(--surface-primary) text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/25"
          placeholder={__('Repeat your password')}
          minLength={6}
          required
        />
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full py-2.5 px-4 rounded-lg font-medium text-sm bg-brand-500 text-white hover:bg-brand-600 transition-colors disabled:opacity-50"
      >
        {loading ? __('Resetting...') : __('Reset Password')}
      </button>
    </form>
  );
}
