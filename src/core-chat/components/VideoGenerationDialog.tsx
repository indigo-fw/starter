'use client';

import { useState, useEffect } from 'react';
import { useBlankTranslations } from '@/lib/translations';
import { X, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface VideoGenerationDialogProps {
  sourceImageUrl?: string;
  onSubmit: (opts: { prompt: string; duration: number; resolution: string }) => void;
  onClose: () => void;
  isGenerating: boolean;
  tokenBalance?: number;
}

const DURATIONS = [5, 10] as const;
const RESOLUTIONS = [
  { label: '480p', value: '480p', multiplier: 1 },
  { label: '720p', value: '720p', multiplier: 2 },
  { label: '1080p', value: '1080p', multiplier: 3 },
] as const;
const BASE_PER_SECOND = 8;

export function VideoGenerationDialog({ sourceImageUrl, onSubmit, onClose, isGenerating, tokenBalance }: VideoGenerationDialogProps) {
  const __ = useBlankTranslations();

  // Restore preferences from localStorage
  const [duration, setDuration] = useState<number>(() => {
    if (typeof window === 'undefined') return 5;
    return parseInt(localStorage.getItem('chat-video-duration') ?? '5') || 5;
  });
  const [resolution, setResolution] = useState<string>(() => {
    if (typeof window === 'undefined') return '720p';
    return localStorage.getItem('chat-video-resolution') ?? '720p';
  });
  const [prompt, setPrompt] = useState('');

  // Save preferences
  useEffect(() => { localStorage.setItem('chat-video-duration', String(duration)); }, [duration]);
  useEffect(() => { localStorage.setItem('chat-video-resolution', resolution); }, [resolution]);

  const resMultiplier = RESOLUTIONS.find((r) => r.value === resolution)?.multiplier ?? 2;
  const cost = duration * BASE_PER_SECOND * resMultiplier;
  const canAfford = tokenBalance == null || tokenBalance >= cost;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-md bg-(--surface-primary) rounded-2xl shadow-xl border border-(--border-primary) overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-(--border-primary)">
          <h2 className="text-base font-semibold text-(--text-primary)">{__('Generate Video')}</h2>
          <button onClick={onClose} className="p-1 text-(--text-tertiary) hover:text-(--text-primary)"><X size={18} /></button>
        </div>

        <div className="p-5 space-y-4">
          {/* Source image preview */}
          {sourceImageUrl && (
            <div className="flex justify-center">
              <img src={sourceImageUrl} alt="" className="h-48 rounded-lg object-cover" />
            </div>
          )}

          {/* Duration */}
          <div>
            <label className="text-sm font-medium text-(--text-secondary) mb-2 block">{__('Duration')}</label>
            <div className="flex gap-2">
              {DURATIONS.map((d) => (
                <button key={d} onClick={() => setDuration(d)}
                  className={cn('flex-1 py-2 rounded-lg text-sm font-medium border transition-colors',
                    duration === d ? 'bg-brand-500/10 text-brand-500 border-brand-500/30' : 'bg-(--surface-secondary) text-(--text-tertiary) border-transparent')}>
                  {d}s
                </button>
              ))}
            </div>
          </div>

          {/* Resolution */}
          <div>
            <label className="text-sm font-medium text-(--text-secondary) mb-2 block">{__('Resolution')}</label>
            <div className="flex gap-2">
              {RESOLUTIONS.map((r) => (
                <button key={r.value} onClick={() => setResolution(r.value)}
                  className={cn('flex-1 py-2 rounded-lg text-sm font-medium border transition-colors',
                    resolution === r.value ? 'bg-brand-500/10 text-brand-500 border-brand-500/30' : 'bg-(--surface-secondary) text-(--text-tertiary) border-transparent')}>
                  {r.label}
                </button>
              ))}
            </div>
          </div>

          {/* Prompt */}
          <div>
            <label className="text-sm font-medium text-(--text-secondary) mb-2 block">{__('Motion prompt')}</label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value.slice(0, 250))}
              placeholder={__('Describe the motion (e.g., "slowly turns and smiles")')}
              rows={2}
              className="textarea w-full text-sm"
            />
            <div className="text-right text-[10px] text-(--text-tertiary)">{prompt.length}/250</div>
          </div>

          {/* Cost */}
          <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-(--surface-secondary)">
            <span className="text-sm text-(--text-secondary)">{__('Cost')}</span>
            <span className={cn('text-sm font-bold', canAfford ? 'text-brand-500' : 'text-red-500')}>
              {cost} 🪙
            </span>
          </div>

          {!canAfford && (
            <p className="text-xs text-red-500 text-center">{__('Insufficient tokens. Please upgrade your plan.')}</p>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-(--border-primary) flex justify-end gap-2">
          <button onClick={onClose} className="btn btn-secondary text-sm">{__('Cancel')}</button>
          <button
            onClick={() => onSubmit({ prompt: prompt || 'Natural fluid motion', duration, resolution })}
            disabled={isGenerating || !canAfford}
            className="btn btn-primary text-sm flex items-center gap-2 disabled:opacity-50"
          >
            {isGenerating && <Loader2 size={14} className="animate-spin" />}
            {__('Generate')}
          </button>
        </div>
      </div>
    </div>
  );
}
