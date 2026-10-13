'use client';

import { useState } from 'react';

import { useSearchParams } from 'next/navigation';

import { Link } from '@/components/Link';
import { SocialLoginButtons } from '@/components/public/SocialLoginButtons';
import { accountRoutes, publicAuthRoutes } from '@/config/routes';
import { useRouter } from '@/i18n/navigation';
import { signUp } from '@/lib/auth-client';
import { useBlankTranslations } from '@/lib/translations';

export interface RegisterFormProps {
  /** Called after successful registration (dialog mode). If not provided, redirects. */
  onSuccess?: () => void;
  /** Called when user clicks "Sign in" (dialog mode). If not provided, renders a Link. */
  onSwitchToLogin?: () => void;
  /** Override callbackUrl for social login (dialog mode: pass current pathname so OAuth returns here) */
  socialCallbackUrl?: string;
}

export function RegisterForm({
  onSuccess,
  onSwitchToLogin,
  socialCallbackUrl,
}: RegisterFormProps = {}) {
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
        router.push(
          plan
            ? { pathname: accountRoutes.home, query: { plan } }
            : accountRoutes.home
        );
      }
    } catch {
      setError(__('Something went wrong. Please try again.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <SocialLoginButtons
        callbackUrl={socialCallbackUrl ?? accountRoutes.home}
      />

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
            htmlFor="register-name"
            className="mb-1 block text-sm font-medium"
          >
            {__('Name')}
          </label>
          <input
            id="register-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-lg border border-(--border-primary) bg-(--surface-primary) px-3 py-2 text-sm focus:ring-2 focus:ring-brand-500/25 focus:outline-none"
            placeholder={__('Your name')}
            required
          />
        </div>

        <div>
          <label
            htmlFor="register-email"
            className="mb-1 block text-sm font-medium"
          >
            {__('Email')}
          </label>
          <input
            id="register-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg border border-(--border-primary) bg-(--surface-primary) px-3 py-2 text-sm focus:ring-2 focus:ring-brand-500/25 focus:outline-none"
            placeholder={__('you@example.com')}
            required
          />
        </div>

        <div>
          <label
            htmlFor="register-password"
            className="mb-1 block text-sm font-medium"
          >
            {__('Password')}
          </label>
          <input
            id="register-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg border border-(--border-primary) bg-(--surface-primary) px-3 py-2 text-sm focus:ring-2 focus:ring-brand-500/25 focus:outline-none"
            placeholder={__('At least 6 characters')}
            minLength={6}
            required
          />
        </div>

        <div className="flex items-start gap-2">
          <input
            id="register-terms"
            type="checkbox"
            required
            className="mt-1"
          />
          <label
            htmlFor="register-terms"
            className="text-xs text-(--text-secondary)"
          >
            {__('I agree to the')}{' '}
            <Link href="/terms" className="text-brand-500 hover:underline">
              {__('Terms of Service')}
            </Link>{' '}
            {__('and')}{' '}
            <Link
              href="/privacy-policy"
              className="text-brand-500 hover:underline"
            >
              {__('Privacy Policy')}
            </Link>
          </label>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brand-600 disabled:opacity-50"
        >
          {loading ? __('Creating account...') : __('Create Account')}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-(--text-secondary)">
        {__('Already have an account?')}{' '}
        {onSwitchToLogin ? (
          <button
            type="button"
            onClick={onSwitchToLogin}
            className="text-brand-500 hover:underline"
          >
            {__('Sign in')}
          </button>
        ) : (
          <Link
            href={publicAuthRoutes.login}
            className="text-brand-500 hover:underline"
          >
            {__('Sign in')}
          </Link>
        )}
      </p>
    </div>
  );
}
