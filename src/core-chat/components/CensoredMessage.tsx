'use client';

import { useBlankTranslations } from '@/lib/translations';
import { AlertTriangle, ShieldAlert } from 'lucide-react';
import { CensorType } from '@/core-chat/lib/types';

interface CensoredMessageProps {
  censorType?: number;
  reason?: string;
}

export function CensoredMessage({ censorType, reason }: CensoredMessageProps) {
  const __ = useBlankTranslations();

  if (censorType === CensorType.CENSORED_IMAGE) {
    return (
      <div className="flex items-center gap-2 text-red-500 px-4 py-2.5">
        <ShieldAlert size={14} />
        <span className="text-xs">{__('Image request blocked by content filter')}</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 text-red-500 px-4 py-2.5">
      <AlertTriangle size={14} />
      <span className="text-xs">{__('Message flagged by content filter')}</span>
    </div>
  );
}
