'use client';

import type { ReactNode } from 'react';
import { trpc } from '@/lib/trpc/client';
import { useAdminTranslations } from '@/core/lib/translations';

export interface ContentStatusEntry {
  /** PostType numeric value to query */
  type: number;
  /** Label for published count, e.g. "Published pages" */
  publishedLabel: string;
  /** Label for draft count, e.g. "Draft pages" */
  draftLabel: string;
}

function ContentStatusRow({ entry }: { entry: ContentStatusEntry }) {
  const counts = trpc.cms.counts.useQuery({ type: entry.type });
  return (
    <>
      <div className="stat-row">
        <span className="stat-label">{entry.publishedLabel}</span>
        <span className="stat-value">{counts.data?.published ?? '—'}</span>
      </div>
      <div className="stat-row">
        <span className="stat-label">{entry.draftLabel}</span>
        <span className="stat-value">{counts.data?.draft ?? '—'}</span>
      </div>
    </>
  );
}

function ScheduledRow({ entries }: { entries: ContentStatusEntry[] }) {
  const __ = useAdminTranslations();
  const queries = entries.map((e) => trpc.cms.counts.useQuery({ type: e.type }));
  const total = queries.reduce((sum, q) => sum + (q.data?.scheduled ?? 0), 0);
  return (
    <div className="stat-row">
      <span className="stat-label">{__('Scheduled')}</span>
      <span className="stat-value">{queries.some((q) => q.data) ? total : '—'}</span>
    </div>
  );
}

export interface ContentStatusWidgetProps {
  dragHandle?: ReactNode;
  /** Content type entries to display. Each entry queries cms.counts for that type. */
  entries: ContentStatusEntry[];
}

export default function ContentStatusWidget({ dragHandle, entries }: ContentStatusWidgetProps) {
  const __ = useAdminTranslations();

  return (
    <div className="card flex flex-col overflow-hidden">
      <div className="widget-header">
        <div className="flex items-center gap-2">
          {dragHandle}
          <h2 className="h2">{__('Content Status')}</h2>
        </div>
      </div>
      <div className="stat-grid px-4">
        {entries.map((entry) => (
          <ContentStatusRow key={entry.type} entry={entry} />
        ))}
        <ScheduledRow entries={entries} />
      </div>
    </div>
  );
}
