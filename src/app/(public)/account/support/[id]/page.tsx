'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Loader2, Send } from 'lucide-react';
import { trpc } from '@/lib/trpc/client';
import { useChannel } from '@/core/lib/ws-client';
import { accountRoutes } from '@/config/routes';
import { cn } from '@/lib/utils';
import { useBlankTranslations, dataTranslations } from '@/lib/translations';

const _d = dataTranslations('General');

interface TicketWsEvent {
  type: 'ticket_message' | 'ticket_status';
  id?: string;
  ticketId: string;
  userId?: string;
  isStaff?: boolean;
  body?: string;
  createdAt?: string;
  status?: string;
}

const STATUS_LABELS: Record<string, string> = {
  open: _d('Open'),
  awaiting_user: _d('Awaiting You'),
  awaiting_admin: _d('Awaiting Staff'),
  resolved: _d('Resolved'),
  closed: _d('Closed'),
};

const STATUS_COLORS: Record<string, string> = {
  open: 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400',
  awaiting_user: 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400',
  awaiting_admin: 'bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-400',
  resolved: 'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-400',
  closed: 'bg-gray-100 text-gray-600 dark:bg-gray-500/20 dark:text-gray-400',
};

function isNearBottom(el: HTMLElement, threshold = 150): boolean {
  return el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
}

export default function TicketDetailPage() {
  const __ = useBlankTranslations();
  const params = useParams();
  const id = params.id as string;
  const utils = trpc.useUtils();
  const [replyBody, setReplyBody] = useState('');
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const shouldScrollRef = useRef(true);

  const { data: ticket, isLoading } = trpc.support.get.useQuery({ id });

  // Track scroll position to decide auto-scroll
  const handleScroll = useCallback(() => {
    if (messagesContainerRef.current) {
      shouldScrollRef.current = isNearBottom(messagesContainerRef.current);
    }
  }, []);

  // Real-time: subscribe to ticket channel
  useChannel<TicketWsEvent>(`support:${id}`, (event) => {
    if (event.type === 'ticket_message' && event.id && event.body != null) {
      // Append message directly to cache
      utils.support.get.setData({ id }, (old) => {
        if (!old) return old;
        const alreadyExists = old.messages.some((m) => m.id === event.id);
        if (alreadyExists) return old;
        return {
          ...old,
          status: event.isStaff ? 'awaiting_user' : 'awaiting_admin',
          messages: [
            ...old.messages,
            {
              id: event.id!,
              userId: event.userId ?? '',
              isStaff: event.isStaff ?? false,
              body: event.body!,
              attachments: null,
              createdAt: new Date(event.createdAt ?? Date.now()),
            },
          ],
        };
      });
    } else if (event.type === 'ticket_status') {
      // Status change — invalidate to get full refresh
      utils.support.get.invalidate({ id });
    }
  });

  // Auto-scroll only when near bottom
  useEffect(() => {
    if (shouldScrollRef.current && messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
    }
  }, [ticket?.messages.length]);

  const reply = trpc.support.reply.useMutation({
    onSuccess: () => {
      setReplyBody('');
      shouldScrollRef.current = true;
      // WS broadcast will append message to cache — no invalidation needed
    },
  });

  const closeTicket = trpc.support.close.useMutation({
    onSuccess: () => {
      utils.support.get.invalidate({ id });
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-(--text-muted)" />
      </div>
    );
  }

  if (!ticket) {
    return (
      <div className="text-center py-12">
        <p className="text-(--text-secondary)">{__('Ticket not found.')}</p>
        <Link href={accountRoutes.support} className="text-sm text-brand-500 mt-2 inline-block">
          {__('Back to tickets')}
        </Link>
      </div>
    );
  }

  const isClosed = ticket.status === 'closed';

  function handleReply(e: React.FormEvent) {
    e.preventDefault();
    if (!replyBody.trim()) return;
    reply.mutate({ ticketId: id, body: replyBody });
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-start gap-3 mb-6">
        <Link
          href={accountRoutes.support}
          className="rounded-lg p-1.5 mt-0.5 text-(--text-muted) hover:bg-(--surface-secondary)"
        >
          <ArrowLeft size={20} />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold">{ticket.subject}</h1>
          <div className="flex items-center gap-3 mt-1 text-sm text-(--text-muted)">
            <span className={cn('inline-block rounded-full px-2.5 py-0.5 text-xs font-medium', STATUS_COLORS[ticket.status] ?? '')}>
              {__(STATUS_LABELS[ticket.status] ?? ticket.status)}
            </span>
            <span>{__('Priority:')} {ticket.priority}</span>
            <span>{__('Created:')} {new Date(ticket.createdAt).toLocaleDateString()}</span>
          </div>
        </div>
        {!isClosed && ticket.status !== 'resolved' && (
          <button
            onClick={() => closeTicket.mutate({ ticketId: id })}
            disabled={closeTicket.isPending}
            className="shrink-0 py-1.5 px-3 text-sm rounded-lg border border-(--border-primary) text-(--text-secondary) hover:bg-(--surface-secondary) transition-colors disabled:opacity-50"
          >
            {closeTicket.isPending ? __('Closing...') : __('Close Ticket')}
          </button>
        )}
      </div>

      {/* Messages */}
      <div
        ref={messagesContainerRef}
        onScroll={handleScroll}
        className="space-y-4 mb-6 max-h-[60vh] overflow-y-auto"
      >
        {ticket.messages.map((msg) => (
          <div
            key={msg.id}
            className={cn(
              'rounded-lg p-4',
              msg.isStaff
                ? 'bg-(--surface-secondary) border border-(--border-primary)'
                : 'bg-brand-500/5 border border-brand-500/20',
            )}
          >
            <div className="flex items-center gap-2 mb-2 text-xs text-(--text-muted)">
              <span className="font-medium">
                {msg.isStaff ? __('Staff') : __('You')}
              </span>
              <span>{new Date(msg.createdAt).toLocaleString()}</span>
            </div>
            <div className="text-sm whitespace-pre-wrap">{msg.body}</div>
          </div>
        ))}
      </div>

      {/* Reply form */}
      {!isClosed ? (
        <form onSubmit={handleReply} className="rounded-lg border border-(--border-primary) p-4">
          <textarea
            required
            maxLength={5000}
            rows={3}
            value={replyBody}
            onChange={(e) => setReplyBody(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-(--border-primary) bg-(--surface-primary) text-sm resize-y mb-3"
            placeholder={__('Type your reply...')}
          />
          {reply.error && (
            <p className="text-sm text-danger-500 mb-2">{reply.error.message}</p>
          )}
          <button
            type="submit"
            disabled={reply.isPending || !replyBody.trim()}
            className="inline-flex items-center gap-2 py-2 px-4 rounded-lg font-medium text-sm bg-brand-500 text-white hover:bg-brand-600 transition-colors disabled:opacity-50"
          >
            {reply.isPending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            {__('Send Reply')}
          </button>
        </form>
      ) : (
        <div className="rounded-lg border border-(--border-primary) p-4 text-center text-sm text-(--text-muted)">
          {__('This ticket is closed. Create a new ticket if you need further assistance.')}
        </div>
      )}
    </div>
  );
}
