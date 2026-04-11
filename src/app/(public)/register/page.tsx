import type { Metadata } from 'next';
import { getServerTranslations } from '@/lib/translations-server';
import { siteConfig } from '@/config/site';
import { RegisterForm } from './RegisterForm';

export async function generateMetadata(): Promise<Metadata> {
  const __ = await getServerTranslations();
  return {
    title: `${__('Create Account')} | ${siteConfig.name}`,
    description: __('Create a new account'),
    robots: { index: false, follow: true },
  };
}

export default async function RegisterPage() {
  const __ = await getServerTranslations();
  const registrationEnabled = process.env.NEXT_PUBLIC_REGISTRATION_ENABLED !== 'false';

  if (!registrationEnabled) {
    return (
      <main className="app-container py-16 max-w-md text-center">
        <h1 className="text-3xl font-bold mb-4">{__('Registration Closed')}</h1>
        <p className="text-(--text-secondary)">{__('Registration is currently not available. Please contact us for access.')}</p>
      </main>
    );
  }

  return (
    <main className="app-container py-16 max-w-md">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold">{__('Create Account')}</h1>
        <p className="text-(--text-secondary) mt-2">{__('Start your journey with a free account.')}</p>
      </div>
      <RegisterForm />
    </main>
  );
}
