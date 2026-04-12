'use client';

import Link from 'next/link';
import { Plus, ExternalLink } from 'lucide-react';
import { trpc } from '@/lib/trpc/client';
import { useAdminTranslations } from '@/core/lib/i18n/translations';

export default function SitesListPage() {
  const __ = useAdminTranslations();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sites = (trpc as any).sites;
  const { data: siteList, isLoading } = sites.list.useQuery() as {
    data: { id: string; name: string; slug: string; status: number; isNetworkAdmin: boolean; createdAt: Date }[] | undefined;
    isLoading: boolean;
  };

  const statusLabel = (s: number) =>
    s === 1 ? __('Active') : s === 2 ? __('Suspended') : __('Deleted');

  return (
    <div className="dash-container">
      <div className="dash-header">
        <h1 className="dash-title">{__('Sites')}</h1>
        <Link href="/dashboard/settings/sites/create" className="btn btn-primary text-sm">
          <Plus size={16} /> {__('Create Site')}
        </Link>
      </div>

      <div className="dash-main">
        <div className="dash-inner">
          {isLoading ? (
            <p className="text-sm text-(--text-muted)">{__('Loading...')}</p>
          ) : !siteList?.length ? (
            <p className="text-sm text-(--text-muted)">{__('No sites yet. Create your first site.')}</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="table-th">{__('Name')}</th>
                  <th className="table-th">{__('Slug')}</th>
                  <th className="table-th">{__('Status')}</th>
                  <th className="table-th">{__('Created')}</th>
                  <th className="table-th" />
                </tr>
              </thead>
              <tbody>
                {siteList.map((site) => (
                  <tr key={site.id} className="table-tr">
                    <td className="table-td font-medium">
                      {site.name}
                      {site.isNetworkAdmin && (
                        <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded bg-brand-500/10 text-brand-500">
                          {__('Network')}
                        </span>
                      )}
                    </td>
                    <td className="table-td font-mono text-xs">{site.slug}</td>
                    <td className="table-td">{statusLabel(site.status)}</td>
                    <td className="table-td">{new Date(site.createdAt).toLocaleDateString()}</td>
                    <td className="table-td text-right">
                      <a href={`/dashboard/settings/sites/${site.id}`} className="icon-btn" title={__('Edit')}>
                        <ExternalLink size={14} />
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
