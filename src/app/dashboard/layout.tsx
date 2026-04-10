import type { Metadata } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, getLocale } from 'next-intl/server';
import { getAdminMessages } from '@/core/lib/i18n/admin-messages';

import './assets/admin.css';

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = await getLocale();
  const [publicMessages, adminMessages] = await Promise.all([
    getMessages(),
    getAdminMessages(),
  ]);

  // Merge admin messages into public — admin keys override on conflict
  const messages = { ...publicMessages as Record<string, unknown> };
  for (const [ns, keys] of Object.entries(adminMessages)) {
    messages[ns] = { ...(messages[ns] as Record<string, string> ?? {}), ...(keys as Record<string, string>) };
  }

  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      {children}
    </NextIntlClientProvider>
  );
}
