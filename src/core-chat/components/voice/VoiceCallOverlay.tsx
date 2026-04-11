'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { useBlankTranslations } from '@/lib/translations';
import { Phone, X } from 'lucide-react';

interface VoiceCallOverlayProps {
  characterName: string;
  characterAvatar?: string | null;
  costPerMinute: number;
  tokenBalance: number;
  onAccept: () => void;
  onDecline: () => void;
}

/**
 * Pre-call ringing overlay with 5-second auto-accept countdown.
 */
export function VoiceCallOverlay({
  characterName, characterAvatar, costPerMinute, tokenBalance,
  onAccept, onDecline,
}: VoiceCallOverlayProps) {
  const __ = useBlankTranslations();
  const [countdown, setCountdown] = useState(5);
  const canAfford = tokenBalance >= costPerMinute;

  useEffect(() => {
    if (!canAfford) return;
    const timer = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) { onAccept(); return 0; }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [canAfford, onAccept]);

  // Escape to decline
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onDecline(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onDecline]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <div className="text-center space-y-6">
        {/* Avatar */}
        <div className="w-24 h-24 rounded-full bg-(--surface-secondary) mx-auto flex items-center justify-center overflow-hidden ring-4 ring-brand-500/30 animate-pulse">
          {characterAvatar ? (
            <Image src={characterAvatar} alt={characterName} className="w-full h-full object-cover" width={96} height={96} />
          ) : (
            <span className="text-3xl font-bold text-(--text-secondary)">{characterName[0]?.toUpperCase()}</span>
          )}
        </div>

        <div>
          <h2 className="text-xl font-semibold text-white">{characterName}</h2>
          <p className="text-sm text-white/60 mt-1">{__('Voice call')}</p>
        </div>

        {!canAfford ? (
          <p className="text-red-400 text-sm">{__('Insufficient tokens for voice call')}</p>
        ) : (
          <>
            <p className="text-white/50 text-xs">{costPerMinute} {__('tokens/minute')}</p>
            <p className="text-white/70 text-sm">{__('Auto-connecting in')} {countdown}...</p>
          </>
        )}

        <div className="flex items-center justify-center gap-6">
          <button onClick={onDecline}
            className="w-14 h-14 rounded-full bg-red-500 text-white flex items-center justify-center hover:bg-red-600 transition-colors">
            <X size={24} />
          </button>
          {canAfford && (
            <button onClick={onAccept}
              className="w-14 h-14 rounded-full bg-green-500 text-white flex items-center justify-center hover:bg-green-600 transition-colors">
              <Phone size={24} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
