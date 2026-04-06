'use client';

import { useState } from 'react';
import Image from 'next/image';
import { useAdminTranslations } from '@/core/lib/translations';
import { cn } from '@/lib/utils';

interface Props {
  title: string;
  description: string;
  slug: string;
  urlPrefix: string;
  featuredImage?: string;
}

type Tab = 'google' | 'facebook' | 'twitter';

function charColor(len: number, warn: number, max: number) {
  if (len <= warn) return 'text-green-600 dark:text-green-400';
  if (len <= max) return 'text-yellow-600 dark:text-yellow-400';
  return 'text-red-600 dark:text-red-400';
}

function ImagePlaceholder({ __: t }: { __: (s: string) => string }) {
  return (
    <div className="flex h-full w-full items-center justify-center text-sm text-(--text-muted)">
      {t('No image')}
    </div>
  );
}

export function SeoPreviewCard({ title, description, slug, urlPrefix, featuredImage }: Props) {
  const __ = useAdminTranslations();
  const [activeTab, setActiveTab] = useState<Tab>('google');

  const displayTitle = (title || 'Page Title').slice(0, 70);
  const displayDesc = (description || 'No meta description set.').slice(0, 170);
  const displayUrl = `example.com${urlPrefix}${slug || 'page-slug'}`;

  const tabs: { key: Tab; label: string }[] = [
    { key: 'google', label: __('Google') },
    { key: 'facebook', label: __('Facebook') },
    { key: 'twitter', label: __('Twitter / X') },
  ];

  return (
    <>
      {/* Tabs */}
      <div className="flex gap-1 border-b border-(--border-primary)">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setActiveTab(t.key)}
            className={cn(
              'border-b-2 px-3 pb-2 text-sm font-medium transition-colors',
              activeTab === t.key
                ? 'border-brand-600 text-brand-600'
                : 'border-transparent text-(--text-muted) hover:border-(--border-primary) hover:text-(--text-primary)'
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Google tab */}
      {activeTab === 'google' && (
        <div className="seo-preview-google mt-4 rounded-md border border-(--border-primary) bg-(--surface-primary) p-4">
          <p className="seo-preview-title text-sm text-brand-700 dark:text-brand-400 truncate">{displayTitle}</p>
          <p className="seo-preview-url text-xs text-green-700 dark:text-green-400">{displayUrl}</p>
          <p className="seo-preview-description mt-1 text-xs text-(--text-secondary) line-clamp-2">{displayDesc}</p>
        </div>
      )}

      {/* Facebook tab */}
      {activeTab === 'facebook' && (
        <div className="mt-4 overflow-hidden rounded-md border border-(--border-primary)">
          {/* Image area - 16:9 */}
          <div className="relative aspect-video bg-(--surface-secondary)">
            {featuredImage ? (
              <Image src={featuredImage} alt="" fill className="object-cover" />
            ) : (
              <ImagePlaceholder __={__} />
            )}
          </div>
          {/* Meta below image */}
          <div className="seo-preview-social-meta bg-(--surface-primary) p-3">
            <p className="seo-preview-domain text-[10px] uppercase tracking-wide text-(--text-muted)">
              {displayUrl.split('/')[0]}
            </p>
            <p className="seo-preview-title mt-1 text-sm font-bold text-(--text-primary) truncate">{displayTitle}</p>
            <p className="seo-preview-description mt-0.5 text-xs text-(--text-secondary) line-clamp-2">{displayDesc}</p>
          </div>
        </div>
      )}

      {/* Twitter / X tab */}
      {activeTab === 'twitter' && (
        <div className="mt-4 overflow-hidden rounded-md border border-(--border-primary)">
          {/* Image area - 2:1 */}
          <div className="relative bg-(--surface-secondary)" style={{ aspectRatio: '2 / 1' }}>
            {featuredImage ? (
              <Image src={featuredImage} alt="" fill className="object-cover" />
            ) : (
              <ImagePlaceholder __={__} />
            )}
          </div>
          {/* Meta below image */}
          <div className="seo-preview-social-meta bg-(--surface-primary) p-3">
            <p className="seo-preview-title text-sm font-medium text-(--text-primary) truncate">{displayTitle}</p>
            <p className="seo-preview-description mt-0.5 text-xs text-(--text-secondary) line-clamp-2">{displayDesc}</p>
            <p className="seo-preview-domain mt-1 text-[10px] text-(--text-muted)">{displayUrl.split('/')[0]}</p>
          </div>
        </div>
      )}

      {/* Character counters (always visible) */}
      <div className="seo-char-counters mt-3 flex gap-4 text-xs">
        <span className={cn('seo-char-count', charColor(title.length, 50, 60))}>
          {__('Title')}: {title.length}/60
        </span>
        <span className={cn('seo-char-count', charColor(description.length, 140, 160))}>
          {__('Description')}: {description.length}/160
        </span>
      </div>
    </>
  );
}
