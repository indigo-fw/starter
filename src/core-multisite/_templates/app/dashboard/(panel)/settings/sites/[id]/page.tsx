'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { Globe, Trash2, Plus, Check, X, ArrowLeft, Pause, Play, RotateCcw, Copy, Palette } from 'lucide-react';
import { useSitesApi, useSitesUtils } from '@/core-multisite/hooks/useSitesApi';
import { useAdminTranslations } from '@/core/lib/i18n/translations';
import { useConfirm, usePrompt } from '@/core/hooks';

export default function SiteDetailPage() {
  const __ = useAdminTranslations();
  const confirm = useConfirm();
  const prompt = usePrompt();
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const sites = useSitesApi();
  const { data: site, isLoading } = sites.getById.useQuery({ id });
  const updateSite = sites.update.useMutation();
  const softDelete = sites.softDelete.useMutation();
  const restoreMutation = sites.restore.useMutation();
  const suspendMutation = sites.suspend.useMutation();
  const unsuspendMutation = sites.unsuspend.useMutation();
  const cloneMutation = sites.clone.useMutation();
  const addDomainMutation = sites.addDomain.useMutation();
  const removeDomainMutation = sites.removeDomain.useMutation();
  const utils = useSitesUtils();

  const [name, setName] = useState('');
  const [newDomain, setNewDomain] = useState('');
  const [verifyMsg, setVerifyMsg] = useState('');

  // Branding state — keyed on site.id to reset when navigating between sites
  const [brandHue, setBrandHue] = useState('');
  const [accentHue, setAccentHue] = useState('');
  const [grayHue, setGrayHue] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [faviconUrl, setFaviconUrl] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [syncedSiteId, setSyncedSiteId] = useState<string | null>(null);

  // Sync state from loaded data — re-syncs when site.id changes
  if (site && syncedSiteId !== site.id) {
    setName(site.name);
    setBrandHue(site.settings?.brandHue != null ? String(site.settings.brandHue) : '');
    setAccentHue(site.settings?.accentHue != null ? String(site.settings.accentHue) : '');
    setGrayHue(site.settings?.grayHue != null ? String(site.settings.grayHue) : '');
    setLogoUrl(site.settings?.logoUrl ?? '');
    setFaviconUrl(site.settings?.faviconUrl ?? '');
    setContactEmail(site.settings?.contactEmail ?? '');
    setSyncedSiteId(site.id);
  }

  if (isLoading) return <div className="dash-container"><p className="text-sm text-(--text-muted)">{__('Loading...')}</p></div>;
  if (!site) return <div className="dash-container"><p className="text-sm text-(--text-muted)">{__('Site not found')}</p></div>;

  const isActive = site.status === 1;
  const isSuspended = site.status === 2;
  const isDeleted = site.status === 3;

  const handleSave = async () => {
    await updateSite.mutateAsync({ id, name });
    utils.invalidate();
  };

  const handleSaveBranding = async () => {
    const settings = {
      ...site.settings,
      brandHue: brandHue ? Number(brandHue) : undefined,
      accentHue: accentHue ? Number(accentHue) : undefined,
      grayHue: grayHue ? Number(grayHue) : undefined,
      logoUrl: logoUrl || undefined,
      faviconUrl: faviconUrl || undefined,
      contactEmail: contactEmail || undefined,
    };
    await updateSite.mutateAsync({ id, settings });
    utils.invalidate();
  };

  const handleSuspend = async () => {
    if (!await confirm({ title: __('Suspend this site?'), message: __('It will become inaccessible to visitors.'), variant: 'danger', confirmLabel: __('Suspend') })) return;
    await suspendMutation.mutateAsync({ id });
    utils.invalidate();
  };

  const handleUnsuspend = async () => {
    await unsuspendMutation.mutateAsync({ id });
    utils.invalidate();
  };

  const handleDelete = async () => {
    if (!await confirm({ title: __('Are you sure you want to disable this site?'), variant: 'danger', confirmLabel: __('Delete') })) return;
    await softDelete.mutateAsync({ id });
    router.push('/dashboard/settings/sites');
  };

  const handleRestore = async () => {
    await restoreMutation.mutateAsync({ id });
    utils.invalidate();
  };

  const handleClone = async () => {
    const cloneName = await prompt({ title: __('Name for the cloned site:'), placeholder: __('Site name') });
    if (!cloneName?.trim()) return;
    const result = await cloneMutation.mutateAsync({ sourceSiteId: id, name: cloneName.trim() });
    router.push(`/dashboard/settings/sites/${result.id}`);
  };

  const handleAddDomain = async () => {
    if (!newDomain.trim()) return;
    const result = await addDomainMutation.mutateAsync({ siteId: id, domain: newDomain.trim() });
    setVerifyMsg(result.verificationInstruction);
    setNewDomain('');
    utils.invalidate();
  };

  const handleRemoveDomain = async (domainId: string) => {
    if (!await confirm({ title: __('Remove this domain?'), variant: 'danger', confirmLabel: __('Remove') })) return;
    await removeDomainMutation.mutateAsync({ id: domainId });
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
          {isSuspended && <span className="text-xs px-2 py-0.5 rounded bg-yellow-500/10 text-yellow-600">{__('Suspended')}</span>}
          {isDeleted && <span className="text-xs px-2 py-0.5 rounded bg-red-500/10 text-red-600">{__('Deleted')}</span>}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleClone} className="btn btn-secondary text-sm" title={__('Clone Site')}>
            <Copy size={14} /> {__('Clone')}
          </button>
          {isActive && (
            <button onClick={handleSuspend} className="btn btn-secondary text-sm">
              <Pause size={14} /> {__('Suspend')}
            </button>
          )}
          {isSuspended && (
            <button onClick={handleUnsuspend} className="btn btn-primary text-sm">
              <Play size={14} /> {__('Unsuspend')}
            </button>
          )}
          {isDeleted && (
            <button onClick={handleRestore} className="btn btn-primary text-sm">
              <RotateCcw size={14} /> {__('Restore')}
            </button>
          )}
          {!isDeleted && (
            <button onClick={handleDelete} className="btn btn-danger text-sm">
              <Trash2 size={14} /> {__('Disable Site')}
            </button>
          )}
        </div>
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

          {/* Branding */}
          <section>
            <h2 className="text-sm font-semibold text-(--text-primary) mb-4 flex items-center gap-2">
              <Palette size={16} /> {__('Branding')}
            </h2>
            <div className="space-y-3 max-w-md">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="label">{__('Brand Hue')}</label>
                  <input
                    className="input"
                    type="number"
                    min="0"
                    max="360"
                    value={brandHue}
                    onChange={(e) => setBrandHue(e.target.value)}
                    placeholder="350"
                  />
                </div>
                <div>
                  <label className="label">{__('Accent Hue')}</label>
                  <input
                    className="input"
                    type="number"
                    min="0"
                    max="360"
                    value={accentHue}
                    onChange={(e) => setAccentHue(e.target.value)}
                    placeholder="303"
                  />
                </div>
                <div>
                  <label className="label">{__('Gray Hue')}</label>
                  <input
                    className="input"
                    type="number"
                    min="0"
                    max="360"
                    value={grayHue}
                    onChange={(e) => setGrayHue(e.target.value)}
                    placeholder="260"
                  />
                </div>
              </div>
              <div>
                <label className="label">{__('Logo URL')}</label>
                <input className="input" value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} placeholder="https://..." />
              </div>
              <div>
                <label className="label">{__('Favicon URL')}</label>
                <input className="input" value={faviconUrl} onChange={(e) => setFaviconUrl(e.target.value)} placeholder="https://..." />
              </div>
              <div>
                <label className="label">{__('Contact Email')}</label>
                <input className="input" type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} placeholder="hello@example.com" />
              </div>
              <button onClick={handleSaveBranding} className="btn btn-primary text-sm" disabled={updateSite.isPending}>
                {__('Save Branding')}
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
