import type { Metadata } from 'next';

import { siteConfig } from '@/config/site';
import { CmsSlotContent } from '@/components/CmsSlotContent';
import { serverTRPC } from '@/lib/trpc/server';
import { getLocale } from '@/lib/locale-server';
import { ShowcaseFeed } from '@/components/public/ShowcaseFeed';
import { resolveContentVars } from '@/core/lib/content/vars';

export async function generateMetadata(): Promise<Metadata> {
  const { getServerTranslations } = await import('@/lib/translations-server');
  const { getPageCmsOverride } = await import('@/lib/cms-override');
  const { getContentType } = await import('@/config/cms');
  const { buildPageTitle } = await import('@/core/lib/content/title-template');
  const __ = await getServerTranslations();
  const locale = await getLocale();
  const cms = await getPageCmsOverride('showcase');
  const ct = getContentType('showcase')!;

  return {
    title: buildPageTitle({
      configTemplate: ct.titleTemplate,
      seoTitle: cms?.seo.seoTitle,
      fallbackTitle: __('Showcase'),
      sitename: siteConfig.name,
    }),
    description: cms?.seo.metaDescription || __('Explore our showcase — swipe through videos, images, and stories.'),
    ...(cms?.seo.noindex && { robots: { index: false, follow: false } }),
    openGraph: { locale },
  };
}

export default async function ShowcasePage() {
  const locale = await getLocale();
  const api = await serverTRPC();
  const { results: items } = await api.showcase.listPublished({
    lang: locale,
    pageSize: 100,
  });

  // Resolve %VAR% placeholders server-side so the client ShowcaseFeed never
  // imports vars.ts (which transitively pulls in ioredis — Node-only, can't
  // be bundled into client). ShortcodeRenderer no longer resolves vars itself.
  const resolvedItems = items.map((item) => ({
    ...item,
    description: item.description ? resolveContentVars(item.description) : item.description,
  }));

  return (
    <>
      <ShowcaseFeed
        items={resolvedItems}
        showNavDots={siteConfig.showcase.showNavDots}
      />
      <CmsSlotContent slug="showcase" />
    </>
  );
}
