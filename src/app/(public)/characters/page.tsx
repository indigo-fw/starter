import type { Metadata } from 'next';
import { CharacterBrowsePageClient } from './client';
import { getServerTranslations } from '@/lib/translations-server';
import { siteConfig } from '@/config/site';
import { db } from '@/server/db';
import { getCmsOverride } from '@/lib/cms-override';
import { getLocale } from '@/lib/locale-server';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const __ = await getServerTranslations();
  const cms = await getCmsOverride(db, 'characters', locale).catch(() => null);
  const title = cms?.seo.seoTitle || `${__('AI Characters')} | ${siteConfig.name}`;
  const description = cms?.seo.metaDescription || __('Browse AI characters with unique personalities. Find your perfect companion and start chatting instantly.');
  return {
    title,
    description,
    ...(cms?.seo.noindex && { robots: { index: false, follow: false } }),
    openGraph: {
      title,
      description,
      type: 'website',
      locale,
    },
  };
}

/**
 * /characters — Server component with metadata.
 * Renders client component for interactive browse experience.
 */
export default function CharactersPage() {
  return <CharacterBrowsePageClient />;
}
