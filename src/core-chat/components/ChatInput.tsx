'use client';

import { useRef, useState } from 'react';
import { Send, Paperclip, X } from 'lucide-react';
import { useBlankTranslations } from '@/lib/translations';
import { cn } from '@/lib/utils';

interface ChatInputProps {
  onSend: (content: string, mediaId?: string) => void;
  onUpload?: (file: File) => Promise<{ id: string; url: string } | null>;
  disabled?: boolean;
  placeholder?: string;
  maxLength?: number;
}

export function ChatInput({
  onSend,
  onUpload,
  disabled = false,
  placeholder,
  maxLength = 4000,
}: ChatInputProps) {
  const __ = useBlankTranslations();
  const [value, setValue] = useState('');
  const [attachment, setAttachment] = useState<{ file: File; preview: string } | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleSend() {
    const trimmed = value.trim();
    if ((!trimmed && !attachment) || disabled) return;

    let mediaId: string | undefined;

    if (attachment && onUpload) {
      setIsUploading(true);
      try {
        const result = await onUpload(attachment.file);
        mediaId = result?.id;
      } catch {
        // Upload failed — send without attachment
      }
      setIsUploading(false);
    }

    onSend(trimmed || '[Image]', mediaId);
    setValue('');
    setAttachment(null);
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
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

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      alert(__('File too large. Maximum 5MB.'));
      return;
    }
    const preview = URL.createObjectURL(file);
    setAttachment({ file, preview });
    e.target.value = '';
  }

  function clearAttachment() {
    if (attachment) {
      URL.revokeObjectURL(attachment.preview);
      setAttachment(null);
    }
  }

  return (
    <div className="border-t border-(--border-primary) bg-(--surface-primary) p-3">
      {/* Attachment preview */}
      {attachment && (
        <div className="mb-2 relative inline-block">
          <img src={attachment.preview} alt="" className="h-16 rounded-lg object-cover" />
          <button
            onClick={clearAttachment}
            className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center"
          >
            <X size={12} />
          </button>
        </div>
      )}

      <div className="flex items-end gap-2">
        {/* Attachment button */}
        {onUpload && (
          <>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={disabled || isUploading}
              className="shrink-0 rounded-xl p-2.5 text-(--text-tertiary) hover:text-(--text-primary) hover:bg-(--surface-secondary) transition-colors disabled:opacity-50"
              aria-label={__('Attach image')}
            >
              <Paperclip size={18} />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handleFileSelect}
              className="hidden"
            />
          </>
        )}

        {/* Textarea */}
        <div className="relative flex-1">
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => setValue(e.target.value.slice(0, maxLength))}
            onKeyDown={handleKeyDown}
            onInput={handleInput}
            placeholder={placeholder ?? __('Type a message...')}
            disabled={disabled}
            rows={1}
            role="textbox"
            aria-label={__('Message input')}
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

        {/* Send button */}
        <button
          onClick={handleSend}
          disabled={disabled || isUploading || (!value.trim() && !attachment)}
          className={cn(
            'shrink-0 rounded-xl p-2.5 transition-colors',
            (value.trim() || attachment) && !disabled
              ? 'bg-brand-500 text-white hover:bg-brand-600'
              : 'bg-(--surface-secondary) text-(--text-tertiary) cursor-not-allowed',
          )}
          aria-label={__('Send message')}
        >
          <Send size={18} />
        </button>
      </div>
    </div>
  );
}
