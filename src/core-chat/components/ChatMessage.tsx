'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { useBlankTranslations } from '@/lib/translations';
import { MessageRole, MessageStatus, CensorType } from '@/core-chat/lib/types';
import { Lightbox } from '@/core/components/Lightbox';
import { NsfwBlurOverlay } from './NsfwBlurOverlay';
import { CensoredMessage } from './CensoredMessage';
import { SmartProgress } from './SmartProgress';
import { AlertTriangle, Check, Loader2, RotateCcw } from 'lucide-react';

export interface ChatMessageData {
  id: string;
  role: string;
  content: string;
  status: string;
  createdAt?: string;
  isStreaming?: boolean;
  mediaUrl?: string;
  mediaType?: 'image' | 'video';
  mediaWidth?: number;
  mediaHeight?: number;
  isNsfw?: boolean;
  isProcessing?: boolean;
  censorType?: number;
}

interface ChatMessageProps {
  message: ChatMessageData;
  characterName?: string;
  characterAvatar?: string | null;
  onRetry?: () => void;
}

export function ChatMessage({ message, characterName, characterAvatar, onRetry }: ChatMessageProps) {
  const __ = useBlankTranslations();
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const isUser = message.role === MessageRole.USER || message.role === MessageRole.USER_IMG;
  const isModerated = message.status === MessageStatus.MODERATED;
  const isFailed = message.status === MessageStatus.FAILED;
  const isPending = message.status === MessageStatus.PENDING;
  const isProcessing = message.isProcessing || (message.content === '[Image]' && !message.mediaUrl);

  return (
    <div
      className={cn('flex gap-3 px-4 py-2', isUser ? 'flex-row-reverse' : 'flex-row')}
      role="article"
      aria-label={`${isUser ? __('You') : characterName ?? __('Assistant')}: ${message.content.slice(0, 50)}`}
    >
      {/* Avatar */}
      {!isUser && (
        <div className="w-8 h-8 rounded-full bg-(--surface-secondary) shrink-0 flex items-center justify-center overflow-hidden">
          {characterAvatar ? (
            <img src={characterAvatar} alt={characterName ?? ''} className="w-full h-full object-cover" />
          ) : (
            <span className="text-xs font-medium text-(--text-secondary)">
              {characterName?.[0]?.toUpperCase() ?? 'A'}
            </span>
          )}
        </div>
      )}

      {/* Bubble */}
      <div
        className={cn(
          'max-w-[75%] rounded-2xl text-sm leading-relaxed overflow-hidden',
          isUser
            ? 'bg-brand-500 text-white rounded-br-md'
            : 'bg-(--surface-secondary) text-(--text-primary) rounded-bl-md',
          !message.mediaUrl && 'px-4 py-2.5',
          isPending && 'opacity-60',
          isModerated && 'bg-red-500/10 border border-red-500/20 px-4 py-2.5',
          isFailed && 'bg-red-500/10 border border-red-500/20 px-4 py-2.5',
        )}
      >
        {isModerated ? (
          <CensoredMessage censorType={message.censorType} />
        ) : message.mediaUrl && message.mediaType === 'video' ? (
          /* Video message */
          <div className="relative">
            <video src={message.mediaUrl} controls className="rounded-xl max-w-full" style={{ maxHeight: 400 }} />
          </div>
        ) : message.mediaUrl ? (
          /* Image message with lightbox + NSFW overlay */
          <>
            <div className="relative cursor-pointer" onClick={() => setLightboxOpen(true)}>
              {message.isNsfw ? (
                <NsfwBlurOverlay imageUrl={message.mediaUrl}>
                  <img src={message.mediaUrl} alt={message.content} className="rounded-xl max-w-full" style={{ maxHeight: 400 }} loading="lazy" />
                </NsfwBlurOverlay>
              ) : (
                <img src={message.mediaUrl} alt={message.content} className="rounded-xl max-w-full hover:opacity-90 transition-opacity" style={{ maxHeight: 400 }} loading="lazy" />
              )}
            </div>
            <Lightbox open={lightboxOpen} onClose={() => setLightboxOpen(false)} label={message.content} closeOnContentClick>
              <img src={message.mediaUrl} alt={message.content} className="max-w-[90vw] max-h-[90vh] object-contain" />
            </Lightbox>
          </>
        ) : isProcessing ? (
          /* Smart progress bar for image/video generation */
          <SmartProgress estimatedSeconds={message.mediaType === 'video' ? 30 : 12} />
        ) : (
          /* Text message */
          <div className="whitespace-pre-wrap break-words">
            {message.content}
            {message.isStreaming && (
              <span className="inline-block w-1.5 h-4 bg-current ml-0.5 animate-pulse" />
            )}
          </div>
        )}

        {isFailed && onRetry && (
          <button
            onClick={onRetry}
            className="mt-1.5 flex items-center gap-1 text-xs text-red-500 hover:text-red-400 transition-colors"
          >
            <RotateCcw size={12} />
            {__('Retry')}
          </button>
        )}
      </div>

      {/* Status indicator for user messages */}
      {isUser && (
        <div className="flex items-end shrink-0">
          {isPending && <Loader2 size={12} className="text-(--text-tertiary) animate-spin" />}
          {message.status === MessageStatus.DELIVERED && (
            <Check size={12} className="text-(--text-tertiary)" />
          )}
        </div>
      )}
    </div>
  );
}
