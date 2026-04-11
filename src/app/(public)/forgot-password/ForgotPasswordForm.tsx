'use client';

import { useState } from 'react';
import { Link } from '@/components/Link';
import { requestPasswordReset } from './actions';
import { publicAuthRoutes } from '@/config/routes';
import { useBlankTranslations } from '@/lib/translations';

export function ForgotPasswordForm() {
  const __ = useBlankTranslations();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const result = await requestPasswordReset(email);
      if (result.success) {
        setSent(true);
      } else {
        setError(result.error ?? __('Something went wrong'));
      }
    } catch {
      setError(__('Something went wrong. Please try again.'));
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <div className="text-center">
        <div className="w-12 h-12 rounded-full bg-brand-500/10 flex items-center justify-center mx-auto mb-4">
          <svg className="w-6 h-6 text-brand-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        </div>
        <p className="text-sm text-(--text-secondary)">
          {__("If an account exists with that email, you'll receive a reset link shortly.")}
        </p>
        <Link href={publicAuthRoutes.login} className="inline-block mt-4 text-sm text-brand-500 hover:underline">
          {__('Back to sign in')}
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="text-sm text-danger-500 bg-danger-500/10 px-4 py-2 rounded-lg">
          {error}
        </div>
      )}

      <div>
        <label htmlFor="email" className="block text-sm font-medium mb-1">{__('Email')}</label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full px-3 py-2 rounded-lg border border-(--border-primary) bg-(--surface-primary) text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/25"
          placeholder={__('you@example.com')}
          required
        />
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full py-2.5 px-4 rounded-lg font-medium text-sm bg-brand-500 text-white hover:bg-brand-600 transition-colors disabled:opacity-50"
      >
        {loading ? __('Sending...') : __('Send Reset Link')}
      </button>

      <p className="text-center text-sm text-(--text-secondary)">
        <Link href={publicAuthRoutes.login} className="text-brand-500 hover:underline">{__('Back to sign in')}</Link>
      </p>
    </form>
  );
}
