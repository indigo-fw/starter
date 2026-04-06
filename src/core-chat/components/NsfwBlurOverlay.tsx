'use client';

import { useState } from 'react';
import { useBlankTranslations } from '@/lib/translations';
import { Lock, Eye } from 'lucide-react';

interface NsfwBlurOverlayProps {
  imageUrl: string;
  isSubscribed?: boolean;
  children?: React.ReactNode;
}

/**
 * Blurs NSFW images for non-subscribers with an upsell overlay.
 * Subscribers see images normally. Click to reveal temporarily.
 */
export function NsfwBlurOverlay({ imageUrl, isSubscribed = false, children }: NsfwBlurOverlayProps) {
  const __ = useBlankTranslations();
  const [revealed, setRevealed] = useState(false);

  if (isSubscribed || revealed) {
    return <>{children}</>;
  }

  return (
    <div className="relative overflow-hidden rounded-xl">
      {/* Blurred image */}
      <img
        src={imageUrl}
        alt=""
        className="w-full max-h-[400px] object-cover filter blur-xl scale-110"
      />

      {/* Overlay */}
      <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/40 gap-3">
        <Lock className="text-white/80" size={28} />
        <p className="text-white/90 text-sm font-medium text-center px-4">
          {__('NSFW content')}
        </p>
        <button
          onClick={() => setRevealed(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/20 text-white text-xs font-medium hover:bg-white/30 transition-colors"
        >
          <Eye size={14} />
          {__('Reveal')}
        </button>
      </div>
    </div>
  );
}
