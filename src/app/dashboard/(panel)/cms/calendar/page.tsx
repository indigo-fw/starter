'use client';

import { Suspense } from 'react';
import { Loader2 } from 'lucide-react';

import { ContentCalendar } from '@/core/components/ContentCalendar';
import { adminPanel } from '@/config/routes';
import { getContentType, getContentTypeByPostType } from '@/config/cms';

function resolveSection(contentType: string, postType?: number | null): string {
  // Try by content type id first (e.g. 'category' → 'categories', 'portfolio' → 'portfolio')
  const ct = getContentType(contentType);
  if (ct) return ct.adminSlug;
  // Fall back to postType lookup (e.g. PostType.PAGE → 'pages')
  if (postType != null) {
    const ptCt = getContentTypeByPostType(postType);
    if (ptCt) return ptCt.adminSlug;
  }
  return contentType;
}

export default function CalendarPage() {
  return (
    <>
      <header className="dash-header">
        <div className="dash-toolbar">
          <h1 className="text-2xl font-bold text-(--text-primary)">Calendar</h1>
        </div>
      </header>
      <main className="dash-main"><div className="dash-inner">
      <Suspense
        fallback={
          <div className="calendar-loading flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-(--text-muted)" />
          </div>
        }
      >
        <ContentCalendar
          editUrlBuilder={(section, id) => adminPanel.cmsItem(section, id)}
          resolveSection={resolveSection}
        />
      </Suspense>
    </div></main>
    </>
  );
}
