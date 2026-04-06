'use client';

import { useAdminTranslations } from '@/core/lib/translations';
import { cn } from '@/lib/utils';

interface SEOFieldsProps {
  seoTitle: string;
  metaDescription: string;
  noindex: boolean;
  onSeoTitleChange: (value: string) => void;
  onMetaDescriptionChange: (value: string) => void;
  onNoindexChange: (value: boolean) => void;
  fieldErrors?: Record<string, string[]>;
}

export function SEOFields({
  seoTitle, metaDescription, noindex,
  onSeoTitleChange, onMetaDescriptionChange, onNoindexChange,
  fieldErrors,
}: SEOFieldsProps) {
  const __ = useAdminTranslations();

  return (
    <>
      <div className="seo-fields-title">
        <label className="label">
          {__('SEO Title')}
        </label>
        <input
          type="text"
          value={seoTitle}
          onChange={(e) => onSeoTitleChange(e.target.value)}
          placeholder={__('Optional SEO title for {titleTag} tag', { titleTag: '<title>' })}
          maxLength={255}
          className={cn('input', fieldErrors?.seoTitle && '!border-red-500 focus:!border-red-500')}
        />
        {fieldErrors?.seoTitle ? (
          <p className="mt-1 text-sm text-red-400">{fieldErrors.seoTitle[0]}</p>
        ) : (
          <p className="mt-1 text-xs text-(--text-muted)">{__('Falls back to Title if empty')}</p>
        )}
      </div>

      <div className="seo-fields-description">
        <label className="label">
          {__('Meta Description')}
        </label>
        <textarea
          value={metaDescription}
          onChange={(e) => onMetaDescriptionChange(e.target.value)}
          placeholder={__('SEO meta description (max 160 chars)')}
          maxLength={160}
          rows={3}
          className={cn('textarea', fieldErrors?.metaDescription && '!border-red-500 focus:!border-red-500')}
        />
        {fieldErrors?.metaDescription ? (
          <p className="mt-1 text-sm text-red-400">{fieldErrors.metaDescription[0]}</p>
        ) : (
          <p className="mt-1 text-xs text-(--text-muted)">{metaDescription.length}/160</p>
        )}
      </div>

      <div className="seo-fields-noindex">
        <label className="flex items-center gap-2 text-sm font-medium text-(--text-secondary)">
          <input
            type="checkbox"
            checked={noindex}
            onChange={(e) => onNoindexChange(e.target.checked)}
            className="h-4 w-4 rounded border-(--border-primary) bg-(--surface-primary)"
          />
          {__('Noindex')}
        </label>
        <p className="mt-1 text-xs text-(--text-muted)">
          {__('Exclude from search engine indexing (adds noindex meta tag)')}
        </p>
      </div>
    </>
  );
}
