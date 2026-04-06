import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { Loader2 } from 'lucide-react';

import { getContentTypeByAdminSlug } from '@/config/cms';
import { CmsListView } from '@/components/admin/CmsListView';

interface Props {
  params: Promise<{ section: string }>;
}

export default async function CmsSectionPage({ params }: Props) {
  const { section } = await params;
  const contentType = getContentTypeByAdminSlug(section);

  if (!contentType) {
    notFound();
  }

  return (
    <Suspense
      fallback={
        <main className="dash-main"><div className="dash-inner">
          <div className="section-loading flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-(--text-muted)" />
          </div>
        </div></main>
      }
    >
      <CmsListView contentType={contentType} />
    </Suspense>
  );
}
