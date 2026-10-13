'use client';

import { useRef, useState } from 'react';

import { Camera, ChevronUp, Film, Sparkles } from 'lucide-react';

import { useCloseOnClickOutside } from '@/core/hooks/useCloseOnClickOutside';
import { useBlankTranslations } from '@/lib/translations';
import { cn } from '@/lib/utils';

interface ChatInputActionsProps {
  onAction: (text: string) => void;
  onVideoRequest?: () => void;
  disabled?: boolean;
  hasText?: boolean;
}

// Display-only cost hints. Actual costs enforced server-side via options registry.
const ACTIONS = [
  {
    id: 'photo',
    icon: Camera,
    labelKey: 'Send photo',
    text: 'send photo',
    cost: null,
  },
  {
    id: 'nsfw',
    icon: Sparkles,
    labelKey: 'Send NSFW photo',
    text: 'send photo nsfw',
    cost: 10,
  },
  { id: 'video', icon: Film, labelKey: 'Send video', text: null, cost: 40 },
] as const;

export function ChatInputActions({
  onAction,
  onVideoRequest,
  disabled,
  hasText,
}: ChatInputActionsProps) {
  const __ = useBlankTranslations();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const hoverTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useCloseOnClickOutside(ref, () => setOpen(false), { enabled: open });

  // Hide when input has text
  if (hasText) return null;

  function handleAction(action: (typeof ACTIONS)[number]) {
    if (action.id === 'video' && onVideoRequest) {
      onVideoRequest();
    } else if (action.text) {
      onAction(action.text);
    }
    setOpen(false);
  }

  return (
    <div
      ref={ref}
      className="relative"
      onMouseEnter={() => {
        if (window.matchMedia('(hover: hover)').matches) {
          hoverTimeout.current = setTimeout(() => setOpen(true), 250);
        }
      }}
      onMouseLeave={() => {
        if (hoverTimeout.current) clearTimeout(hoverTimeout.current);
        if (window.matchMedia('(hover: hover)').matches) setOpen(false);
      }}
    >
      {/* Toggle button */}
      <button
        onClick={() => setOpen(!open)}
        disabled={disabled}
        className={cn(
          'rounded-xl p-2.5 text-(--text-tertiary) transition-colors',
          'hover:bg-(--surface-secondary) hover:text-(--text-primary)',
          'disabled:opacity-50'
        )}
        aria-label={__('Quick actions')}
      >
        <ChevronUp
          size={18}
          className={cn('transition-transform', open && 'rotate-180')}
        />
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute bottom-full left-0 z-10 mb-1 min-w-[180px] overflow-hidden rounded-xl border border-(--border-primary) bg-(--surface-primary) shadow-lg">
          {ACTIONS.map((action) => (
            <button
              key={action.id}
              onClick={() => handleAction(action)}
              disabled={disabled}
              className="flex w-full items-center gap-2.5 px-3 py-2.5 text-sm text-(--text-primary) transition-colors hover:bg-(--surface-secondary) disabled:opacity-50"
            >
              <action.icon size={16} className="text-(--text-tertiary)" />
              <span className="flex-1 text-left">{__(action.labelKey)}</span>
              {action.cost && (
                <span className="text-xs text-(--text-tertiary)">
                  {action.cost} 🪙
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
