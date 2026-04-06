'use client';

import { useState, useRef, useEffect } from 'react';
import { useBlankTranslations } from '@/lib/translations';
import { Camera, Film, Sparkles, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ChatInputActionsProps {
  onAction: (text: string) => void;
  onVideoRequest?: () => void;
  disabled?: boolean;
  hasText?: boolean;
}

const ACTIONS = [
  { id: 'photo', icon: Camera, labelKey: 'Send photo', text: 'send photo', cost: null },
  { id: 'nsfw', icon: Sparkles, labelKey: 'Send NSFW photo', text: 'send photo nsfw', cost: 10 },
  { id: 'video', icon: Film, labelKey: 'Send video', text: null, cost: 40 },
] as const;

export function ChatInputActions({ onAction, onVideoRequest, disabled, hasText }: ChatInputActionsProps) {
  const __ = useBlankTranslations();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const hoverTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Hide when input has text
  if (hasText) return null;

  function handleAction(action: typeof ACTIONS[number]) {
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
          'rounded-xl p-2.5 transition-colors text-(--text-tertiary)',
          'hover:text-(--text-primary) hover:bg-(--surface-secondary)',
          'disabled:opacity-50',
        )}
        aria-label={__('Quick actions')}
      >
        <ChevronUp size={18} className={cn('transition-transform', open && 'rotate-180')} />
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute bottom-full left-0 mb-1 bg-(--surface-primary) border border-(--border-primary) rounded-xl shadow-lg overflow-hidden min-w-[180px] z-10">
          {ACTIONS.map((action) => (
            <button
              key={action.id}
              onClick={() => handleAction(action)}
              disabled={disabled}
              className="flex items-center gap-2.5 w-full px-3 py-2.5 text-sm text-(--text-primary) hover:bg-(--surface-secondary) transition-colors disabled:opacity-50"
            >
              <action.icon size={16} className="text-(--text-tertiary)" />
              <span className="flex-1 text-left">{__(action.labelKey)}</span>
              {action.cost && (
                <span className="text-xs text-(--text-tertiary)">{action.cost} 🪙</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
