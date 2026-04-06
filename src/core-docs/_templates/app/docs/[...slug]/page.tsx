'use client';

import { useParams, notFound } from 'next/navigation';
import { trpc } from '@/lib/trpc/client';
import { DocRenderer } from '@/core-docs/components/DocRenderer';
import { DocSidebar } from '@/core-docs/components/DocSidebar';

export default function DocsPage() {
  const params = useParams();
  const slugParts = params.slug as string[];
  const slug = slugParts.join('/');

  const { data: doc, isLoading } = trpc.docs.getBySlug.useQuery({ slug });
  const { data: navigation } = trpc.docs.getNavigation.useQuery();

  if (isLoading) {
    return (
      <div className="flex min-h-screen">
        <div className="w-64 shrink-0" />
        <main className="flex-1 p-8">
          <div className="animate-pulse space-y-4">
            <div className="h-8 bg-gray-200 rounded w-1/3" />
            <div className="h-4 bg-gray-200 rounded w-full" />
            <div className="h-4 bg-gray-200 rounded w-2/3" />
          </div>
        </main>
      </div>
    );
  }

  if (!doc) return notFound();

  return (
    <div className="flex min-h-screen">
      <DocSidebar navigation={navigation ?? []} activeSlug={slug} />
      <main className="flex-1 max-w-4xl p-8">
        <DocRenderer doc={doc} />
      </main>
    </div>
  );
}
