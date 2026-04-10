'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Loader2, Send } from 'lucide-react';

import { trpc } from '@/lib/trpc/client';
import { useChannel } from '@/core/lib/realtime/ws-client';
import { useAdminTranslations } from '@/lib/translations';
import { toast } from '@/store/toast-store';
import { adminPanel } from '@/config/routes';
import { cn } from '@/lib/utils';

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

const STATUSES = ['open', 'awaiting_user', 'awaiting_admin', 'resolved', 'closed'] as const;

const STATUS_LABELS: Record<string, string> = {
  open: 'Open',
  awaiting_user: 'Awaiting User',
  awaiting_admin: 'Awaiting Admin',
  resolved: 'Resolved',
  closed: 'Closed',
};

const PRIORITY_LABELS: Record<string, string> = {
  low: 'Low',
  normal: 'Normal',
  high: 'High',
  urgent: 'Urgent',
};

const SATISFACTION_DISPLAY: Record<string, { emoji: string; label: string; color: string }> = {
  positive: { emoji: '😊', label: 'Satisfied', color: 'text-green-500' },
  neutral: { emoji: '😐', label: 'It was okay', color: 'text-amber-500' },
  negative: { emoji: '😞', label: 'Not satisfied', color: 'text-red-500' },
};

function isNearBottom(el: HTMLElement, threshold = 150): boolean {
  return el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
}

