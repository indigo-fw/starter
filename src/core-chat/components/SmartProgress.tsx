'use client';

import { useEffect, useState } from 'react';
import { useBlankTranslations } from '@/lib/translations';

interface SmartProgressProps {
  /** Expected duration in seconds (for progress estimation) */
  estimatedSeconds?: number;
  label?: string;
}

/**
 * Non-linear progress bar that simulates generation progress.
 * Fast at start (excitement), slows in middle (realistic), speeds up at end (anticipation).
 */
export function SmartProgress({ estimatedSeconds = 15, label }: SmartProgressProps) {
  const __ = useBlankTranslations();
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const startTime = Date.now();
    const totalMs = estimatedSeconds * 1000;

    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const t = Math.min(elapsed / totalMs, 0.95); // Never reach 100% until done

      // Non-linear easing: fast → slow → fast
      // Using a custom curve: starts fast (0-30%), slows (30-70%), speeds up (70-95%)
      let visual: number;
      if (t < 0.3) {
        visual = t * 1.5; // Fast: 0→45%
      } else if (t < 0.7) {
        visual = 0.45 + (t - 0.3) * 0.5; // Slow: 45→65%
      } else {
        visual = 0.65 + (t - 0.7) * 1.2; // Fast: 65→95%
      }

      setProgress(Math.min(visual * 100, 95));
    }, 100);

    return () => clearInterval(interval);
  }, [estimatedSeconds]);

  return (
    <div className="px-4 py-3 space-y-2">
      <div className="flex items-center justify-between text-xs text-(--text-tertiary)">
        <span>{label ?? __('Generating...')}</span>
        <span>{Math.round(progress)}%</span>
      </div>
      <div className="h-1.5 bg-(--surface-secondary) rounded-full overflow-hidden">
        <div
          className="h-full bg-brand-500 rounded-full transition-all duration-200 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}
