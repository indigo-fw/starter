'use client';

import { memo } from 'react';

import { X } from 'lucide-react';

import { useAdminTranslations } from '@/core/lib/translations';

interface BrokenLinksBannerProps {
  urls: string[];
  onDismiss: () => void;
}

function BrokenLinksBanner({ urls, onDismiss }: BrokenLinksBannerProps) {
  const __ = useAdminTranslations();

  if (urls.length === 0) return null;

  return (
    <div className="rounded-lg border border-yellow-600/50 bg-yellow-600/10 px-4 py-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-yellow-400">
          {__('Broken internal links detected:')}
        </span>
        <button type="button" onClick={onDismiss} className="text-yellow-400 hover:text-yellow-300">
          <X size={16} />
        </button>
      </div>
      <ul className="mt-2 space-y-1">
        {urls.map((url) => (
          <li key={url} className="font-mono text-xs text-yellow-300">{url}</li>
        ))}
      </ul>
    </div>
  );
}

export default memo(BrokenLinksBanner);
