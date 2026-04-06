'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc/client';
import { cn } from '@/lib/utils';
import { MessageSquarePlus, Archive, Trash2, Loader2 } from 'lucide-react';

interface ConversationListProps {
  activeConversationId?: string;
  onSelect: (conversationId: string) => void;
  onNewChat: () => void;
}

export function ConversationList({ activeConversationId, onSelect, onNewChat }: ConversationListProps) {
  const { data: conversations, isLoading } = trpc.conversations.list.useQuery({ status: 'active' });
  const archiveMutation = trpc.conversations.archive.useMutation();
  const deleteMutation = trpc.conversations.delete.useMutation();
  const utils = trpc.useUtils();

  const [hoveredId, setHoveredId] = useState<string | null>(null);

  function handleArchive(e: React.MouseEvent, id: string) {
    e.stopPropagation();
    archiveMutation.mutate({ id }, {
      onSuccess: () => utils.conversations.list.invalidate(),
    });
  }

  function handleDelete(e: React.MouseEvent, id: string) {
    e.stopPropagation();
    deleteMutation.mutate({ id }, {
      onSuccess: () => utils.conversations.list.invalidate(),
    });
  }

  return (
    <div className="flex flex-col h-full border-r border-(--border-primary) bg-(--surface-primary)">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-(--border-primary)">
        <h2 className="text-sm font-semibold text-(--text-primary)">Chats</h2>
        <button
          onClick={onNewChat}
          className="rounded-lg p-1.5 text-(--text-secondary) hover:bg-(--surface-secondary) transition-colors"
          title="New chat"
        >
          <MessageSquarePlus size={18} />
        </button>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="animate-spin text-(--text-tertiary)" size={20} />
          </div>
        ) : !conversations?.length ? (
          <div className="px-4 py-8 text-center text-sm text-(--text-tertiary)">
            No conversations yet.
            <br />
            <button onClick={onNewChat} className="text-brand-500 hover:underline mt-1 inline-block">
              Start a new chat
            </button>
          </div>
        ) : (
          conversations.map((conv) => (
            <div
              key={conv.id}
              onClick={() => onSelect(conv.id)}
              onMouseEnter={() => setHoveredId(conv.id)}
              onMouseLeave={() => setHoveredId(null)}
              className={cn(
                'flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors',
                conv.id === activeConversationId
                  ? 'bg-brand-500/10'
                  : 'hover:bg-(--surface-secondary)',
              )}
            >
              {/* Avatar */}
              <div className="w-10 h-10 rounded-full bg-(--surface-secondary) shrink-0 flex items-center justify-center overflow-hidden">
                {conv.character.avatarUrl ? (
                  <img
                    src={conv.character.avatarUrl}
                    alt={conv.character.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span className="text-sm font-medium text-(--text-secondary)">
                    {conv.character.name[0]?.toUpperCase()}
                  </span>
                )}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-(--text-primary) truncate">
                    {conv.title ?? conv.character.name}
                  </span>
                  {conv.lastMessageAt && (
                    <span className="text-[10px] text-(--text-tertiary) shrink-0 ml-2">
                      {formatRelative(conv.lastMessageAt)}
                    </span>
                  )}
                </div>
                <p className="text-xs text-(--text-tertiary) truncate mt-0.5">
                  {conv.lastMessagePreview ?? conv.character.tagline ?? `Chat with ${conv.character.name}`}
                </p>
              </div>

              {/* Actions (on hover) */}
              {hoveredId === conv.id && (
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={(e) => handleArchive(e, conv.id)}
                    className="p-1 rounded text-(--text-tertiary) hover:text-(--text-secondary) hover:bg-(--surface-tertiary) transition-colors"
                    title="Archive"
                  >
                    <Archive size={14} />
                  </button>
                  <button
                    onClick={(e) => handleDelete(e, conv.id)}
                    className="p-1 rounded text-(--text-tertiary) hover:text-red-500 hover:bg-red-500/10 transition-colors"
                    title="Delete"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function formatRelative(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return 'now';
  if (diffMins < 60) return `${diffMins}m`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
