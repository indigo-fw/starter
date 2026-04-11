'use client';

import Image from 'next/image';
import { useBlankTranslations } from '@/lib/translations';
import { PhoneOff, Mic, MicOff } from 'lucide-react';
import { useState } from 'react';

interface VoiceCallActiveOverlayProps {
  characterName: string;
  characterAvatar?: string | null;
  duration: number;
  subtitle?: string;
  onEndCall: () => void;
}

export function VoiceCallActiveOverlay({
  characterName, characterAvatar, duration, subtitle, onEndCall,
}: VoiceCallActiveOverlayProps) {
  const __ = useBlankTranslations();
  const [muted, setMuted] = useState(false);

  const mins = Math.floor(duration / 60);
  const secs = duration % 60;

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/80">
      {/* Avatar with pulse ring */}
      <div className="relative mb-6">
        <div className="w-28 h-28 rounded-full bg-(--surface-secondary) flex items-center justify-center overflow-hidden">
          {characterAvatar ? (
            <Image src={characterAvatar} alt={characterName} className="w-full h-full object-cover" width={112} height={112} />
          ) : (
            <span className="text-4xl font-bold text-(--text-secondary)">{characterName[0]?.toUpperCase()}</span>
          )}
        </div>
        <div className="absolute inset-0 rounded-full ring-4 ring-green-500/40 animate-ping" />
      </div>

      <h2 className="text-lg font-semibold text-white">{characterName}</h2>

      {/* Timer */}
      <p className="text-2xl font-mono text-white/90 mt-2">
        {String(mins).padStart(2, '0')}:{String(secs).padStart(2, '0')}
      </p>

      {/* Subtitle */}
      {subtitle && (
        <p className="text-sm text-white/70 mt-4 max-w-sm text-center italic">
          &ldquo;{subtitle}&rdquo;
        </p>
      )}

      {/* Controls */}
      <div className="flex items-center gap-6 mt-8">
        <button
          onClick={() => setMuted(!muted)}
          className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${
            muted ? 'bg-red-500/20 text-red-400' : 'bg-white/10 text-white/80 hover:bg-white/20'
          }`}
          aria-label={muted ? __('Unmute') : __('Mute')}
        >
          {muted ? <MicOff size={20} /> : <Mic size={20} />}
        </button>

        <button
          onClick={onEndCall}
          className="w-16 h-16 rounded-full bg-red-500 text-white flex items-center justify-center hover:bg-red-600 transition-colors"
          aria-label={__('End call')}
        >
          <PhoneOff size={24} />
        </button>
      </div>
    </div>
  );
}
