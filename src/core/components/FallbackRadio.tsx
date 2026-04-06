'use client';

import { useId } from 'react';

import type { ContentTypeDeclaration } from '@/core/config/content-types';
import { useAdminTranslations } from '@/core/lib/translations';

interface FallbackRadioProps {
  value: boolean | null;
  onChange: (value: boolean | null) => void;
  ct: ContentTypeDeclaration;
}

export function FallbackRadio({ value, onChange, ct }: FallbackRadioProps) {
  const __ = useAdminTranslations();
  const radioName = useId();

  return (
    <div>
      <label className="mb-2 block text-sm font-medium text-(--text-secondary)">
        {__('Language Fallback')}
      </label>
      <div className="space-y-2">
        <label className="flex cursor-pointer items-center gap-2 text-sm text-(--text-secondary)">
          <input type="radio" name={radioName} checked={value === null}
            onChange={() => onChange(null)}
            className="h-4 w-4 border-(--border-primary) bg-(--surface-primary)" />
          {__('Default')}
          <span className="text-xs text-(--text-muted)">
            ({ct.fallbackToDefault
              ? __('Show EN version for missing translations')
              : __('404 for missing translations')})
          </span>
        </label>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-(--text-secondary)">
          <input type="radio" name={radioName} checked={value === true}
            onChange={() => onChange(true)}
            className="h-4 w-4 border-(--border-primary) bg-(--surface-primary)" />
          {__('Always Fallback')}
        </label>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-(--text-secondary)">
          <input type="radio" name={radioName} checked={value === false}
            onChange={() => onChange(false)}
            className="h-4 w-4 border-(--border-primary) bg-(--surface-primary)" />
          {__('Never Fallback')}
        </label>
      </div>
      <p className="mt-1 text-xs text-(--text-muted)">
        {__('Controls whether this content is shown when visiting in a language without a translation')}
      </p>
    </div>
  );
}
