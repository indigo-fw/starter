'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Plus, ExternalLink, Pause, Play, RotateCcw } from 'lucide-react';
import { useSitesApi, useSitesUtils } from '@/core-multisite/hooks/useSitesApi';
import { useAdminTranslations } from '@/core/lib/i18n/translations';
import { useConfirm } from '@/core/hooks';

export default function SitesListPage() {
  const __ = useAdminTranslations();
  const confirm = useConfirm();
  const [showDeleted, setShowDeleted] = useState(false);

  const sites = useSitesApi();
  const { data: siteList, isLoading } = sites.list.useQuery();
  const suspend = sites.suspend.useMutation();
  const unsuspend = sites.unsuspend.useMutation();
  const restore = sites.restore.useMutation();
  const utils = useSitesUtils();

  const STATUS_ACTIVE = 1;
  const STATUS_SUSPENDED = 2;
  const STATUS_DELETED = 3;

  const statusLabel = (s: number) =>
    s === STATUS_ACTIVE ? __('Active') : s === STATUS_SUSPENDED ? __('Suspended') : __('Deleted');

  const statusClass = (s: number) =>
    s === STATUS_ACTIVE ? 'text-green-600' : s === STATUS_SUSPENDED ? 'text-yellow-600' : 'text-red-500';

  const filteredSites = siteList?.filter((s) => showDeleted || s.status !== STATUS_DELETED);

  const handleSuspend = async (id: string) => {
    if (!await confirm({ title: __('Suspend this site?'), message: __('It will become inaccessible to visitors.'), variant: 'danger', confirmLabel: __('Suspend') })) return;
    await suspend.mutateAsync({ id });
    utils.invalidate();
  };

  const handleUnsuspend = async (id: string) => {
    await unsuspend.mutateAsync({ id });
    utils.invalidate();
  };

  const handleRestore = async (id: string) => {
    await restore.mutateAsync({ id });
    utils.invalidate();
  };

  return (
    <div className="dash-container">
      <div className="dash-header">
        <h1 className="dash-title">{__('Sites')}</h1>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-xs text-(--text-muted) cursor-pointer">
            <input
              type="checkbox"
              checked={showDeleted}
              onChange={(e) => setShowDeleted(e.target.checked)}
              className="rounded"
            />
            {__('Show deleted')}
          </label>
          <Link href="/dashboard/settings/sites/create" className="btn btn-primary text-sm">
            <Plus size={16} /> {__('Create Site')}
          </Link>
        </div>
      </div>

      <div className="dash-main">
        <div className="dash-inner">
          {isLoading ? (
            <p className="text-sm text-(--text-muted)">{__('Loading...')}</p>
          ) : !filteredSites?.length ? (
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
                {filteredSites.map((site) => (
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
                    <td className={`table-td ${statusClass(site.status)}`}>
                      {statusLabel(site.status)}
                    </td>
                    <td className="table-td">{new Date(site.createdAt).toLocaleDateString()}</td>
                    <td className="table-td text-right">
                      <div className="flex items-center justify-end gap-1">
                        {site.status === STATUS_ACTIVE && !site.isNetworkAdmin && (
                          <button
                            onClick={() => handleSuspend(site.id)}
                            className="icon-btn text-(--text-muted)"
                            title={__('Suspend')}
                          >
                            <Pause size={14} />
                          </button>
                        )}
                        {site.status === STATUS_SUSPENDED && (
                          <button
                            onClick={() => handleUnsuspend(site.id)}
                            className="icon-btn text-yellow-600"
                            title={__('Unsuspend')}
                          >
                            <Play size={14} />
                          </button>
                        )}
                        {site.status === STATUS_DELETED && (
                          <button
                            onClick={() => handleRestore(site.id)}
                            className="icon-btn text-red-500"
                            title={__('Restore')}
                          >
                            <RotateCcw size={14} />
                          </button>
                        )}
                        <a href={`/dashboard/settings/sites/${site.id}`} className="icon-btn" title={__('Edit')}>
                          <ExternalLink size={14} />
                        </a>
                      </div>
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
