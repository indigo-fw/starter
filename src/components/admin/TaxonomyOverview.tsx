'use client';

import { BarChart3, Hash, Link2, AlertTriangle } from 'lucide-react';

import { trpc } from '@/lib/trpc/client';
import { useAdminTranslations } from '@/lib/translations';

export function TaxonomyOverview() {
  const __ = useAdminTranslations();
  const { data, isLoading } = trpc.tags.stats.useQuery();

  if (isLoading || !data) return null;

  const statCards = [
    {
      label: __('Total Tags'),
      value: data.totalTags,
      icon: Hash,
      color: 'text-(--color-brand-600) dark:text-(--color-brand-400) bg-(--color-brand-50) dark:bg-[oklch(0.65_0.17_var(--brand-hue)_/_0.12)]',
    },
    {
      label: __('Published'),
      value: data.publishedTags,
      icon: BarChart3,
      color: 'text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-500/15',
    },
    {
      label: __('Relationships'),
      value: data.totalRelationships,
      icon: Link2,
      color: 'text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-500/15',
    },
    {
      label: __('Orphaned'),
      value: data.orphanedTags,
      icon: AlertTriangle,
      color: 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/15',
    },
  ];

  return (
    <div className="mb-6 space-y-4">
      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {statCards.map((stat) => (
          <div key={stat.label} className="card p-4">
            <div className="flex items-center gap-3">
              <div
                className={`flex h-9 w-9 items-center justify-center rounded-lg ${stat.color}`}
              >
                <stat.icon className="h-4 w-4" />
              </div>
              <div>
                <p className="text-2xl font-bold text-(--text-primary)">{stat.value}</p>
                <p className="text-xs text-(--text-muted)">{stat.label}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Top tags table */}
      {data.topTags.length > 0 && (
        <div className="card overflow-hidden">
          <div className="px-4 py-3">
            <h3 className="text-sm font-semibold text-(--text-secondary)">
              {__('Top Tags')}
            </h3>
          </div>
          <table className="w-full">
            <thead className="table-thead">
              <tr>
                <th className="table-th">{__('Tag')}</th>
                <th className="table-th w-24 text-right">{__('Posts')}</th>
              </tr>
            </thead>
            <tbody>
              {data.topTags.map((tag) => (
                <tr key={tag.slug} className="hover:bg-(--surface-secondary)">
                  <td className="table-td text-sm font-medium text-(--text-primary)">
                    {tag.name}
                  </td>
                  <td className="table-td text-right text-sm text-(--text-muted)">
                    {Number(tag.count)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
