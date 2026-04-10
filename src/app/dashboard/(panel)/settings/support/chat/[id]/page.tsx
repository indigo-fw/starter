'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Loader2, Send, X } from 'lucide-react';

import { trpc } from '@/lib/trpc/client';
import { useChannel } from '@/core/lib/realtime/ws-client';
import { useAdminTranslations } from '@/lib/translations';
import { toast } from '@/store/toast-store';
import { adminPanel } from '@/config/routes';
import { cn } from '@/lib/utils';

interface ChatWsEvent {
  type: 'chat_message' | 'chat_status';
  id?: string;
  sessionId: string;
  role?: string;
  body?: string;
  createdAt?: string;
  status?: string;
}

const STATUS_LABELS: Record<string, string> = {
  ai_active: 'AI Active',
  agent_active: 'Agent Active',
  escalated: 'Escalated',
  closed: 'Closed',
};

const ROLE_LABELS: Record<string, string> = {
  user: 'User',
  ai: 'AI',
  agent: 'Agent',
};

function isNearBottom(el: HTMLElement, threshold = 150): boolean {
  return el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
}

export default function AdminChatDetailPage() {
  const __ = useAdminTranslations();
  const params = useParams();
  const id = params.id as string;
  const utils = trpc.useUtils();
  const [replyBody, setReplyBody] = useState('');
  const [status, setStatus] = useState<string>('ai_active');
  const [prevSessionStatus, setPrevSessionStatus] = useState<string | undefined>(undefined);
  const messagesRef = useRef<HTMLDivElement>(null);
  const shouldScrollRef = useRef(true);

  const { data: session, isLoading } = trpc.supportChat.adminGet.useQuery({ id });
  const replyMut = trpc.supportChat.adminReply.useMutation({
    onSuccess: () => {
      setReplyBody('');
      utils.supportChat.adminGet.invalidate({ id });
    },
    onError: (err) => toast.error(err.message),
  });
  const closeMut = trpc.supportChat.adminClose.useMutation({
    onSuccess: () => {
      setStatus('closed');
      utils.supportChat.adminGet.invalidate({ id });
      toast.success(__('Chat closed'));
    },
  });

  // Track status — adjust state during render (React docs pattern)
  if (session?.status && session.status !== prevSessionStatus) {
    setPrevSessionStatus(session.status);
    setStatus(session.status);
  }

  // Real-time updates
  useChannel<ChatWsEvent>(`supportChat:${id}`, useCallback((event: ChatWsEvent) => {
    if (event.type === 'chat_message') {
      utils.supportChat.adminGet.invalidate({ id });
    }
    if (event.type === 'chat_status' && event.status) {
      setStatus(event.status);
    }
  }, [id, utils]));

  // Auto-scroll
  useEffect(() => {
    const el = messagesRef.current;
    if (el && shouldScrollRef.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [session?.messages]);

  const handleScroll = useCallback(() => {
    if (messagesRef.current) {
      shouldScrollRef.current = isNearBottom(messagesRef.current);
    }
  }, []);

  const handleReply = useCallback(() => {
    const body = replyBody.trim();
    if (!body) return;
    replyMut.mutate({ sessionId: id, body });
  }, [replyBody, id, replyMut]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleReply();
      }
    },
    [handleReply]
  );

  if (isLoading) {
    return (
      <main className="dash-main">
        <div className="dash-inner flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-(--text-muted)" />
        </div>
      </main>
    );
  }

  if (!session) {
    return (
      <main className="dash-main">
        <div className="dash-inner py-20 text-center text-(--text-muted)">
          {__('Chat session not found.')}
        </div>
      </main>
    );
  }

  const isClosed = status === 'closed';

  return (
    <>
      <header className="dash-header">
        <div className="dash-toolbar">
          <div className="flex items-center gap-3">
            <Link
              href={adminPanel.settingsSupport}
              className="rounded-md p-1.5 text-(--text-muted) hover:bg-(--surface-secondary)"
            >
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <h1 className="text-xl font-bold text-(--text-primary)">
              {__('Live Chat')}
            </h1>
            <span className={cn(
              'badge',
              status === 'ai_active' && 'badge-published',
              status === 'agent_active' && 'badge-scheduled',
              status === 'escalated' && 'badge-scheduled',
              status === 'closed' && 'badge-draft',
            )}>
              {__(STATUS_LABELS[status] ?? status)}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {session.ticketId && (
              <Link
                href={adminPanel.settingsSupportDetail(session.ticketId)}
                className="btn btn-secondary btn-sm"
              >
                {__('View Ticket')}
              </Link>
            )}
            {!isClosed && (
              <button
                onClick={() => closeMut.mutate({ sessionId: id })}
                disabled={closeMut.isPending}
                className="btn btn-danger btn-sm"
              >
                <X className="mr-1 h-4 w-4 inline" />
                {__('Close Chat')}
              </button>
            )}
          </div>
        </div>
      </header>
      <main className="dash-main"><div className="dash-inner">
      {/* Info bar */}
      <div className="mt-4 flex flex-wrap gap-4 text-sm text-(--text-muted)">
        <span>
          <strong>{__('Visitor')}:</strong>{' '}
          {session.creator
            ? `${session.creator.name ?? session.creator.email}`
            : session.email
              ? session.email
              : `${session.visitorId.slice(0, 12)}…`}
        </span>
        {session.email && session.creator && session.email !== session.creator.email && (
          <span>
            <strong>{__('Chat email')}:</strong> {session.email}
          </span>
        )}
        <span>
          <strong>{__('Started')}:</strong>{' '}
          {new Date(session.createdAt).toLocaleString()}
        </span>
        {session.subject && (
          <span>
            <strong>{__('Subject')}:</strong> {session.subject}
          </span>
        )}
      </div>

      {/* Messages */}
      <div className="mt-4 flex flex-col" style={{ height: 'calc(100vh - 20rem)' }}>
        <div
          ref={messagesRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto card p-4 space-y-3"
        >
          {session.messages.map((msg) => (
            <div
              key={msg.id}
              className={cn(
                'flex',
                msg.role === 'user' ? 'justify-end' : 'justify-start'
              )}
            >
              <div
                className={cn(
                  'max-w-[70%] rounded-xl px-4 py-2 text-sm whitespace-pre-wrap',
                  msg.role === 'user' && 'bg-(--surface-inset) text-(--text-primary)',
                  msg.role === 'ai' && 'bg-(--surface-secondary) text-(--text-primary) border-l-2 border-(--text-muted)',
                  msg.role === 'agent' && 'bg-(--surface-secondary) text-(--text-primary) border-l-2 border-brand-500',
                )}
              >
                <div className="text-xs font-semibold text-(--text-muted) mb-0.5">
                  {__(ROLE_LABELS[msg.role] ?? msg.role)}{' '}
                  <span className="font-normal">
                    {new Date(msg.createdAt).toLocaleTimeString()}
                  </span>
                </div>
                {msg.body}
              </div>
            </div>
          ))}
        </div>

        {/* Reply input */}
        {!isClosed && (
          <div className="mt-3 flex gap-2">
            <textarea
              value={replyBody}
              onChange={(e) => setReplyBody(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={__('Reply as agent...')}
              rows={2}
              className="input flex-1 resize-none"
            />
            <button
              onClick={handleReply}
              disabled={!replyBody.trim() || replyMut.isPending}
              className="btn btn-primary self-end"
            >
              {replyMut.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </button>
          </div>
        )}
      </div>
    </div></main>
    </>
  );
}
