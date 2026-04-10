'use client';

import { memo, useEffect, useState } from 'react';

import { useAdminTranslations } from '@/core/lib/i18n/translations';

interface AutosaveIndicatorProps {
  lastAutosaveAt: number | null;
  isDirty: boolean;
}

function formatRelative(ms: number): string {
  const seconds = Math.floor((Date.now() - ms) / 1000);
  if (seconds < 60) return '<1m ago';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

function AutosaveIndicator({
  lastAutosaveAt,
  isDirty,
}: AutosaveIndicatorProps) {
  const __ = useAdminTranslations();
  const [, setTick] = useState(0);

  // Re-render every 30s to update relative time
  useEffect(() => {
    if (!lastAutosaveAt || !isDirty) return;
    const interval = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(interval);
  }, [lastAutosaveAt, isDirty]);

  if (!isDirty || !lastAutosaveAt) return null;

  return (
    <span className="self-center text-xs text-(--text-muted)">
      {__('Autosaved')} {formatRelative(lastAutosaveAt)}
    </span>
  );
}

export default memo(AutosaveIndicator);
