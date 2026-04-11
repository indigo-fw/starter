import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import Image from 'next/image';
import { Link } from '@/components/Link';

import { siteConfig } from '@/config/site';
import { buildCanonicalUrl } from '@/core/lib/seo/canonical';
import '@/config/canonical-init';
import { getLocale } from '@/lib/locale-server';
import { localePath } from '@/lib/locale';
import { PostType } from '@/core/types/cms';
import { serverTRPC } from '@/lib/trpc/server';
import { StructuredData } from '@/core/components/seo/StructuredData';
import { PostCard } from '@/core/components/PostCard';

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const api = await serverTRPC();
  try {
    const author = await api.authors.getBySlug({ slug });
    return {
      title: `${author.name} | ${siteConfig.name}`,
      description: author.bio ? author.bio.slice(0, 160) : `Posts by ${author.name}`,
      alternates: { canonical: buildCanonicalUrl(`/author/${slug}`) },
      openGraph: {
        locale: await getLocale(),
        ...(author.avatar && { images: [{ url: author.avatar, alt: author.name }] }),
      },
    };
  } catch {
    return {};
  }
}

export default async function AuthorPage({ params }: Props) {
  const { slug } = await params;
  const locale = await getLocale();
  const api = await serverTRPC();

  let author;
  try {
    author = await api.authors.getBySlug({ slug });
  } catch {
    notFound();
  }

  const socialUrls = author.socialUrls ? JSON.parse(author.socialUrls) as Record<string, string> : null;

  const posts = await api.authors.getPostsByAuthor({
    authorId: author.id,
    lang: locale,
    pageSize: 20,
  });

  return (
    <div className="app-container py-12">
      {/* Author profile header */}
      <div className="mx-auto max-w-2xl text-center mb-12">
        {author.avatar && (
          <Image
            src={author.avatar}
            alt={author.name}
            width={96}
            height={96}
            className="mx-auto mb-4 rounded-full object-cover"
          />
        )}
        <h1 className="text-3xl font-bold text-(--text-primary)">{author.name}</h1>
        {author.bio && (
          <p className="mt-3 text-(--text-secondary)">{author.bio}</p>
        )}
        {socialUrls && Object.keys(socialUrls).length > 0 && (
          <div className="mt-4 flex justify-center gap-3">
            {socialUrls.website && (
              <a href={socialUrls.website} className="text-sm text-(--text-muted) hover:text-(--text-secondary)" target="_blank" rel="noopener noreferrer">Website</a>
            )}
            {socialUrls.twitter && (
              <a href={`https://x.com/${socialUrls.twitter.replace('@', '')}`} className="text-sm text-(--text-muted) hover:text-(--text-secondary)" target="_blank" rel="noopener noreferrer">X</a>
            )}
            {socialUrls.github && (
              <a href={socialUrls.github} className="text-sm text-(--text-muted) hover:text-(--text-secondary)" target="_blank" rel="noopener noreferrer">GitHub</a>
            )}
            {socialUrls.linkedin && (
              <a href={socialUrls.linkedin} className="text-sm text-(--text-muted) hover:text-(--text-secondary)" target="_blank" rel="noopener noreferrer">LinkedIn</a>
            )}
          </div>
        )}
      </div>

      {/* Author's posts */}
      {posts.results.length > 0 && (
        <div className="mx-auto max-w-3xl space-y-4">
          <h2 className="text-xl font-semibold text-(--text-primary)">
            Posts by {author.name}
          </h2>
          {posts.results.map((post) => {
            const isBlog = post.type === PostType.BLOG;
            return (
              <PostCard
                key={post.id}
                title={post.title}
                href={localePath(isBlog ? `/blog/${post.slug}` : `/${post.slug}`, locale)}
                metaDescription={post.metaDescription}
                publishedAt={post.publishedAt}
                locale={locale}
              />
            );
          })}
        </div>
      )}

      {/* Person JSON-LD */}
      <StructuredData data={{
        '@context': 'https://schema.org',
        '@type': 'Person',
        name: author.name,
        url: `${siteConfig.url}/author/${author.slug}`,
        ...(author.bio && { description: author.bio }),
        ...(author.avatar && { image: author.avatar }),
        ...(socialUrls?.website && { sameAs: [socialUrls.website, socialUrls.twitter ? `https://x.com/${socialUrls.twitter.replace('@', '')}` : null, socialUrls.github, socialUrls.linkedin].filter(Boolean) }),
      }} />
    </div>
  );
}
