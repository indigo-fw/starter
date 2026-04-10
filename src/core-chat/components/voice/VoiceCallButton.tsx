'use client';

import { Phone } from 'lucide-react';
import { useBlankTranslations } from '@/lib/translations';
import { cn } from '@/lib/utils';

interface VoiceCallButtonProps {
  onClick: () => void;
  disabled?: boolean;
  isActive?: boolean;
}

export function VoiceCallButton({ onClick, disabled, isActive }: VoiceCallButtonProps) {
  const __ = useBlankTranslations();

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'rounded-lg p-1.5 transition-colors',
        isActive
          ? 'bg-red-500 text-white hover:bg-red-600'
          : 'text-(--text-secondary) hover:bg-(--surface-secondary) hover:text-brand-500',
        'disabled:opacity-50 disabled:cursor-not-allowed',
      )}
      title={isActive ? __('End call') : __('Voice call')}
      aria-label={isActive ? __('End voice call') : __('Start voice call')}
    >
      <Phone size={18} className={isActive ? 'animate-pulse' : ''} />
    </button>
  );
}
