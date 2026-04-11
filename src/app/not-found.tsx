import type { Metadata } from 'next';
import Link from 'next/link';
import { siteConfig } from '@/config/site';
import { getServerTranslations } from '@/lib/translations-server';

export const metadata: Metadata = {
  title: `404 | ${siteConfig.name}`,
  robots: { index: false, follow: false },
};

export default async function NotFound() {
  const __ = await getServerTranslations();

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-(--surface-secondary) p-4">
      <h1 className="text-6xl font-bold text-(--border-primary)">404</h1>
      <h2 className="mt-4 text-xl font-semibold text-(--text-primary)">{__('Page not found')}</h2>
      <p className="mt-2 text-sm text-(--text-secondary)">
        {__("The page you're looking for doesn't exist or has been moved.")}
      </p>
      <div className="mt-6 flex gap-3">
        <Link
          href="/"
          className="inline-flex items-center justify-center gap-1.5 rounded-md px-4 py-2 text-sm font-medium text-white"
          style={{ background: 'var(--gradient-brand)' }}
        >
          {__('Go Home')}
        </Link>
        <Link
          href="/blog"
          className="rounded-md border border-(--border-primary) bg-(--surface-primary) px-4 py-2 text-sm font-medium text-(--text-secondary) hover:bg-(--surface-secondary)"
        >
          {__('Browse Blog')}
        </Link>
      </div>
    </div>
  );
}
