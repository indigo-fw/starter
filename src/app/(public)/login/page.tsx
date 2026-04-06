import { Metadata } from 'next';
import { getServerTranslations } from '@/lib/translations-server';
import { LoginForm } from './LoginForm';

export const metadata: Metadata = {
  title: 'Sign In',
  description: 'Sign in to your account',
};

export default async function LoginPage() {
  const __ = await getServerTranslations();
  return (
    <main className="container mx-auto px-4 py-16 max-w-md">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold">{__('Sign In')}</h1>
        <p className="text-(--text-secondary) mt-2">{__('Welcome back! Sign in to your account.')}</p>
      </div>
      <LoginForm />
    </main>
  );
}
