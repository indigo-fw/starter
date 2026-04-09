import type { Metadata } from 'next';
import { CharacterBrowsePageClient } from './client';
import { getServerTranslations } from '@/lib/translations-server';

export async function generateMetadata(): Promise<Metadata> {
  const __ = await getServerTranslations();
  return {
    title: __('AI Characters — Browse & Chat'),
    description: __('Browse AI characters with unique personalities. Find your perfect companion and start chatting instantly.'),
    openGraph: {
      title: __('AI Characters'),
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
