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
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold">{__('Sign In')}</h1>
        <p className="text-(--text-secondary) mt-2">{__('Welcome back! Sign in to your account.')}</p>
      </div>
      <LoginForm devEmail={bannerEmail} devPassword={bannerPassword} isDemo={isDemo} />
    </main>
  );
}
