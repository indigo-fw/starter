import type { Metadata } from 'next';
import { getServerTranslations } from '@/lib/translations-server';
import { siteConfig } from '@/config/site';
import { ResetPasswordForm } from './ResetPasswordForm';

export async function generateMetadata(): Promise<Metadata> {
  const __ = await getServerTranslations();
  return {
    title: `${__('Reset Password')} | ${siteConfig.name}`,
    description: __('Set a new password'),
    robots: { index: false, follow: true },
  };
}

export default async function ResetPasswordPage() {
  const __ = await getServerTranslations();
  return (
    <main className="app-container py-16 max-w-md">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold">{__('Reset Password')}</h1>
        <p className="text-(--text-secondary) mt-2">{__('Enter your new password below.')}</p>
      </div>
      <ResetPasswordForm />
    </main>
  );
}
