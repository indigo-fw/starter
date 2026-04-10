import type { Metadata } from 'next';
import { CharacterBrowsePageClient } from './client';
import { getServerTranslations } from '@/lib/translations-server';
import { siteConfig } from '@/config/site';

export async function generateMetadata(): Promise<Metadata> {
  const __ = await getServerTranslations();
  const title = `${__('AI Characters')} | ${siteConfig.name}`;
  return {
    title,
    description: __('Browse AI characters with unique personalities. Find your perfect companion and start chatting instantly.'),
    openGraph: {
      title,
      description: __('Browse AI characters with unique personalities and start chatting.'),
      type: 'website',
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
