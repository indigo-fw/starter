import type { Metadata } from 'next';

import { siteConfig } from '@/config/site';
import { serverTRPC } from '@/lib/trpc/server';
import { getLocale } from '@/lib/locale-server';
import { ShowcaseFeed } from '@/components/public/ShowcaseFeed';

export async function generateMetadata(): Promise<Metadata> {
  const { getServerTranslations } = await import('@/lib/translations-server');
  const { db } = await import('@/server/db');
  const { getCmsOverride } = await import('@/lib/cms-override');
  const __ = await getServerTranslations();
  const locale = await getLocale();
  const cms = await getCmsOverride(db, 'showcase', locale).catch(() => null);

  return {
    title: cms?.seo.seoTitle || `${__('Showcase')} | ${siteConfig.name}`,
    description: cms?.seo.metaDescription || __('Explore our showcase — swipe through videos, images, and stories.'),
    ...(cms?.seo.noindex && { robots: { index: false, follow: false } }),
  };
}

export default async function ShowcasePage() {
  const locale = await getLocale();
  const api = await serverTRPC();
  const { results: items } = await api.showcase.listPublished({
    lang: locale,
    pageSize: 100,
  });

  return (
    <ShowcaseFeed
      items={items}
      showNavDots={siteConfig.showcase.showNavDots}
    />
  );
}
