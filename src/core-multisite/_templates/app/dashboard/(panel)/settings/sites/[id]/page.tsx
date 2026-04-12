'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { Globe, Trash2, Plus, Check, X, ArrowLeft } from 'lucide-react';
import { trpc } from '@/lib/trpc/client';
import { useAdminTranslations } from '@/core/lib/i18n/translations';

export default function SiteDetailPage() {
  const __ = useAdminTranslations();
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sites = (trpc as any).sites;
  const { data: site, isLoading } = sites.getById.useQuery({ id }) as {
    data: {
      id: string; name: string; slug: string; schemaName: string;
      defaultLocale: string; locales: string[]; status: number;
      settings: Record<string, unknown>;
      domains: { id: string; domain: string; isPrimary: boolean; verified: boolean; verificationToken: string | null }[];
      members: { userId: string; role: string; createdAt: Date }[];
    } | undefined;
    isLoading: boolean;
  };

  const updateSite = sites.update.useMutation() as { mutateAsync: (input: Record<string, unknown>) => Promise<unknown>; isPending: boolean };
  const softDelete = sites.softDelete.useMutation() as { mutateAsync: (input: { id: string }) => Promise<unknown> };
  const addDomain = sites.addDomain.useMutation() as { mutateAsync: (input: Record<string, unknown>) => Promise<{ verificationInstruction: string }> };
  const removeDomain = sites.removeDomain.useMutation() as { mutateAsync: (input: { id: string }) => Promise<unknown> };
  const utils = trpc.useUtils();

  const [name, setName] = useState('');
  const [newDomain, setNewDomain] = useState('');
  const [verifyMsg, setVerifyMsg] = useState('');

  // Sync name from loaded data
  if (site && !name) setName(site.name);

  if (isLoading) return <div className="dash-container"><p className="text-sm text-(--text-muted)">{__('Loading...')}</p></div>;
  if (!site) return <div className="dash-container"><p className="text-sm text-(--text-muted)">{__('Site not found')}</p></div>;

  const handleSave = async () => {
    await updateSite.mutateAsync({ id, name });
    utils.invalidate();
  };

  const handleDelete = async () => {
    if (!confirm(__('Are you sure you want to disable this site?'))) return;
    await softDelete.mutateAsync({ id });
    router.push('/dashboard/settings/sites');
  };

  const handleAddDomain = async () => {
    if (!newDomain.trim()) return;
    const result = await addDomain.mutateAsync({ siteId: id, domain: newDomain.trim() });
    setVerifyMsg(result.verificationInstruction);
    setNewDomain('');
    utils.invalidate();
  };

  const handleRemoveDomain = async (domainId: string) => {
    if (!confirm(__('Remove this domain?'))) return;
    await removeDomain.mutateAsync({ id: domainId });
    utils.invalidate();
  };

  return (
    <div className="dash-container">
      <div className="dash-header">
        <div className="flex items-center gap-3">
          <Link href="/dashboard/settings/sites" className="icon-btn">
            <ArrowLeft size={16} />
          </Link>
          <h1 className="dash-title">{site.name}</h1>
        </div>
        <button onClick={handleDelete} className="btn btn-danger text-sm">
          <Trash2 size={14} /> {__('Disable Site')}
        </button>
      </div>

      <div className="dash-main">
        <div className="dash-inner space-y-8">
          {/* General */}
          <section>
            <h2 className="text-sm font-semibold text-(--text-primary) mb-4">{__('General')}</h2>
            <div className="space-y-3 max-w-md">
              <div>
                <label className="label">{__('Site Name')}</label>
                <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div>
                <label className="label">{__('Slug')}</label>
                <input className="input" value={site.slug} disabled />
              </div>
              <div>
                <label className="label">{__('Schema')}</label>
                <input className="input font-mono text-xs" value={site.schemaName} disabled />
              </div>
              <button onClick={handleSave} className="btn btn-primary text-sm" disabled={updateSite.isPending}>
                {__('Save')}
              </button>
            </div>
          </section>

          {/* Domains */}
          <section>
            <h2 className="text-sm font-semibold text-(--text-primary) mb-4">{__('Domains')}</h2>
            <div className="space-y-2 mb-4">
              {site.domains.map((d) => (
                <div key={d.id} className="flex items-center gap-3 px-3 py-2 rounded border border-(--border-primary) bg-(--surface-primary)">
                  <Globe size={14} className="text-(--text-muted)" />
                  <span className="text-sm font-mono flex-1">{d.domain}</span>
                  {d.verified ? (
                    <span className="text-xs text-green-500 flex items-center gap-1"><Check size={12} /> {__('Verified')}</span>
                  ) : (
                    <span className="text-xs text-yellow-500 flex items-center gap-1"><X size={12} /> {__('Pending')}</span>
                  )}
                  {d.isPrimary && <span className="text-[10px] px-1.5 py-0.5 rounded bg-brand-500/10 text-brand-500">{__('Primary')}</span>}
                  <button onClick={() => handleRemoveDomain(d.id)} className="icon-btn text-(--text-muted)">
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>

            <div className="flex gap-2 max-w-md">
              <input className="input flex-1" placeholder="cool-sneakers.com" value={newDomain} onChange={(e) => setNewDomain(e.target.value)} />
              <button onClick={handleAddDomain} className="btn btn-secondary text-sm">
                <Plus size={14} /> {__('Add')}
              </button>
            </div>

            {verifyMsg && (
              <div className="mt-3 p-3 rounded bg-yellow-50 dark:bg-yellow-500/10 border border-yellow-200 dark:border-yellow-500/30 text-sm text-yellow-800 dark:text-yellow-300">
                {verifyMsg}
              </div>
            )}
          </section>

          {/* Members */}
          <section>
            <h2 className="text-sm font-semibold text-(--text-primary) mb-4">{__('Members')}</h2>
            {site.members.length === 0 ? (
              <p className="text-sm text-(--text-muted)">{__('No members yet.')}</p>
            ) : (
              <div className="space-y-1">
                {site.members.map((m) => (
                  <div key={m.userId} className="flex items-center gap-3 px-3 py-2 rounded border border-(--border-primary) bg-(--surface-primary)">
                    <span className="text-sm font-mono flex-1">{m.userId}</span>
                    <span className="text-xs text-(--text-muted)">{m.role}</span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
