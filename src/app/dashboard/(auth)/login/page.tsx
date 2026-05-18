import { LoginPageClient } from './LoginPageClient';

export default function LoginPage() {
  const isProd = process.env.NODE_ENV === 'production';
  // Demo module will inject its own banner; this handles local dev only
  const devEmail = !isProd ? (process.env.INIT_ADMIN_EMAIL ?? null) : null;
  const devPassword = !isProd ? (process.env.INIT_ADMIN_PASSWORD ?? null) : null;
  // Temporary: demo deployment runs NODE_ENV=production — keep until demo module exists
  const isDemo = process.env.INDIGO_ROBOTS_PROFILE === 'demo';
  const demoEmail = isDemo ? (process.env.INIT_ADMIN_EMAIL ?? null) : null;
  const demoPassword = isDemo ? (process.env.INIT_ADMIN_PASSWORD ?? null) : null;

  return (
    <LoginPageClient
      devEmail={devEmail ?? demoEmail}
      devPassword={devPassword ?? demoPassword}
      isDemo={isDemo}
    />
  );
}
