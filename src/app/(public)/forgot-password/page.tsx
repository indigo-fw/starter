import { Metadata } from 'next';
import { getServerTranslations } from '@/lib/translations-server';
import { ForgotPasswordForm } from './ForgotPasswordForm';

export const metadata: Metadata = {
  title: 'Forgot Password',
  description: 'Reset your password',
};

export default async function ForgotPasswordPage() {
  const __ = await getServerTranslations();
  return (
    <main className="container mx-auto px-4 py-16 max-w-md">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold">{__('Forgot Password')}</h1>
        <p className="text-(--text-secondary) mt-2">{__('Enter your email to receive a reset link.')}</p>
      </div>
      <ForgotPasswordForm />
    </main>
  );
}
