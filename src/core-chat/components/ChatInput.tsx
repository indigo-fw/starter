'use client';

import { useRef, useState } from 'react';
import { Send } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ChatInputProps {
  onSend: (content: string) => void;
  disabled?: boolean;
  placeholder?: string;
  maxLength?: number;
}

export function ChatInput({
  onSend,
  disabled = false,
  placeholder = 'Type a message...',
  maxLength = 4000,
}: ChatInputProps) {
  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function handleSend() {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function handleInput() {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }

  return (
    <div className="border-t border-(--border-primary) bg-(--surface-primary) p-3">
      <div className="flex items-end gap-2">
        <div className="relative flex-1">
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => setValue(e.target.value.slice(0, maxLength))}
            onKeyDown={handleKeyDown}
            onInput={handleInput}
            placeholder={placeholder}
            disabled={disabled}
            rows={1}
            className={cn(
              'w-full resize-none rounded-xl border border-(--border-primary) bg-(--surface-secondary)',
              'px-4 py-2.5 text-sm text-(--text-primary) placeholder:text-(--text-tertiary)',
              'focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500/20',
              'disabled:opacity-50 disabled:cursor-not-allowed',
              'scrollbar-thin',
            )}
          />
          {value.length > maxLength * 0.9 && (
            <span className="absolute bottom-1 right-2 text-[10px] text-(--text-tertiary)">
              {value.length}/{maxLength}
            </span>
          )}
        </div>
        <button
          onClick={handleSend}
          disabled={disabled || !value.trim()}
          className={cn(
            'shrink-0 rounded-xl p-2.5 transition-colors',
            value.trim() && !disabled
              ? 'bg-brand-500 text-white hover:bg-brand-600'
              : 'bg-(--surface-secondary) text-(--text-tertiary) cursor-not-allowed',
          )}
        >
          <Send size={18} />
        </button>
      </div>
    </div>
  );
}
