import type { Metadata } from 'next';

import { siteConfig } from '@/config/site';
import { serverTRPC } from '@/lib/trpc/server';
import { getLocale } from '@/lib/locale-server';
import { ShowcaseFeed } from '@/components/public/ShowcaseFeed';

export async function generateMetadata(): Promise<Metadata> {
  const { getServerTranslations } = await import('@/lib/translations-server');
  const __ = await getServerTranslations();
  return {
    title: `${__('Showcase')} | ${siteConfig.name}`,
    description: __('Explore our showcase — swipe through videos, images, and stories.'),
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
