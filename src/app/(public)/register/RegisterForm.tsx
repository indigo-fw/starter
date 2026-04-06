'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { signUp } from '@/lib/auth-client';
import { SocialLoginButtons } from '@/components/public/SocialLoginButtons';
import { accountRoutes, publicAuthRoutes } from '@/config/routes';
import { useBlankTranslations } from '@/lib/translations';

export interface RegisterFormProps {
  /** Called after successful registration (dialog mode). If not provided, redirects. */
  onSuccess?: () => void;
  /** Called when user clicks "Sign in" (dialog mode). If not provided, renders a Link. */
  onSwitchToLogin?: () => void;
  /** Override callbackUrl for social login (dialog mode: pass current pathname so OAuth returns here) */
  socialCallbackUrl?: string;
}

export function RegisterForm({ onSuccess, onSwitchToLogin, socialCallbackUrl }: RegisterFormProps = {}) {
  const __ = useBlankTranslations();
  const router = useRouter();
  const searchParams = useSearchParams();
  const plan = searchParams.get('plan');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const result = await signUp.email({ name, email, password });
      if (result.error) {
        setError(result.error.message ?? __('Registration failed'));
      } else if (onSuccess) {
        onSuccess();
      } else {
        router.push(plan ? `${accountRoutes.home}?plan=${plan}` : accountRoutes.home);
      }
    } catch {
      setError(__('Something went wrong. Please try again.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <SocialLoginButtons callbackUrl={socialCallbackUrl ?? accountRoutes.home} />

      <div className="flex items-center gap-3 my-6">
        <div className="flex-1 border-t border-(--border-primary)" />
        <span className="text-xs text-(--text-secondary)">{__('or continue with email')}</span>
        <div className="flex-1 border-t border-(--border-primary)" />
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="text-sm text-danger-500 bg-danger-500/10 px-4 py-2 rounded-lg">
            {error}
          </div>
        )}

        <div>
          <label htmlFor="register-name" className="block text-sm font-medium mb-1">{__('Name')}</label>
          <input
            id="register-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-(--border-primary) bg-(--surface-primary) text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/25"
            placeholder={__('Your name')}
            required
          />
        </div>

        <div>
          <label htmlFor="register-email" className="block text-sm font-medium mb-1">{__('Email')}</label>
          <input
            id="register-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-(--border-primary) bg-(--surface-primary) text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/25"
            placeholder={__('you@example.com')}
            required
          />
        </div>

        <div>
          <label htmlFor="register-password" className="block text-sm font-medium mb-1">{__('Password')}</label>
          <input
            id="register-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-(--border-primary) bg-(--surface-primary) text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/25"
            placeholder={__('At least 6 characters')}
            minLength={6}
            required
          />
        </div>

        <div className="flex items-start gap-2">
          <input id="register-terms" type="checkbox" required className="mt-1" />
          <label htmlFor="register-terms" className="text-xs text-(--text-secondary)">
            {__('I agree to the')}{' '}
            <Link href="/terms" className="text-brand-500 hover:underline">{__('Terms of Service')}</Link>
            {' '}{__('and')}{' '}
            <Link href="/privacy-policy" className="text-brand-500 hover:underline">{__('Privacy Policy')}</Link>
          </label>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full py-2.5 px-4 rounded-lg font-medium text-sm bg-brand-500 text-white hover:bg-brand-600 transition-colors disabled:opacity-50"
        >
          {loading ? __('Creating account...') : __('Create Account')}
        </button>
      </form>

      <p className="text-center text-sm text-(--text-secondary) mt-6">
        {__('Already have an account?')}{' '}
        {onSwitchToLogin ? (
          <button type="button" onClick={onSwitchToLogin} className="text-brand-500 hover:underline">
            {__('Sign in')}
          </button>
        ) : (
          <Link href={publicAuthRoutes.login} className="text-brand-500 hover:underline">
            {__('Sign in')}
          </Link>
        )}
      </p>
    </div>
  );
}
