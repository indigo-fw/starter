import type { Metadata } from 'next';

import { siteConfig } from '@/config/site';
import { SHORTCODE_COMPONENTS } from '@/config/shortcodes';
import { CmsContent } from '@/core/components';
import { serverTRPC } from '@/lib/trpc/server';
import { getLocale } from '@/lib/locale-server';
import { ShowcaseFeed } from '@/components/public/ShowcaseFeed';

export async function generateMetadata(): Promise<Metadata> {
  const { getServerTranslations } = await import('@/lib/translations-server');
  const { db } = await import('@/server/db');
  const { getCmsOverride } = await import('@/lib/cms-override');
  const { getContentType } = await import('@/config/cms');
  const { buildPageTitle } = await import('@/core/lib/content/title-template');
  const __ = await getServerTranslations();
  const locale = await getLocale();
  const cms = await getCmsOverride(db, 'showcase', locale).catch(() => null);
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
  };
}

export default async function ShowcasePage() {
  const locale = await getLocale();
  const { db } = await import('@/server/db');
  const { getCmsOverride } = await import('@/lib/cms-override');
  const cms = await getCmsOverride(db, 'showcase', locale).catch(() => null);
  const api = await serverTRPC();
  const { results: items } = await api.showcase.listPublished({
    lang: locale,
    pageSize: 100,
  });

  return (
    <>
      <ShowcaseFeed
        items={items}
        showNavDots={siteConfig.showcase.showNavDots}
      />
      {cms?.content && (
        <div className="app-container py-12">
          <CmsContent content={cms.content} components={SHORTCODE_COMPONENTS} />
        </div>
      )}
    </>
  );
}
