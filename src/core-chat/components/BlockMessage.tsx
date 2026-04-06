'use client';

import { useEffect, useState } from 'react';
import { useBlankTranslations } from '@/lib/translations';
import { Lock, Clock, CreditCard, ImageOff } from 'lucide-react';
import { BlockType } from '@/core-chat/lib/types';

interface BlockMessageProps {
  blockType: number;
  blockResetAt?: number;
}

export function BlockMessage({ blockType, blockResetAt }: BlockMessageProps) {
  const __ = useBlankTranslations();

  const config = BLOCK_CONFIGS[blockType];
  if (!config) return null;

  return (
    <div className="mx-4 my-2 px-4 py-3 rounded-xl bg-(--surface-secondary) border border-(--border-primary) text-center">
      <config.icon size={24} className="mx-auto mb-2 text-(--text-tertiary)" />
      <p className="text-sm font-medium text-(--text-primary)">{__(config.title)}</p>
      <p className="text-xs text-(--text-tertiary) mt-1">{__(config.description)}</p>
      {blockResetAt && <CountdownTimer resetAt={blockResetAt} />}
    </div>
  );
}

function CountdownTimer({ resetAt }: { resetAt: number }) {
  const __ = useBlankTranslations();
  const [remaining, setRemaining] = useState(() => Math.max(0, resetAt - Math.floor(Date.now() / 1000)));

  useEffect(() => {
    if (remaining <= 0) return;
    const interval = setInterval(() => {
      const left = Math.max(0, resetAt - Math.floor(Date.now() / 1000));
      setRemaining(left);
      if (left <= 0) clearInterval(interval);
    }, 1000);
    return () => clearInterval(interval);
  }, [resetAt, remaining]);

  if (remaining <= 0) return null;

  const mins = Math.floor(remaining / 60);
  const secs = remaining % 60;

  return (
    <div className="flex items-center justify-center gap-1.5 mt-2 text-xs text-(--text-tertiary)">
      <Clock size={12} />
      <span>{__('Try again in')} {mins}:{secs.toString().padStart(2, '0')}</span>
    </div>
  );
}

const BLOCK_CONFIGS: Record<number, { icon: typeof Lock; title: string; description: string }> = {
  [BlockType.BLOCK_ANONYMOUS]: {
    icon: Lock,
    title: 'Sign up to continue',
    description: 'Create a free account to keep chatting.',
  },
  [BlockType.BLOCK_UNSUBSCRIBED]: {
    icon: CreditCard,
    title: 'Subscribe to continue',
    description: 'Upgrade your plan to unlock unlimited chat.',
  },
  [BlockType.BLOCK_INSUFFICIENT_TOKENS]: {
    icon: CreditCard,
    title: 'Insufficient tokens',
    description: 'Add more tokens to continue chatting.',
  },
  [BlockType.BLOCK_ANONYMOUS_SOFT]: {
    icon: Lock,
    title: 'Message limit reached',
    description: 'Sign up for more messages.',
  },
  [BlockType.BLOCK_IMAGE_LIMIT]: {
    icon: ImageOff,
    title: 'Image limit reached',
    description: 'You have reached your image generation limit.',
  },
  [BlockType.BLOCK_IMAGE_DISABLED]: {
    icon: ImageOff,
    title: 'Image generation disabled',
    description: 'Image generation is not available on your current plan.',
  },
  [BlockType.BLOCK_UNSUBSCRIBED_SOFT]: {
    icon: Clock,
    title: 'Rate limit reached',
    description: 'Subscribe for unlimited messaging, or wait for the cooldown.',
  },
};
