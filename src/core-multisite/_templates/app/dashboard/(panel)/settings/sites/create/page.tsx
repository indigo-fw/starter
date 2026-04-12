'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { trpc } from '@/lib/trpc/client';
import { useAdminTranslations } from '@/core/lib/i18n/translations';

export default function CreateSitePage() {
  const __ = useAdminTranslations();
  const router = useRouter();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sites = (trpc as any).sites;
  const createSite = sites.create.useMutation() as {
    mutateAsync: (input: { name: string; slug?: string; defaultLocale?: string }) => Promise<{ id: string }>;
    isPending: boolean;
    error: { message: string } | null;
  };

  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [locale, setLocale] = useState('');

  const handleCreate = async () => {
    if (!name.trim()) return;
    const result = await createSite.mutateAsync({
      name: name.trim(),
      ...(slug && { slug: slug.trim() }),
      ...(locale && { defaultLocale: locale.trim() }),
    });
    router.push(`/dashboard/settings/sites/${result.id}`);
  };

  return (
    <div className="dash-container">
      <div className="dash-header">
        <div className="flex items-center gap-3">
          <Link href="/dashboard/settings/sites" className="icon-btn">
            <ArrowLeft size={16} />
          </Link>
          <h1 className="dash-title">{__('Create Site')}</h1>
        </div>
      </div>

      <div className="dash-main">
        <div className="dash-inner">
          <div className="space-y-4 max-w-md">
            <div>
              <label className="label">{__('Site Name')} *</label>
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Cool Sneakers" />
            </div>
            <div>
              <label className="label">{__('Slug')} ({__('optional')})</label>
              <input className="input font-mono text-sm" value={slug} onChange={(e) => setSlug(e.target.value)} placeholder={__('auto-generated from name')} />
              <p className="mt-1 text-xs text-(--text-muted)">{__('Used for subdomain: {slug}.yourdomain.com')}</p>
            </div>
            <div>
              <label className="label">{__('Default Locale')} ({__('optional')})</label>
              <input className="input" value={locale} onChange={(e) => setLocale(e.target.value)} placeholder="en" />
            </div>

            {createSite.error && (
              <div className="p-3 rounded bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 text-sm text-red-800 dark:text-red-300">
                {createSite.error.message}
              </div>
            )}

            <button onClick={handleCreate} className="btn btn-primary text-sm" disabled={createSite.isPending || !name.trim()}>
              {createSite.isPending ? __('Creating...') : __('Create Site')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
