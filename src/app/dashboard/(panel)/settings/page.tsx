'use client';

import { useMemo, useState } from 'react';
import { Save, Loader2, CheckCircle2, XCircle, Globe, RotateCcw } from 'lucide-react';

import Image from 'next/image';
import { trpc } from '@/lib/trpc/client';
import { useAdminTranslations } from '@/lib/translations';
import { toast } from '@/store/toast-store';
import { SeoOverridesDialog } from '@/core/components/SeoOverridesDialog';
import { LOCALES, LOCALE_LABELS } from '@/lib/constants';
import { GROUP_LABELS } from '@/config/options-registry';

interface OptionItem {
  key: string;
  label: string;
  description: string | null;
  group: string;
  type: 'text' | 'url' | 'number' | 'boolean' | 'textarea' | 'json';
  defaultValue: string | number | boolean;
  placeholder?: string;
  currentValue: unknown;
  isCustom: boolean;
}

export default function SettingsPage() {
  const __ = useAdminTranslations();
  const utils = trpc.useUtils();

  // ─── Data ───────────────────────────────────────────────────────────────────
  const registryQuery = trpc.options.listWithDefaults.useQuery();
  const [localOverrides, setLocalOverrides] = useState<Record<string, unknown>>({});

  const setMany = trpc.options.setMany.useMutation({
    onSuccess: () => {
      toast.success(__('Settings saved'));
      setLocalOverrides({});
      utils.options.listWithDefaults.invalidate();
      utils.options.getAll.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const resetToDefault = trpc.options.resetToDefault.useMutation({
    onSuccess: (_data, variables) => {
      toast.success(__('Reset "{key}" to default', { key: variables.key }));
      // Clear local override if any
      setLocalOverrides((prev) => {
        const next = { ...prev };
        delete next[variables.key];
        return next;
      });
      utils.options.listWithDefaults.invalidate();
      utils.options.getAll.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const testGA4 = trpc.analytics.testConnection.useMutation({
    onSuccess: () => toast.success(__('GA4 connection successful')),
    onError: (err) => toast.error(err.message),
  });

  const [seoDialogOpen, setSeoDialogOpen] = useState(false);
  const createSeoOverrides = trpc.cms.createMissingSeoOverrides.useMutation({
    onSuccess: (data) => {
      toast.success(__._n('Created 1 SEO override page', 'Created {count} SEO override pages', data.created));
      setSeoDialogOpen(false);
    },
    onError: (err) => toast.error(err.message),
  });

  // ─── Derived state ─────────────────────────────────────────────────────────
  const items = registryQuery.data as OptionItem[] | undefined;

  const grouped = useMemo(() => {
    if (!items) return {};
    const groups: Record<string, OptionItem[]> = {};
    for (const item of items) {
      if (!groups[item.group]) groups[item.group] = [];
      groups[item.group].push(item);
    }
    return groups;
  }, [items]);

  const groupOrder = useMemo(() => Object.keys(GROUP_LABELS), []);

  function getValue(item: OptionItem): unknown {
    if (item.key in localOverrides) return localOverrides[item.key];
    return item.currentValue;
  }

  function setValue(key: string, value: unknown) {
    setLocalOverrides((prev) => ({ ...prev, [key]: value }));
  }

  const hasChanges = Object.keys(localOverrides).length > 0;

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!hasChanges) return;
    setMany.mutate({ options: localOverrides });
  }

  // ─── Loading ────────────────────────────────────────────────────────────────
  if (registryQuery.isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-(--text-muted)" />
      </div>
    );
  }

  // ─── Render field by type ──────────────────────────────────────────────────
  function renderField(item: OptionItem) {
    const value = getValue(item);
    const inputClass = 'input mt-1';

    switch (item.type) {
      case 'boolean':
        return (
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={value as boolean}
              onChange={(e) => setValue(item.key, e.target.checked)}
              className="rounded border-(--border-primary)"
            />
            {__(item.label)}
          </label>
        );
      case 'number':
        return (
          <input
            type="number"
            min={1}
            max={100}
            value={value as number}
            onChange={(e) => setValue(item.key, Number(e.target.value))}
            className="input mt-1 w-32"
          />
        );
      case 'textarea':
        return (
          <textarea
            value={(value as string) ?? ''}
            onChange={(e) => setValue(item.key, e.target.value)}
            rows={3}
            className="textarea mt-1"
          />
        );
      case 'json':
        return (
          <textarea
            value={(value as string) ?? ''}
            onChange={(e) => setValue(item.key, e.target.value)}
            rows={4}
            className="textarea mt-1 font-mono text-xs"
            placeholder='{"type":"service_account",...}'
          />
        );
      case 'url':
        return (
          <>
            <input
              type="text"
              value={(value as string) ?? ''}
              onChange={(e) => setValue(item.key, e.target.value)}
              className={inputClass}
              placeholder="https://..."
            />
            {item.key === 'site.logo' && value && (
              <div className="relative mt-2 h-12 w-48">
                <Image
                  src={value as string}
                  alt="Logo preview"
                  fill
                  className="object-contain"
                />
              </div>
            )}
          </>
        );
      default: // text
        return (
          <input
            type="text"
            value={(value as string) ?? ''}
            onChange={(e) => setValue(item.key, e.target.value)}
            className={inputClass}
            placeholder={item.placeholder ?? undefined}
          />
        );
    }
  }

  return (
    <>
      <header className="dash-header">
        <div className="dash-toolbar">
          <h1 className="text-2xl font-bold text-(--text-primary)">{__('Settings')}</h1>
          <div className="flex items-center gap-2">
            <button
              type="submit"
              form="settings-form"
              disabled={setMany.isPending || !hasChanges}
              className="btn btn-primary disabled:opacity-50"
            >
              {setMany.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              {__('Save')}
            </button>
          </div>
        </div>
      </header>
      <main className="dash-main"><div className="dash-inner settings-page">
      <form id="settings-form" onSubmit={handleSave} className="settings-form space-y-6">
        {groupOrder.map((groupKey) => {
          const groupItems = grouped[groupKey];
          if (!groupItems?.length) return null;

          return (
            <div key={groupKey} className="card p-6">
              <h2 className="h2">{__(GROUP_LABELS[groupKey] ?? groupKey)}</h2>
              {groupKey === 'ga4' && (
                <p className="mt-1 text-xs text-(--text-muted)">
                  {__('Connect a GA4 property to display analytics on the dashboard. Requires a service account with Analytics read access.')}
                </p>
              )}
              <div className="mt-4 space-y-4">
                {groupItems.map((item) => {
                  if (item.type === 'boolean') {
                    return (
                      <div key={item.key} className="settings-field-row flex items-center justify-between">
                        {renderField(item)}
                        {item.isCustom && (
                          <button
                            type="button"
                            onClick={() => resetToDefault.mutate({ key: item.key })}
                            className="ml-2 text-xs text-(--text-muted) hover:text-(--text-secondary)"
                            title={__('Reset to default')}
                          >
                            <RotateCcw className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    );
                  }

                  return (
                    <div key={item.key}>
                      <div className="settings-field-header flex items-center gap-2">
                        <label className="block text-sm font-medium text-(--text-secondary)">
                          {__(item.label)}
                        </label>
                        {item.isCustom && (
                          <span className="rounded bg-brand-100 dark:bg-[oklch(0.65_0.17_var(--brand-hue)_/_0.15)] px-1.5 py-0.5 text-[10px] font-medium text-brand-700 dark:text-brand-400">
                            {__('Modified')}
                          </span>
                        )}
                        {item.isCustom && (
                          <button
                            type="button"
                            onClick={() => resetToDefault.mutate({ key: item.key })}
                            className="text-xs text-(--text-muted) hover:text-(--text-secondary)"
                            title={__('Reset to default')}
                          >
                            <RotateCcw className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                      {item.description && (
                        <p className="mt-0.5 text-xs text-(--text-muted)">
                          {__(item.description)}
                        </p>
                      )}
                      {renderField(item)}
                    </div>
                  );
                })}

                {/* GA4 Test Connection button — special case */}
                {groupKey === 'ga4' && (
                  <div>
                    <button
                      type="button"
                      disabled={testGA4.isPending}
                      onClick={() => testGA4.mutate()}
                      className="btn btn-secondary disabled:opacity-50"
                    >
                      {testGA4.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : testGA4.isSuccess ? (
                        <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
                      ) : testGA4.isError ? (
                        <XCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
                      ) : null}
                      {__('Test Connection')}
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {/* SEO Overrides — non-registry section */}
        <div className="settings-seo-section card p-6">
          <h2 className="h2">{__('SEO Overrides')}</h2>
          <p className="mt-1 text-sm text-(--text-muted)">
            {__('Create CMS pages to override SEO metadata for coded routes (homepage, login, etc.).')}
          </p>
          <div className="mt-4">
            <button
              type="button"
              onClick={() => setSeoDialogOpen(true)}
              className="btn btn-secondary"
            >
              <Globe className="h-4 w-4" />
              {__('Manage SEO Overrides')}
            </button>
          </div>
        </div>
      </form>

      <SeoOverridesDialog
        open={seoDialogOpen}
        onClose={() => setSeoDialogOpen(false)}
        onConfirm={(selected) => createSeoOverrides.mutate({ routes: selected })}
        isPending={createSeoOverrides.isPending}
        locales={LOCALES}
        localeLabels={LOCALE_LABELS}
      />
    </div></main>
    </>
  );
}
