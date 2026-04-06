'use client';

import { useCallback, useState } from 'react';

import { useAdminTranslations } from '@/core/lib/translations';
import { toast } from '@/core/store/toast-store';

type AccentColor = 'info' | 'warning';

const BORDER_CLASSES: Record<AccentColor, string> = {
  info: 'border-(--border-primary) focus:border-accent-500',
  warning: 'border-(--border-primary) focus:border-yellow-500',
};

export function useCmsFormState<T extends Record<string, unknown>>(
  initialData: T,
  accentColor: AccentColor = 'info'
) {
  const __ = useAdminTranslations();
  const [formData, setFormData] = useState(initialData);
  const [saving, setSaving] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  const handleChange = useCallback(<V,>(field: keyof T, value: V) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setFieldErrors((prev) => {
      if (!prev[field as string]) return prev;
      const next = { ...prev };
      delete next[field as string];
      return next;
    });
  }, []);

  const fieldErrorClass = (field: string) =>
    fieldErrors[field]
      ? 'border-red-500 focus:border-red-500'
      : BORDER_CLASSES[accentColor];

  const handleSaveError = useCallback(
    (error: unknown, fallbackMsg: string) => {
      setSaving(false);
      const err = error as Error & {
        fieldErrors?: Record<string, string[]>;
      };

      if (err.fieldErrors && Object.keys(err.fieldErrors).length > 0) {
        setFieldErrors(err.fieldErrors);
        const firstError = Object.values(err.fieldErrors)[0]?.[0];
        toast.error(firstError || __('Please check the form for errors'));
      } else {
        toast.error(err.message || __(fallbackMsg));
      }
    },
    [__]
  );

  return {
    formData,
    setFormData,
    saving,
    setSaving,
    fieldErrors,
    setFieldErrors,
    handleChange,
    fieldErrorClass,
    handleSaveError,
  };
}

/**
 * Type-narrows recovered autosave data to the form's data shape.
 * Eliminates the per-form `as string` / `as number` cast boilerplate in handleRestore callbacks.
 */
export function narrowRecoveredData<T extends Record<string, unknown>>(
  recovered: Record<string, unknown>,
  defaults: T,
): T {
  const result = { ...defaults };
  for (const key of Object.keys(defaults)) {
    if (key in recovered) {
      (result as Record<string, unknown>)[key] = recovered[key];
    }
  }
  return result;
}
