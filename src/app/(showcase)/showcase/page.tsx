import type { Metadata } from 'next';

import { siteConfig } from '@/config/site';
import { serverTRPC } from '@/lib/trpc/server';
import { getLocale } from '@/lib/locale-server';
import { ShowcaseFeed } from '@/components/public/ShowcaseFeed';

export const metadata: Metadata = {
  title: `Showcase | ${siteConfig.name}`,
  description: 'Explore our showcase — swipe through videos, images, and stories.',
};

export default async function ShowcasePage() {
  const locale = await getLocale();
  const api = await serverTRPC();
  const { results: items } = await api.showcase.listPublished({
    lang: locale,
    pageSize: 100,
  });

  return <ShowcaseFeed items={items} />;
}
