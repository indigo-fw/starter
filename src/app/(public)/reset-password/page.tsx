import { Metadata } from 'next';
import { getServerTranslations } from '@/lib/translations-server';
import { ResetPasswordForm } from './ResetPasswordForm';

export const metadata: Metadata = {
  title: 'Reset Password',
  description: 'Set a new password',
};

export default async function ResetPasswordPage() {
  const __ = await getServerTranslations();
  return (
    <main className="content-container py-16 max-w-md">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold">{__('Reset Password')}</h1>
        <p className="text-(--text-secondary) mt-2">{__('Enter your new password below.')}</p>
      </div>
      <ResetPasswordForm />
    </main>
  );
}