export default function AdminTicketDetailPage() {
  const __ = useAdminTranslations();
  const params = useParams();
  const id = params.id as string;
  const utils = trpc.useUtils();

  const [replyBody, setReplyBody] = useState('');
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const shouldScrollRef = useRef(true);

  const { data: ticket, isLoading } = trpc.support.adminGet.useQuery({ id });

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
      utils.support.adminGet.setData({ id }, (old) => {
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
              ticketId: event.ticketId,
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
      utils.support.adminGet.invalidate({ id });
    }
  });

  // Auto-scroll only when near bottom
  useEffect(() => {
    if (shouldScrollRef.current && messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
    }
  }, [ticket?.messages.length]);

  const staffReply = trpc.support.adminReply.useMutation({
    onSuccess: () => {
      setReplyBody('');
      shouldScrollRef.current = true;
      toast.success(__('Reply sent'));
      // WS broadcast will append message to cache — no invalidation needed
    },
    onError: (err) => toast.error(err.message),
  });

  const changeStatus = trpc.support.changeStatus.useMutation({
    onSuccess: () => {
      toast.success(__('Status updated'));
      // WS broadcast will trigger invalidation
    },
    onError: (err) => toast.error(err.message),
  });

  const assign = trpc.support.assign.useMutation({
    onSuccess: () => {
      toast.success(__('Assignment updated'));
      utils.support.adminGet.invalidate({ id });
    },
    onError: (err) => toast.error(err.message),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-(--text-muted)" />
      </div>
    );
  }

  if (!ticket) {
    return (
      <div className="py-12 text-center">
        <p className="text-(--text-muted)">{__('Ticket not found.')}</p>
        <Link href={adminPanel.settingsSupport} className="text-sm text-brand-500 mt-2 inline-block">
          {__('Back to tickets')}
        </Link>
      </div>
    );
  }

  const isClosed = ticket.status === 'closed';

  function handleReply(e: React.FormEvent) {
    e.preventDefault();
    if (!replyBody.trim()) return;
    staffReply.mutate({ ticketId: id, body: replyBody });
  }

  function handleStatusChange(status: string) {
    changeStatus.mutate({
      ticketId: id,
      status: status as (typeof STATUSES)[number],
    });
  }

  function handleUnassign() {
    assign.mutate({ ticketId: id, assignedTo: null });
  }

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
            <h1 className="text-2xl font-bold text-(--text-primary) truncate">{ticket.subject}</h1>
          </div>
        </div>
      </header>
      <main className="dash-main"><div className="dash-inner support-detail-page">
      <div className="flex flex-col lg:flex-row gap-6">
        {/* Main content — messages + reply */}
        <div className="flex-1 min-w-0">
          {/* Messages */}
          <div
            ref={messagesContainerRef}
            onScroll={handleScroll}
            className="space-y-3 mb-6 max-h-[60vh] overflow-y-auto"
          >
            {ticket.messages.map((msg) => (
              <div
                key={msg.id}
                className={cn(
                  'card p-4',
                  msg.isStaff && 'border-l-2 border-l-brand-500',
                )}
              >
                <div className="flex items-center gap-2 mb-2 text-xs text-(--text-muted)">
                  <span className={cn('font-medium', msg.isStaff ? 'text-brand-500' : 'text-(--text-primary)')}>
                    {msg.isStaff ? __('Staff') : (ticket.creator?.name ?? ticket.creator?.email ?? __('Customer'))}
                  </span>
                  <span>{new Date(msg.createdAt).toLocaleString()}</span>
                </div>
                <div className="text-sm whitespace-pre-wrap text-(--text-primary)">{msg.body}</div>
              </div>
            ))}
          </div>

          {/* Reply form */}
          {!isClosed ? (
            <form onSubmit={handleReply} className="card p-4">
              <label className="block text-sm font-medium text-(--text-secondary) mb-2">
                {__('Staff Reply')}
              </label>
              <textarea
                required
                maxLength={5000}
                rows={4}
                value={replyBody}
                onChange={(e) => setReplyBody(e.target.value)}
                className="textarea mb-3"
                placeholder={__('Type your reply...')}
              />
              <button
                type="submit"
                disabled={staffReply.isPending || !replyBody.trim()}
                className="btn btn-primary disabled:opacity-50"
              >
                {staffReply.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                {__('Send Reply')}
              </button>
            </form>
          ) : (
            <div className="card p-4 text-center text-sm text-(--text-muted)">
              <div>{__('This ticket is closed.')}</div>
              {ticket.satisfaction && SATISFACTION_DISPLAY[ticket.satisfaction] && (
                <div className="mt-2 text-xs">
                  {__('User feedback')}:{' '}
                  <span className={SATISFACTION_DISPLAY[ticket.satisfaction].color}>
                    {SATISFACTION_DISPLAY[ticket.satisfaction].emoji}{' '}
                    {__(SATISFACTION_DISPLAY[ticket.satisfaction].label)}
                  </span>
                  {ticket.satisfactionComment && (
                    <p className="mt-1 text-(--text-muted) italic">&ldquo;{ticket.satisfactionComment}&rdquo;</p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Sidebar — ticket metadata + actions */}
        <div className="lg:w-72 shrink-0 space-y-4">
          {/* Info card */}
          <div className="card p-4 space-y-3">
            <h3 className="font-semibold text-(--text-primary) text-sm">{__('Details')}</h3>
            <div className="stat-grid">
              <div className="stat-row">
                <span className="stat-label">{__('Status')}</span>
                <span className="stat-value text-sm">{__(STATUS_LABELS[ticket.status] ?? ticket.status)}</span>
              </div>
              <div className="stat-row">
                <span className="stat-label">{__('Priority')}</span>
                <span className="stat-value text-sm">{__(PRIORITY_LABELS[ticket.priority] ?? ticket.priority)}</span>
              </div>
              <div className="stat-row">
                <span className="stat-label">{__('Created')}</span>
                <span className="stat-value text-sm">{new Date(ticket.createdAt).toLocaleDateString()}</span>
              </div>
              {ticket.creator && (
                <div className="stat-row">
                  <span className="stat-label">{__('From')}</span>
                  <span className="stat-value text-sm truncate">{ticket.creator.name ?? ticket.creator.email}</span>
                </div>
              )}
              {ticket.assignedTo && (
                <div className="stat-row">
                  <span className="stat-label">{__('Assigned')}</span>
                  <span className="stat-value text-xs truncate">{ticket.assignedTo}</span>
                </div>
              )}
            </div>
          </div>

          {/* Status change */}
          <div className="card p-4">
            <h3 className="font-semibold text-(--text-primary) text-sm mb-2">{__('Change Status')}</h3>
            <select
              value={ticket.status}
              onChange={(e) => handleStatusChange(e.target.value)}
              disabled={changeStatus.isPending}
              className="select w-full"
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>{__(STATUS_LABELS[s])}</option>
              ))}
            </select>
          </div>

          {/* Assignment */}
          <div className="card p-4">
            <h3 className="font-semibold text-(--text-primary) text-sm mb-2">{__('Assignment')}</h3>
            {ticket.assignedTo ? (
              <div className="space-y-2">
                <p className="text-xs text-(--text-muted) truncate">{ticket.assignedTo}</p>
                <button
                  onClick={handleUnassign}
                  disabled={assign.isPending}
                  className="btn btn-secondary btn-sm w-full disabled:opacity-50"
                >
                  {__('Unassign')}
                </button>
              </div>
            ) : (
              <p className="text-xs text-(--text-muted)">{__('Not assigned')}</p>
            )}
          </div>
        </div>
      </div>
    </div></main>
    </>
  );
}
