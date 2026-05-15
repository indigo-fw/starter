import { LoginPageClient } from './LoginPageClient';

export default function LoginPage() {
  const isDemo = process.env.INDIGO_ROBOTS_PROFILE === 'demo';
  return <LoginPageClient isDemo={isDemo} />;
}
