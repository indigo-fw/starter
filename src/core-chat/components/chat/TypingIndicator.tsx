'use client';

import { cn } from '@/lib/utils';

interface TypingIndicatorProps {
  characterName?: string;
  characterAvatar?: string | null;
}

/**
 * Three-dot typing indicator with bounce animation.
 * Shown while AI is generating a response.
 */
export function TypingIndicator({ characterName, characterAvatar }: TypingIndicatorProps) {
  return (
    <div className="chat-typing-wrapper flex gap-3 px-4 py-2">
      {/* Avatar */}
      <div className="w-8 h-8 rounded-full bg-(--surface-secondary) shrink-0 flex items-center justify-center overflow-hidden">
        {characterAvatar ? (
          <img src={characterAvatar} alt={characterName ?? ''} className="w-full h-full object-cover" />
        ) : (
          <span className="text-xs font-medium text-(--text-secondary)">
            {characterName?.[0]?.toUpperCase() ?? 'A'}
          </span>
        )}
      </div>

      {/* Dots bubble */}
      <div className="bg-(--surface-secondary) rounded-2xl rounded-bl-md px-4 py-3">
        <div className="chat-typing-dots flex items-center gap-1" role="status" aria-label="Character is typing">
          <span className="chat-dot w-2 h-2 rounded-full bg-(--text-tertiary)" />
          <span className="chat-dot w-2 h-2 rounded-full bg-(--text-tertiary)" />
          <span className="chat-dot w-2 h-2 rounded-full bg-(--text-tertiary)" />
        </div>
      </div>

      {/* CSS animations */}
      <style>{`
        .chat-typing-wrapper {
          animation: chat-typing-slide-in 0.15s ease-out;
        }
        @keyframes chat-typing-slide-in {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .chat-dot {
          animation: chat-dot-bounce 1.5s infinite;
        }
        .chat-dot:nth-child(1) { animation-delay: 0s; }
        .chat-dot:nth-child(2) { animation-delay: 0.3s; }
        .chat-dot:nth-child(3) { animation-delay: 0.6s; }
        @keyframes chat-dot-bounce {
          0%, 80%, 100% { opacity: 0.3; transform: scale(1); }
          40% { opacity: 1; transform: scale(1.2); }
        }
      `}</style>
    </div>
  );
}
