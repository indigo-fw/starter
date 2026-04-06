'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { signUp } from '@/lib/auth-client';
import { adminRoutes } from '@/config/routes';

const registrationEnabled =
  process.env.NEXT_PUBLIC_ADMIN_REGISTRATION_ENABLED === 'true' ||
  process.env.NEXT_PUBLIC_ADMIN_REGISTRATION_ENABLED === '1';

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (!registrationEnabled) {
    return (
      <div className="auth-register-card rounded-lg border border-(--border-primary) bg-(--surface-primary) p-8 shadow-sm">
        <h1 className="text-2xl font-bold text-(--text-primary)">Registration Disabled</h1>
        <p className="mt-3 text-sm text-(--text-secondary)">
          Admin registration is currently disabled. Contact your administrator for access.
        </p>
        <Link
          href={adminRoutes.login}
          className="mt-6 inline-block text-sm font-medium text-brand-600 hover:text-brand-500"
        >
          Back to Sign In
        </Link>
      </div>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const result = await signUp.email({ name, email, password });
      if (result.error) {
        setError(result.error.message ?? 'Registration failed');
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
    <div className="auth-register-card rounded-lg border border-(--border-primary) bg-(--surface-primary) p-8 shadow-sm">
      <h1 className="text-2xl font-bold text-(--text-primary)">Create Account</h1>
      <p className="mt-1 text-sm text-(--text-muted)">
        Get started with Indigo
      </p>

      {error && (
        <div className="auth-register-error mt-4 rounded-md bg-red-50 dark:bg-red-500/15 p-3 text-sm text-red-700 dark:text-red-400">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="auth-register-form mt-6 space-y-4">
        <div>
          <label
            htmlFor="name"
            className="block text-sm font-medium text-(--text-secondary)"
          >
            Name
          </label>
          <input
            id="name"
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="input mt-1"
            placeholder="Your name"
          />
        </div>

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
          {loading ? 'Creating account...' : 'Create Account'}
        </button>
      </form>

      <p className="auth-register-alt-action mt-6 text-center text-sm text-(--text-muted)">
        Already have an account?{' '}
        <Link href={adminRoutes.login} className="font-medium text-brand-600 hover:text-brand-500">
          Sign in
        </Link>
      </p>
    </div>
  );
}
