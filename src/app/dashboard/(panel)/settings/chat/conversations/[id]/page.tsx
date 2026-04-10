'use client';

import { useParams, useRouter } from 'next/navigation';
import { trpc } from '@/lib/trpc/client';
import { useAdminTranslations } from '@/lib/translations';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { ChatMessage } from '@/core-chat/components/chat/ChatMessage';
import { cn } from '@/lib/utils';

export default function AdminConversationDetailPage() {
  const __ = useAdminTranslations();
  const params = useParams<{ id: string }>();
  const router = useRouter();

  const { data: messages, isLoading } = trpc.chatAdmin.conversationMessages.useQuery({
    conversationId: params.id,
    limit: 200,
  });

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center gap-3">
        <button onClick={() => router.push('/dashboard/settings/chat/conversations')}
          className="p-1.5 rounded-lg text-(--text-tertiary) hover:text-(--text-primary) hover:bg-(--surface-secondary)">
          <ArrowLeft size={18} />
        </button>
        <h1 className="text-2xl font-bold text-(--text-primary)">{__('Conversation')}</h1>
        <span className="text-xs text-(--text-tertiary) font-mono">{params.id.slice(0, 8)}...</span>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="animate-spin text-(--text-tertiary)" size={24} /></div>
      ) : !messages?.length ? (
        <div className="text-center py-12 text-sm text-(--text-tertiary)">{__('No messages.')}</div>
      ) : (
        <div className="card p-4 space-y-1 max-h-[70vh] overflow-y-auto">
          {messages.map((msg) => (
            <ChatMessage
              key={msg.id}
              message={{
                id: msg.id,
                role: msg.role,
                content: msg.content,
                status: msg.status,
                createdAt: msg.createdAt?.toISOString(),
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
