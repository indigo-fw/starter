import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { siteConfig } from '@/config/site';
import { getCachedDoc, getCachedNavigation } from '../data';
import { DocRenderer } from '@/core-docs/components/DocRenderer';
import { DocSidebar } from '@/core-docs/components/DocSidebar';
import { DocsTabsHydrator } from '@/core-docs/components/DocsTabsHydrator';
import '@/core/styles/mdx-components.css';
import '@/core-docs/styles/docs.css';

interface Props {
  params: Promise<{ slug: string[] }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug: slugParts } = await params;
  const slug = slugParts.join('/');
  const doc = await getCachedDoc(slug);

  if (!doc) return {};

  const title = `${doc.metaTitle ?? doc.title} — ${siteConfig.name} Docs`;
  const description = doc.metaDescription ?? `${doc.title} documentation for ${siteConfig.name}`;

  return {
    title,
    description,
    alternates: {
      canonical: `${siteConfig.url}/docs/${slug}`,
    },
    openGraph: {
      title,
      description,
      type: 'article',
      modifiedTime: doc.updatedAt.toISOString(),
    },
  };
}

export default async function DocsPage({ params }: Props) {
  const { slug: slugParts } = await params;
  const slug = slugParts.join('/');

  const [doc, navigation] = await Promise.all([
    getCachedDoc(slug),
    getCachedNavigation(),
  ]);

  if (!doc) notFound();

  return (
    <div className="docs-layout">
      <DocSidebar navigation={navigation} activeSlug={slug} />
      <main className="docs-main">
        <DocsTabsHydrator>
          <DocRenderer doc={doc} />
        </DocsTabsHydrator>
      </main>
    </div>
  );
}
