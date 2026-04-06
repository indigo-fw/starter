'use client';

import { useBlankTranslations } from '@/lib/translations';
import { Phone, PhoneOff } from 'lucide-react';
import { MessageRole } from '@/core-chat/lib/types';

interface VoiceCallEventMessageProps {
  role: string;
  content: string;
}

/**
 * Chat timeline markers for voice call events.
 */
export function VoiceCallEventMessage({ role, content }: VoiceCallEventMessageProps) {
  const __ = useBlankTranslations();

  if (role === MessageRole.CALL_START) {
    return (
      <div className="flex items-center justify-center gap-2 py-2 text-xs text-(--text-tertiary)">
        <Phone size={12} className="text-green-500" />
        <span>{__('Voice call started')}</span>
      </div>
    );
  }

  if (role === MessageRole.CALL_END) {
    const durationSeconds = parseInt(content) || 0;
    const mins = Math.floor(durationSeconds / 60);
    const secs = durationSeconds % 60;
    const durationStr = `${mins}m ${secs}s`;

    return (
      <div className="flex items-center justify-center gap-2 py-2 text-xs text-(--text-tertiary)">
        <PhoneOff size={12} className="text-red-500" />
        <span>{__('Voice call')} — {durationStr}</span>
      </div>
    );
  }

  return null;
}
