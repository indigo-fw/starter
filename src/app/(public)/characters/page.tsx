import type { Metadata } from 'next';
import { CharacterBrowsePageClient } from './client';

export const metadata: Metadata = {
  title: 'AI Characters — Browse & Chat',
  description: 'Browse AI characters with unique personalities. Find your perfect companion and start chatting instantly.',
  openGraph: {
    title: 'AI Characters',
    description: 'Browse AI characters with unique personalities and start chatting.',
    type: 'website',
  },
};

/**
 * /characters — Server component with metadata.
 * Renders client component for interactive browse experience.
 */
export default function CharactersPage() {
  return <CharacterBrowsePageClient />;
}
