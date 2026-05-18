import type { Metadata } from 'next';
import { getServerTranslations } from '@/lib/translations-server';
import { siteConfig } from '@/config/site';
import { LoginForm } from './LoginForm';

export async function generateMetadata(): Promise<Metadata> {
  const __ = await getServerTranslations();
  return {
    title: `${__('Sign In')} | ${siteConfig.name}`,
    description: __('Sign in to your account'),
    robots: { index: false, follow: true },
  };
}

export default async function LoginPage() {
  const __ = await getServerTranslations();
  const isProd = process.env.NODE_ENV === 'production';
  // Temporary: demo runs NODE_ENV=production — keep INDIGO_ROBOTS_PROFILE until demo module exists
  const isDemo = process.env.INDIGO_ROBOTS_PROFILE === 'demo';
  const showBanner = !isProd || isDemo;
  const bannerEmail = showBanner ? (process.env.INIT_ADMIN_EMAIL ?? null) : null;
  const bannerPassword = showBanner ? (process.env.INIT_ADMIN_PASSWORD ?? null) : null;

  return (
    <main className="app-container py-16 max-w-md">
      {bannerEmail && bannerPassword && (
        <div className="mb-6 rounded-md border border-amber-200 bg-amber-50 dark:border-amber-500/30 dark:bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-300">
          <p className="font-semibold">
            {isDemo ? 'Demo instance — resets every hour' : 'Local dev'}
          </p>
          <p className="mt-1">
            Sign in as:{' '}
            <code className="rounded bg-amber-100 dark:bg-amber-500/20 px-1 py-0.5 font-mono text-xs">
              {bannerEmail}
            </code>{' '}
            /{' '}
            <code className="rounded bg-amber-100 dark:bg-amber-500/20 px-1 py-0.5 font-mono text-xs">
              {bannerPassword}
            </code>
          </p>
        </div>
      )}
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold">{__('Sign In')}</h1>
        <p className="text-(--text-secondary) mt-2">{__('Welcome back! Sign in to your account.')}</p>
      </div>
      <LoginForm />
    </main>
  );
}
